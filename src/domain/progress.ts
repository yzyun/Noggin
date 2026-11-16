// Progress maths over the review log and card states. Pure TypeScript —
// no Tauri, unit-tested. "Days" are local calendar days throughout.

import type { CardRow, ReviewLogEntry } from "./srs";

/** Rating 1 is "Again" — the card was not recalled. */
const AGAIN = 1;
/** Interval (days) from which a card counts as mature — the Anki convention. */
export const MATURE_DAYS = 21;

/** Parse .studydb/review-log.jsonl; blank or corrupt lines are skipped. */
export function parseReviewLog(text: string): ReviewLogEntry[] {
  const out: ReviewLogEntry[] = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      const e = JSON.parse(line) as ReviewLogEntry;
      if (e && typeof e.question_id === "string" && typeof e.reviewed_at === "string") out.push(e);
    } catch {
      /* a half-written or hand-edited line — ignore */
    }
  }
  return out;
}

/** Local calendar day as YYYY-MM-DD. */
export function dayKey(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** `n` days before/after `d` (local midnight-safe: uses calendar arithmetic). */
export function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}

export interface DayTally {
  total: number;
  /** Reviews graded Again. */
  again: number;
}

export function tallyByDay(log: ReviewLogEntry[]): Map<string, DayTally> {
  const days = new Map<string, DayTally>();
  for (const e of log) {
    const key = dayKey(new Date(e.reviewed_at));
    const t = days.get(key) ?? { total: 0, again: 0 };
    t.total++;
    if (e.rating === AGAIN) t.again++;
    days.set(key, t);
  }
  return days;
}

/** Consecutive days with at least one review. The current streak survives
 *  until the end of today: reviewing yesterday but not yet today still counts. */
export function streaks(days: Map<string, DayTally>, today: Date): { current: number; longest: number } {
  let current = 0;
  let cursor = days.has(dayKey(today)) ? today : addDays(today, -1);
  while (days.has(dayKey(cursor))) {
    current++;
    cursor = addDays(cursor, -1);
  }

  let longest = 0;
  let run = 0;
  let prev: string | null = null;
  for (const key of [...days.keys()].sort()) {
    const [y, m, d] = key.split("-").map(Number);
    run = prev === dayKey(addDays(new Date(y, m - 1, d), -1)) ? run + 1 : 1;
    longest = Math.max(longest, run);
    prev = key;
  }
  return { current, longest };
}

/** Share of reviews not graded Again over the last `span` days (including
 *  today); null when there were none. */
export function recallRate(days: Map<string, DayTally>, today: Date, span: number): number | null {
  let total = 0;
  let again = 0;
  for (let i = 0; i < span; i++) {
    const t = days.get(dayKey(addDays(today, -i)));
    if (t) {
      total += t.total;
      again += t.again;
    }
  }
  return total === 0 ? null : (total - again) / total;
}

export type Stage = "new" | "learning" | "young" | "mature";
export const STAGES: Stage[] = ["new", "learning", "young", "mature"];

/** Where a card is on the way to long-term memory. */
export function stageOf(card: Pick<CardRow, "state" | "scheduled_days">): Stage {
  if (card.state === "new") return "new";
  if (card.state !== "review") return "learning"; // learning or relearning
  return card.scheduled_days >= MATURE_DAYS ? "mature" : "young";
}

export function isDue(card: Pick<CardRow, "state" | "due">, now: Date): boolean {
  return card.state !== "new" && card.due !== null && new Date(card.due) <= now;
}
