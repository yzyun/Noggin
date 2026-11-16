// Settings: scheduler (FSRS or manual intervals), review-session defaults,
// quiz defaults, and appearance. Everything writes through the settings
// store, which persists to the vault's .studydb/config.json.

import { useEffect, useState } from "react";
import {
  ANSWER_PLACEMENT_OPTIONS,
  DEFAULT_SETTINGS,
  parseDuration,
  SESSION_MODE_OPTIONS,
} from "../domain/settings";
import { THEMES } from "../lib/theme";
import { useSettings } from "../state/settings";
import { CheckIcon } from "./icons";
import { INPUT, LABEL } from "./ui/Field";
import { Toggle } from "./ui/Toggle";
import { Segmented } from "./ui/Segmented";

function Section({
  title,
  hint,
  action,
  children,
}: {
  title: string;
  hint?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-2 flex items-end justify-between gap-3 px-1">
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          {hint && <p className="text-xs text-neutral-500 dark:text-neutral-400">{hint}</p>}
        </div>
        {action}
      </div>
      <div className="divide-y divide-edge rounded-xl border border-edge bg-surface">{children}</div>
    </section>
  );
}

/** One setting: name + plain-language explanation on the left, control on
 *  the right. `stack` puts a wide control underneath instead. */
function Row({
  label,
  hint,
  stack = false,
  children,
}: {
  label: string;
  hint?: React.ReactNode;
  stack?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={`px-4 py-3 ${stack ? "space-y-2" : "flex items-center justify-between gap-6"}`}>
      <div className="min-w-0">
        <div className="text-sm font-medium">{label}</div>
        {hint && <div className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">{hint}</div>}
      </div>
      <div className={stack ? "" : "shrink-0"}>{children}</div>
    </div>
  );
}

function NumberInput({
  value,
  min,
  max,
  step,
  fallback,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  fallback: number;
  onChange(v: number): void;
}) {
  return (
    <input
      type="number"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(Math.min(max, Math.max(min, Number(e.target.value) || fallback)))}
      className={`w-24 text-right tabular-nums ${INPUT}`}
    />
  );
}

/** Text input for a duration ("10m", "2h", "3d"); commits only valid values. */
function DurationInput({
  label,
  value,
  onCommit,
}: {
  label: string;
  value: string;
  onCommit(v: string): void;
}) {
  const [text, setText] = useState(value);
  const [invalid, setInvalid] = useState(false);
  useEffect(() => {
    setText(value);
    setInvalid(false);
  }, [value]);

  const commit = () => {
    const ok = parseDuration(text) !== null;
    setInvalid(!ok);
    if (ok) onCommit(text.trim());
  };

  return (
    <label className="block">
      <span className={LABEL}>{label}</span>
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && commit()}
        aria-invalid={invalid}
        className={`w-full ${INPUT} ${invalid ? "border-red-500" : ""}`}
      />
      {invalid && <span className="mt-1 block text-xs text-red-600 dark:text-red-400">use 10m / 2h / 3d</span>}
    </label>
  );
}

/** Space/comma-separated list of durations, e.g. "1m 10m 1d". */
function StepsInput({
  label,
  hint,
  value,
  onCommit,
}: {
  label: string;
  hint: string;
  value: string[];
  onCommit(v: string[]): void;
}) {
  const [text, setText] = useState(value.join(" "));
  const [invalid, setInvalid] = useState(false);
  useEffect(() => {
    setText(value.join(" "));
    setInvalid(false);
  }, [value]);

  const commit = () => {
    const tokens = text.split(/[\s,]+/).filter(Boolean);
    const ok = tokens.length > 0 && tokens.every((t) => parseDuration(t) !== null);
    setInvalid(!ok);
    if (ok) onCommit(tokens);
  };

  return (
    <Row
      label={label}
      hint={
        invalid ? (
          <span className="text-red-600 dark:text-red-400">
            Every step must look like 10m, 2h or 3d.
          </span>
        ) : (
          hint
        )
      }
    >
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && commit()}
        aria-label={label}
        aria-invalid={invalid}
        className={`w-36 font-mono text-[13px] ${INPUT} ${invalid ? "border-red-500" : ""}`}
      />
    </Row>
  );
}

const SECTIONS = [
  ["appearance", "Appearance"],
  ["sessions", "Review sessions"],
  ["scheduler", "Scheduler"],
  ["quiz", "Quiz"],
] as const;

export function SettingsView() {
  const settings = useSettings((s) => s.settings);
  const update = useSettings((s) => s.update);
  const { scheduler, session, quiz } = settings;
  const activeTheme = settings.theme;
  const retention = Math.round(scheduler.fsrs.requestRetention * 100);
  const schedulerIsDefault =
    JSON.stringify(scheduler) === JSON.stringify(DEFAULT_SETTINGS.scheduler);

  return (
    <div className="h-full overflow-y-auto scroll-smooth">
      <div className="mx-auto grid max-w-4xl grid-cols-[10rem_1fr] gap-10 px-8 py-10">
        {/* Section index */}
        <nav className="sticky top-10 h-fit space-y-0.5 text-sm">
          <h1 className="mb-4 font-display text-3xl font-semibold tracking-tight">Settings</h1>
          {SECTIONS.map(([id, label]) => (
            <a
              key={id}
              href={`#settings-${id}`}
              onClick={(e) => {
                e.preventDefault();
                document.getElementById(`settings-${id}`)?.scrollIntoView({ behavior: "smooth" });
              }}
              className="block rounded-md px-2 py-1 text-neutral-600 hover:bg-neutral-200/60 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
            >
              {label}
            </a>
          ))}
          <p className="px-2 pt-4 text-xs text-neutral-400">
            Changes save automatically to <code>.studydb/config.json</code> and travel with your
            vault.
          </p>
        </nav>

        <div className="min-w-0 space-y-8">
          <div id="settings-appearance" className="scroll-mt-10">
            <Section title="Appearance" hint="Pick a theme — it applies immediately.">
              <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
                {THEMES.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => update({ theme: t.id })}
                    aria-pressed={activeTheme === t.id}
                    className="group text-left"
                  >
                    {/* Miniature of the app in that theme */}
                    <span
                      className={`flex h-16 overflow-hidden rounded-lg border transition-shadow ${
                        activeTheme === t.id
                          ? "border-accent ring-2 ring-accent"
                          : "border-edge group-hover:border-neutral-400"
                      }`}
                      style={{ background: t.bg }}
                    >
                      <span className="w-1/4" style={{ background: t.swatch, opacity: 0.12 }} />
                      <span className="flex flex-1 flex-col justify-center gap-1.5 px-2.5">
                        <span className="h-1.5 w-3/4 rounded-full" style={{ background: t.swatch }} />
                        <span
                          className="h-1.5 w-1/2 rounded-full"
                          style={{ background: t.swatch, opacity: 0.35 }}
                        />
                      </span>
                    </span>
                    <span
                      className={`mt-1.5 flex items-center gap-1 text-xs ${
                        activeTheme === t.id ? "font-medium" : "text-neutral-500 dark:text-neutral-400"
                      }`}
                    >
                      {t.label}
                      {activeTheme === t.id && <CheckIcon className="h-3 w-3" />}
                    </span>
                  </button>
                ))}
              </div>
            </Section>
          </div>

          <div id="settings-sessions" className="scroll-mt-10">
            <Section title="Review sessions" hint="What the Start review button gives you.">
              <Row label="Cards per session" hint="A session stops after this many cards.">
                <NumberInput
                  value={session.defaultMaxCards}
                  min={1}
                  max={1000}
                  fallback={20}
                  onChange={(defaultMaxCards) => update({ session: { defaultMaxCards } })}
                />
              </Row>
              <Row
                label="New cards per day"
                hint="Caps how many never-seen cards are introduced daily, so a big import doesn't flood you. 0 = none."
              >
                <NumberInput
                  value={session.dailyNewLimit}
                  min={0}
                  max={9999}
                  fallback={0}
                  onChange={(dailyNewLimit) => update({ session: { dailyNewLimit } })}
                />
              </Row>
              <Row
                label="Answer mode"
                hint="Flashcard: think, then reveal. Type-in: write your answer first. Per question: each card uses its own setting."
              >
                <Segmented
                  value={session.defaultMode}
                  options={SESSION_MODE_OPTIONS}
                  onChange={(defaultMode) => update({ session: { defaultMode } })}
                />
              </Row>
            </Section>
          </div>

          <div id="settings-scheduler" className="scroll-mt-10">
            <Section
              title="Scheduler"
              hint="Decides when you see each card again. The defaults suit most people."
              action={
                !schedulerIsDefault && (
                  <button
                    onClick={() => update({ scheduler: DEFAULT_SETTINGS.scheduler })}
                    className="text-xs text-neutral-500 underline underline-offset-2 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
                  >
                    Reset to defaults
                  </button>
                )
              }
            >
              <Row
                label="Algorithm"
                hint={
                  scheduler.mode === "fsrs"
                    ? "FSRS adapts each card's interval to how well you remember it."
                    : "Fixed intervals per grade — predictable, Anki-classic style."
                }
              >
                <Segmented
                  value={scheduler.mode}
                  options={[
                    ["fsrs", "Adaptive (FSRS)"],
                    ["manual", "Fixed intervals"],
                  ]}
                  onChange={(mode) => update({ scheduler: { mode } })}
                />
              </Row>

              {scheduler.mode === "fsrs" ? (
                <>
                  <Row
                    stack
                    label={`Desired retention — ${retention}%`}
                    hint={`Cards are scheduled so you recall about ${retention} in 100 when they come up. Lower means fewer reviews; higher means more.`}
                  >
                    <input
                      type="range"
                      min={0.7}
                      max={0.97}
                      step={0.01}
                      value={scheduler.fsrs.requestRetention}
                      aria-label="Desired retention"
                      onChange={(e) =>
                        update({ scheduler: { fsrs: { requestRetention: Number(e.target.value) } } })
                      }
                      className="w-full accent-accent"
                    />
                    <div className="flex justify-between text-[11px] text-neutral-400">
                      <span>70% · fewer reviews</span>
                      <span>97% · more reviews</span>
                    </div>
                  </Row>
                  <StepsInput
                    label="Learning steps"
                    hint='Short gaps for brand-new cards before they graduate. "10m 1d" makes Again ≈ 10 min and Good ≈ 1 day.'
                    value={scheduler.fsrs.learningSteps}
                    onCommit={(learningSteps) => update({ scheduler: { fsrs: { learningSteps } } })}
                  />
                  <StepsInput
                    label="Relearning steps"
                    hint="Gaps a card repeats at after you press Again on one you used to know."
                    value={scheduler.fsrs.relearningSteps}
                    onCommit={(relearningSteps) =>
                      update({ scheduler: { fsrs: { relearningSteps } } })
                    }
                  />
                  <Row label="Longest interval" hint="No card is scheduled further out than this many days.">
                    <NumberInput
                      value={scheduler.fsrs.maximumIntervalDays}
                      min={1}
                      max={36500}
                      fallback={1}
                      onChange={(maximumIntervalDays) =>
                        update({ scheduler: { fsrs: { maximumIntervalDays } } })
                      }
                    />
                  </Row>
                  <Row
                    label="Spread out due dates"
                    hint="Adds a little randomness so cards added together don't all come due on the same day."
                  >
                    <Toggle
                      label="Spread out due dates"
                      checked={scheduler.fsrs.enableFuzz}
                      onChange={(enableFuzz) => update({ scheduler: { fsrs: { enableFuzz } } })}
                    />
                  </Row>
                </>
              ) : (
                <>
                  <Row
                    stack
                    label="Interval per grade"
                    hint="How long until a card returns after each grade — e.g. 10m, 2h, 3d."
                  >
                    <div className="grid grid-cols-4 gap-3">
                      {(["again", "hard", "good", "easy"] as const).map((grade) => (
                        <DurationInput
                          key={grade}
                          label={grade[0].toUpperCase() + grade.slice(1)}
                          value={scheduler.manual[grade]}
                          onCommit={(v) => update({ scheduler: { manual: { [grade]: v } } })}
                        />
                      ))}
                    </div>
                  </Row>
                  <Row
                    label="Growth factor"
                    hint="Once a card's interval reaches a day, each Good or Easy multiplies it by this. Again always resets it."
                  >
                    <NumberInput
                      value={scheduler.manual.growthFactor}
                      min={1}
                      max={10}
                      step={0.1}
                      fallback={1}
                      onChange={(growthFactor) => update({ scheduler: { manual: { growthFactor } } })}
                    />
                  </Row>
                </>
              )}
            </Section>
          </div>

          <div id="settings-quiz" className="scroll-mt-10">
            <Section title="Quiz" hint="Starting options for new printable quizzes.">
              <Row label="Answers" hint="Leave them out, print each under its question, or collect a key on the last page.">
                <Segmented
                  value={quiz.defaultAnswers}
                  options={ANSWER_PLACEMENT_OPTIONS}
                  onChange={(defaultAnswers) => update({ quiz: { defaultAnswers } })}
                />
              </Row>
              <Row label="Show source and difficulty" hint="Prints each question's source and difficulty beneath it.">
                <Toggle
                  label="Show source and difficulty"
                  checked={quiz.defaultShowMeta}
                  onChange={(defaultShowMeta) => update({ quiz: { defaultShowMeta } })}
                />
              </Row>
            </Section>
          </div>
        </div>
      </div>
    </div>
  );
}
