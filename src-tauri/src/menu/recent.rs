//! The Open Recent submenu: recent files and folders, shown short.

use super::*;

#[derive(Default)]
pub(super) struct RecentRefresh(Mutex<RefreshState>);

#[derive(Default)]
struct RefreshState {
    requested: u64,
    running: bool,
}

impl RefreshState {
    fn request(&mut self) -> Option<u64> {
        self.requested = self.requested.wrapping_add(1);
        if self.running {
            return None;
        }
        self.running = true;
        Some(self.requested)
    }

    /// Called on the main thread, immediately before applying the snapshot.
    fn finish(&mut self, revision: u64) -> Option<u64> {
        if revision != self.requested {
            Some(self.requested)
        } else {
            self.running = false;
            None
        }
    }
}

/// How a recent folder reads in the submenu: its path ending in a separator,
/// which sets it apart from files in any language.
pub(crate) fn folder_menu_text(path: &str) -> String {
    let sep = if path.contains('\\') && !path.contains('/') {
        '\\'
    } else {
        '/'
    };
    let shown = abbreviate_home(path);
    menu_text(&format!("{}{sep}", shown.trim_end_matches(['/', '\\'])))
}

pub(crate) fn abbreviate_home(path: &str) -> String {
    // Windows has no HOME; without USERPROFILE every recent file would show its
    // full C:\Users\... prefix.
    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .ok();
    if let Some(home) = home {
        if let Some(rest) = path.strip_prefix(&home) {
            return format!("~{rest}");
        }
    }
    path.to_string()
}

/// Read and probe paths off the calling thread: a disconnected drive can take
/// seconds. One probe (or queued main-thread callback) covers a burst of requests.
pub(crate) fn rebuild_recent_menu(app: &tauri::AppHandle) {
    let Some(revision) = app.state::<RecentRefresh>().0.lock().unwrap().request() else {
        return;
    };
    refresh_recent_menu(app.clone(), revision);
}

fn refresh_recent_menu(app: AppHandle, revision: u64) {
    tauri::async_runtime::spawn_blocking(move || {
        let folders = commands::recents::still_there(commands::recents::read_recent_folders(&app));
        let list = commands::recents::still_there(commands::recents::read_recent_files(&app));
        let handle = app.clone();
        if let Err(e) = app.run_on_main_thread(move || {
            let state = handle.state::<RecentRefresh>();
            let mut refresh = state.0.lock().unwrap();
            if let Some(next) = refresh.finish(revision) {
                drop(refresh);
                refresh_recent_menu(handle.clone(), next);
                return;
            }
            // Hold the revision lock through the menu update: a request cannot
            // invalidate this result between the check and its application.
            apply_recent_menu(&handle, &folders, &list);
        }) {
            app.state::<RecentRefresh>().0.lock().unwrap().running = false;
            eprintln!("moxie: cannot refresh the recent menu: {e}");
        }
    });
}

/// Only called on the main thread. Refill the current submenu, leaving the
/// menu bar's event handler and accelerators in place across refreshes.
fn apply_recent_menu(app: &AppHandle, folders: &[String], list: &[String]) {
    let Some(state) = app.try_state::<RecentMenu>() else {
        return;
    };
    let guard = state.0.lock().unwrap();
    let Some(submenu) = guard.as_ref() else {
        return;
    };
    let labels = app
        .try_state::<MenuLabels>()
        .map(|state| state.0.lock().unwrap().clone())
        .unwrap_or_default();
    if let Ok(items) = submenu.items() {
        for item in items {
            let _ = submenu.remove(&item);
        }
    }
    if list.is_empty() && folders.is_empty() {
        if let Ok(item) = MenuItemBuilder::with_id(
            "recent-none",
            label(&labels, "recent-none", "No Recent Files"),
        )
        .enabled(false)
        .build(app)
        {
            let _ = submenu.append(&item);
        }
        return;
    }
    for path in folders {
        if let Ok(item) = MenuItemBuilder::with_id(
            format!("{RECENT_FOLDER_PREFIX}{path}"),
            folder_menu_text(path),
        )
        .build(app)
        {
            let _ = submenu.append(&item);
        }
    }
    if !folders.is_empty() && !list.is_empty() {
        if let Ok(sep) = PredefinedMenuItem::separator(app) {
            let _ = submenu.append(&sep);
        }
    }
    for path in list {
        if let Ok(item) = MenuItemBuilder::with_id(
            format!("{RECENT_PREFIX}{path}"),
            menu_text(&abbreviate_home(path)),
        )
        .build(app)
        {
            let _ = submenu.append(&item);
        }
    }
    if let Ok(sep) = PredefinedMenuItem::separator(app) {
        let _ = submenu.append(&sep);
    }
    if let Ok(item) = MenuItemBuilder::with_id(
        RECENT_CLEAR_ID,
        label(&labels, RECENT_CLEAR_ID, "Clear Menu"),
    )
    .build(app)
    {
        let _ = submenu.append(&item);
    }
}

#[cfg(test)]
mod refresh_tests {
    use super::*;

    #[test]
    fn requests_during_a_probe_coalesce_into_one_latest_probe() {
        let mut state = RefreshState::default();
        let first = state.request().unwrap();
        for _ in 0..20 {
            assert_eq!(state.request(), None, "only one probe may be active");
        }
        let latest = state
            .finish(first)
            .expect("the old snapshot must be discarded");
        assert_eq!(latest, first + 20);
        assert_eq!(state.finish(latest), None);
        assert_eq!(state.request(), Some(latest + 1));
    }

    #[test]
    fn an_update_queued_for_the_main_thread_cannot_overwrite_a_newer_request() {
        let mut state = RefreshState::default();
        let probing = state.request().unwrap();
        // A completed disk probe is waiting for the main thread. Clear Menu or
        // a new file arrives before that callback gets to run.
        state.request();
        let retry = state.finish(probing);
        assert_eq!(retry, Some(probing + 1), "do not apply the old menu");
        assert_eq!(state.finish(retry.unwrap()), None);
    }

    #[test]
    fn a_menu_rebuild_during_a_retry_requests_the_current_menu_again() {
        let mut state = RefreshState::default();
        let first = state.request().unwrap();
        state.request();
        let retry = state.finish(first).unwrap();
        // Language/accelerator changes replace the submenu while a retry runs.
        assert_eq!(state.request(), None);
        let newest = state.finish(retry).unwrap();
        assert!(newest > retry);
        assert_eq!(state.finish(newest), None);
    }
}
