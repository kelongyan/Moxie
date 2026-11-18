//! History stores load on first use, before any read or mutation can see them.

use std::ops::Deref;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

pub struct LazyStore<T> {
    value: OnceLock<T>,
    path: PathBuf,
    load: fn(&Path) -> T,
}

impl<T> LazyStore<T> {
    pub fn new(path: PathBuf, load: fn(&Path) -> T) -> Self {
        Self {
            value: OnceLock::new(),
            path,
            load,
        }
    }

    /// Exit flushes only stores already used. Looking here must never start I/O.
    pub fn loaded(&self) -> Option<&T> {
        self.value.get()
    }
}

impl<T> Deref for LazyStore<T> {
    type Target = T;

    fn deref(&self) -> &T {
        // Initialization (including rebuilding a chat index) finishes before a
        // competing read or write gets the same, fully loaded store.
        self.value.get_or_init(|| (self.load)(&self.path))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::{Barrier, Mutex};

    #[test]
    fn simultaneous_first_users_share_one_fully_loaded_store() {
        static LOADS: AtomicUsize = AtomicUsize::new(0);
        let store = LazyStore::new(PathBuf::new(), |_| {
            LOADS.fetch_add(1, Ordering::SeqCst);
            Mutex::new(vec!["saved".to_owned()])
        });
        assert!(store.loaded().is_none());
        assert_eq!(LOADS.load(Ordering::SeqCst), 0);
        let start = Barrier::new(8);
        std::thread::scope(|scope| {
            for i in 0..8 {
                let store = &store;
                let start = &start;
                scope.spawn(move || {
                    start.wait();
                    let mut data = store.lock().unwrap();
                    assert_eq!(data[0], "saved");
                    data.push(i.to_string());
                });
            }
        });
        assert_eq!(LOADS.load(Ordering::SeqCst), 1);
        assert_eq!(store.loaded().unwrap().lock().unwrap().len(), 9);
    }
}
