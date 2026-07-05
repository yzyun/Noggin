import { describe, expect, it } from "vitest";
import { Rating } from "ts-fsrs";
import { fmtInterval, gradeCard, previewIntervals, type CardRow } from "./srs";

const NOW = new Date("2026-07-05T10:00:00.000Z");

function newCard(id = "q1"): CardRow {
  return {
    question_id: id,
    state: "new",
    stability: 0,
    difficulty: 0,
    due: null,
    reps: 0,
    lapses: 0,
    last_review: null,
    elapsed_days: 0,
    scheduled_days: 0,
    learning_steps: 0,
  };
}

describe("gradeCard", () => {
  it("Good on a new card moves it forward and schedules the future", () => {
    const { updated, log } = gradeCard(newCard(), Rating.Good, "flashcard", NOW);
    expect(updated.state).not.toBe("new");
    expect(updated.reps).toBe(1);
    expect(new Date(updated.due!).getTime()).toBeGreaterThan(NOW.getTime());
    expect(updated.last_review).toBe(NOW.toISOString());
    expect(log.rating).toBe(Rating.Good);
    expect(log.mode).toBe("flashcard");
  });

  it("Easy schedules further out than Again", () => {
    const easy = gradeCard(newCard(), Rating.Easy, "flashcard", NOW);
    const again = gradeCard(newCard(), Rating.Again, "flashcard", NOW);
    expect(new Date(easy.updated.due!).getTime()).toBeGreaterThan(
      new Date(again.updated.due!).getTime(),
    );
  });

  it("a matured card lapses on Again (lapse count increments)", () => {
    // Mature the card: two Goods spaced by the scheduled interval.
    let row = gradeCard(newCard(), Rating.Good, "flashcard", NOW).updated;
    let t = new Date(row.due!);
    row = gradeCard(row, Rating.Good, "flashcard", t).updated;
    expect(row.state).toBe("review");
    t = new Date(row.due!);
    const lapsed = gradeCard(row, Rating.Again, "flashcard", t).updated;
    expect(lapsed.lapses).toBe(row.lapses + 1);
    expect(lapsed.state).toBe("relearning");
  });

  it("stability grows across review-state repetitions", () => {
    // Mature the card out of the learning phase first.
    let row = gradeCard(newCard(), Rating.Good, "flashcard", NOW).updated;
    let guard = 0;
    while (row.state !== "review" && guard++ < 10) {
      row = gradeCard(row, Rating.Good, "flashcard", new Date(row.due!)).updated;
    }
    const s1 = row.stability;
    row = gradeCard(row, Rating.Good, "flashcard", new Date(row.due!)).updated;
    expect(row.stability).toBeGreaterThan(s1);
  });
});

describe("previewIntervals", () => {
  it("orders again <= hard <= good <= easy for a new card", () => {
    const p = previewIntervals(newCard(), NOW);
    // Sanity: all four render as short human strings.
    for (const k of ["again", "hard", "good", "easy"] as const) {
      expect(p[k]).toMatch(/^\d+(\.\d+)?(m|h|d|mo|y)$/);
    }
  });
});

describe("fmtInterval", () => {
  const at = (mins: number) => new Date(NOW.getTime() + mins * 60_000);
  it("formats minutes, hours, days, months", () => {
    expect(fmtInterval(NOW, at(10))).toBe("10m");
    expect(fmtInterval(NOW, at(120))).toBe("2h");
    expect(fmtInterval(NOW, at(60 * 24 * 3))).toBe("3d");
    expect(fmtInterval(NOW, at(60 * 24 * 61))).toBe("2.0mo");
  });
});
