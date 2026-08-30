mod codec;
pub mod encodings;
pub mod file_io;
mod file_meta;
pub mod json_format;
mod recent;
mod recovery;
mod sidebar;

#[cfg(test)]
pub(crate) mod testutil {
    use std::sync::atomic::{AtomicU32, Ordering};
    use std::sync::{Mutex, MutexGuard};

    static GUARD: Mutex<()> = Mutex::new(());
    static SEQ: AtomicU32 = AtomicU32::new(0);

    pub fn isolate(prefix: &str) -> MutexGuard<'static, ()> {
        let guard = GUARD.lock().unwrap_or_else(|e| e.into_inner());
        let seq = SEQ.fetch_add(1, Ordering::SeqCst);
        let dir = std::env::temp_dir().join(format!(
            "moxie-test-{}-{}-{}",
            std::process::id(),
            prefix,
            seq
        ));
        let _ = std::fs::remove_dir_all(&dir);
        std::env::set_var("MOXIE_DATA_DIR", &dir);
        guard
    }
}

use std::path::PathBuf;
use tauri::command;

use encodings::{apply_line_ending, detect_line_ending, normalize_to_lf, EncodingId, LineEnding};

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadResult {
    pub text: String,
    pub encoding: String,
    pub line_ending: String,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RevisionResult {
    pub identity: String,
    pub modified_ms: u64,
    pub size: u64,
}

fn finish_read(text: String, encoding: EncodingId) -> ReadResult {
    let line_ending = detect_line_ending(&text);
    ReadResult {
        text: normalize_to_lf(&text),
        encoding: encoding.as_str().to_string(),
        line_ending: line_ending.as_str().to_string(),
    }
}

#[command]
fn read_text_file(path: PathBuf) -> Result<ReadResult, String> {
    let bytes = file_io::read_bytes(&path).map_err(|e| e.to_string())?;
    match String::from_utf8(bytes) {
        Ok(text) => Ok(finish_read(text, EncodingId::Utf8)),
        Err(_) => Err("not-utf8".to_string()),
    }
}

#[command]
fn read_text_file_with_encoding(path: PathBuf, encoding: String) -> Result<ReadResult, String> {
    let id = EncodingId::parse(&encoding).ok_or_else(|| "unknown-encoding".to_string())?;
    let bytes = file_io::read_bytes(&path).map_err(|e| e.to_string())?;
    let (resolved, payload) = match id {
        EncodingId::Utf16Le | EncodingId::Utf16Be => encodings::detect_utf16_variant(&bytes),
        other => (other, bytes.as_slice()),
    };
    let text = encodings::decode_strict(resolved, payload).map_err(|e| match e {
        encodings::CodecError::DecodeFailed => "decode-failed".to_string(),
        encodings::CodecError::Unrepresentable => "unrepresentable".to_string(),
    })?;
    Ok(finish_read(text, resolved))
}

#[command]
fn write_text_file(
    path: PathBuf,
    text: String,
    encoding: String,
    line_ending: String,
) -> Result<(), String> {
    let id = EncodingId::parse(&encoding).ok_or_else(|| "unknown-encoding".to_string())?;
    let ending = match line_ending.as_str() {
        "cr" => LineEnding::Cr,
        "crlf" => LineEnding::Crlf,
        _ => LineEnding::Lf,
    };
    let converted = apply_line_ending(&text, ending);
    let bytes = encodings::encode_strict(id, &converted).map_err(|e| match e {
        encodings::CodecError::Unrepresentable => "unrepresentable".to_string(),
        encodings::CodecError::DecodeFailed => "decode-failed".to_string(),
    })?;
    file_io::write_bytes_atomic(&path, &bytes).map_err(|e| e.to_string())
}

#[command]
fn get_file_identity(path: PathBuf) -> String {
    file_meta::file_identity(&path)
}

#[command]
fn get_file_revision(path: PathBuf) -> Result<RevisionResult, String> {
    file_meta::file_revision(&path)
        .map(|r| RevisionResult {
            identity: r.identity,
            modified_ms: r.modified_ms,
            size: r.size,
        })
        .map_err(|e| e.to_string())
}

#[command]
fn json_format(text: String, mode: String) -> Result<String, String> {
    let parsed_mode = match mode.as_str() {
        "minify" => json_format::JsonMode::Minify,
        _ => json_format::JsonMode::Pretty,
    };
    json_format::format_json(&text, parsed_mode)
}

#[command]
fn codec_op(operation: String, text: String, confirmed: bool) -> Result<String, String> {
    codec::run_operation(&operation, &text, confirmed).map_err(|e| {
        if e.needs_confirmation {
            format!("confirm:{}", e.message)
        } else {
            e.message
        }
    })
}

#[command]
fn recent_list() -> Vec<String> {
    recent::list()
}

#[command]
fn recent_add(path: String) -> Vec<String> {
    recent::add(&path)
}

#[command]
fn recent_remove(path: String) -> Vec<String> {
    recent::remove(&path)
}

#[command]
fn recent_clear() -> Vec<String> {
    recent::clear()
}

#[command]
fn recent_replace(old: String, new: String) -> Vec<String> {
    recent::replace(&old, &new)
}

#[command]
fn settings_load() -> serde_json::Value {
    recent::load_preferences()
}

#[command]
fn settings_save(value: serde_json::Value) {
    recent::save_preferences(value);
}

#[command]
fn sidebar_load() -> serde_json::Value {
    sidebar::load()
}

#[command]
fn sidebar_save(value: serde_json::Value) -> Result<(), String> {
    sidebar::save(value).map_err(|e| e.to_string())
}

#[command]
fn rename_file(from: PathBuf, to: PathBuf) -> Result<(), String> {
    sidebar::rename_file(&from, &to)
}

#[command]
fn explorer_select(path: PathBuf) -> Result<(), String> {
    sidebar::reveal_in_explorer(&path)
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecoveryEntryDto {
    pub doc_id: String,
    pub meta: String,
    pub content: String,
}

#[command]
fn recovery_read_marker() -> Option<String> {
    recovery::read_marker()
}

#[command]
fn recovery_write_marker(session: String) -> Result<(), String> {
    recovery::write_marker(&session).map_err(|e| e.to_string())
}

#[command]
fn recovery_load(session: String) -> Vec<RecoveryEntryDto> {
    recovery::load_session(&session)
        .into_iter()
        .map(|e| RecoveryEntryDto {
            doc_id: e.doc_id,
            meta: e.meta,
            content: e.content,
        })
        .collect()
}

#[command]
fn recovery_save_doc(session: String, doc_id: String, meta: String, content: String) -> Result<(), String> {
    recovery::save_doc(&session, &doc_id, &meta, &content).map_err(|e| e.to_string())
}

#[command]
fn recovery_remove_doc(session: String, doc_id: String) {
    recovery::remove_doc(&session, &doc_id);
}

#[command]
fn recovery_cleanup(keep_session: String) {
    recovery::cleanup(&keep_session);
}

#[command]
fn recovery_finish_cleanly(session: String) {
    recovery::finish_cleanly(&session);
}

#[command]
fn workspace_save(manifest: String, docs: Vec<(String, String)>) -> Result<(), String> {
    recovery::workspace_save(&manifest, &docs).map_err(|e| e.to_string())
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceSnapshotDto {
    pub manifest: String,
    pub docs: Vec<(String, String)>,
}

#[command]
fn workspace_load_and_consume() -> Option<WorkspaceSnapshotDto> {
    recovery::workspace_load_and_consume().map(|s| WorkspaceSnapshotDto {
        manifest: s.manifest,
        docs: s.docs,
    })
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            read_text_file,
            read_text_file_with_encoding,
            write_text_file,
            get_file_identity,
            get_file_revision,
            json_format,
            codec_op,
            recent_list,
            recent_add,
            recent_remove,
            recent_clear,
            recent_replace,
            settings_load,
            settings_save,
            sidebar_load,
            sidebar_save,
            rename_file,
            explorer_select,
            recovery_read_marker,
            recovery_write_marker,
            recovery_load,
            recovery_save_doc,
            recovery_remove_doc,
            recovery_cleanup,
            recovery_finish_cleanly,
            workspace_save,
            workspace_load_and_consume
        ])
        .run(tauri::generate_context!())
        .expect("error while running Moxie");
}
