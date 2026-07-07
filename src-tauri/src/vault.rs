//! The vault: a user-chosen folder of plain files (questions/, notes/,
//! attachments/) plus an app-owned .studydb/ directory holding the SQLite
//! index and config. All filesystem commands are scoped to the vault root —
//! relative paths only, no traversal outside it.

use std::fs;
use std::path::{Component, Path, PathBuf};
use std::sync::Mutex;

use rusqlite::Connection;
use tauri::{AppHandle, Manager, State};

use crate::error::{Error, Result};
use crate::{db, watcher};

pub const STUDYDB_DIR: &str = ".studydb";
const INDEX_FILE: &str = "index.sqlite";
const CONFIG_FILE: &str = "config.json";
const VAULT_SUBDIRS: [&str; 4] = ["questions", "notes", "papers", "attachments"];

const DEFAULT_CONFIG: &str = r#"{
  "schemaVersion": 1,
  "newPerDay": 20,
  "maxReviewsPerDay": 200
}
"#;

/// An open vault: root folder + live SQLite connection + fs watcher.
pub struct OpenVault {
    pub root: PathBuf,
    pub db: Connection,
    // Held to keep the watcher alive; dropped when the vault closes.
    _watcher: notify::RecommendedWatcher,
}

/// Global app state: at most one open vault.
pub struct AppState(pub Mutex<Option<OpenVault>>);

/// Resolve a vault-relative path safely (rejects absolute paths and `..`).
fn resolve(root: &Path, rel: &str) -> Result<PathBuf> {
    let rel_path = Path::new(rel);
    if rel_path.is_absolute() {
        return Err(Error::msg("absolute paths are not allowed"));
    }
    for c in rel_path.components() {
        match c {
            Component::Normal(_) | Component::CurDir => {}
            _ => return Err(Error::msg(format!("illegal path component in '{rel}'"))),
        }
    }
    Ok(root.join(rel_path))
}

/// Run `f` with the open vault, or fail if none is open.
fn with_vault<T>(state: &State<'_, AppState>, f: impl FnOnce(&OpenVault) -> Result<T>) -> Result<T> {
    let guard = state.0.lock().map_err(|_| Error::msg("state lock poisoned"))?;
    match guard.as_ref() {
        Some(v) => f(v),
        None => Err(Error::msg("no vault is open")),
    }
}

/// Where we remember the last-opened vault path (app config dir, not the vault).
fn last_vault_marker(app: &AppHandle) -> Result<PathBuf> {
    let dir = app.path().app_config_dir()?;
    fs::create_dir_all(&dir)?;
    Ok(dir.join("last-vault"))
}

#[derive(serde::Serialize)]
pub struct VaultInfo {
    pub root: String,
    pub stats: db::IndexStats,
}

/// Open (creating structure if needed) the vault at `path`.
#[tauri::command]
pub fn open_vault(app: AppHandle, state: State<'_, AppState>, path: String) -> Result<VaultInfo> {
    let root = PathBuf::from(&path);
    if !root.is_dir() {
        return Err(Error::msg(format!("'{path}' is not a directory")));
    }

    // Initialise vault structure (idempotent).
    for sub in VAULT_SUBDIRS {
        fs::create_dir_all(root.join(sub))?;
    }
    let studydb = root.join(STUDYDB_DIR);
    fs::create_dir_all(&studydb)?;
    let config_path = studydb.join(CONFIG_FILE);
    if !config_path.exists() {
        fs::write(&config_path, DEFAULT_CONFIG)?;
    }

    let conn = db::open(&studydb.join(INDEX_FILE))?;
    let stats = db::stats(&conn)?;
    let w = watcher::start(app.clone(), root.clone())?;

    *state.0.lock().map_err(|_| Error::msg("state lock poisoned"))? = Some(OpenVault {
        root: root.clone(),
        db: conn,
        _watcher: w,
    });

    // Remember for next launch (best-effort).
    if let Ok(marker) = last_vault_marker(&app) {
        let _ = fs::write(marker, &path);
    }

    Ok(VaultInfo { root: path, stats })
}

/// The vault path opened in a previous session, if it still exists.
#[tauri::command]
pub fn get_last_vault(app: AppHandle) -> Result<Option<String>> {
    let marker = last_vault_marker(&app)?;
    match fs::read_to_string(marker) {
        Ok(p) if Path::new(p.trim()).is_dir() => Ok(Some(p.trim().to_string())),
        _ => Ok(None),
    }
}

#[tauri::command]
pub fn close_vault(state: State<'_, AppState>) -> Result<()> {
    *state.0.lock().map_err(|_| Error::msg("state lock poisoned"))? = None;
    Ok(())
}

#[tauri::command]
pub fn index_stats(state: State<'_, AppState>) -> Result<db::IndexStats> {
    with_vault(&state, |v| db::stats(&v.db))
}

// ---------------------------------------------------------------------------
// Scoped filesystem commands (all paths vault-relative)
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn vault_read_file(state: State<'_, AppState>, rel: String) -> Result<String> {
    with_vault(&state, |v| Ok(fs::read_to_string(resolve(&v.root, &rel)?)?))
}

#[tauri::command]
pub fn vault_write_file(state: State<'_, AppState>, rel: String, contents: String) -> Result<()> {
    with_vault(&state, |v| {
        let path = resolve(&v.root, &rel)?;
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }
        Ok(fs::write(path, contents)?)
    })
}

/// Write binary data (images pasted/dropped into the editor → attachments/).
#[tauri::command]
pub fn vault_write_binary(state: State<'_, AppState>, rel: String, contents: Vec<u8>) -> Result<()> {
    with_vault(&state, |v| {
        let path = resolve(&v.root, &rel)?;
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }
        Ok(fs::write(path, contents)?)
    })
}

#[tauri::command]
pub fn vault_read_binary(state: State<'_, AppState>, rel: String) -> Result<Vec<u8>> {
    with_vault(&state, |v| Ok(fs::read(resolve(&v.root, &rel)?)?))
}

#[tauri::command]
pub fn vault_remove_file(state: State<'_, AppState>, rel: String) -> Result<()> {
    with_vault(&state, |v| Ok(fs::remove_file(resolve(&v.root, &rel)?)?))
}

#[derive(serde::Serialize)]
pub struct DirEntry {
    pub name: String,
    pub rel: String,
    pub is_dir: bool,
    pub mtime: u64,
}

/// List a vault directory (non-recursive). Hides dotfiles/.studydb.
#[tauri::command]
pub fn vault_list(state: State<'_, AppState>, rel: String) -> Result<Vec<DirEntry>> {
    with_vault(&state, |v| {
        let dir = resolve(&v.root, &rel)?;
        let mut out = Vec::new();
        for entry in fs::read_dir(dir)? {
            let entry = entry?;
            let name = entry.file_name().to_string_lossy().into_owned();
            if name.starts_with('.') {
                continue;
            }
            let meta = entry.metadata()?;
            let mtime = meta
                .modified()
                .ok()
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_secs())
                .unwrap_or(0);
            let rel_child = if rel.is_empty() {
                name.clone()
            } else {
                format!("{}/{}", rel.trim_end_matches('/'), name)
            };
            out.push(DirEntry {
                name,
                rel: rel_child,
                is_dir: meta.is_dir(),
                mtime,
            });
        }
        out.sort_by(|a, b| (!a.is_dir, a.name.to_lowercase()).cmp(&(!b.is_dir, b.name.to_lowercase())));
        Ok(out)
    })
}

/// Create a folder (and any missing parents) inside the vault.
#[tauri::command]
pub fn vault_create_dir(state: State<'_, AppState>, rel: String) -> Result<()> {
    with_vault(&state, |v| Ok(fs::create_dir_all(resolve(&v.root, &rel)?)?))
}

/// Rename/move a folder (or file). Creates the destination's parent dirs.
/// Moving a folder into itself is rejected.
#[tauri::command]
pub fn vault_rename(state: State<'_, AppState>, from: String, to: String) -> Result<()> {
    with_vault(&state, |v| {
        let from_n = from.trim_matches('/');
        let to_n = to.trim_matches('/');
        if to_n == from_n || to_n.starts_with(&format!("{from_n}/")) {
            return Err(Error::msg("cannot move a folder into itself"));
        }
        let src = resolve(&v.root, from_n)?;
        let dst = resolve(&v.root, to_n)?;
        if dst.exists() {
            return Err(Error::msg(format!("'{to_n}' already exists")));
        }
        if let Some(parent) = dst.parent() {
            fs::create_dir_all(parent)?;
        }
        Ok(fs::rename(src, dst)?)
    })
}

/// Delete a folder. Its contents (questions and subfolders) are moved up
/// into the parent folder first, so nothing is ever lost. Name collisions
/// get a numeric suffix.
#[tauri::command]
pub fn vault_delete_folder(state: State<'_, AppState>, rel: String) -> Result<()> {
    with_vault(&state, |v| {
        let rel_n = rel.trim_matches('/');
        let dir = resolve(&v.root, rel_n)?;
        if !dir.is_dir() {
            return Err(Error::msg(format!("'{rel_n}' is not a folder")));
        }
        let parent = dir
            .parent()
            .ok_or_else(|| Error::msg("cannot delete the vault root"))?
            .to_path_buf();

        for entry in fs::read_dir(&dir)? {
            let entry = entry?;
            let name = entry.file_name().to_string_lossy().into_owned();
            let mut target = parent.join(&name);
            // Collision-safe: foo.md → foo-1.md, subdir → subdir-1
            let (stem, ext) = match name.rsplit_once('.') {
                Some((s, e)) if entry.path().is_file() => (s.to_string(), format!(".{e}")),
                _ => (name.clone(), String::new()),
            };
            let mut n = 0;
            while target.exists() {
                n += 1;
                target = parent.join(format!("{stem}-{n}{ext}"));
            }
            fs::rename(entry.path(), target)?;
        }
        Ok(fs::remove_dir(dir)?)
    })
}

/// All folders (recursive) under a vault directory. Skips dot-dirs.
#[tauri::command]
pub fn vault_list_dirs(state: State<'_, AppState>, rel: String) -> Result<Vec<String>> {
    with_vault(&state, |v| {
        let root = resolve(&v.root, &rel)?;
        let mut out = Vec::new();
        let mut stack = vec![(root, String::new())];
        while let Some((dir, prefix)) = stack.pop() {
            let Ok(entries) = fs::read_dir(&dir) else { continue };
            for entry in entries.flatten() {
                let name = entry.file_name().to_string_lossy().into_owned();
                if name.starts_with('.') || !entry.path().is_dir() {
                    continue;
                }
                let rel_child = if prefix.is_empty() {
                    name.clone()
                } else {
                    format!("{prefix}/{name}")
                };
                out.push(rel_child.clone());
                stack.push((entry.path(), rel_child));
            }
        }
        out.sort();
        Ok(out)
    })
}

/// Recursively list files under a vault directory, optionally filtered by
/// extension (e.g. "md"). Used for rescans. Skips dot-directories.
#[tauri::command]
pub fn vault_list_recursive(
    state: State<'_, AppState>,
    rel: String,
    ext: Option<String>,
) -> Result<Vec<DirEntry>> {
    with_vault(&state, |v| {
        let root = resolve(&v.root, &rel)?;
        let mut out = Vec::new();
        let mut stack = vec![(root, rel.trim_end_matches('/').to_string())];
        while let Some((dir, rel_dir)) = stack.pop() {
            let Ok(entries) = fs::read_dir(&dir) else { continue };
            for entry in entries.flatten() {
                let name = entry.file_name().to_string_lossy().into_owned();
                if name.starts_with('.') {
                    continue;
                }
                let Ok(meta) = entry.metadata() else { continue };
                let rel_child = if rel_dir.is_empty() {
                    name.clone()
                } else {
                    format!("{rel_dir}/{name}")
                };
                if meta.is_dir() {
                    stack.push((entry.path(), rel_child));
                } else {
                    if let Some(want) = ext.as_deref() {
                        if !name.to_lowercase().ends_with(&format!(".{want}")) {
                            continue;
                        }
                    }
                    let mtime = meta
                        .modified()
                        .ok()
                        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                        .map(|d| d.as_secs())
                        .unwrap_or(0);
                    out.push(DirEntry {
                        name,
                        rel: rel_child,
                        is_dir: false,
                        mtime,
                    });
                }
            }
        }
        Ok(out)
    })
}
