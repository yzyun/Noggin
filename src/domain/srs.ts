// Spaced repetition: mapping between our SQLite card rows and ts-fsrs Cards,
// grading, and human-readable interval previews for the rating buttons.
// Pure TypeScript — no Tauri, unit-tested.

import {
  createEmptyCard,
  fsrs,
  generatorParameters,
  Rating,
  State,
  type Card,
  type Grade,
} from "ts-fsrs";

export type { Grade };
export { Rating };

/** Wire format of the Rust `cards` table (see src-tauri/src/cards.rs). */
export interface CardRow {
  question_id: string;
  state: "new" | "learning" | "review" | "relearning";
  stability: number;
  difficulty: number;
  due: string | null;
  reps: number;
  lapses: number;
  last_review: string | null;
  elapsed_days: number;
  scheduled_days: number;
  learning_steps: number;
}

export interface ReviewLogEntry {
  question_id: string;
  rating: number;
  mode: "flashcard" | "typein";
  reviewed_at: string;
  elapsed_days: number;
  scheduled_days: number;
}

const STATE_TO_DB: Record<State, CardRow["state"]> = {
  [State.New]: "new",
  [State.Learning]: "learning",
  [State.Review]: "review",
  [State.Relearning]: "relearning",
};

const DB_TO_STATE: Record<CardRow["state"], State> = {
  new: State.New,
  learning: State.Learning,
  review: State.Review,
  relearning: State.Relearning,
};

// Default FSRS parameters (90% target retention) with fuzz so cards entered
// together don't stay clumped forever.
const scheduler = fsrs(generatorParameters({ enable_fuzz: true }));

export function toFsrsCard(row: CardRow, now: Date): Card {
  if (row.state === "new" && !row.last_review) {
    return createEmptyCard(now);
  }
  return {
    due: row.due ? new Date(row.due) : now,
    stability: row.stability,
    difficulty: row.difficulty,
    elapsed_days: row.elapsed_days,
    scheduled_days: row.scheduled_days,
    reps: row.reps,
    lapses: row.lapses,
    state: DB_TO_STATE[row.state],
    last_review: row.last_review ? new Date(row.last_review) : undefined,
    learning_steps: row.learning_steps,
  };
}

export function fromFsrsCard(questionId: string, card: Card): CardRow {
  return {
    question_id: questionId,
    state: STATE_TO_DB[card.state],
    stability: card.stability,
    difficulty: card.difficulty,
    due: card.due.toISOString(),
    reps: card.reps,
    lapses: card.lapses,
    last_review: card.last_review ? card.last_review.toISOString() : null,
    elapsed_days: card.elapsed_days,
    scheduled_days: card.scheduled_days,
    learning_steps: card.learning_steps ?? 0,
  };
}

export interface GradeResult {
  updated: CardRow;
  log: ReviewLogEntry;
}

/** Grade a card. Returns the updated row + the log entry to persist. */
export function gradeCard(
  row: CardRow,
  rating: Grade,
  mode: "flashcard" | "typein",
  now: Date = new Date(),
): GradeResult {
  const result = scheduler.repeat(toFsrsCard(row, now), now)[rating];
  return {
    updated: fromFsrsCard(row.question_id, result.card),
    log: {
      question_id: row.question_id,
      rating,
      mode,
      reviewed_at: now.toISOString(),
      elapsed_days: result.log.elapsed_days,
      scheduled_days: result.card.scheduled_days,
    },
  };
}

/** Next-due preview per rating, e.g. { again: "10m", good: "3d", … }. */
export function previewIntervals(
  row: CardRow,
  now: Date = new Date(),
): Record<"again" | "hard" | "good" | "easy", string> {
  const rec = scheduler.repeat(toFsrsCard(row, now), now);
  return {
    again: fmtInterval(now, rec[Rating.Again].card.due),
    hard: fmtInterval(now, rec[Rating.Hard].card.due),
    good: fmtInterval(now, rec[Rating.Good].card.due),
    easy: fmtInterval(now, rec[Rating.Easy].card.due),
  };
}

export function fmtInterval(from: Date, to: Date): string {
  const mins = Math.max(1, Math.round((to.getTime() - from.getTime()) / 60_000));
  if (mins < 60) return `${mins}m`;
  const hours = mins / 60;
  if (hours < 24) return `${Math.round(hours)}h`;
  const days = hours / 24;
  if (days < 30) return `${Math.round(days)}d`;
  const months = days / 30.4;
  if (months < 12) return `${months.toFixed(months < 3 ? 1 : 0)}mo`;
  return `${(days / 365.25).toFixed(1)}y`;
}

/** Local-midnight ISO string (start of "today" for stats). */
export function todayStartIso(now: Date = new Date()): string {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}
