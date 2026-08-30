use std::path::PathBuf;

const RECENT_LIMIT: usize = 12;
const FILE_NAME: &str = "preferences.json";

#[derive(Debug, Default, serde::Serialize, serde::Deserialize)]
struct PreferencesFile {
    #[serde(default)]
    recent_file_paths: Vec<String>,
    #[serde(default)]
    preferences: serde_json::Value,
}

pub fn app_data_dir() -> PathBuf {
    if let Ok(dir) = std::env::var("MOXIE_DATA_DIR") {
        return PathBuf::from(dir);
    }
    let base = std::env::var("APPDATA")
        .map(PathBuf::from)
        .unwrap_or_else(|_| std::env::temp_dir());
    base.join("Moxie")
}

fn prefs_path() -> PathBuf {
    app_data_dir().join(FILE_NAME)
}

fn load() -> PreferencesFile {
    std::fs::read_to_string(prefs_path())
        .ok()
        .and_then(|text| serde_json::from_str(&text).ok())
        .unwrap_or_default()
}

fn save(prefs: &PreferencesFile) -> std::io::Result<()> {
    let dir = app_data_dir();
    std::fs::create_dir_all(&dir)?;
    let path = prefs_path();
    let temp = dir.join(format!(".{FILE_NAME}.tmp"));
    std::fs::write(&temp, serde_json::to_string_pretty(prefs)?)?;
    std::fs::rename(&temp, &path)
}

pub fn load_preferences() -> serde_json::Value {
    load().preferences
}

pub fn save_preferences(value: serde_json::Value) {
    let mut prefs = load();
    prefs.preferences = value;
    let _ = save(&prefs);
}

fn normalize(path: &str) -> String {
    std::fs::canonicalize(path)
        .map(|p| {
            let s = p.to_string_lossy();
            s.strip_prefix(r"\\?\").unwrap_or(&s).to_string()
        })
        .unwrap_or_else(|_| path.to_string())
}

pub fn list() -> Vec<String> {
    load().recent_file_paths
}

pub fn add(path: &str) -> Vec<String> {
    let entry = normalize(path);
    let mut prefs = load();
    prefs.recent_file_paths.retain(|p| *p != entry);
    prefs.recent_file_paths.insert(0, entry);
    prefs.recent_file_paths.truncate(RECENT_LIMIT);
    let _ = save(&prefs);
    prefs.recent_file_paths
}

pub fn remove(path: &str) -> Vec<String> {
    let mut prefs = load();
    prefs.recent_file_paths.retain(|p| *p != path);
    let _ = save(&prefs);
    prefs.recent_file_paths
}

pub fn clear() -> Vec<String> {
    let mut prefs = load();
    prefs.recent_file_paths.clear();
    let _ = save(&prefs);
    prefs.recent_file_paths
}

pub fn replace(old: &str, new: &str) -> Vec<String> {
    let mut prefs = load();
    let target = normalize(new);
    for entry in prefs.recent_file_paths.iter_mut() {
        if *entry == old {
            *entry = target.clone();
        }
    }
    let _ = save(&prefs);
    prefs.recent_file_paths
}

#[cfg(test)]
mod tests {
    use super::*;

    fn isolate() -> std::sync::MutexGuard<'static, ()> {
        crate::testutil::isolate("recent")
    }

    #[test]
    fn add_deduplicates_caps_and_orders() {
        let _guard = isolate();
        clear();
        for i in 0..15 {
            add(&format!("C:\\fake\\file{i}.txt"));
        }
        let entries = list();
        assert_eq!(entries.len(), RECENT_LIMIT);
        assert_eq!(entries[0], "C:\\fake\\file14.txt");
        add("C:\\fake\\file10.txt");
        let entries = list();
        assert_eq!(entries[0], "C:\\fake\\file10.txt");
        assert_eq!(
            entries.iter().filter(|p| **p == "C:\\fake\\file10.txt").count(),
            1
        );
        remove("C:\\fake\\file10.txt");
        assert!(!list().contains(&"C:\\fake\\file10.txt".to_string()));
        clear();
        assert!(list().is_empty());
    }
}
