// App settings: schema, defaults, and tolerant parsing of the vault's
// .studydb/config.json. Pure TypeScript — no Tauri, unit-tested.
//
// Schema v2. v1 ({ newPerDay, maxReviewsPerDay }) is migrated on load:
// newPerDay → session.dailyNewLimit; maxReviewsPerDay is dropped (it was
// never enforced — session.defaultMaxCards covers the intent).

export type SchedulerMode = "fsrs" | "manual";
export type SessionMode = "auto" | "flashcard" | "typein";
export type AnswerPlacement = "none" | "inline" | "key";

export interface FsrsSettings {
  /** Target recall probability at review time (0.70–0.99). */
  requestRetention: number;
  maximumIntervalDays: number;
  enableFuzz: boolean;
  /** ts-fsrs steps, e.g. ["1m", "10m"] — units m/h/d only. */
  learningSteps: string[];
  relearningSteps: string[];
}

export interface ManualSettings {
  again: string;
  hard: string;
  good: string;
  easy: string;
  /** Interval multiplier for Good/Easy on already-reviewed cards (≥ 1). */
  growthFactor: number;
}

export interface SchedulerSettings {
  mode: SchedulerMode;
  fsrs: FsrsSettings;
  manual: ManualSettings;
}

export interface AppSettings {
  schemaVersion: 2;
  theme: string;
  scheduler: SchedulerSettings;
  session: {
    defaultMaxCards: number;
    defaultMode: SessionMode;
    /** New cards mixed into reviews per day; 0 = none. */
    dailyNewLimit: number;
  };
  quiz: {
    defaultAnswers: AnswerPlacement;
    defaultShowMeta: boolean;
  };
}

/** Shared picker labels — every SessionMode / AnswerPlacement UI uses these. */
export const SESSION_MODE_OPTIONS: [SessionMode, string][] = [
  ["auto", "Per question"],
  ["flashcard", "Flashcard"],
  ["typein", "Type-in"],
];

export const ANSWER_PLACEMENT_OPTIONS: [AnswerPlacement, string][] = [
  ["none", "None"],
  ["inline", "Under each"],
  ["key", "Key at end"],
];

export const DEFAULT_SETTINGS: AppSettings = {
  schemaVersion: 2,
  theme: "light",
  scheduler: {
    mode: "fsrs",
    fsrs: {
      requestRetention: 0.9,
      maximumIntervalDays: 36500,
      enableFuzz: true,
      learningSteps: ["1m", "10m"],
      relearningSteps: ["10m"],
    },
    manual: { again: "10m", hard: "1d", good: "3d", easy: "7d", growthFactor: 2.0 },
  },
  session: { defaultMaxCards: 20, defaultMode: "auto", dailyNewLimit: 20 },
  quiz: { defaultAnswers: "key", defaultShowMeta: false },
};

/** Parse a duration like "10m" / "2h" / "1d" into minutes; null if invalid.
 *  Units limited to m/h/d to stay compatible with ts-fsrs step strings. */
export function parseDuration(s: string): number | null {
  const m = /^(\d+(?:\.\d+)?)([mhd])$/.exec(s.trim());
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n <= 0) return null;
  const unit = m[2] === "m" ? 1 : m[2] === "h" ? 60 : 1440;
  return n * unit;
}

export const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

function num(v: unknown, def: number, min: number, max: number): number {
  return typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : def;
}

function bool(v: unknown, def: boolean): boolean {
  return typeof v === "boolean" ? v : def;
}

function oneOf<T extends string>(v: unknown, allowed: readonly T[], def: T): T {
  return typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : def;
}

function duration(v: unknown, def: string): string {
  return typeof v === "string" && parseDuration(v) !== null ? v.trim() : def;
}

function steps(v: unknown, def: string[]): string[] {
  if (!Array.isArray(v)) return def;
  const valid = v.filter((s): s is string => typeof s === "string" && parseDuration(s) !== null);
  return valid.length > 0 ? valid.map((s) => s.trim()) : def;
}

/** Merge unknown JSON (v1, partial v2, or garbage) over the defaults.
 *  Every leaf is type-checked and clamped; never throws. */
export function normalizeSettings(raw: unknown): AppSettings {
  const d = DEFAULT_SETTINGS;
  if (!isRecord(raw)) return structuredClone(d);

  const sch = isRecord(raw.scheduler) ? raw.scheduler : {};
  const fsrs = isRecord(sch.fsrs) ? sch.fsrs : {};
  const manual = isRecord(sch.manual) ? sch.manual : {};
  const session = isRecord(raw.session) ? raw.session : {};
  const quiz = isRecord(raw.quiz) ? raw.quiz : {};

  // v1 migration: top-level newPerDay becomes the daily new-card limit.
  const dailyNewDefault =
    typeof raw.newPerDay === "number" && Number.isFinite(raw.newPerDay)
      ? Math.max(0, Math.round(raw.newPerDay))
      : d.session.dailyNewLimit;

  return {
    schemaVersion: 2,
    theme: typeof raw.theme === "string" ? raw.theme : d.theme,
    scheduler: {
      mode: oneOf(sch.mode, ["fsrs", "manual"] as const, d.scheduler.mode),
      fsrs: {
        requestRetention: num(fsrs.requestRetention, d.scheduler.fsrs.requestRetention, 0.7, 0.99),
        maximumIntervalDays: num(
          fsrs.maximumIntervalDays,
          d.scheduler.fsrs.maximumIntervalDays,
          1,
          36500,
        ),
        enableFuzz: bool(fsrs.enableFuzz, d.scheduler.fsrs.enableFuzz),
        learningSteps: steps(fsrs.learningSteps, d.scheduler.fsrs.learningSteps),
        relearningSteps: steps(fsrs.relearningSteps, d.scheduler.fsrs.relearningSteps),
      },
      manual: {
        again: duration(manual.again, d.scheduler.manual.again),
        hard: duration(manual.hard, d.scheduler.manual.hard),
        good: duration(manual.good, d.scheduler.manual.good),
        easy: duration(manual.easy, d.scheduler.manual.easy),
        growthFactor: num(manual.growthFactor, d.scheduler.manual.growthFactor, 1, 10),
      },
    },
    session: {
      defaultMaxCards: Math.round(num(session.defaultMaxCards, d.session.defaultMaxCards, 1, 1000)),
      defaultMode: oneOf(
        session.defaultMode,
        ["auto", "flashcard", "typein"] as const,
        d.session.defaultMode,
      ),
      dailyNewLimit: Math.round(num(session.dailyNewLimit, dailyNewDefault, 0, 9999)),
    },
    quiz: {
      defaultAnswers: oneOf(
        quiz.defaultAnswers,
        ["none", "inline", "key"] as const,
        d.quiz.defaultAnswers,
      ),
      defaultShowMeta: bool(quiz.defaultShowMeta, d.quiz.defaultShowMeta),
    },
  };
}
