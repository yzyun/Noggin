//! Index commands: keep the SQLite index in sync with question files.
//! The frontend parses/serializes the markdown; these commands only mirror
//! the parsed metadata + searchable text into SQLite.

use rusqlite::{params, Connection, OptionalExtension};
use tauri::State;

use crate::error::Result;
use crate::vault::AppState;

fn with_db<T>(state: &State<'_, AppState>, f: impl FnOnce(&Connection) -> Result<T>) -> Result<T> {
    let guard = state
        .0
        .lock()
        .map_err(|_| crate::error::Error::msg("state lock poisoned"))?;
    match guard.as_ref() {
        Some(v) => f(&v.db),
        None => Err(crate::error::Error::msg("no vault is open")),
    }
}

/// Everything the index stores about one question. The frontend builds this
/// from a parsed QuestionDoc + its vault-relative path.
#[derive(serde::Deserialize)]
pub struct QuestionUpsert {
    pub id: String,
    pub path: String,
    pub title: Option<String>,
    pub body_kind: String,
    pub difficulty: Option<i64>,
    pub folder: String,
    pub source: Option<String>,
    /// JSON-ready list; stored as a JSON string in the `tags` column.
    pub tags: Vec<String>,
    pub recall: String,
    pub created: Option<String>,
    pub mtime: i64,
    // Searchable text for FTS (not stored in `questions`).
    pub question_text: String,
    pub answer_text: Option<String>,
}

#[derive(serde::Serialize)]
pub struct QuestionRow {
    pub id: String,
    pub path: String,
    pub title: Option<String>,
    pub body_kind: String,
    pub difficulty: Option<i64>,
    pub folder: String,
    pub source: Option<String>,
    pub tags: Vec<String>,
    pub recall: String,
    pub created: Option<String>,
}

#[tauri::command]
pub fn index_upsert_question(state: State<'_, AppState>, q: QuestionUpsert) -> Result<()> {
    with_db(&state, |db| {
        let tags_json = serde_json::to_string(&q.tags)
            .map_err(|e| crate::error::Error::msg(e.to_string()))?;

        db.execute(
            "INSERT INTO questions (id, path, title, body_kind, difficulty, folder, source, tags, recall, created, mtime)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
             ON CONFLICT(id) DO UPDATE SET
               path=?2, title=?3, body_kind=?4, difficulty=?5, folder=?6,
               source=?7, tags=?8, recall=?9, created=?10, mtime=?11",
            params![
                q.id, q.path, q.title, q.body_kind, q.difficulty, q.folder,
                q.source, tags_json, q.recall, q.created, q.mtime
            ],
        )?;

        // FTS has no upsert: replace the row.
        db.execute("DELETE FROM questions_fts WHERE id = ?1", params![q.id])?;
        db.execute(
            "INSERT INTO questions_fts (id, title, question, answer, source, tags)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                q.id,
                q.title.as_deref().unwrap_or(""),
                q.question_text,
                q.answer_text.as_deref().unwrap_or(""),
                q.source.as_deref().unwrap_or(""),
                q.tags.join(" ")
            ],
        )?;

        // Every question gets a schedule card, born 'new' and due immediately.
        db.execute(
            "INSERT OR IGNORE INTO cards (question_id, state) VALUES (?1, 'new')",
            params![q.id],
        )?;
        Ok(())
    })
}

#[tauri::command]
pub fn index_remove_question(state: State<'_, AppState>, id: String) -> Result<()> {
    with_db(&state, |db| {
        db.execute("DELETE FROM questions WHERE id = ?1", params![id])?; // cards cascade
        db.execute("DELETE FROM questions_fts WHERE id = ?1", params![id])?;
        Ok(())
    })
}

/// Phase 1: the whole bank, newest first. Phase 2 adds filters/search.
#[tauri::command]
pub fn index_list_questions(state: State<'_, AppState>) -> Result<Vec<QuestionRow>> {
    with_db(&state, |db| {
        let mut stmt = db.prepare(
            "SELECT id, path, title, body_kind, difficulty, folder, source, tags, recall, created
             FROM questions ORDER BY id DESC",
        )?;
        let rows = stmt
            .query_map([], row_to_question)?
            .collect::<std::result::Result<Vec<_>, _>>()?;
        Ok(rows)
    })
}

/// Look up one question by id (e.g. to re-open the editor).
#[tauri::command]
pub fn index_get_question(state: State<'_, AppState>, id: String) -> Result<Option<QuestionRow>> {
    with_db(&state, |db| {
        Ok(db
            .query_row(
                "SELECT id, path, title, body_kind, difficulty, folder, source, tags, recall, created
                 FROM questions WHERE id = ?1",
                params![id],
                row_to_question,
            )
            .optional()?)
    })
}

fn row_to_question(row: &rusqlite::Row<'_>) -> std::result::Result<QuestionRow, rusqlite::Error> {
    let tags_json: String = row.get(7)?;
    Ok(QuestionRow {
        id: row.get(0)?,
        path: row.get(1)?,
        title: row.get(2)?,
        body_kind: row.get(3)?,
        difficulty: row.get(4)?,
        folder: row.get(5)?,
        source: row.get(6)?,
        tags: serde_json::from_str(&tags_json).unwrap_or_default(),
        recall: row.get(8)?,
        created: row.get(9)?,
    })
}
