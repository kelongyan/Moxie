use std::fs;
use std::path::{Path, PathBuf};

use crate::recent::app_data_dir;

const MARKER_FILE: &str = "ActiveSession.json";

fn recovery_root() -> PathBuf {
    app_data_dir().join("Recovery")
}

fn workspace_root() -> PathBuf {
    app_data_dir().join("Workspace")
}

fn session_dir(session: &str) -> PathBuf {
    recovery_root().join(format!("Session-{}", session))
}

fn sanitize_id(id: &str) -> String {
    id.chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_')
        .collect()
}

fn write_atomic(path: &Path, content: &str) -> std::io::Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let name = path
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default();
    let temp = path.with_file_name(format!(".{}.tmp", name));
    fs::write(&temp, content)?;
    fs::rename(&temp, path)
}

// ---------- recovery session ----------

pub fn read_marker() -> Option<String> {
    let path = recovery_root().join(MARKER_FILE);
    fs::read_to_string(path)
        .ok()
        .and_then(|text| serde_json::from_str::<serde_json::Value>(&text).ok())
        .and_then(|value| value.get("session")?.as_str().map(|s| s.to_string()))
}

pub fn write_marker(session: &str) -> std::io::Result<()> {
    let value = serde_json::json!({ "session": session });
    write_atomic(
        &recovery_root().join(MARKER_FILE),
        &serde_json::to_string(&value)?,
    )
}

pub fn list_sessions() -> Vec<String> {
    let mut out = Vec::new();
    if let Ok(entries) = fs::read_dir(recovery_root()) {
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().into_owned();
            if let Some(rest) = name.strip_prefix("Session-") {
                if entry.path().is_dir() {
                    out.push(rest.to_string());
                }
            }
        }
    }
    out.sort();
    out
}

pub struct RecoveryEntry {
    pub doc_id: String,
    pub meta: String,
    pub content: String,
}

pub fn load_session(session: &str) -> Vec<RecoveryEntry> {
    let dir = session_dir(session);
    let mut out = Vec::new();
    let meta_files = match fs::read_dir(&dir) {
        Ok(entries) => entries,
        Err(_) => return out,
    };
    for entry in meta_files.flatten() {
        let name = entry.file_name().to_string_lossy().into_owned();
        if !name.ends_with(".json") {
            continue;
        }
        let doc_id = name.trim_end_matches(".json").to_string();
        let meta = match fs::read_to_string(entry.path()) {
            Ok(text) => text,
            Err(_) => continue,
        };
        let content = fs::read_to_string(dir.join(format!("{}.utf8", doc_id))).unwrap_or_default();
        out.push(RecoveryEntry {
            doc_id,
            meta,
            content,
        });
    }
    out.sort_by(|a, b| a.doc_id.cmp(&b.doc_id));
    out
}

pub fn save_doc(session: &str, doc_id: &str, meta: &str, content: &str) -> std::io::Result<()> {
    let id = sanitize_id(doc_id);
    let dir = session_dir(session);
    write_atomic(&dir.join(format!("{}.json", id)), meta)?;
    write_atomic(&dir.join(format!("{}.utf8", id)), content)
}

pub fn remove_doc(session: &str, doc_id: &str) {
    let id = sanitize_id(doc_id);
    let dir = session_dir(session);
    let _ = fs::remove_file(dir.join(format!("{}.json", id)));
    let _ = fs::remove_file(dir.join(format!("{}.utf8", id)));
}

pub fn cleanup(keep_session: &str) {
    for session in list_sessions() {
        if session != keep_session {
            let _ = fs::remove_dir_all(session_dir(&session));
        }
    }
}

pub fn finish_cleanly(session: &str) {
    let _ = fs::remove_dir_all(session_dir(session));
    let _ = fs::remove_file(recovery_root().join(MARKER_FILE));
}

// ---------- workspace snapshot ----------

const WORKSPACE_MARKER: &str = "CurrentWorkspace.json";

pub fn workspace_save(manifest: &str, docs: &[(String, String)]) -> std::io::Result<()> {
    let root = workspace_root();
    fs::create_dir_all(&root)?;
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let staging = root.join(format!("Workspace-{}.tmp", stamp));
    fs::create_dir_all(&staging)?;
    for (doc_id, content) in docs {
        let id = sanitize_id(doc_id);
        fs::write(staging.join(format!("{}.utf8", id)), content)?;
    }
    fs::write(staging.join("Manifest.json"), manifest)?;
    let final_dir = root.join(format!("Workspace-{}", stamp));
    if final_dir.exists() {
        fs::remove_dir_all(&final_dir)?;
    }
    fs::rename(&staging, &final_dir)?;
    let marker = serde_json::json!({ "workspace": format!("Workspace-{}", stamp) });
    write_atomic(&root.join(WORKSPACE_MARKER), &serde_json::to_string(&marker)?)
}

pub struct WorkspaceSnapshot {
    pub manifest: String,
    pub docs: Vec<(String, String)>,
}

pub fn workspace_load_and_consume() -> Option<WorkspaceSnapshot> {
    let root = workspace_root();
    let marker_path = root.join(WORKSPACE_MARKER);
    let marker_text = fs::read_to_string(&marker_path).ok()?;
    let marker: serde_json::Value = serde_json::from_str(&marker_text).ok()?;
    let dir_name = marker.get("workspace")?.as_str()?.to_string();
    let dir = root.join(&dir_name);

    let manifest = fs::read_to_string(dir.join("Manifest.json")).ok()?;
    let mut docs = Vec::new();
    if let Ok(entries) = fs::read_dir(&dir) {
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().into_owned();
            if let Some(doc_id) = name.strip_suffix(".utf8") {
                if let Ok(content) = fs::read_to_string(entry.path()) {
                    docs.push((doc_id.to_string(), content));
                }
            }
        }
    }

    let _ = fs::remove_file(&marker_path);
    let _ = fs::remove_dir_all(&dir);
    // remove any stale workspace dirs
    if let Ok(entries) = fs::read_dir(&root) {
        for entry in entries.flatten() {
            if entry.path().is_dir() {
                let _ = fs::remove_dir_all(entry.path());
            }
        }
    }

    Some(WorkspaceSnapshot { manifest, docs })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn isolate() -> std::sync::MutexGuard<'static, ()> {
        crate::testutil::isolate("recovery")
    }

    #[test]
    fn marker_round_trip_and_finish_cleanly() {
        let _g = isolate();
        assert!(read_marker().is_none());
        write_marker("s1").unwrap();
        assert_eq!(read_marker().as_deref(), Some("s1"));
        finish_cleanly("s1");
        assert!(read_marker().is_none());
    }

    #[test]
    fn doc_save_load_remove() {
        let _g = isolate();
        save_doc("s1", "doc-1", r#"{"a":1}"#, "内容 text").unwrap();
        let entries = load_session("s1");
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].doc_id, "doc-1");
        assert_eq!(entries[0].meta, r#"{"a":1}"#);
        assert_eq!(entries[0].content, "内容 text");

        remove_doc("s1", "doc-1");
        assert!(load_session("s1").is_empty());
    }

    #[test]
    fn cleanup_keeps_only_current_session() {
        let _g = isolate();
        save_doc("old", "d", "{}", "x").unwrap();
        save_doc("keep", "d", "{}", "y").unwrap();
        cleanup("keep");
        let sessions = list_sessions();
        assert_eq!(sessions, vec!["keep".to_string()]);
    }

    #[test]
    fn abnormal_exit_leaves_marker_and_content() {
        let _g = isolate();
        write_marker("crash-session").unwrap();
        save_doc("crash-session", "d1", r#"{"n":1}"#, "unsaved").unwrap();
        // simulate restart: marker present, session loadable
        assert_eq!(read_marker().as_deref(), Some("crash-session"));
        let entries = load_session("crash-session");
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].content, "unsaved");
    }

    #[test]
    fn workspace_save_and_consume_once() {
        let _g = isolate();
        let docs = vec![("d1".to_string(), "text1".to_string())];
        workspace_save(r#"{"version":1}"#, &docs).unwrap();

        let snap = workspace_load_and_consume().expect("snapshot present");
        assert_eq!(snap.manifest, r#"{"version":1}"#);
        assert_eq!(snap.docs.len(), 1);
        assert_eq!(snap.docs[0].1, "text1");

        assert!(workspace_load_and_consume().is_none());
    }

    #[test]
    fn doc_ids_are_sanitized() {
        let _g = isolate();
        save_doc("s2", "../evil", "{}", "x").unwrap();
        let entries = load_session("s2");
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].doc_id, "evil");
    }
}
