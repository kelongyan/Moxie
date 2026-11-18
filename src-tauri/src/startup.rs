//! Opt-in startup timings. Only phase names and durations are recorded; no
//! document paths, settings or user text enter the trace.

use serde::Serialize;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};
use std::time::Instant;
use tauri::Listener;

struct Trace {
    started: Instant,
    path: PathBuf,
    phases: Mutex<Vec<Phase>>,
}

#[derive(Clone, Serialize)]
struct Phase {
    name: String,
    elapsed_ms: f64,
    page_ms: Option<f64>,
}

static TRACE: OnceLock<Option<Trace>> = OnceLock::new();

/// Called at the executable's entry, before CLI classification or Tauri.
pub fn begin() {
    TRACE.get_or_init(|| {
        std::env::var_os("MOXIE_STARTUP_TRACE").map(|path| Trace {
            started: Instant::now(),
            path: path.into(),
            phases: Mutex::new(Vec::new()),
        })
    });
    mark("process-entry");
}

pub(crate) fn enabled() -> bool {
    TRACE.get().is_some_and(Option::is_some)
}

pub(crate) fn mark(name: &str) {
    record(name, None);
}

fn record(name: &str, page_ms: Option<f64>) {
    if let Some(Some(trace)) = TRACE.get() {
        trace.phases.lock().unwrap().push(Phase {
            name: name.into(),
            elapsed_ms: trace.started.elapsed().as_secs_f64() * 1000.0,
            page_ms,
        });
    }
}

pub(crate) fn listen(app: &tauri::AppHandle) {
    if !enabled() {
        return;
    }
    app.listen("moxie-startup-phase", |event| {
        #[derive(serde::Deserialize)]
        struct PagePhase {
            phase: String,
            at: f64,
        }
        let Ok(phase) = serde_json::from_str::<PagePhase>(event.payload()) else {
            return;
        };
        if !matches!(
            phase.phase.as_str(),
            "main" | "shell" | "document" | "restored" | "settled"
        ) || !phase.at.is_finite()
            || phase.at < 0.0
        {
            return;
        }
        record(&phase.phase, Some(phase.at));
        if phase.phase == "settled" {
            flush();
        }
    });
}

pub(crate) fn flush() {
    let Some(Some(trace)) = TRACE.get() else {
        return;
    };
    let phases = trace.phases.lock().unwrap().clone();
    if let Ok(json) = serde_json::to_vec_pretty(&phases) {
        let _ = std::fs::write(&trace.path, json);
    }
}
