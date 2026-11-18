//! Extra session windows are queued after the first document is ready. Assign
//! their paths up front so newly opened windows cannot steal a queued session.

use std::collections::{HashMap, HashSet, VecDeque};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Listener, Manager};

#[derive(Default)]
pub(crate) struct DeferredWindows(Mutex<RestoreQueue>);

#[derive(Default)]
struct RestoreQueue {
    assigned: HashMap<String, Vec<String>>,
    next: VecDeque<String>,
    waiting: Option<String>,
    generation: u64,
    cancelled: HashSet<String>,
}

impl RestoreQueue {
    fn assign(
        &mut self,
        windows: Vec<Vec<String>>,
        mut label: impl FnMut() -> String,
    ) -> HashMap<String, Vec<String>> {
        let mut session = HashMap::new();
        for paths in windows {
            let name = if self.waiting.is_none() {
                self.waiting = Some("main".into());
                "main".into()
            } else {
                let name = label();
                self.next.push_back(name.clone());
                name
            };
            session.insert(name.clone(), paths.clone());
            self.assigned.insert(name, paths);
        }
        session
    }

    fn advance(&mut self, ready: &str) -> Option<String> {
        if self.waiting.as_deref() != Some(ready) {
            return None;
        }
        let next = self.next.pop_front();
        self.waiting = next.clone();
        next
    }
}

pub(crate) fn listen(app: &AppHandle) {
    let handle = app.clone();
    // Frontend counterpart: src/platform/startup.ts, after a document paints.
    app.listen("moxie-document-ready", move |event| {
        if let Ok(label) = serde_json::from_str::<String>(event.payload()) {
            advance(&handle, &label);
        }
    });
}

pub(crate) fn enqueue(app: &AppHandle, windows: Vec<Vec<String>>) {
    let state = app.state::<DeferredWindows>();
    let mut queue = state.0.lock().unwrap();
    let starting = queue.waiting.is_none();
    let assigned = queue.assign(windows, || {
        format!("window-{}", crate::editor_windows::next_window_id())
    });
    // Persisted bookkeeping includes unbuilt windows. A first-window update
    // must not shrink a session whose other WebViews are still waiting.
    app.state::<crate::commands::session::SessionTabsState>()
        .0
        .lock()
        .unwrap()
        .extend(assigned);
    drop(queue);
    if starting {
        fallback(app.clone(), "main".into());
    }
}

pub(crate) fn take(app: &AppHandle, label: &str) -> Option<Vec<String>> {
    app.state::<DeferredWindows>()
        .0
        .lock()
        .unwrap()
        .assigned
        .remove(label)
}

/// A user who closes the last real window while others are pending must not
/// have it reopened by a fallback timer, nor lose the still-pending session.
pub(crate) fn cancel_if_last(app: &AppHandle, closed: &str) -> bool {
    if app
        .webview_windows()
        .keys()
        .any(|label| label != closed && crate::commands::chat_window::is_editor_window(label))
    {
        return false;
    }
    let state = app.state::<DeferredWindows>();
    let mut queue = state.0.lock().unwrap();
    let pending = !queue.next.is_empty() || !queue.assigned.is_empty();
    let cancelled: Vec<_> = queue.assigned.keys().cloned().collect();
    queue.cancelled.extend(cancelled);
    queue.next.clear();
    queue.assigned.clear();
    queue.waiting = None;
    queue.generation += 1;
    pending
}

pub(crate) fn was_cancelled(app: &AppHandle, label: &str) -> bool {
    app.state::<DeferredWindows>()
        .0
        .lock()
        .unwrap()
        .cancelled
        .contains(label)
}

/// A windowless app reads the saved session afresh when opened again.
pub(crate) fn reset(app: &AppHandle) {
    let state = app.state::<DeferredWindows>();
    let mut queue = state.0.lock().unwrap();
    let generation = queue.generation + 1;
    *queue = RestoreQueue {
        generation,
        ..Default::default()
    };
    app.state::<crate::commands::session::SessionTabsState>()
        .0
        .lock()
        .unwrap()
        .clear();
}

fn advance(app: &AppHandle, ready: &str) {
    if crate::commands::session::app_quitting() {
        fallback(app.clone(), ready.into());
        return;
    }
    let state = app.state::<DeferredWindows>();
    let mut queue = state.0.lock().unwrap();
    let next = queue.advance(ready);
    let generation = queue.generation;
    drop(queue);
    let Some(label) = next else {
        return;
    };
    let handle = app.clone();
    // Creating a WebView from a synchronous command can deadlock WebView2.
    tauri::async_runtime::spawn(async move {
        tokio::task::yield_now().await;
        if handle
            .state::<DeferredWindows>()
            .0
            .lock()
            .unwrap()
            .generation
            != generation
        {
            return;
        }
        crate::startup::mark("restore-window-start");
        let _ = crate::editor_windows::build_restored_window(&handle, &label);
        crate::startup::mark("restore-window-built");
        if handle
            .state::<DeferredWindows>()
            .0
            .lock()
            .unwrap()
            .generation
            != generation
        {
            if let Some(window) = handle.get_webview_window(&label) {
                let _ = window.destroy();
            }
            return;
        }
        // The first window is usable now. Continue native construction without
        // waiting for every other editor to parse its document in sequence.
        advance(&handle, &label);
    });
}

fn fallback(app: AppHandle, label: String) {
    tauri::async_runtime::spawn(async move {
        // A missing document or a failed page must not strand other windows.
        tokio::time::sleep(Duration::from_secs(3)).await;
        advance(&app, &label);
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn paths_belong_to_their_window_before_any_extra_webview_is_built() {
        let mut queue = RestoreQueue::default();
        let mut id = 0;
        let session = queue.assign(
            vec![vec!["a.md".into()], vec!["b.md".into(), "c.md".into()]],
            || {
                id += 1;
                format!("window-{id}")
            },
        );
        assert_eq!(session["main"], ["a.md"]);
        assert_eq!(session["window-1"], ["b.md", "c.md"]);
        assert_eq!(queue.assigned.remove("new-window"), None);
        assert_eq!(queue.assigned.remove("main"), Some(vec!["a.md".into()]));
        assert_eq!(queue.next, ["window-1"]);
    }

    #[test]
    fn duplicate_readiness_or_timeout_does_not_build_a_second_window() {
        let mut queue = RestoreQueue::default();
        let mut id = 0;
        queue.assign(vec![vec![], vec![], vec![]], || {
            id += 1;
            format!("window-{id}")
        });
        assert_eq!(queue.advance("chat-main"), None);
        assert_eq!(queue.advance("main"), Some("window-1".into()));
        assert_eq!(queue.advance("main"), None);
        assert_eq!(queue.advance("window-1"), Some("window-2".into()));
        assert_eq!(queue.advance("window-2"), None);
        assert!(queue.next.is_empty());
    }
}
