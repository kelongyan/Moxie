use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq)]
pub struct FileRevision {
    pub identity: String,
    pub modified_ms: u64,
    pub size: u64,
}

#[cfg(windows)]
fn identity_from_handle(path: &Path) -> Option<String> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Foundation::{CloseHandle, INVALID_HANDLE_VALUE, GENERIC_READ};
    use windows_sys::Win32::Storage::FileSystem::{
        CreateFileW, GetFileInformationByHandle, BY_HANDLE_FILE_INFORMATION,
        FILE_FLAG_BACKUP_SEMANTICS, FILE_SHARE_DELETE, FILE_SHARE_READ, FILE_SHARE_WRITE,
        OPEN_EXISTING,
    };

    let wide: Vec<u16> = path
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();
    unsafe {
        let handle = CreateFileW(
            wide.as_ptr(),
            GENERIC_READ,
            FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
            std::ptr::null(),
            OPEN_EXISTING,
            FILE_FLAG_BACKUP_SEMANTICS,
            std::ptr::null_mut(),
        );
        if handle.is_null() || handle == INVALID_HANDLE_VALUE {
            return None;
        }
        let mut info: BY_HANDLE_FILE_INFORMATION = std::mem::zeroed();
        let ok = GetFileInformationByHandle(handle, &mut info);
        CloseHandle(handle);
        if ok == 0 {
            return None;
        }
        Some(format!(
            "win:{}:{:x}{:08x}",
            info.dwVolumeSerialNumber, info.nFileIndexHigh, info.nFileIndexLow
        ))
    }
}

#[cfg(not(windows))]
fn identity_from_handle(_path: &Path) -> Option<String> {
    None
}

fn normalized_path_identity(path: &Path) -> String {
    let canonical = std::fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf());
    format!("path:{}", canonical.to_string_lossy().to_lowercase())
}

pub fn file_identity(path: &Path) -> String {
    identity_from_handle(path).unwrap_or_else(|| normalized_path_identity(path))
}

#[allow(dead_code)]
pub fn canonical_path(path: &Path) -> PathBuf {
    std::fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf())
}

pub fn file_revision(path: &Path) -> std::io::Result<FileRevision> {
    let meta = std::fs::metadata(path)?;
    let modified_ms = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);
    Ok(FileRevision {
        identity: file_identity(path),
        modified_ms,
        size: meta.len(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU32, Ordering};

    static COUNTER: AtomicU32 = AtomicU32::new(0);

    fn fixture(name: &str) -> PathBuf {
        let n = COUNTER.fetch_add(1, Ordering::SeqCst);
        let dir = std::env::temp_dir().join(format!("laceditor-meta-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        dir.join(format!("{n}-{name}"))
    }

    #[test]
    fn identity_is_stable_and_unique() {
        let a = fixture("a.txt");
        let b = fixture("b.txt");
        std::fs::write(&a, "x").unwrap();
        std::fs::write(&b, "x").unwrap();
        assert_eq!(file_identity(&a), file_identity(&a));
        assert_ne!(file_identity(&a), file_identity(&b));
    }

    #[cfg(windows)]
    #[test]
    fn hard_link_shares_identity() {
        let a = fixture("link-src.txt");
        let link = fixture("link-dst.txt");
        std::fs::write(&a, "same file").unwrap();
        std::fs::hard_link(&a, &link).unwrap();
        assert_eq!(file_identity(&a), file_identity(&link));
    }

    #[test]
    fn revision_changes_with_content() {
        let f = fixture("rev.txt");
        std::fs::write(&f, "first").unwrap();
        let r1 = file_revision(&f).unwrap();
        std::fs::write(&f, "second, longer").unwrap();
        let r2 = file_revision(&f).unwrap();
        assert_ne!(r1.size, r2.size);
        assert!(r2.modified_ms >= r1.modified_ms);
    }
}
