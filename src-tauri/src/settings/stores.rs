//! Every store the app keeps (settings, UI state, the history lists).

use super::lazy_store::LazyStore;
use super::*;

/// The two histories. Their caps match the frontend's and are enforced here
/// too, as the one writer.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize, Serialize)]
#[cfg_attr(test, derive(specta::Type))]
#[serde(rename_all = "lowercase")]
pub enum HistoryKind {
    Chat,
    Clipboard,
}

pub(crate) const MAX_CLIPBOARD_TEXT: usize = 50_000;

impl HistoryKind {
    pub(crate) fn stem(self) -> &'static str {
        match self {
            Self::Chat => "chat-history",
            Self::Clipboard => "clipboard-history",
        }
    }

    pub(crate) fn max(self) -> usize {
        match self {
            Self::Chat => chat_history::MAX_CONVERSATIONS,
            Self::Clipboard => 30,
        }
    }

    /// What makes two entries the same: a conversation's id, or a clipboard text
    /// itself (copying again moves it to the top).
    pub(crate) fn key_of(self, entry: &Value) -> Option<&str> {
        let field = match self {
            Self::Chat => "id",
            Self::Clipboard => "text",
        };
        entry.get(field)?.as_str()
    }

    pub(crate) fn valid(self, entry: &Value) -> bool {
        let Some(key) = self.key_of(entry) else {
            return false;
        };
        match self {
            // The id names the conversation's file.
            Self::Chat => {
                chat_history::safe_id(key)
                    && entry.get("updatedAt").is_some_and(Value::is_number)
                    && entry.get("turns").is_some_and(Value::is_array)
            }
            Self::Clipboard => {
                key.chars().count() <= MAX_CLIPBOARD_TEXT
                    && entry.get("at").is_some_and(Value::is_number)
            }
        }
    }

    /// Order and cap: conversations most recently active first (stable, so an
    /// upserted entry leads ties); clipboard entries newest first. Returns the overflow.
    pub(crate) fn tidy(self, list: &mut Vec<Value>) -> Vec<Value> {
        if self == Self::Chat {
            let updated = |e: &Value| e.get("updatedAt").and_then(Value::as_f64).unwrap_or(0.0);
            list.sort_by(|a, b| updated(b).total_cmp(&updated(a)));
        }
        list.split_off(list.len().min(self.max()))
    }
}

pub struct Stores {
    pub settings: Arc<Store>,
    pub ui_state: Arc<Store>,
    pub chat: LazyStore<ChatHistory>,
    pub clipboard: LazyStore<Arc<Store>>,
}

impl Stores {
    pub fn load(config_dir: &Path, data_dir: &Path) -> Self {
        let settings = Store::load(
            config_dir.join(file_name("settings")),
            "settings",
            json!({}),
            true,
        );
        let new_profile = settings.missing_at_load();
        let stores = Self {
            settings: Arc::new(settings),
            ui_state: Arc::new(Store::load(
                data_dir.join(file_name("ui-state")),
                "state",
                json!({}),
                true,
            )),
            chat: LazyStore::new(data_dir.to_path_buf(), ChatHistory::load),
            clipboard: LazyStore::new(data_dir.to_path_buf(), |data_dir| {
                Arc::new(Store::load(
                    data_dir.join(file_name(HistoryKind::Clipboard.stem())),
                    "entries",
                    json!([]),
                    false,
                ))
            }),
        };
        if new_profile {
            stores.seed_new_profile();
        }
        stores
    }

    /// Marks a new profile as having no moved skills to bring over; an older
    /// settings file lacks the mark and gets them installed. In memory until the first write.
    fn seed_new_profile(&self) {
        let mut inner = self.settings.inner.lock().unwrap();
        let mut seed = Map::new();
        seed.insert(
            crate::plugins::moved_skills::MOVED_KEY.into(),
            crate::plugins::moved_skills::all_seen_to(),
        );
        merge_top_level(&mut inner.payload, &seed);
    }

    pub fn patch_settings(&self, patch: &Map<String, Value>) -> u64 {
        self.settings.patch(patch)
    }

    /// Adds the fields of `defaults` the settings lack, under one lock, so it never
    /// overwrites a value. A window with an empty boot snapshot writes defaults
    /// through this, so a later reload can't undo the user's changes.
    pub fn fill_missing_settings(
        &self,
        defaults: &Map<String, Value>,
    ) -> Option<(Map<String, Value>, u64)> {
        self.settings.fill_missing(defaults)
    }

    pub fn flush_all(&self) {
        for store in [&self.settings, &self.ui_state]
            .into_iter()
            .chain(self.clipboard.loaded())
        {
            if let Err(e) = store.flush() {
                eprintln!("moxie: cannot write {}: {e}", store.path.display());
            }
        }
        if let Some(chat) = self.chat.loaded() {
            chat.flush();
        }
    }
}

/// A store file read once without keeping a `Store` for it: its payload under
/// `key`, or `None` when missing or malformed. A newer `schemaVersion` keeps unknown fields.
pub fn read_store_file(path: &Path, key: &str, empty: &Value) -> Option<Value> {
    let raw = std::fs::read_to_string(path).ok()?;
    parse(&raw, key, empty).map(|(payload, _)| payload)
}

#[cfg(test)]
mod startup_tests {
    use super::*;

    fn chat_dir(data: &Path) -> PathBuf {
        data.join(file_name("chat-history").trim_end_matches(".json"))
    }

    fn clipboard_path(data: &Path) -> PathBuf {
        data.join(file_name("clipboard-history"))
    }

    fn seed_histories(data: &Path) {
        let dir = chat_dir(data);
        std::fs::create_dir_all(&dir).unwrap();
        let entry = json!({ "id": "saved", "updatedAt": 1, "turns": ["kept"] });
        write_file(&dir.join("saved.json"), 1, "entry", &entry, false).unwrap();
        write_file(
            &clipboard_path(data),
            7,
            "entries",
            &json!([{ "text": "saved", "at": 1 }]),
            false,
        )
        .unwrap();
    }

    #[test]
    fn startup_leaves_unused_history_files_untouched() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(chat_dir(dir.path())).unwrap();
        let index = chat_dir(dir.path()).join("index.json");
        let clipboard = clipboard_path(dir.path());
        for path in [&index, &clipboard] {
            std::fs::write(path, "not json").unwrap();
        }
        let stores = Stores::load(dir.path(), dir.path());
        stores.flush_all();
        for path in [&index, &clipboard] {
            assert_eq!(std::fs::read_to_string(path).unwrap(), "not json");
        }
    }

    #[test]
    fn unused_flush_does_not_load_histories_and_first_read_sees_saved_data() {
        let dir = tempfile::tempdir().unwrap();
        let stores = Stores::load(dir.path(), dir.path());
        stores.flush_all();
        // A store read by startup or flush would have cached an empty snapshot.
        seed_histories(dir.path());
        assert_eq!(stores.clipboard.snapshot().0[0]["text"], "saved");
        assert_eq!(stores.chat.list()[0]["id"], "saved");
        assert_eq!(stores.chat.get("saved").unwrap()["turns"], json!(["kept"]));
        stores.flush_all();
    }

    #[test]
    fn first_writes_load_saved_histories_before_merging_and_flush_them() {
        let dir = tempfile::tempdir().unwrap();
        let stores = Stores::load(dir.path(), dir.path());
        seed_histories(dir.path());
        stores
            .chat
            .save(json!({ "id": "new", "updatedAt": 2, "turns": [] }));
        stores
            .clipboard
            .upsert(HistoryKind::Clipboard, json!({ "text": "new", "at": 2 }));
        stores.flush_all();
        let reloaded = Stores::load(dir.path(), dir.path());
        assert_eq!(reloaded.chat.list().as_array().unwrap().len(), 2);
        assert_eq!(reloaded.chat.list()[1]["id"], "saved");
        assert_eq!(
            reloaded.clipboard.snapshot().0,
            json!([
                { "text": "new", "at": 2 }, { "text": "saved", "at": 1 }
            ])
        );
        let raw = std::fs::read_to_string(clipboard_path(dir.path())).unwrap();
        assert_eq!(
            serde_json::from_str::<Value>(&raw).unwrap()["schemaVersion"],
            7
        );
    }

    #[test]
    fn flushing_a_used_history_leaves_the_other_history_unloaded() {
        for use_chat in [true, false] {
            let dir = tempfile::tempdir().unwrap();
            let stores = Stores::load(dir.path(), dir.path());
            seed_histories(dir.path());
            if use_chat {
                stores
                    .chat
                    .save(json!({ "id": "new", "updatedAt": 2, "turns": [] }));
            } else {
                stores
                    .clipboard
                    .upsert(HistoryKind::Clipboard, json!({ "text": "new", "at": 2 }));
            }
            stores.flush_all();
            assert_eq!(stores.chat.loaded().is_some(), use_chat);
            assert_eq!(stores.clipboard.loaded().is_some(), !use_chat);
            if use_chat {
                assert_eq!(stores.clipboard.snapshot().0[0]["text"], "saved");
            } else {
                assert_eq!(stores.chat.list()[0]["id"], "saved");
            }
            stores.flush_all();
        }
    }

    #[test]
    fn an_unreadable_lazy_history_is_never_replaced_by_its_first_write() {
        let dir = tempfile::tempdir().unwrap();
        let path = clipboard_path(dir.path());
        // A directory in place of the file is an I/O error on every platform.
        std::fs::create_dir(&path).unwrap();
        let stores = Stores::load(dir.path(), dir.path());
        stores
            .clipboard
            .upsert(HistoryKind::Clipboard, json!({ "text": "new", "at": 2 }));
        stores.flush_all();
        assert_eq!(stores.clipboard.snapshot().0[0]["text"], "new");
        assert!(path.is_dir());
        assert_eq!(std::fs::read_dir(path).unwrap().count(), 0);
    }

    #[test]
    fn settings_and_ui_state_are_loaded_before_the_boot_snapshot() {
        let dir = tempfile::tempdir().unwrap();
        let settings = dir.path().join(file_name("settings"));
        let ui = dir.path().join(file_name("ui-state"));
        write_file(&settings, 1, "settings", &json!({ "theme": "dark" }), true).unwrap();
        write_file(&ui, 1, "state", &json!({ "sidebarWidth": 240 }), true).unwrap();
        let stores = Stores::load(dir.path(), dir.path());
        write_file(&settings, 1, "settings", &json!({}), true).unwrap();
        write_file(&ui, 1, "state", &json!({}), true).unwrap();
        assert_eq!(stores.settings.snapshot().0["theme"], "dark");
        assert_eq!(stores.ui_state.snapshot().0["sidebarWidth"], 240);
    }

    #[test]
    fn concurrent_first_writes_keep_every_entry_and_the_saved_history() {
        let dir = tempfile::tempdir().unwrap();
        let stores = Stores::load(dir.path(), dir.path());
        seed_histories(dir.path());
        let start = std::sync::Barrier::new(8);
        std::thread::scope(|scope| {
            for i in 0..8 {
                let stores = &stores;
                let start = &start;
                scope.spawn(move || {
                    start.wait();
                    stores
                        .chat
                        .save(json!({ "id": format!("new{i}"), "updatedAt": i + 2, "turns": [] }));
                    stores.clipboard.upsert(
                        HistoryKind::Clipboard,
                        json!({ "text": format!("new{i}"), "at": i + 2 }),
                    );
                });
            }
        });
        stores.flush_all();
        let reloaded = Stores::load(dir.path(), dir.path());
        assert_eq!(reloaded.chat.list().as_array().unwrap().len(), 9);
        assert_eq!(reloaded.clipboard.snapshot().0.as_array().unwrap().len(), 9);
    }
}
