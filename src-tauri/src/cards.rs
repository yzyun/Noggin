//! Review commands: the due queue, card state persistence, the append-only
//! review log (SQLite + a .jsonl mirror in the vault for portability), and
//! summary stats. Scheduling math lives in TypeScript (ts-fsrs); Rust only
//! stores what it's told.

use std::io::Write;

use rusqlite::params;
use tauri::State;

use crate::error::{Error, Result};
use crate::index::{push_filters, row_to_question, with_db, QuestionRow, SearchParams, QUESTION_COLS};
use crate::vault::{AppState, STUDYDB_DIR};

#[derive(serde::Serialize, serde::Deserialize)]
pub struct CardRow {
    pub question_id: String,
    pub state: String, // new | learning | review | relearning
    pub stability: f64,
    pub difficulty: f64,
    pub due: Option<String>,
    pub reps: i64,
    pub lapses: i64,
    pub last_review: Option<String>,
    pub elapsed_days: f64,
    pub scheduled_days: f64,
    pub learning_steps: i64,
}

#[derive(serde::Serialize)]
pub struct DueEntry {
    pub question: QuestionRow,
    pub card: CardRow,
}

const CARD_COLS: &str =
    "c.question_id, c.state, c.stability, c.difficulty, c.due, c.reps, c.lapses, c.last_review,
     c.elapsed_days, c.scheduled_days, c.learning_steps";

fn row_to_card(row: &rusqlite::Row<'_>, offset: usize) -> std::result::Result<CardRow, rusqlite::Error> {
    Ok(CardRow {
        question_id: row.get(offset)?,
        state: row.get(offset + 1)?,
        stability: row.get(offset + 2)?,
        difficulty: row.get(offset + 3)?,
        due: row.get(offset + 4)?,
        reps: row.get(offset + 5)?,
        lapses: row.get(offset + 6)?,
        last_review: row.get(offset + 7)?,
        elapsed_days: row.get(offset + 8)?,
        scheduled_days: row.get(offset + 9)?,
        learning_steps: row.get(offset + 10)?,
    })
}

/// The review queue: cards due at `now` (plus new cards), scoped by the same
/// deck filters as browsing. Reviews come before new cards; both oldest-first.
#[tauri::command]
pub fn cards_due(
    state: State<'_, AppState>,
    params: SearchParams,
    now: String,
    limit: i64,
) -> Result<Vec<DueEntry>> {
    with_db(&state, |db| {
        let mut sql = format!(
            "SELECT {QUESTION_COLS}, {CARD_COLS}
             FROM questions q JOIN cards c ON c.question_id = q.id
             WHERE (c.state = 'new' OR c.due IS NULL OR c.due <= ?)"
        );
        let mut binds: Vec<Box<dyn rusqlite::types::ToSql>> = vec![Box::new(now)];
        push_filters(&mut sql, &mut binds, &params);
        sql.push_str(
            " ORDER BY CASE WHEN c.state = 'new' THEN 1 ELSE 0 END, c.due ASC, q.id ASC LIMIT ?",
        );
        binds.push(Box::new(limit));

        let mut stmt = db.prepare(&sql)?;
        let refs: Vec<&dyn rusqlite::types::ToSql> = binds.iter().map(|b| b.as_ref()).collect();
        let rows = stmt
            .query_map(refs.as_slice(), |row| {
                Ok(DueEntry {
                    question: row_to_question(row)?,
                    card: row_to_card(row, 11)?,
                })
            })?
            .collect::<std::result::Result<Vec<_>, _>>()?;
        Ok(rows)
    })
}

/// Persist a card after grading (the TS scheduler computed the new state).
#[tauri::command]
pub fn card_update(state: State<'_, AppState>, card: CardRow) -> Result<()> {
    with_db(&state, |db| {
        let n = db.execute(
            "UPDATE cards SET state=?2, stability=?3, difficulty=?4, due=?5, reps=?6,
             lapses=?7, last_review=?8, elapsed_days=?9, scheduled_days=?10, learning_steps=?11
             WHERE question_id = ?1",
            params![
                card.question_id, card.state, card.stability, card.difficulty, card.due,
                card.reps, card.lapses, card.last_review, card.elapsed_days,
                card.scheduled_days, card.learning_steps
            ],
        )?;
        if n == 0 {
            return Err(Error::msg(format!("no card for question {}", card.question_id)));
        }
        Ok(())
    })
}

#[derive(serde::Serialize, serde::Deserialize)]
pub struct ReviewLogEntry {
    pub question_id: String,
    pub rating: i64, // 1 Again, 2 Hard, 3 Good, 4 Easy
    pub mode: String, // flashcard | typein
    pub reviewed_at: String,
    pub elapsed_days: f64,
    pub scheduled_days: f64,
}

/// Record one review: SQLite row + append to .studydb/review-log.jsonl
/// (the jsonl is the portable backup the stats can be rebuilt from).
#[tauri::command]
pub fn review_log_add(state: State<'_, AppState>, entry: ReviewLogEntry) -> Result<()> {
    crate::vault::with_vault(&state, |vault| {
    vault.db.execute(
        "INSERT INTO review_log (question_id, rating, mode, reviewed_at, elapsed_days, scheduled_days)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![
            entry.question_id, entry.rating, entry.mode, entry.reviewed_at,
            entry.elapsed_days, entry.scheduled_days
        ],
    )?;

    let line = serde_json::to_string(&entry)?;
    let mut file = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(vault.root.join(STUDYDB_DIR).join("review-log.jsonl"))?;
    writeln!(file, "{line}")?;
    Ok(())
    })
}

#[derive(serde::Serialize)]
pub struct ReviewStats {
    pub due_now: i64,
    pub new_count: i64,
    pub reviews_today: i64,
    /// Cards whose first-ever review happened today (spends the daily new-card budget).
    pub new_today: i64,
    pub total_reviews: i64,
    /// (YYYY-MM-DD, count) pairs for upcoming scheduled reviews.
    pub upcoming: Vec<(String, i64)>,
}

fn count(db: &rusqlite::Connection, sql: &str, params: impl rusqlite::Params) -> Result<i64> {
    Ok(db.query_row(sql, params, |r| r.get(0))?)
}

/// Summary for the review setup screen. `now`/`today_start` are ISO strings
/// from the frontend so "today" respects the local timezone.
#[tauri::command]
pub fn review_stats(
    state: State<'_, AppState>,
    now: String,
    today_start: String,
) -> Result<ReviewStats> {
    with_db(&state, |db| {
        let due_now = count(
            db,
            "SELECT COUNT(*) FROM cards WHERE state != 'new' AND due IS NOT NULL AND due <= ?",
            params![now],
        )?;
        let new_count = count(db, "SELECT COUNT(*) FROM cards WHERE state = 'new'", [])?;
        let reviews_today = count(
            db,
            "SELECT COUNT(*) FROM review_log WHERE reviewed_at >= ?",
            params![today_start],
        )?;
        let new_today = count(
            db,
            "SELECT COUNT(*) FROM (
                 SELECT question_id, MIN(reviewed_at) AS first_review
                 FROM review_log GROUP BY question_id
             ) WHERE first_review >= ?",
            params![today_start],
        )?;
        let total_reviews = count(db, "SELECT COUNT(*) FROM review_log", [])?;

        let mut stmt = db.prepare(
            "SELECT substr(due, 1, 10) AS day, COUNT(*) FROM cards
             WHERE state != 'new' AND due > ? GROUP BY day ORDER BY day LIMIT 7",
        )?;
        let upcoming = stmt
            .query_map(params![now], |r| Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?)))?
            .collect::<std::result::Result<Vec<_>, _>>()?;

        Ok(ReviewStats {
            due_now,
            new_count,
            reviews_today,
            new_today,
            total_reviews,
            upcoming,
        })
    })
}
