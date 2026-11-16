import { describe, expect, it } from "vitest";
import {
  addDays,
  dayKey,
  isDue,
  parseReviewLog,
  recallRate,
  stageOf,
  streaks,
  tallyByDay,
} from "./progress";
import type { ReviewLogEntry } from "./srs";

const today = new Date(2026, 10, 16, 15, 0, 0); // local 16 Nov 2026, 3pm

function review(daysAgo: number, rating = 3): ReviewLogEntry {
  return {
    question_id: "q",
    rating,
    mode: "flashcard",
    reviewed_at: addDays(today, -daysAgo).toISOString(),
    elapsed_days: 0,
    scheduled_days: 1,
  };
}

describe("parseReviewLog", () => {
  it("reads one entry per line and skips junk", () => {
    const good = JSON.stringify(review(0));
    const log = parseReviewLog(`${good}\n\nnot json\n{"rating":3}\n${good}\n{"question_id":"x"`);
    expect(log).toHaveLength(2);
  });
});

describe("tallyByDay", () => {
  it("groups by local day and counts Again", () => {
    const days = tallyByDay([review(0), review(0, 1), review(2)]);
    expect(days.get(dayKey(today))).toEqual({ total: 2, again: 1 });
    expect(days.get(dayKey(addDays(today, -2)))).toEqual({ total: 1, again: 0 });
  });
});

describe("streaks", () => {
  it("counts back from today", () => {
    const s = streaks(tallyByDay([review(0), review(1), review(2), review(4)]), today);
    expect(s).toEqual({ current: 3, longest: 3 });
  });
  it("keeps yesterday's streak alive until today is over", () => {
    expect(streaks(tallyByDay([review(1), review(2)]), today).current).toBe(2);
  });
  it("is zero once a full day was missed, but remembers the longest", () => {
    const s = streaks(tallyByDay([review(2), review(3), review(4), review(5)]), today);
    expect(s).toEqual({ current: 0, longest: 4 });
  });
  it("handles an empty log", () => {
    expect(streaks(new Map(), today)).toEqual({ current: 0, longest: 0 });
  });
});

describe("recallRate", () => {
  it("is the non-Again share within the window", () => {
    const days = tallyByDay([review(0), review(1, 1), review(2), review(3), review(40, 1)]);
    expect(recallRate(days, today, 30)).toBe(0.75);
  });
  it("is null with no reviews in the window", () => {
    expect(recallRate(tallyByDay([review(40)]), today, 30)).toBeNull();
  });
});

describe("stageOf / isDue", () => {
  it("classifies cards", () => {
    expect(stageOf({ state: "new", scheduled_days: 0 })).toBe("new");
    expect(stageOf({ state: "learning", scheduled_days: 0 })).toBe("learning");
    expect(stageOf({ state: "relearning", scheduled_days: 30 })).toBe("learning");
    expect(stageOf({ state: "review", scheduled_days: 20 })).toBe("young");
    expect(stageOf({ state: "review", scheduled_days: 21 })).toBe("mature");
  });
  it("never calls a new card due", () => {
    expect(isDue({ state: "new", due: null }, today)).toBe(false);
    expect(isDue({ state: "review", due: addDays(today, -1).toISOString() }, today)).toBe(true);
    expect(isDue({ state: "review", due: addDays(today, 1).toISOString() }, today)).toBe(false);
  });
});
