//! Index commands: keep the SQLite index in sync with question files.
//! The frontend parses/serializes the markdown; these commands only mirror
//! the parsed metadata + searchable text into SQLite.

use rusqlite::{params, Connection};
use tauri::State;

use crate::error::Result;
use crate::vault::AppState;

pub(crate) fn with_db<T>(
    state: &State<'_, AppState>,
    f: impl FnOnce(&Connection) -> Result<T>,
) -> Result<T> {
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
    pub mtime: i64,
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
            "SELECT id, path, title, body_kind, difficulty, folder, source, tags, recall, created, mtime
             FROM questions ORDER BY id DESC",
        )?;
        let rows = stmt
            .query_map([], row_to_question)?
            .collect::<std::result::Result<Vec<_>, _>>()?;
        Ok(rows)
    })
}

/// Combinable filters for browsing the bank. All optional; AND semantics
/// (except `folders`, which ORs its entries).
#[derive(serde::Deserialize, Default)]
#[serde(default)]
pub struct SearchParams {
    /// Free-text query. Space-separated terms are ANDed; each term matches
    /// as a substring of title/question/answer/source/tags ("synth" finds
    /// "photosynthesis"), like the search students actually expect.
    pub text: Option<String>,
    /// Folder path; matches the folder and everything nested under it.
    pub folder: Option<String>,
    /// Multiple folders (OR of subtree matches) — used by the quiz builder.
    pub folders: Vec<String>,
    /// Tags that must ALL be present.
    pub tags: Vec<String>,
    pub min_difficulty: Option<i64>,
    pub max_difficulty: Option<i64>,
    pub body_kind: Option<String>,
}

/// Append the WHERE clauses for `params` to `sql` (expects a `questions q`
/// alias already in scope). Shared by index_search and the review queue.
pub(crate) fn push_filters(
    sql: &mut String,
    binds: &mut Vec<Box<dyn rusqlite::types::ToSql>>,
    params: &SearchParams,
) {
    if let Some(folder) = params.folder.as_deref().filter(|f| !f.is_empty()) {
        sql.push_str(" AND (q.folder = ? OR q.folder LIKE ? || '/%')");
        binds.push(Box::new(folder.to_string()));
        binds.push(Box::new(folder.to_string()));
    }
    if !params.folders.is_empty() {
        let clause = params
            .folders
            .iter()
            .map(|_| "(q.folder = ? OR q.folder LIKE ? || '/%')")
            .collect::<Vec<_>>()
            .join(" OR ");
        sql.push_str(&format!(" AND ({clause})"));
        for f in &params.folders {
            binds.push(Box::new(f.clone()));
            binds.push(Box::new(f.clone()));
        }
    }
    for tag in &params.tags {
        sql.push_str(" AND EXISTS (SELECT 1 FROM json_each(q.tags) je WHERE je.value = ?)");
        binds.push(Box::new(tag.clone()));
    }
    if let Some(min) = params.min_difficulty {
        sql.push_str(" AND q.difficulty >= ?");
        binds.push(Box::new(min));
    }
    if let Some(max) = params.max_difficulty {
        sql.push_str(" AND q.difficulty <= ?");
        binds.push(Box::new(max));
    }
    if let Some(kind) = params.body_kind.as_deref().filter(|k| !k.is_empty()) {
        sql.push_str(" AND q.body_kind = ?");
        binds.push(Box::new(kind.to_string()));
    }
    if let Some(text) = params.text.as_deref() {
        for term in text.split_whitespace() {
            // Each term must match somewhere: content/tags (FTS mirror) or
            // the folder path the question lives under.
            sql.push_str(
                " AND (q.id IN (SELECT id FROM questions_fts
                   WHERE title LIKE '%'||?||'%' OR question LIKE '%'||?||'%'
                      OR answer LIKE '%'||?||'%' OR source LIKE '%'||?||'%'
                      OR tags LIKE '%'||?||'%')
                   OR q.folder LIKE '%'||?||'%')",
            );
            for _ in 0..6 {
                binds.push(Box::new(term.to_string()));
            }
        }
    }
}

#[tauri::command]
pub fn index_search(state: State<'_, AppState>, params: SearchParams) -> Result<Vec<QuestionRow>> {
    with_db(&state, |db| {
        let mut sql = String::from(
            "SELECT q.id, q.path, q.title, q.body_kind, q.difficulty, q.folder, q.source, q.tags, q.recall, q.created, q.mtime
             FROM questions q WHERE 1=1",
        );
        let mut binds: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();
        push_filters(&mut sql, &mut binds, &params);
        sql.push_str(" ORDER BY q.id DESC");

        let mut stmt = db.prepare(&sql)?;
        let params_ref: Vec<&dyn rusqlite::types::ToSql> = binds.iter().map(|b| b.as_ref()).collect();
        let rows = stmt
            .query_map(params_ref.as_slice(), row_to_question)?
            .collect::<std::result::Result<Vec<_>, _>>()?;
        Ok(rows)
    })
}

pub(crate) fn row_to_question(
    row: &rusqlite::Row<'_>,
) -> std::result::Result<QuestionRow, rusqlite::Error> {
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
        mtime: row.get(10)?,
    })
}
