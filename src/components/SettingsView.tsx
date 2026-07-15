// Settings: scheduler (FSRS or manual intervals), review-session defaults,
// quiz defaults, and appearance. Everything writes through the settings
// store, which persists to the vault's .studydb/config.json.

import { useEffect, useState } from "react";
import {
  ANSWER_PLACEMENT_OPTIONS,
  parseDuration,
  SESSION_MODE_OPTIONS,
} from "../domain/settings";
import { THEMES } from "../lib/theme";
import { useSettings } from "../state/settings";
import { INPUT, LABEL } from "./ui/Field";
import { Segmented } from "./ui/Segmented";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-3 text-sm font-semibold">{title}</h3>
      <div className="space-y-4 rounded-lg border border-edge bg-surface p-4">{children}</div>
    </section>
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
        className={`w-20 ${INPUT} ${invalid ? "border-red-500" : ""}`}
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
    <label className="block">
      <span className={LABEL}>{label}</span>
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && commit()}
        className={`w-full ${INPUT} ${invalid ? "border-red-500" : ""}`}
      />
      <span className="mt-1 block text-xs text-neutral-400">
        {invalid ? (
          <span className="text-red-600 dark:text-red-400">
            every step must look like 10m / 2h / 3d
          </span>
        ) : (
          hint
        )}
      </span>
    </label>
  );
}

export function SettingsView() {
  const settings = useSettings((s) => s.settings);
  const update = useSettings((s) => s.update);
  const { scheduler, session, quiz } = settings;
  const activeTheme = settings.theme;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-xl space-y-6 p-6">
        <div>
          <h2 className="text-xl font-semibold">Settings</h2>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            Saved to <code className="text-xs">.studydb/config.json</code> in your vault — they
            sync and back up with it.
          </p>
        </div>

        <Section title="Scheduler">
          <label className="block">
            <span className={LABEL}>Algorithm</span>
            <Segmented
              grow
              value={scheduler.mode}
              options={[
                ["fsrs", "FSRS (adaptive)"],
                ["manual", "Manual intervals"],
              ]}
              onChange={(mode) => update({ scheduler: { mode } })}
            />
          </label>

          {scheduler.mode === "fsrs" ? (
            <>
              <label className="block">
                <span className={LABEL}>
                  Desired retention — {Math.round(scheduler.fsrs.requestRetention * 100)}%
                </span>
                <input
                  type="range"
                  min={0.7}
                  max={0.97}
                  step={0.01}
                  value={scheduler.fsrs.requestRetention}
                  onChange={(e) =>
                    update({ scheduler: { fsrs: { requestRetention: Number(e.target.value) } } })
                  }
                  className="w-full accent-accent"
                />
                <span className="mt-1 block text-xs text-neutral-400">
                  Lower = fewer, more spaced reviews · higher = more frequent reviews
                </span>
              </label>
              <StepsInput
                label="Learning steps (new cards)"
                hint='Early intervals before a card graduates — e.g. "10m 1d" makes Again ≈ 10m and Good ≈ 1d on new cards'
                value={scheduler.fsrs.learningSteps}
                onCommit={(learningSteps) => update({ scheduler: { fsrs: { learningSteps } } })}
              />
              <StepsInput
                label="Relearning steps (lapsed cards)"
                hint="Intervals a card repeats after you press Again on a mature card"
                value={scheduler.fsrs.relearningSteps}
                onCommit={(relearningSteps) => update({ scheduler: { fsrs: { relearningSteps } } })}
              />
              <div className="flex items-end gap-6">
                <label className="block">
                  <span className={LABEL}>Maximum interval (days)</span>
                  <input
                    type="number"
                    min={1}
                    max={36500}
                    value={scheduler.fsrs.maximumIntervalDays}
                    onChange={(e) =>
                      update({
                        scheduler: {
                          fsrs: { maximumIntervalDays: Math.max(1, Number(e.target.value) || 1) },
                        },
                      })
                    }
                    className={`w-28 ${INPUT}`}
                  />
                </label>
                <label className="flex items-center gap-2 pb-2 text-xs text-neutral-600 dark:text-neutral-300">
                  <input
                    type="checkbox"
                    checked={scheduler.fsrs.enableFuzz}
                    onChange={(e) => update({ scheduler: { fsrs: { enableFuzz: e.target.checked } } })}
                  />
                  fuzz intervals (de-clumps cards added together)
                </label>
              </div>
            </>
          ) : (
            <>
              <div className="grid grid-cols-4 gap-3">
                <DurationInput
                  label="Again"
                  value={scheduler.manual.again}
                  onCommit={(again) => update({ scheduler: { manual: { again } } })}
                />
                <DurationInput
                  label="Hard"
                  value={scheduler.manual.hard}
                  onCommit={(hard) => update({ scheduler: { manual: { hard } } })}
                />
                <DurationInput
                  label="Good"
                  value={scheduler.manual.good}
                  onCommit={(good) => update({ scheduler: { manual: { good } } })}
                />
                <DurationInput
                  label="Easy"
                  value={scheduler.manual.easy}
                  onCommit={(easy) => update({ scheduler: { manual: { easy } } })}
                />
              </div>
              <label className="block">
                <span className={LABEL}>Growth factor</span>
                <input
                  type="number"
                  min={1}
                  max={10}
                  step={0.1}
                  value={scheduler.manual.growthFactor}
                  onChange={(e) =>
                    update({
                      scheduler: {
                        manual: { growthFactor: Math.max(1, Number(e.target.value) || 1) },
                      },
                    })
                  }
                  className={`w-24 ${INPUT}`}
                />
                <span className="mt-1 block text-xs text-neutral-400">
                  First reviews use the fixed times above; after a card graduates (≥ 1d), each
                  Good/Easy multiplies its interval by this factor. Again always resets to its
                  fixed time.
                </span>
              </label>
            </>
          )}
        </Section>

        <Section title="Review sessions">
          <div className="flex items-end gap-6">
            <label className="block">
              <span className={LABEL}>Default max cards</span>
              <input
                type="number"
                min={1}
                max={1000}
                value={session.defaultMaxCards}
                onChange={(e) =>
                  update({
                    session: { defaultMaxCards: Math.max(1, Number(e.target.value) || 20) },
                  })
                }
                className={`w-24 ${INPUT}`}
              />
            </label>
            <label className="block">
              <span className={LABEL}>New cards per day</span>
              <input
                type="number"
                min={0}
                max={9999}
                value={session.dailyNewLimit}
                onChange={(e) =>
                  update({ session: { dailyNewLimit: Math.max(0, Number(e.target.value) || 0) } })
                }
                className={`w-24 ${INPUT}`}
              />
            </label>
          </div>
          <label className="block">
            <span className={LABEL}>Default mode</span>
            <Segmented
              grow
              value={session.defaultMode}
              options={SESSION_MODE_OPTIONS}
              onChange={(defaultMode) => update({ session: { defaultMode } })}
            />
          </label>
        </Section>

        <Section title="Quiz defaults">
          <label className="block">
            <span className={LABEL}>Answers</span>
            <Segmented
              grow
              value={quiz.defaultAnswers}
              options={ANSWER_PLACEMENT_OPTIONS}
              onChange={(defaultAnswers) => update({ quiz: { defaultAnswers } })}
            />
          </label>
          <label className="flex items-center gap-2 text-xs text-neutral-600 dark:text-neutral-300">
            <input
              type="checkbox"
              checked={quiz.defaultShowMeta}
              onChange={(e) => update({ quiz: { defaultShowMeta: e.target.checked } })}
            />
            show source &amp; difficulty by default
          </label>
        </Section>

        <Section title="Appearance">
          <div className="grid grid-cols-3 gap-2">
            {THEMES.map((t) => (
              <button
                key={t.id}
                onClick={() => update({ theme: t.id })}
                className={`flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm ${
                  activeTheme === t.id
                    ? "border-accent bg-accent-soft font-medium text-accent-text"
                    : "border-edge text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
                }`}
              >
                <span
                  className="h-4 w-4 shrink-0 rounded-full border border-neutral-400/40"
                  style={{ background: `linear-gradient(135deg, ${t.bg} 50%, ${t.swatch} 50%)` }}
                />
                {t.label}
              </button>
            ))}
          </div>
        </Section>
      </div>
    </div>
  );
}
