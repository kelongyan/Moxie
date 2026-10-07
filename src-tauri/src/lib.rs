mod codec;
pub mod encodings;
mod external;
pub mod file_io;
mod file_meta;
mod recent;
mod recovery;
mod sidebar;
mod timeline;
mod tray;
mod watcher;

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

/// 最近文件条目 DTO（camelCase，与前端 RecentEntry 对应）
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecentEntryDto {
    pub path: String,
    pub last_opened_ms: u64,
}

impl From<recent::RecentEntry> for RecentEntryDto {
    fn from(e: recent::RecentEntry) -> Self {
        RecentEntryDto {
            path: e.path,
            last_opened_ms: e.last_opened_ms,
        }
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
    let converted = apply_line_ending(&normalize_to_lf(&text), ending);
    let bytes = encodings::encode_strict(id, &converted).map_err(|e| match e {
        encodings::CodecError::Unrepresentable => "unrepresentable".to_string(),
        encodings::CodecError::DecodeFailed => "decode-failed".to_string(),
    })?;
    file_io::write_bytes_atomic(&path, &bytes).map_err(|e| e.to_string())
}

/// base64 → 字节落盘（图片粘贴/拖拽），复用原子写并自动创建父目录
#[command]
fn write_file_base64(path: PathBuf, data_base64: String) -> Result<(), String> {
    use base64::Engine;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(data_base64)
        .map_err(|e| format!("invalid-base64: {e}"))?;
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
fn read_file_base64(path: PathBuf) -> Result<String, String> {
    use base64::Engine;
    let bytes = file_io::read_bytes(&path).map_err(|e| e.to_string())?;
    Ok(base64::engine::general_purpose::STANDARD.encode(bytes))
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
fn recent_list() -> Vec<RecentEntryDto> {
    recent::list().into_iter().map(RecentEntryDto::from).collect()
}

#[command]
fn recent_add(path: String) -> Vec<RecentEntryDto> {
    recent::add(&path).into_iter().map(RecentEntryDto::from).collect()
}

#[command]
fn recent_remove(path: String) -> Vec<RecentEntryDto> {
    recent::remove(&path).into_iter().map(RecentEntryDto::from).collect()
}

#[command]
fn recent_clear() -> Vec<RecentEntryDto> {
    recent::clear().into_iter().map(RecentEntryDto::from).collect()
}

#[command]
fn recent_replace(old: String, new: String) -> Vec<RecentEntryDto> {
    recent::replace(&old, &new).into_iter().map(RecentEntryDto::from).collect()
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

#[command]
fn open_external(url: String) -> Result<(), String> {
    external::open_url(&url)
}

#[command]
fn allow_asset_directory(app: tauri::AppHandle, path: PathBuf) -> Result<(), String> {
    use tauri::Manager;
    app.asset_protocol_scope()
        .allow_directory(&path, true)
        .map_err(|e| e.to_string())
}

/// 打开文档目录的外部修改监听（幂等，集合不变时不重建）
#[command]
fn fs_watch(app: tauri::AppHandle, dirs: Vec<String>) {
    watcher::update_dirs(&app, dirs);
}

/// 托盘开关（设置页"关闭到托盘"切换；启动时按偏好恢复）
#[command]
fn tray_set_enabled(app: tauri::AppHandle, enabled: bool) -> Result<(), String> {
    if enabled {
        tray::build_tray(&app)
    } else {
        tray::destroy_tray();
        Ok(())
    }
}

/// 托盘"退出"：前端先保存工作区，再调本命令退出
#[command]
fn app_exit(app: tauri::AppHandle) {
    app.exit(0);
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TimelineEntryDto {
    pub timestamp_ms: u64,
    pub size: u64,
}

#[command]
fn timeline_save(path: String, content: String) -> Result<(), String> {
    timeline::save_snapshot(&path, &content)
}

#[command]
fn timeline_list(path: String) -> Vec<TimelineEntryDto> {
    timeline::list_snapshots(&path)
        .into_iter()
        .map(|e| TimelineEntryDto {
            timestamp_ms: e.timestamp_ms,
            size: e.size,
        })
        .collect()
}

#[command]
fn timeline_read(path: String, timestamp_ms: u64) -> Result<String, String> {
    timeline::read_snapshot(&path, timestamp_ms)
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

/// 从命令行参数筛出存在的 Markdown 文件（单实例二次启动 / 首次启动共用）
fn markdown_paths_from_args(argv: &[String]) -> Vec<String> {
    argv.iter()
        .skip(1)
        .filter(|arg| {
            let lower = arg.to_lowercase();
            ["md", "markdown", "mdown", "mkd", "mkdown"]
                .iter()
                .any(|ext| lower.rsplit('.').next() == Some(*ext))
                && std::path::Path::new(arg).is_file()
        })
        .cloned()
        .collect()
}

/// 首次启动的命令行文件参数（双击 .md 打开）
#[command]
fn launch_args() -> Vec<String> {
    markdown_paths_from_args(&std::env::args().collect::<Vec<String>>())
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
        // 单实例必须最先注册：二次启动把文件参数转发给主窗口
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            let paths = markdown_paths_from_args(&argv);
            if !paths.is_empty() {
                use tauri::Emitter;
                let _ = app.emit_to("main", "open-files-request", paths);
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .setup(|app| {
            // 上次开启过"关闭到托盘"则恢复托盘图标
            if recent::load_preferences()
                .get("isCloseToTray")
                .and_then(|v| v.as_bool())
                .unwrap_or(false)
            {
                let _ = tray::build_tray(app.handle());
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            read_text_file,
            read_text_file_with_encoding,
            write_text_file,
            write_file_base64,
            get_file_identity,
            get_file_revision,
            read_file_base64,
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
            open_external,
            allow_asset_directory,
            recovery_read_marker,
            recovery_write_marker,
            recovery_load,
            recovery_save_doc,
            recovery_remove_doc,
            recovery_cleanup,
            recovery_finish_cleanly,
            workspace_save,
            workspace_load_and_consume,
            launch_args,
            fs_watch,
            tray_set_enabled,
            app_exit,
            timeline_save,
            timeline_list,
            timeline_read
        ])
        .run(tauri::generate_context!())
        .expect("error while running Moxie");
}
