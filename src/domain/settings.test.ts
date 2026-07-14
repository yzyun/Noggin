import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, normalizeSettings, parseDuration } from "./settings";

describe("parseDuration", () => {
  it("parses minutes, hours, days", () => {
    expect(parseDuration("10m")).toBe(10);
    expect(parseDuration("2h")).toBe(120);
    expect(parseDuration("1d")).toBe(1440);
    expect(parseDuration("1.5h")).toBe(90);
    expect(parseDuration(" 3d ")).toBe(3 * 1440);
  });

  it("rejects garbage", () => {
    expect(parseDuration("")).toBeNull();
    expect(parseDuration("10")).toBeNull();
    expect(parseDuration("m")).toBeNull();
    expect(parseDuration("-5m")).toBeNull();
    expect(parseDuration("0m")).toBeNull();
    expect(parseDuration("1mo")).toBeNull(); // months not a ts-fsrs step unit
    expect(parseDuration("ten minutes")).toBeNull();
  });
});

describe("normalizeSettings", () => {
  it("returns defaults for non-objects and empty objects", () => {
    expect(normalizeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings("nonsense")).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings([1, 2])).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings({})).toEqual(DEFAULT_SETTINGS);
  });

  it("migrates a v1 config's newPerDay to dailyNewLimit", () => {
    const s = normalizeSettings({ schemaVersion: 1, newPerDay: 30, maxReviewsPerDay: 200 });
    expect(s.session.dailyNewLimit).toBe(30);
    expect(s.schemaVersion).toBe(2);
  });

  it("prefers an explicit v2 dailyNewLimit over the v1 field", () => {
    const s = normalizeSettings({ newPerDay: 30, session: { dailyNewLimit: 5 } });
    expect(s.session.dailyNewLimit).toBe(5);
  });

  it("keeps valid values", () => {
    const s = normalizeSettings({
      theme: "nord",
      scheduler: {
        mode: "manual",
        fsrs: { requestRetention: 0.85, learningSteps: ["5m", "30m", "1d"] },
        manual: { good: "4d", growthFactor: 2.5 },
      },
      session: { defaultMaxCards: 50, defaultMode: "typein", dailyNewLimit: 0 },
      quiz: { defaultAnswers: "inline", defaultShowMeta: true },
    });
    expect(s.theme).toBe("nord");
    expect(s.scheduler.mode).toBe("manual");
    expect(s.scheduler.fsrs.requestRetention).toBe(0.85);
    expect(s.scheduler.fsrs.learningSteps).toEqual(["5m", "30m", "1d"]);
    expect(s.scheduler.manual.good).toBe("4d");
    expect(s.scheduler.manual.growthFactor).toBe(2.5);
    expect(s.session).toEqual({ defaultMaxCards: 50, defaultMode: "typein", dailyNewLimit: 0 });
    expect(s.quiz).toEqual({ defaultAnswers: "inline", defaultShowMeta: true });
  });

  it("repairs wrong types and clamps out-of-range numbers", () => {
    const s = normalizeSettings({
      scheduler: {
        mode: "banana",
        fsrs: {
          requestRetention: "high", // wrong type → default
          maximumIntervalDays: -3, // clamped to 1
          learningSteps: ["1m", "junk", 5], // invalid entries dropped
        },
        manual: { again: "soon", growthFactor: 0.1 },
      },
      session: { defaultMaxCards: 0, defaultMode: 7 },
    });
    expect(s.scheduler.mode).toBe("fsrs");
    expect(s.scheduler.fsrs.requestRetention).toBe(0.9);
    expect(s.scheduler.fsrs.maximumIntervalDays).toBe(1);
    expect(s.scheduler.fsrs.learningSteps).toEqual(["1m"]);
    expect(s.scheduler.manual.again).toBe("10m");
    expect(s.scheduler.manual.growthFactor).toBe(1);
    expect(s.session.defaultMaxCards).toBe(1);
    expect(s.session.defaultMode).toBe("auto");
  });

  it("clamps retention into the sane FSRS range", () => {
    expect(normalizeSettings({ scheduler: { fsrs: { requestRetention: 0.5 } } }).scheduler.fsrs
      .requestRetention).toBe(0.7);
    expect(normalizeSettings({ scheduler: { fsrs: { requestRetention: 1 } } }).scheduler.fsrs
      .requestRetention).toBe(0.99);
  });

  it("falls back to default steps when every entry is invalid", () => {
    const s = normalizeSettings({ scheduler: { fsrs: { learningSteps: ["nope", "x"] } } });
    expect(s.scheduler.fsrs.learningSteps).toEqual(["1m", "10m"]);
  });
});
