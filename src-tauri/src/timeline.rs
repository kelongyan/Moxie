//! 本地版本时间线：每次成功写盘快照一次正文，按文件分槽保存，
//! 每个文件保留最近 TIMELINE_KEEP 份；路径用 FNV-1a 哈希做目录名。

use std::fs;
use std::hash::{Hash, Hasher};
use std::path::PathBuf;

use crate::recent::app_data_dir;

const TIMELINE_KEEP: usize = 20;

fn slot_for(path: &str) -> PathBuf {
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    path.hash(&mut hasher);
    app_data_dir().join("Timeline").join(format!("{:016x}", hasher.finish()))
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TimelineEntry {
    pub timestamp_ms: u64,
    pub size: u64,
}

fn list_files(slot: &PathBuf) -> Vec<(u64, PathBuf)> {
    let mut entries: Vec<(u64, PathBuf)> = fs::read_dir(slot)
        .into_iter()
        .flatten()
        .flatten()
        .filter_map(|e| {
            let name = e.file_name().to_string_lossy().into_owned();
            let ts: u64 = name.strip_suffix(".utf8")?.parse().ok()?;
            Some((ts, e.path()))
        })
        .collect();
    entries.sort_by_key(|(ts, _)| std::cmp::Reverse(*ts));
    entries
}

/// 保存快照并裁剪到上限；时间戳取毫秒，同一毫秒追加纳秒偏移防覆盖
pub fn save_snapshot(path: &str, content: &str) -> Result<(), String> {
    let slot = slot_for(path);
    fs::create_dir_all(&slot).map_err(|e| e.to_string())?;
    let existing = list_files(&slot);
    let mut ts: u64 = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);
    if existing.first().map(|(t, _)| *t) == Some(ts) {
        ts += 1;
    }
    crate::file_io::write_bytes_atomic(&slot.join(format!("{ts}.utf8")), content.as_bytes())
        .map_err(|e| e.to_string())?;
    for (_, stale) in list_files(&slot).into_iter().skip(TIMELINE_KEEP) {
        let _ = fs::remove_file(stale);
    }
    Ok(())
}

pub fn list_snapshots(path: &str) -> Vec<TimelineEntry> {
    list_files(&slot_for(path))
        .into_iter()
        .map(|(ts, p)| TimelineEntry {
            timestamp_ms: ts,
            size: fs::metadata(p).map(|m| m.len()).unwrap_or(0),
        })
        .collect()
}

pub fn read_snapshot(path: &str, timestamp_ms: u64) -> Result<String, String> {
    let file = slot_for(path).join(format!("{timestamp_ms}.utf8"));
    fs::read_to_string(file).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testutil::isolate;

    #[test]
    fn save_list_read_and_prune() {
        let _guard = isolate("timeline");
        let path = "C:\\docs\\demo.md";
        for i in 0..(TIMELINE_KEEP + 5) {
            save_snapshot(path, &format!("版本 {i}")).unwrap();
            std::thread::sleep(std::time::Duration::from_millis(2));
        }
        let entries = list_snapshots(path);
        assert_eq!(entries.len(), TIMELINE_KEEP);
        // 最新的排最前
        assert!(entries[0].timestamp_ms > entries[1].timestamp_ms);
        let content = read_snapshot(path, entries[0].timestamp_ms).unwrap();
        assert!(content.starts_with("版本 "));
        // 另一文件互不干扰
        assert!(list_snapshots("C:\\docs\\other.md").is_empty());
    }
}
