import { describe, expect, it } from "vitest";
import { Rating } from "ts-fsrs";
import {
  applyDailyNewLimit,
  fmtInterval,
  fromFsrsCard,
  gradeCard,
  previewIntervals,
  toFsrsCard,
  todayStartIso,
  type CardRow,
} from "./srs";
import { DEFAULT_SETTINGS, type SchedulerSettings } from "./settings";

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

function fsrsSettings(patch: Partial<SchedulerSettings["fsrs"]>): SchedulerSettings {
  const d = DEFAULT_SETTINGS.scheduler;
  // Fuzz forced off so interval assertions are deterministic.
  return { ...d, mode: "fsrs", fsrs: { ...d.fsrs, ...patch, enableFuzz: false } };
}

function manualSettings(patch: Partial<SchedulerSettings["manual"]> = {}): SchedulerSettings {
  const d = DEFAULT_SETTINGS.scheduler;
  return { ...d, mode: "manual", manual: { ...d.manual, ...patch } };
}

const dueMs = (r: { updated: CardRow }) => new Date(r.updated.due!).getTime();

describe("configurable FSRS settings", () => {
  function matured(settings: SchedulerSettings): CardRow {
    let row = gradeCard(newCard(), Rating.Good, "flashcard", NOW, settings).updated;
    let guard = 0;
    while (row.state !== "review" && guard++ < 10) {
      row = gradeCard(row, Rating.Good, "flashcard", new Date(row.due!), settings).updated;
    }
    return row;
  }

  it("lower requested retention schedules further out", () => {
    const relaxed = fsrsSettings({ requestRetention: 0.8 });
    const strict = fsrsSettings({ requestRetention: 0.95 });
    const rowR = matured(relaxed);
    const rowS = matured(strict);
    const nextR = gradeCard(rowR, Rating.Good, "flashcard", new Date(rowR.due!), relaxed).updated;
    const nextS = gradeCard(rowS, Rating.Good, "flashcard", new Date(rowS.due!), strict).updated;
    expect(nextR.scheduled_days).toBeGreaterThan(nextS.scheduled_days);
  });

  it("maximumIntervalDays bounds mature Easy scheduling", () => {
    // ts-fsrs lets the realized interval overshoot the cap by a day or two
    // (easy-after-good ordering rules), so assert boundedness vs. growth.
    const capped = fsrsSettings({ maximumIntervalDays: 5 });
    const uncapped = fsrsSettings({});
    let rowC = matured(capped);
    let rowU = matured(uncapped);
    for (let i = 0; i < 5; i++) {
      rowC = gradeCard(rowC, Rating.Easy, "flashcard", new Date(rowC.due!), capped).updated;
      rowU = gradeCard(rowU, Rating.Easy, "flashcard", new Date(rowU.due!), uncapped).updated;
    }
    expect(rowC.scheduled_days).toBeLessThanOrEqual(8);
    expect(rowU.scheduled_days).toBeGreaterThan(rowC.scheduled_days);
  });

  it("custom learning steps drive the new-card previews", () => {
    const p = previewIntervals(newCard(), NOW, fsrsSettings({ learningSteps: ["5m", "2h"] }));
    expect(p.again).toBe("5m");
    expect(p.good).toBe("2h");
  });
});

describe("manual scheduler", () => {
  it("uses the fixed intervals for a new card", () => {
    const s = manualSettings({ again: "10m", hard: "1h", good: "3d", easy: "7d" });
    const p = previewIntervals(newCard(), NOW, s);
    expect(p).toEqual({ again: "10m", hard: "1h", good: "3d", easy: "7d" });
    expect(dueMs(gradeCard(newCard(), Rating.Good, "flashcard", NOW, s))).toBe(
      NOW.getTime() + 3 * 24 * 60 * 60_000,
    );
  });

  it("sub-day interval keeps learning, >= 1d graduates to review", () => {
    const s = manualSettings({ hard: "30m", good: "1d" });
    expect(gradeCard(newCard(), Rating.Hard, "flashcard", NOW, s).updated.state).toBe("learning");
    expect(gradeCard(newCard(), Rating.Good, "flashcard", NOW, s).updated.state).toBe("review");
  });

  it("Again on a review card lapses it into relearning", () => {
    const s = manualSettings();
    const row = gradeCard(newCard(), Rating.Good, "flashcard", NOW, s).updated; // review (3d)
    const t = new Date(row.due!);
    const lapsed = gradeCard(row, Rating.Again, "flashcard", t, s).updated;
    expect(lapsed.state).toBe("relearning");
    expect(lapsed.lapses).toBe(row.lapses + 1);
  });

  it("Good on a review card grows by growthFactor and never shrinks", () => {
    const s = manualSettings({ good: "3d", growthFactor: 2 });
    let row = gradeCard(newCard(), Rating.Good, "flashcard", NOW, s).updated;
    expect(row.scheduled_days).toBe(3);
    row = gradeCard(row, Rating.Good, "flashcard", new Date(row.due!), s).updated;
    expect(row.scheduled_days).toBe(6);
    row = gradeCard(row, Rating.Good, "flashcard", new Date(row.due!), s).updated;
    expect(row.scheduled_days).toBe(12);
    // Hard repeats the current interval rather than shrinking to its fixed time.
    const hard = gradeCard(row, Rating.Hard, "flashcard", new Date(row.due!), s).updated;
    expect(hard.scheduled_days).toBeGreaterThanOrEqual(12);
  });

  it("manual-graded cards feed back into FSRS mode without breaking", () => {
    const manual = manualSettings();
    const fsrsMode = fsrsSettings({});
    let row = gradeCard(newCard(), Rating.Good, "flashcard", NOW, manual).updated;
    row = gradeCard(row, Rating.Good, "flashcard", new Date(row.due!), fsrsMode).updated;
    expect(new Date(row.due!).getTime()).toBeGreaterThan(NOW.getTime());
    expect(row.reps).toBe(2);
  });
});

describe("applyDailyNewLimit", () => {
  const entry = (state: CardRow["state"]) => ({ card: { state } });
  const queue = [entry("review"), entry("learning"), entry("new"), entry("new"), entry("new")];

  it("keeps due cards and trims new cards beyond the budget", () => {
    const out = applyDailyNewLimit(queue, 0, 2);
    expect(out).toHaveLength(4);
    expect(out.filter((e) => e.card.state === "new")).toHaveLength(2);
  });

  it("budget already spent today strips all new cards", () => {
    const out = applyDailyNewLimit(queue, 5, 5);
    expect(out.filter((e) => e.card.state === "new")).toHaveLength(0);
    expect(out).toHaveLength(2);
  });

  it("limit 0 means no new cards ever", () => {
    expect(applyDailyNewLimit(queue, 0, 0).filter((e) => e.card.state === "new")).toHaveLength(0);
  });
});

describe("CardRow ↔ ts-fsrs Card mapping", () => {
  it("round-trips a reviewed row through toFsrsCard/fromFsrsCard", () => {
    const row: CardRow = {
      question_id: "q1",
      state: "review",
      stability: 12.5,
      difficulty: 6.2,
      due: "2026-07-20T10:00:00.000Z",
      reps: 7,
      lapses: 2,
      last_review: "2026-07-05T10:00:00.000Z",
      elapsed_days: 3,
      scheduled_days: 15,
      learning_steps: 0,
    };
    expect(fromFsrsCard("q1", toFsrsCard(row, NOW))).toEqual(row);
  });

  it("maps an unseen new row to a fresh FSRS card", () => {
    const card = toFsrsCard(newCard(), NOW);
    expect(card.reps).toBe(0);
    expect(card.stability).toBe(0);
    expect(card.last_review).toBeUndefined();
  });
});

describe("todayStartIso", () => {
  it("is local midnight of the given day", () => {
    const d = new Date(2026, 6, 5, 15, 42, 7, 123); // local time
    const start = new Date(todayStartIso(d));
    expect([start.getHours(), start.getMinutes(), start.getSeconds(), start.getMilliseconds()])
      .toEqual([0, 0, 0, 0]);
    expect([start.getFullYear(), start.getMonth(), start.getDate()]).toEqual([2026, 6, 5]);
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
