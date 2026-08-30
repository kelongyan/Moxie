use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

#[derive(Debug, thiserror::Error)]
pub enum FileIoError {
    #[error("io: {0}")]
    Io(#[from] std::io::Error),
    #[error("not-utf8")]
    NotUtf8,
    #[error("decode-failed")]
    DecodeFailed,
    #[error("unrepresentable")]
    Unrepresentable,
}

pub type Result<T> = std::result::Result<T, FileIoError>;

pub fn read_bytes(path: &Path) -> Result<Vec<u8>> {
    Ok(fs::read(path)?)
}

#[allow(dead_code)]
pub fn read_text_utf8(path: &Path) -> Result<String> {
    let bytes = read_bytes(path)?;
    String::from_utf8(bytes).map_err(|_| FileIoError::NotUtf8)
}

fn temp_path_for(path: &Path) -> PathBuf {
    let name = path
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default();
    path.with_file_name(format!(".{name}.lac-tmp"))
}

pub fn write_bytes_atomic(path: &Path, bytes: &[u8]) -> Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let temp = temp_path_for(path);
    let outcome = (|| -> std::io::Result<()> {
        let mut file = fs::File::create(&temp)?;
        file.write_all(bytes)?;
        file.sync_all()?;
        fs::rename(&temp, path)
    })();
    if outcome.is_err() {
        let _ = fs::remove_file(&temp);
    }
    outcome?;
    Ok(())
}

#[allow(dead_code)]
pub fn write_text_atomic(path: &Path, text: &str) -> Result<()> {
    write_bytes_atomic(path, text.as_bytes())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU32, Ordering};

    static COUNTER: AtomicU32 = AtomicU32::new(0);

    fn fixture_dir() -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "laceditor-file-io-{}",
            std::process::id()
        ));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn fixture_path(name: &str) -> PathBuf {
        let n = COUNTER.fetch_add(1, Ordering::SeqCst);
        fixture_dir().join(format!("{n}-{name}"))
    }

    #[test]
    fn utf8_round_trip_is_byte_identical() {
        let path = fixture_path("roundtrip.txt");
        let text = "Moxie 中文与 emoji 🚀\nline2\t制表符";
        write_text_atomic(&path, text).unwrap();
        assert_eq!(read_text_utf8(&path).unwrap(), text);
        assert_eq!(fs::read(&path).unwrap(), text.as_bytes());
    }

    #[test]
    fn overwrite_replaces_previous_content() {
        let path = fixture_path("overwrite.txt");
        write_text_atomic(&path, "第一版的较长内容").unwrap();
        write_text_atomic(&path, "短").unwrap();
        assert_eq!(read_text_utf8(&path).unwrap(), "短");
    }

    #[test]
    fn non_utf8_bytes_are_rejected() {
        let path = fixture_path("latin1.txt");
        fs::write(&path, [0xC7, 0xED, 0xB4, 0xFA, 0xB1, 0xED]).unwrap();
        assert!(matches!(
            read_text_utf8(&path).unwrap_err(),
            FileIoError::NotUtf8
        ));
    }

    #[test]
    fn successful_write_leaves_no_temp_file() {
        let path = fixture_path("temp-clean.txt");
        write_text_atomic(&path, "内容").unwrap();
        let own_temp = format!(
            ".{}.lac-tmp",
            path.file_name().unwrap().to_string_lossy()
        );
        let leftovers: Vec<_> = fs::read_dir(path.parent().unwrap())
            .unwrap()
            .filter_map(|e| e.ok())
            .filter(|e| e.file_name().to_string_lossy() == own_temp)
            .collect();
        assert!(leftovers.is_empty());
    }

    #[test]
    fn four_mib_round_trip_is_byte_identical() {
        let path = fixture_path("four-mib.txt");
        let line = "console.log(\"Moxie 大文件往返 0123456789\");\n";
        let target = 4 * 1024 * 1024;
        let mut text = String::with_capacity(target + line.len());
        while text.len() < target {
            text.push_str(line);
        }
        write_text_atomic(&path, &text).unwrap();
        let bytes = fs::read(&path).unwrap();
        assert_eq!(bytes, text.as_bytes());
        assert!(bytes.len() >= target);
    }
}
