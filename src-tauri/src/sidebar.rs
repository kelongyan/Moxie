use std::path::PathBuf;

use crate::recent::app_data_dir;

const FILE_NAME: &str = "SidebarLibrary.json";

pub fn load() -> serde_json::Value {
    let path = app_data_dir().join(FILE_NAME);
    std::fs::read_to_string(path)
        .ok()
        .and_then(|text| serde_json::from_str(&text).ok())
        .unwrap_or_else(|| serde_json::json!({}))
}

pub fn save(value: serde_json::Value) -> std::io::Result<()> {
    let dir = app_data_dir();
    std::fs::create_dir_all(&dir)?;
    let path = dir.join(FILE_NAME);
    let temp = dir.join(format!(".{FILE_NAME}.tmp"));
    std::fs::write(&temp, serde_json::to_string_pretty(&value)?)?;
    std::fs::rename(&temp, &path)
}

pub fn rename_file(from: &std::path::Path, to: &std::path::Path) -> Result<(), String> {
    if to.exists() {
        return Err("目标文件已存在".to_string());
    }
    std::fs::rename(from, to).map_err(|e| e.to_string())
}

#[cfg(windows)]
pub fn reveal_in_explorer(path: &std::path::Path) -> Result<(), String> {
    std::process::Command::new("explorer")
        .arg(format!("/select,{}", path.to_string_lossy()))
        .spawn()
        .map(|_| ())
        .map_err(|e| e.to_string())
}

#[cfg(not(windows))]
pub fn reveal_in_explorer(_path: &std::path::Path) -> Result<(), String> {
    Err("当前平台不支持".to_string())
}

#[allow(dead_code)]
pub fn sidebar_path() -> PathBuf {
    app_data_dir().join(FILE_NAME)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn isolate() -> std::sync::MutexGuard<'static, ()> {
        crate::testutil::isolate("sidebar")
    }

    #[test]
    fn sidebar_round_trip() {
        let _guard = isolate();
        let value = serde_json::json!({
            "favorites": ["C:\\a.txt"],
            "groups": [{"id": "g1", "name": "工作", "expanded": true, "paths": ["C:\\b.txt"]}],
            "sections": {"favorites": true, "groups": false, "recent": true}
        });
        save(value.clone()).unwrap();
        assert_eq!(load(), value);
    }

    #[test]
    fn rename_rejects_existing_target() {
        let _guard = isolate();
        let dir = std::env::temp_dir().join(format!("laceditor-rename-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let a = dir.join("a.txt");
        let b = dir.join("b.txt");
        std::fs::write(&a, "x").unwrap();
        std::fs::write(&b, "y").unwrap();
        assert!(rename_file(&a, &b).is_err());
        let c = dir.join("c.txt");
        assert!(rename_file(&a, &c).is_ok());
        assert!(c.exists() && !a.exists());
    }
}
