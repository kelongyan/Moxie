//! 外部文件修改监听：前端把打开文档所在目录发来，Rust 用 notify 监听，
//! 去抖去重后把变更文件路径推给主窗口。自身写盘的抑制由前端按时间窗完成。

use std::collections::HashSet;
use std::path::PathBuf;
use std::sync::Mutex;

use notify::{RecommendedWatcher, RecursiveMode, Watcher};
use tauri::Emitter;

struct WatchState {
    _watcher: RecommendedWatcher,
    dirs: HashSet<String>,
}

static WATCHER: Mutex<Option<WatchState>> = Mutex::new(None);

/// 与当前监听集合一致时是幂等空操作；否则重建 watcher（打开文档目录数量很小，重建最省心）
pub fn update_dirs(app: &tauri::AppHandle, dirs: Vec<String>) {
    let wanted: HashSet<String> = dirs.into_iter().collect();
    let mut guard = WATCHER.lock().unwrap_or_else(|e| e.into_inner());
    if let Some(state) = guard.as_ref() {
        if state.dirs == wanted {
            return;
        }
    }
    let (tx, rx) = std::sync::mpsc::channel();
    let mut watcher = match notify::recommended_watcher(tx) {
        Ok(w) => w,
        Err(_) => return, // 平台不支持时静默降级为无监听
    };
    for dir in &wanted {
        let _ = watcher.watch(std::path::Path::new(dir), RecursiveMode::NonRecursive);
    }
    *guard = Some(WatchState {
        _watcher: watcher,
        dirs: wanted,
    });

    let handle = app.clone();
    std::thread::spawn(move || {
        let mut pending: HashSet<String> = HashSet::new();
        loop {
            match rx.recv() {
                Ok(Ok(event)) => {
                    collect_paths(&event.paths, &mut pending);
                    // 400ms 窗口内的后续事件合并成一次推送
                    while let Ok(more) = rx.recv_timeout(std::time::Duration::from_millis(400)) {
                        if let Ok(ev) = more {
                            collect_paths(&ev.paths, &mut pending);
                        }
                    }
                    if !pending.is_empty() {
                        let paths: Vec<String> = pending.drain().collect();
                        let _ = handle.emit_to("main", "fs:changed", paths);
                    }
                }
                _ => break,
            }
        }
    });
}

fn collect_paths(paths: &[PathBuf], pending: &mut HashSet<String>) {
    for p in paths {
        if p.is_file() {
            pending.insert(p.to_string_lossy().into_owned());
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn collect_only_existing_files() {
        let mut pending: HashSet<String> = HashSet::new();
        let dir = std::env::temp_dir();
        let file = dir.join("moxie-watch-test.txt");
        std::fs::write(&file, "x").unwrap();
        collect_paths(
            &[file.clone(), dir.join("不存在的文件.txt")],
            &mut pending,
        );
        assert!(pending.contains(file.to_string_lossy().as_ref()));
        assert_eq!(pending.len(), 1);
        let _ = std::fs::remove_file(&file);
    }
}
