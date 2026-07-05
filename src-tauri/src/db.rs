//! SQLite index for the vault: search index + spaced-repetition schedule.
//!
//! Everything except `cards` and `review_log` is rebuildable from the
//! markdown files; the schedule is the one piece of app-owned state.
//! Migrations are additive-only, tracked via PRAGMA user_version.

use rusqlite::Connection;
use std::path::Path;

use crate::error::Result;

/// Current schema version (PRAGMA user_version target).
const SCHEMA_VERSION: i64 = 2;

const MIGRATION_V1: &str = r#"
CREATE TABLE IF NOT EXISTS questions (
  id            TEXT PRIMARY KEY,
  path          TEXT NOT NULL UNIQUE,     -- vault-relative path of the .md file
  title         TEXT,
  body_kind     TEXT NOT NULL DEFAULT 'text',  -- text | math | image
  difficulty    INTEGER,                  -- 1..5
  folder        TEXT NOT NULL DEFAULT '', -- vault-relative dir, '' = questions root
  source        TEXT,
  tags          TEXT NOT NULL DEFAULT '[]', -- JSON array of strings
  recall        TEXT NOT NULL DEFAULT 'both', -- flashcard | typein | both
  created       TEXT,                     -- ISO date from frontmatter
  mtime         INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS questions_folder_idx     ON questions (folder);
CREATE INDEX IF NOT EXISTS questions_difficulty_idx ON questions (difficulty);

-- Full-text search over content. Populated alongside `questions`.
CREATE VIRTUAL TABLE IF NOT EXISTS questions_fts USING fts5(
  id UNINDEXED, title, question, answer, source, tags
);

-- FSRS schedule. One card per question (more card types come later via the
-- card-type registry; they will add a `card_kind` column in a future migration).
CREATE TABLE IF NOT EXISTS cards (
  question_id TEXT PRIMARY KEY REFERENCES questions(id) ON DELETE CASCADE,
  state       TEXT NOT NULL DEFAULT 'new', -- new | learning | review | relearning
  stability   REAL NOT NULL DEFAULT 0,
  difficulty  REAL NOT NULL DEFAULT 0,
  due         TEXT,                        -- ISO datetime
  reps        INTEGER NOT NULL DEFAULT 0,
  lapses      INTEGER NOT NULL DEFAULT 0,
  last_review TEXT
);

CREATE INDEX IF NOT EXISTS cards_due_idx ON cards (due);

-- Append-only review history: the substrate for stats, exam prep and
-- future FSRS parameter optimisation.
CREATE TABLE IF NOT EXISTS review_log (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  question_id    TEXT NOT NULL,
  rating         INTEGER NOT NULL,        -- 1 Again, 2 Hard, 3 Good, 4 Easy
  mode           TEXT NOT NULL,           -- flashcard | typein
  reviewed_at    TEXT NOT NULL,           -- ISO datetime
  elapsed_days   REAL,
  scheduled_days REAL
);

CREATE INDEX IF NOT EXISTS review_log_question_idx ON review_log (question_id);
CREATE INDEX IF NOT EXISTS review_log_time_idx     ON review_log (reviewed_at);

-- Small key/value store for index-level metadata.
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
"#;

/// Open (or create) the index database at `path` and run pending migrations.
pub fn open(path: &Path) -> Result<Connection> {
    let conn = Connection::open(path)?;
    conn.pragma_update(None, "journal_mode", "WAL")?;
    conn.pragma_update(None, "foreign_keys", "ON")?;
    migrate(&conn)?;
    Ok(conn)
}

// v2: extra FSRS state the scheduler round-trips (ts-fsrs Card fields).
const MIGRATION_V2: &str = r#"
ALTER TABLE cards ADD COLUMN elapsed_days   REAL    NOT NULL DEFAULT 0;
ALTER TABLE cards ADD COLUMN scheduled_days REAL    NOT NULL DEFAULT 0;
ALTER TABLE cards ADD COLUMN learning_steps INTEGER NOT NULL DEFAULT 0;
"#;

fn migrate(conn: &Connection) -> Result<()> {
    let version: i64 = conn.query_row("PRAGMA user_version", [], |r| r.get(0))?;
    if version < 1 {
        conn.execute_batch(MIGRATION_V1)?;
    }
    if version < 2 {
        conn.execute_batch(MIGRATION_V2)?;
    }
    // Future migrations: additive only.
    if version < SCHEMA_VERSION {
        conn.pragma_update(None, "user_version", SCHEMA_VERSION)?;
    }
    Ok(())
}

/// Simple counts used by the UI to confirm the index is alive.
#[derive(serde::Serialize)]
pub struct IndexStats {
    pub questions: i64,
    pub cards: i64,
    pub reviews: i64,
    pub schema_version: i64,
}

pub fn stats(conn: &Connection) -> Result<IndexStats> {
    let count = |sql: &str| -> Result<i64> {
        Ok(conn.query_row(sql, [], |r| r.get(0))?)
    };
    Ok(IndexStats {
        questions: count("SELECT COUNT(*) FROM questions")?,
        cards: count("SELECT COUNT(*) FROM cards")?,
        reviews: count("SELECT COUNT(*) FROM review_log")?,
        schema_version: conn.query_row("PRAGMA user_version", [], |r| r.get(0))?,
    })
}
