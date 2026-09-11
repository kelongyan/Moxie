use std::path::PathBuf;

const RECENT_LIMIT: usize = 12;
const FILE_NAME: &str = "preferences.json";

/// 最近文件条目：路径 + 最后打开时间（毫秒时间戳）。
/// 旧版存储为 string[]，读取时经 [RecentEntryRaw] 的 untagged 兼容为 ts=0。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RecentEntry {
    pub path: String,
    pub last_opened_ms: u64,
}

/// 存储层的兼容形态：旧格式是纯字符串，新格式是 {path, last_opened_ms}。
#[derive(Debug, serde::Serialize, serde::Deserialize)]
#[serde(untagged)]
enum RecentEntryRaw {
    Detailed {
        path: String,
        last_opened_ms: u64,
    },
    Path(String),
}

#[derive(Debug, Default, serde::Serialize, serde::Deserialize)]
struct PreferencesFile {
    #[serde(default)]
    recent_file_paths: Vec<RecentEntryRaw>,
    #[serde(default)]
    preferences: serde_json::Value,
}

pub fn app_data_dir() -> PathBuf {
    if let Ok(dir) = std::env::var("MOXIE_DATA_DIR") {
        return PathBuf::from(dir);
    }
    let base = std::env::var("APPDATA")
        .map(PathBuf::from)
        .unwrap_or_else(|_| std::env::temp_dir());
    base.join("Moxie")
}

fn prefs_path() -> PathBuf {
    app_data_dir().join(FILE_NAME)
}

fn load() -> PreferencesFile {
    std::fs::read_to_string(prefs_path())
        .ok()
        .and_then(|text| serde_json::from_str(&text).ok())
        .unwrap_or_default()
}

fn save(prefs: &PreferencesFile) -> std::io::Result<()> {
    let dir = app_data_dir();
    std::fs::create_dir_all(&dir)?;
    let path = prefs_path();
    let temp = dir.join(format!(".{FILE_NAME}.tmp"));
    std::fs::write(&temp, serde_json::to_string_pretty(prefs)?)?;
    std::fs::rename(&temp, &path)
}

pub fn load_preferences() -> serde_json::Value {
    load().preferences
}

pub fn save_preferences(value: serde_json::Value) {
    let mut prefs = load();
    prefs.preferences = value;
    let _ = save(&prefs);
}

fn normalize(path: &str) -> String {
    std::fs::canonicalize(path)
        .map(|p| {
            let s = p.to_string_lossy();
            s.strip_prefix(r"\\?\").unwrap_or(&s).to_string()
        })
        .unwrap_or_else(|_| path.to_string())
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn raw_entries(prefs: &PreferencesFile) -> Vec<RecentEntry> {
    prefs
        .recent_file_paths
        .iter()
        .map(|raw| match raw {
            RecentEntryRaw::Detailed { path, last_opened_ms } => RecentEntry {
                path: path.clone(),
                last_opened_ms: *last_opened_ms,
            },
            RecentEntryRaw::Path(path) => RecentEntry {
                path: path.clone(),
                last_opened_ms: 0,
            },
        })
        .collect()
}

fn write_entries(prefs: &mut PreferencesFile, entries: Vec<RecentEntry>) {
    prefs.recent_file_paths = entries
        .into_iter()
        .map(|e| RecentEntryRaw::Detailed {
            path: e.path,
            last_opened_ms: e.last_opened_ms,
        })
        .collect();
}

pub fn list() -> Vec<RecentEntry> {
    raw_entries(&load())
}

pub fn add(path: &str) -> Vec<RecentEntry> {
    let entry = normalize(path);
    let mut prefs = load();
    let mut entries = raw_entries(&prefs);
    entries.retain(|e| e.path != entry);
    entries.insert(0, RecentEntry { path: entry, last_opened_ms: now_ms() });
    entries.truncate(RECENT_LIMIT);
    write_entries(&mut prefs, entries.clone());
    let _ = save(&prefs);
    entries
}

pub fn remove(path: &str) -> Vec<RecentEntry> {
    let mut prefs = load();
    let mut entries = raw_entries(&prefs);
    entries.retain(|e| e.path != path);
    write_entries(&mut prefs, entries.clone());
    let _ = save(&prefs);
    entries
}

pub fn clear() -> Vec<RecentEntry> {
    let mut prefs = load();
    write_entries(&mut prefs, Vec::new());
    let _ = save(&prefs);
    Vec::new()
}

pub fn replace(old: &str, new: &str) -> Vec<RecentEntry> {
    let mut prefs = load();
    let target = normalize(new);
    let mut entries = raw_entries(&prefs);
    for entry in entries.iter_mut() {
        if entry.path == old {
            entry.path = target.clone();
        }
    }
    write_entries(&mut prefs, entries.clone());
    let _ = save(&prefs);
    entries
}

#[cfg(test)]
mod tests {
    use super::*;

    fn isolate() -> std::sync::MutexGuard<'static, ()> {
        crate::testutil::isolate("recent")
    }

    #[test]
    fn add_deduplicates_caps_and_orders() {
        let _guard = isolate();
        clear();
        for i in 0..15 {
            add(&format!("C:\\fake\\file{i}.txt"));
        }
        let entries = list();
        assert_eq!(entries.len(), RECENT_LIMIT);
        assert_eq!(entries[0].path, "C:\\fake\\file14.txt");
        assert!(entries[0].last_opened_ms > 0);
        add("C:\\fake\\file10.txt");
        let entries = list();
        assert_eq!(entries[0].path, "C:\\fake\\file10.txt");
        assert_eq!(
            entries.iter().filter(|e| e.path == "C:\\fake\\file10.txt").count(),
            1
        );
        remove("C:\\fake\\file10.txt");
        assert!(!list().iter().any(|e| e.path == "C:\\fake\\file10.txt"));
        clear();
        assert!(list().is_empty());
    }

    #[test]
    fn legacy_string_entries_are_read_and_upgraded() {
        let _guard = isolate();
        // 模拟旧版 preferences.json：纯 string 数组
        let dir = app_data_dir();
        std::fs::create_dir_all(&dir).unwrap();
        let legacy = serde_json::json!({
            "recent_file_paths": ["C:\\old\\a.txt", "C:\\old\\b.txt"],
            "preferences": {}
        });
        std::fs::write(
            prefs_path(),
            serde_json::to_string_pretty(&legacy).unwrap(),
        )
        .unwrap();

        let entries = list();
        assert_eq!(entries.len(), 2);
        assert_eq!(entries[0].path, "C:\\old\\a.txt");
        assert_eq!(entries[0].last_opened_ms, 0, "旧格式无时间戳，读为 0");

        // 任意写操作后应升级为新格式（带时间戳的对象）
        add("C:\\old\\a.txt");
        let raw = std::fs::read_to_string(prefs_path()).unwrap();
        assert!(raw.contains("last_opened_ms"), "保存后应为新格式");
        let entries = list();
        assert!(entries[0].last_opened_ms > 0, "升级后应写入真实时间戳");
    }
}
