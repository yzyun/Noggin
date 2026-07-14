// Spaced repetition: mapping between our SQLite card rows and ts-fsrs Cards,
// grading, and human-readable interval previews for the rating buttons.
// Pure TypeScript — no Tauri, unit-tested.
//
// Two scheduler modes, chosen in Settings (SchedulerSettings.mode):
//  - "fsrs": ts-fsrs with user-tunable learning steps, retention, max
//    interval and fuzz.
//  - "manual": fixed per-rating intervals with a growth factor (see
//    manualGrade below for the exact semantics).

import {
  createEmptyCard,
  fsrs,
  generatorParameters,
  Rating,
  State,
  type Card,
  type FSRS,
  type FSRSParameters,
  type Grade,
} from "ts-fsrs";
import {
  DEFAULT_SETTINGS,
  parseDuration,
  type FsrsSettings,
  type ManualSettings,
  type SchedulerSettings,
} from "./settings";

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

const DEFAULT_SCHEDULER = DEFAULT_SETTINGS.scheduler;

// FSRS instance memoized on its settings (they change rarely; fuzz keeps
// cards entered together from staying clumped forever).
let fsrsCache: { key: string; f: FSRS } | null = null;
function getFsrs(s: FsrsSettings): FSRS {
  const key = JSON.stringify(s);
  if (fsrsCache?.key !== key) {
    fsrsCache = {
      key,
      f: fsrs(
        generatorParameters({
          request_retention: s.requestRetention,
          maximum_interval: s.maximumIntervalDays,
          enable_fuzz: s.enableFuzz,
          learning_steps: s.learningSteps as FSRSParameters["learning_steps"],
          relearning_steps: s.relearningSteps as FSRSParameters["relearning_steps"],
        }),
      ),
    };
  }
  return fsrsCache.f;
}

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
  settings: SchedulerSettings = DEFAULT_SCHEDULER,
): GradeResult {
  if (settings.mode === "manual") {
    return manualGrade(row, rating, mode, now, settings);
  }
  const result = getFsrs(settings.fsrs).repeat(toFsrsCard(row, now), now)[rating];
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
  settings: SchedulerSettings = DEFAULT_SCHEDULER,
): Record<"again" | "hard" | "good" | "easy", string> {
  if (settings.mode === "manual") {
    const at = (r: Grade) =>
      fmtInterval(now, new Date(now.getTime() + manualIntervalMinutes(row, r, settings) * 60_000));
    return {
      again: at(Rating.Again),
      hard: at(Rating.Hard),
      good: at(Rating.Good),
      easy: at(Rating.Easy),
    };
  }
  const rec = getFsrs(settings.fsrs).repeat(toFsrsCard(row, now), now);
  return {
    again: fmtInterval(now, rec[Rating.Again].card.due),
    hard: fmtInterval(now, rec[Rating.Hard].card.due),
    good: fmtInterval(now, rec[Rating.Good].card.due),
    easy: fmtInterval(now, rec[Rating.Easy].card.due),
  };
}

const MIN_PER_DAY = 1440;
// Extra spacing for Easy over Good on review cards in manual mode.
const MANUAL_EASY_BONUS = 1.3;

const MANUAL_KEY: Record<Grade, keyof Omit<ManualSettings, "growthFactor">> = {
  [Rating.Again]: "again",
  [Rating.Hard]: "hard",
  [Rating.Good]: "good",
  [Rating.Easy]: "easy",
};

/** Interval (minutes) the manual scheduler assigns for a rating.
 *
 * Semantics:
 *  - Again: the configured "again" time, from any state.
 *  - Hard/Good/Easy on a not-yet-graduated card (new/learning/relearning):
 *    the configured fixed time.
 *  - Hard on a review card: at least the card's current interval — Hard
 *    repeats, it never shrinks the schedule.
 *  - Good/Easy on a review card: current interval × growthFactor (Easy gets
 *    a further ×1.3), but never less than the configured fixed time.
 *  - Everything is capped at the FSRS maximum-interval setting.
 */
function manualIntervalMinutes(row: CardRow, rating: Grade, s: SchedulerSettings): number {
  const fixed = (r: Grade) =>
    parseDuration(s.manual[MANUAL_KEY[r]]) ??
    parseDuration(DEFAULT_SCHEDULER.manual[MANUAL_KEY[r]])!;

  let interval: number;
  if (rating === Rating.Again) {
    interval = fixed(Rating.Again);
  } else if (row.state !== "review") {
    interval = fixed(rating);
  } else if (rating === Rating.Hard) {
    interval = Math.max(fixed(Rating.Hard), row.scheduled_days * MIN_PER_DAY);
  } else {
    const bonus = rating === Rating.Easy ? MANUAL_EASY_BONUS : 1;
    interval = Math.max(
      fixed(rating),
      row.scheduled_days * s.manual.growthFactor * bonus * MIN_PER_DAY,
    );
  }
  return Math.min(interval, s.fsrs.maximumIntervalDays * MIN_PER_DAY);
}

/** Manual-mode grading. Writes CardRow fields that remain valid FSRS inputs
 *  (stability ≈ interval, difficulty defaulted to mid-scale) so switching
 *  back to FSRS mode later resumes with a plausible memory state. */
function manualGrade(
  row: CardRow,
  rating: Grade,
  mode: "flashcard" | "typein",
  now: Date,
  settings: SchedulerSettings,
): GradeResult {
  const intervalMin = manualIntervalMinutes(row, rating, settings);
  const graduatedNow = intervalMin >= MIN_PER_DAY;

  let state: CardRow["state"];
  let lapses = row.lapses;
  if (rating === Rating.Again) {
    // Failed: review cards lapse into relearning, earlier cards (re)learn.
    if (row.state === "review" || row.state === "relearning") {
      state = "relearning";
      if (row.state === "review") lapses += 1;
    } else {
      state = "learning";
    }
  } else if (row.state === "review") {
    state = "review";
  } else {
    // Graduate once the interval reaches a day; otherwise keep learning.
    state = graduatedNow ? "review" : row.state === "relearning" ? "relearning" : "learning";
  }

  const elapsedDays = row.last_review
    ? (now.getTime() - new Date(row.last_review).getTime()) / 86_400_000
    : 0;
  const scheduledDays = intervalMin / MIN_PER_DAY;

  const updated: CardRow = {
    question_id: row.question_id,
    state,
    stability: scheduledDays,
    difficulty: row.difficulty || 5,
    due: new Date(now.getTime() + intervalMin * 60_000).toISOString(),
    reps: row.reps + 1,
    lapses,
    last_review: now.toISOString(),
    elapsed_days: elapsedDays,
    scheduled_days: scheduledDays,
    learning_steps: 0,
  };
  return {
    updated,
    log: {
      question_id: row.question_id,
      rating,
      mode,
      reviewed_at: now.toISOString(),
      elapsed_days: elapsedDays,
      scheduled_days: scheduledDays,
    },
  };
}

/** Trim `entries` so at most `limit - newToday` new cards remain (due cards
 *  always pass). Relies on cards_due ordering new cards after due ones. */
export function applyDailyNewLimit<T extends { card: { state: CardRow["state"] } }>(
  entries: T[],
  newToday: number,
  limit: number,
): T[] {
  let budget = Math.max(0, limit - newToday);
  return entries.filter((e) => e.card.state !== "new" || budget-- > 0);
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
