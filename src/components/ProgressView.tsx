// Progress: what the review log and the card schedule say about how study
// is going — streak, volume, recall, how far cards have matured, and where
// each subject stands. Read-only; everything derives from data the app
// already keeps (.studydb/review-log.jsonl + the cards table).

import { useMemo, useState, type ReactNode } from "react";
import {
  addDays,
  dayKey,
  isDue,
  recallRate,
  stageOf,
  STAGES,
  streaks,
  tallyByDay,
  type Stage,
} from "../domain/progress";
import { ipc } from "../lib/ipc";
import { useAsync } from "../lib/useAsync";
import { useQuestions } from "../state/questions";
import { useUi } from "../state/ui";
import { FlameIcon } from "./icons";
import { Button } from "./ui/Button";

const WEEKS = 26;
const DAYS_SHOWN = 30;

const STAGE_META: Record<Stage, { label: string; hint: string; fill: string; ink: string }> = {
  new: {
    label: "Not started",
    hint: "never reviewed",
    fill: "var(--viz-none)",
    ink: "var(--viz-on-light-step)",
  },
  learning: {
    label: "Learning",
    hint: "in its first short steps, or being relearned",
    fill: "var(--viz-learning)",
    ink: "var(--viz-ink-learning)",
  },
  young: {
    label: "Young",
    hint: "remembered, interval under 3 weeks",
    fill: "var(--viz-young)",
    ink: "#ffffff",
  },
  mature: {
    label: "Mature",
    hint: "interval of 3 weeks or more",
    fill: "var(--viz-mature)",
    ink: "var(--viz-ink-mature)",
  },
};

// --- hover/focus readout shared by every mark on the page -----------------

interface Tip {
  x: number;
  y: number;
  value: string;
  label: string;
}

function useTip() {
  const [tip, setTip] = useState<Tip | null>(null);
  const handlers = (value: string, label: string) => {
    const show = (e: React.SyntheticEvent) => {
      const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
      setTip({ x: r.left + r.width / 2, y: r.top, value, label });
    };
    return {
      onPointerEnter: show,
      onFocus: show,
      onPointerLeave: () => setTip(null),
      onBlur: () => setTip(null),
    };
  };
  const node = tip && (
    <div
      role="tooltip"
      className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-full rounded-md border border-edge bg-surface px-2.5 py-1.5 text-xs whitespace-nowrap shadow-lg"
      style={{ left: tip.x, top: tip.y - 6 }}
    >
      <div className="font-semibold">{tip.value}</div>
      <div className="text-neutral-500 dark:text-neutral-400">{tip.label}</div>
    </div>
  );
  return { handlers, node };
}

function Card({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-edge bg-surface p-5">
      <h2 className="text-sm font-semibold">{title}</h2>
      {hint && <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">{hint}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Tile({ label, value, note, icon }: { label: string; value: ReactNode; note: string; icon?: ReactNode }) {
  return (
    <div className="rounded-xl border border-edge bg-surface px-4 py-3.5">
      <div className="text-xs text-neutral-500 dark:text-neutral-400">{label}</div>
      <div className="mt-1 flex items-center gap-1.5 text-3xl font-semibold">
        {value}
        {icon}
      </div>
      <div className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">{note}</div>
    </div>
  );
}

const longDate = (d: Date) =>
  d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
const plural = (n: number, word: string) => `${n.toLocaleString()} ${word}${n === 1 ? "" : "s"}`;

/** A round axis maximum at or above `n` (5, 10, 20, 50, 100…). */
function niceMax(n: number): number {
  if (n <= 4) return 4;
  const mag = 10 ** Math.floor(Math.log10(n));
  return [1, 2, 5, 10].map((m) => m * mag).find((v) => v >= n)!;
}

export function ProgressView() {
  // Re-read when the bank changes (imports, edits made outside the app).
  const bank = useQuestions((s) => s.allRows);
  const data = useAsync(
    async () => ({ log: await ipc.reviewLog(), cards: await ipc.allCards() }),
    [bank],
    { reset: false },
  );
  const today = useMemo(() => new Date(), []);
  const tip = useTip();

  const view = useMemo(() => {
    if (!data) return null;
    const days = tallyByDay(data.log);
    const count = (d: Date) => days.get(dayKey(d))?.total ?? 0;

    // Last 30 days, oldest first.
    const recent = Array.from({ length: DAYS_SHOWN }, (_, i) => {
      const date = addDays(today, i - (DAYS_SHOWN - 1));
      return { date, count: count(date) };
    });

    // Calendar grid: whole weeks (Mon–Sun), ending with the current week.
    const monday = addDays(today, -((today.getDay() + 6) % 7));
    const weeks = Array.from({ length: WEEKS }, (_, w) =>
      Array.from({ length: 7 }, (_, d) => {
        const date = addDays(monday, (w - (WEEKS - 1)) * 7 + d);
        return { date, count: count(date), future: date > today };
      }),
    );
    const peak = Math.max(1, ...weeks.flat().map((c) => c.count));

    const stages = Object.fromEntries(STAGES.map((s) => [s, 0])) as Record<Stage, number>;
    const subjects = new Map<string, { cards: number; started: number; mature: number; due: number }>();
    for (const { question, card } of data.cards) {
      const stage = stageOf(card);
      stages[stage]++;
      const name = question.folder.split("/")[0] || "No subject";
      const s = subjects.get(name) ?? { cards: 0, started: 0, mature: 0, due: 0 };
      s.cards++;
      if (stage !== "new") s.started++;
      if (stage === "mature") s.mature++;
      if (isDue(card, today)) s.due++;
      subjects.set(name, s);
    }

    return {
      days,
      recent,
      weeks,
      peak,
      stages,
      subjects: [...subjects].sort((a, b) => b[1].cards - a[1].cards),
      streak: streaks(days, today),
      recall: recallRate(days, today, DAYS_SHOWN),
      total: data.log.length,
      cards: data.cards.length,
    };
  }, [data, today]);

  if (!view) {
    return <div className="flex h-full items-center justify-center text-sm text-neutral-400">…</div>;
  }

  if (view.total === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <h1 className="font-display text-3xl font-semibold tracking-tight">No reviews yet</h1>
        <p className="max-w-sm text-sm text-neutral-500 dark:text-neutral-400">
          Your streak, daily activity and how well cards are sticking will show up here once
          you've done your first review session.
        </p>
        <Button size="lg" className="mt-2" onClick={() => useUi.getState().setView("review")}>
          Go to Review
        </Button>
      </div>
    );
  }

  const recentTotal = view.recent.reduce((a, d) => a + d.count, 0);
  const activeDays = view.recent.filter((d) => d.count > 0).length;
  const yMax = niceMax(Math.max(...view.recent.map((d) => d.count)));
  const reviewedToday = view.days.has(dayKey(today));
  const level = (n: number) => (n === 0 ? 0 : Math.min(4, Math.ceil((n / view.peak) * 4)));
  const cellFill = (n: number) =>
    n === 0 ? "var(--viz-track)" : `var(--viz-seq-${level(n)})`;

  return (
    <div className="progress-view h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl space-y-5 px-8 py-10">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Progress</h1>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            {plural(view.total, "review")} across {plural(view.cards, "card")} so far.
          </p>
        </div>

        {/* Headline numbers */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Tile
            label="Current streak"
            value={view.streak.current}
            icon={view.streak.current > 0 && <FlameIcon className="h-5 w-5 text-neutral-400" />}
            note={
              view.streak.current === 0
                ? `Best: ${plural(view.streak.longest, "day")}`
                : reviewedToday
                  ? `${view.streak.current === 1 ? "day" : "days"} · best ${view.streak.longest}`
                  : "Review today to keep it"
            }
          />
          <Tile label="Reviews, last 30 days" value={recentTotal.toLocaleString()} note={`on ${activeDays} of 30 days`} />
          <Tile
            label="Recall, last 30 days"
            value={view.recall === null ? "—" : `${Math.round(view.recall * 100)}%`}
            note="not graded Again"
          />
          <Tile
            label="Mature cards"
            value={view.stages.mature.toLocaleString()}
            note={`of ${plural(view.cards, "card")}`}
          />
        </div>

        {/* Volume per day */}
        <Card title="Reviews per day" hint="Last 30 days">
          <div className="flex gap-2">
            <div className="flex h-36 flex-col justify-between text-right text-[11px] leading-none text-neutral-400 tabular-nums">
              <span>{yMax}</span>
              <span>{yMax / 2}</span>
              <span>0</span>
            </div>
            <div className="min-w-0 flex-1">
              <div className="relative h-36">
                {[0, 50].map((top) => (
                  <div key={top} className="absolute inset-x-0 border-t border-edge" style={{ top: `${top}%` }} />
                ))}
                <div className="absolute inset-x-0 bottom-0 border-t border-neutral-300 dark:border-neutral-600" />
                <div className="absolute inset-0 flex items-end gap-[2px]">
                  {view.recent.map((d) => (
                    <div
                      key={dayKey(d.date)}
                      tabIndex={0}
                      aria-label={`${longDate(d.date)}: ${plural(d.count, "review")}`}
                      className="group flex h-full flex-1 items-end justify-center outline-none"
                      {...tip.handlers(plural(d.count, "review"), longDate(d.date))}
                    >
                      <div
                        className="w-full max-w-6 rounded-t group-hover:brightness-110 group-focus-visible:brightness-110"
                        style={{
                          height: `${(d.count / yMax) * 100}%`,
                          background: "var(--viz)",
                        }}
                      />
                    </div>
                  ))}
                </div>
              </div>
              <div className="mt-1.5 flex text-[11px] text-neutral-400">
                {view.recent.map((d, i) => (
                  <span key={i} className="flex-1 text-center whitespace-nowrap">
                    {/* a label under every 7th column, ending on today */}
                    {(DAYS_SHOWN - 1 - i) % 7 === 0 && (
                      <span className="inline-block -translate-x-0">
                        {i === DAYS_SHOWN - 1
                          ? "Today"
                          : d.date.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                      </span>
                    )}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </Card>

        {/* Consistency */}
        <Card title="Activity" hint={`Each square is a day — last ${WEEKS} weeks`}>
          <div className="flex gap-2">
            <div className="flex flex-col gap-[3px] self-start pt-[19px] text-[10px] leading-[14px] text-neutral-400">
              {["Mon", "", "Wed", "", "Fri", "", "Sun"].map((d, i) => (
                <span key={i} className="h-[14px]">
                  {d}
                </span>
              ))}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex justify-between gap-[3px]">
                {view.weeks.map((week, w) => {
                  const first = week[0].date;
                  const newMonth = first.getDate() <= 7;
                  return (
                    <div key={w} className="flex flex-1 flex-col gap-[3px]">
                      <span className="h-4 text-[10px] whitespace-nowrap text-neutral-400">
                        {newMonth && w < WEEKS - 1
                          ? first.toLocaleDateString(undefined, { month: "short" })
                          : ""}
                      </span>
                      {week.map((cell) =>
                        cell.future ? (
                          <span key={dayKey(cell.date)} className="h-[14px]" />
                        ) : (
                          <span
                            key={dayKey(cell.date)}
                            role="img"
                            aria-label={`${longDate(cell.date)}: ${plural(cell.count, "review")}`}
                            className="h-[14px] rounded-[3px] hover:ring-2 hover:ring-neutral-400"
                            style={{ background: cellFill(cell.count) }}
                            {...tip.handlers(plural(cell.count, "review"), longDate(cell.date))}
                          />
                        ),
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="mt-3 flex items-center justify-end gap-1.5 text-[11px] text-neutral-400">
                Fewer
                {[0, 1, 2, 3, 4].map((l) => (
                  <span
                    key={l}
                    className="h-3 w-3 rounded-[3px]"
                    style={{ background: l === 0 ? "var(--viz-track)" : `var(--viz-seq-${l})` }}
                  />
                ))}
                More
              </div>
            </div>
          </div>
        </Card>

        {/* Maturity */}
        <Card title="Where your cards are" hint="From never seen to long-term memory">
          <div
            className="flex h-7 gap-[2px]"
            role="img"
            aria-label={STAGES.map((s) => `${STAGE_META[s].label}: ${view.stages[s]}`).join(", ")}
          >
            {STAGES.filter((s) => view.stages[s] > 0).map((s) => {
              const share = view.stages[s] / view.cards;
              return (
                <div
                  key={s}
                  tabIndex={0}
                  className="flex min-w-0 items-center rounded px-2 text-xs font-medium outline-none hover:brightness-110 focus-visible:brightness-110"
                  style={{ flexGrow: view.stages[s], flexBasis: 0, background: STAGE_META[s].fill, color: STAGE_META[s].ink }}
                  {...tip.handlers(
                    `${plural(view.stages[s], "card")} · ${Math.round(share * 100)}%`,
                    `${STAGE_META[s].label} — ${STAGE_META[s].hint}`,
                  )}
                >
                  {/* only where the share is wide enough to hold it */}
                  {share >= 0.08 && `${Math.round(share * 100)}%`}
                </div>
              );
            })}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-xs sm:grid-cols-4">
            {STAGES.map((s) => (
              <div key={s} className="flex gap-2">
                <span className="mt-0.5 h-3 w-3 shrink-0 rounded-[3px]" style={{ background: STAGE_META[s].fill }} />
                <span>
                  <span className="font-medium">{STAGE_META[s].label}</span>{" "}
                  <span className="text-neutral-500 tabular-nums dark:text-neutral-400">{view.stages[s]}</span>
                  <span className="block text-neutral-500 dark:text-neutral-400">{STAGE_META[s].hint}</span>
                </span>
              </div>
            ))}
          </div>
        </Card>

        {/* Per subject */}
        <Card title="By subject" hint="How much of each subject you've started, and how much has matured">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-edge text-left text-xs text-neutral-500 dark:text-neutral-400">
                <th className="pb-2 font-medium">Subject</th>
                <th className="w-2/5 pb-2 font-medium">Started · mature</th>
                <th className="pb-2 text-right font-medium">Cards</th>
                <th className="pb-2 text-right font-medium">Mature</th>
                <th className="pb-2 text-right font-medium">Due now</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-edge">
              {view.subjects.map(([name, s]) => (
                <tr key={name}>
                  <td className="py-2 pr-3 font-medium capitalize">{name}</td>
                  <td className="py-2 pr-4">
                    {/* meter: track → started → mature, one hue */}
                    <div
                      className="relative h-2 overflow-hidden rounded-full bg-[var(--viz-track)]"
                      {...tip.handlers(
                        `${s.started} of ${s.cards} started · ${s.mature} mature`,
                        name,
                      )}
                    >
                      <div
                        className="absolute inset-y-0 left-0 rounded-full"
                        style={{ width: `${(s.started / s.cards) * 100}%`, background: "var(--viz-learning)" }}
                      />
                      <div
                        className="absolute inset-y-0 left-0 rounded-full"
                        style={{ width: `${(s.mature / s.cards) * 100}%`, background: "var(--viz-mature)" }}
                      />
                    </div>
                  </td>
                  <td className="py-2 text-right tabular-nums">{s.cards}</td>
                  <td className="py-2 text-right tabular-nums">{s.mature}</td>
                  <td className="py-2 text-right tabular-nums">
                    {s.due > 0 ? s.due : <span className="text-neutral-400">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
      {tip.node}
    </div>
  );
}
