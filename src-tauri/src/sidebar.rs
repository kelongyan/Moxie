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

/// 旧版遗留键清理：工作区文件夹与展开状态属会话内状态，不再落盘（含磁盘上的历史值）
pub fn cleanup_legacy_keys() {
    let path = app_data_dir().join(FILE_NAME);
    let text = match std::fs::read_to_string(&path) {
        Ok(text) => text,
        Err(_) => return,
    };
    let mut value = match serde_json::from_str::<serde_json::Value>(&text) {
        Ok(value) => value,
        Err(_) => return,
    };
    let changed = match value.as_object_mut() {
        Some(obj) => {
            let had_workspace = obj.remove("workspacePath").is_some();
            let had_expanded = obj.remove("expandedDirs").is_some();
            had_workspace || had_expanded
        }
        None => false,
    };
    if changed {
        let _ = save(value);
    }
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DirEntryDto {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub is_markdown: bool,
    pub size: u64,
    pub modified_ms: u64,
}

const IGNORED_DIRS: &[&str] = &[
    ".git",
    "node_modules",
    "target",
    ".idea",
    ".vscode",
    "dist",
    "build",
    ".qoder-credits",
];

const MARKDOWN_EXTENSIONS: &[&str] = &["md", "markdown", "mdown", "mkd", "mkdown"];

pub fn list_dir(dir: &std::path::Path) -> Result<Vec<DirEntryDto>, String> {
    if !dir.exists() {
        return Err("目录不存在".to_string());
    }
    if !dir.is_dir() {
        return Err("目标不是文件夹".to_string());
    }

    let mut entries = Vec::new();
    let read_dir = std::fs::read_dir(dir).map_err(|e| e.to_string())?;

    for entry_res in read_dir {
        let entry = match entry_res {
            Ok(e) => e,
            Err(_) => continue,
        };

        let file_name = entry.file_name().to_string_lossy().to_string();
        // 忽略以点开头的隐藏文件或系统目录
        if file_name.starts_with('.') && file_name != ".md" {
            continue;
        }

        let path = entry.path();
        let metadata = match entry.metadata() {
            Ok(m) => m,
            Err(_) => continue,
        };

        let is_dir = metadata.is_dir();
        if is_dir && IGNORED_DIRS.contains(&file_name.as_str()) {
            continue;
        }

        let is_markdown = if is_dir {
            false
        } else {
            path.extension()
                .and_then(|ext| ext.to_str())
                .map(|ext| MARKDOWN_EXTENSIONS.contains(&ext.to_lowercase().as_str()))
                .unwrap_or(false)
        };

        let modified_ms = metadata
            .modified()
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);

        entries.push(DirEntryDto {
            name: file_name,
            path: path.to_string_lossy().to_string(),
            is_dir,
            is_markdown,
            size: if is_dir { 0 } else { metadata.len() },
            modified_ms,
        });
    }

    // 目录优先，按字母序大小写不敏感排序
    entries.sort_by(|a, b| {
        match (a.is_dir, b.is_dir) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
        }
    });

    Ok(entries)
}

pub fn create_file(path: &std::path::Path) -> Result<(), String> {
    if path.exists() {
        return Err("文件已存在".to_string());
    }
    if let Some(parent) = path.parent() {
        if !parent.exists() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
    }
    std::fs::File::create(path).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn create_dir(path: &std::path::Path) -> Result<(), String> {
    if path.exists() {
        return Err("目录已存在".to_string());
    }
    std::fs::create_dir_all(path).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn delete_path(path: &std::path::Path) -> Result<(), String> {
    if !path.exists() {
        return Err("路径不存在".to_string());
    }
    if path.is_dir() {
        std::fs::remove_dir_all(path).map_err(|e| e.to_string())
    } else {
        std::fs::remove_file(path).map_err(|e| e.to_string())
    }
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
            "groups": [{"id": "g1", "name": "工作", "expanded": true, "paths": ["C:\\b.txt"]}],
            "sections": {"groups": false, "recent": true}
        });
        save(value.clone()).unwrap();
        assert_eq!(load(), value);
    }

    #[test]
    fn legacy_workspace_keys_are_cleaned() {
        let _guard = isolate();
        save(serde_json::json!({
            "activeTab": "files",
            "workspacePath": "C:\\Users\\x\\Desktop\\notes",
            "expandedDirs": {"C:\\Users\\x\\Desktop\\notes": true}
        }))
        .unwrap();
        cleanup_legacy_keys();
        let value = load();
        assert!(value.get("workspacePath").is_none());
        assert!(value.get("expandedDirs").is_none());
        assert_eq!(value.get("activeTab").and_then(|v| v.as_str()), Some("files"));
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

    #[test]
    fn dir_operations_and_listing() {
        let _guard = isolate();
        let dir = std::env::temp_dir().join(format!("moxie-tree-test-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();

        let sub_dir = dir.join("subfolder");
        assert!(create_dir(&sub_dir).is_ok());
        assert!(create_dir(&sub_dir).is_err()); // duplicate

        let md_file = sub_dir.join("note.md");
        assert!(create_file(&md_file).is_ok());
        assert!(create_file(&md_file).is_err()); // duplicate

        let txt_file = dir.join("plain.txt");
        assert!(create_file(&txt_file).is_ok());

        // 测试 list_dir
        let entries = list_dir(&dir).unwrap();
        assert_eq!(entries.len(), 2);
        // 目录排在前面
        assert!(entries[0].is_dir);
        assert_eq!(entries[0].name, "subfolder");
        assert!(!entries[1].is_dir);
        assert_eq!(entries[1].name, "plain.txt");
        assert!(!entries[1].is_markdown);

        // 测试子目录 list_dir
        let sub_entries = list_dir(&sub_dir).unwrap();
        assert_eq!(sub_entries.len(), 1);
        assert_eq!(sub_entries[0].name, "note.md");
        assert!(sub_entries[0].is_markdown);

        // 测试 delete_path
        assert!(delete_path(&txt_file).is_ok());
        assert!(!txt_file.exists());
        assert!(delete_path(&sub_dir).is_ok());
        assert!(!sub_dir.exists());

        let _ = std::fs::remove_dir_all(&dir);
    }
}
