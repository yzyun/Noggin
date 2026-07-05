//! Watches the vault folder and forwards change events to the frontend as
//! `vault:changed` with the affected absolute paths. The frontend debounces
//! and re-indexes; .studydb/ changes are ignored (that's our own writing).

use std::path::PathBuf;

use notify::{Event, RecommendedWatcher, RecursiveMode, Watcher};
use tauri::{AppHandle, Emitter};

use crate::vault::STUDYDB_DIR;

pub fn start(app: AppHandle, root: PathBuf) -> notify::Result<RecommendedWatcher> {
    let studydb = root.join(STUDYDB_DIR);
    let mut watcher = notify::recommended_watcher(move |res: notify::Result<Event>| {
        let Ok(event) = res else { return };
        let paths: Vec<String> = event
            .paths
            .iter()
            .filter(|p| !p.starts_with(&studydb))
            .map(|p| p.to_string_lossy().into_owned())
            .collect();
        if !paths.is_empty() {
            let _ = app.emit("vault:changed", paths);
        }
    })?;
    watcher.watch(&root, RecursiveMode::Recursive)?;
    Ok(watcher)
}
