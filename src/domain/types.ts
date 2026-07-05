// Core domain types. Pure TypeScript — no Tauri, no React.
// These mirror the on-disk question file format documented in the README
// and the SQLite index schema (src-tauri/src/db.rs).

export const SCHEMA_VERSION = 1;

export type BodyKind = "text" | "math" | "image";
export type RecallMode = "flashcard" | "typein" | "both";

/** YAML frontmatter of a question file. Unknown keys are preserved on
 *  round-trip so future schema additions never destroy data. */
export interface QuestionMeta {
  id: string;
  schemaVersion: number;
  type: "question";
  /** Optional display title; when absent the UI derives one from the question text. */
  title?: string;
  body: BodyKind;
  difficulty?: number; // 1–5
  tags: string[];
  source?: string;
  recall: RecallMode;
  created: string; // ISO date (YYYY-MM-DD)
  /** Forward-compat: keys we don't know about yet survive parse→serialize. */
  [key: string]: unknown;
}

/** A parsed question file: frontmatter + markdown sections. */
export interface QuestionDoc {
  meta: QuestionMeta;
  /** Markdown under `# Question` (required). */
  question: string;
  /** Markdown under `# Answer` (optional — a question may have no answer). */
  answer?: string;
  /** Markdown under `# Hint` (optional). */
  hint?: string;
  /** Markdown under `# Solution` (optional, full worked solution). */
  solution?: string;
}

/** Row shape returned by the Rust index commands (wire format, snake_case). */
export interface QuestionRow {
  id: string;
  path: string;
  title: string | null;
  body_kind: BodyKind;
  difficulty: number | null;
  folder: string;
  source: string | null;
  tags: string[];
  recall: RecallMode;
  created: string | null;
  /** Unix seconds of the file's last write, used for rescan change detection. */
  mtime: number;
}

export interface IndexStats {
  questions: number;
  cards: number;
  reviews: number;
  schema_version: number;
}
