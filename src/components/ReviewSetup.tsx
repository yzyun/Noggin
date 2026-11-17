// Review setup, two tabs:
//  - "Due now": subjects grouped with due/new counts, expandable to the
//    individual questions, per-subject Review buttons and Review all.
//  - "Custom session": scope a session by subject/tags, pick mode and size.
// Both converge on onStart(entries, mode); the daily new-card limit is
// applied at every entry point.

import { useEffect, useMemo, useState } from "react";
import { applyDailyNewLimit, fmtInterval, todayStartIso } from "../domain/srs";
import { SESSION_MODE_OPTIONS, type SessionMode } from "../domain/settings";
import { EMPTY_SEARCH, ipc, searchParams, type DueEntry, type ReviewStats, type SearchParams } from "../lib/ipc";
import { useAsync } from "../lib/useAsync";
import { useQuestions } from "../state/questions";
import { useSettings } from "../state/settings";
import { SubjectSelect } from "./fields/SubjectSelect";
import { TagInput } from "./fields/TagInput";
import { ChevronIcon } from "./icons";
import { TitleText } from "./TitleText";
import { Button } from "./ui/Button";
import { Field, INPUT } from "./ui/Field";
import { Segmented } from "./ui/Segmented";

type Tab = "due" | "custom";

const NO_SUBJECT = "(no subject)";

interface SubjectGroup {
  subject: string;
  due: DueEntry[];
  fresh: DueEntry[];
}

function groupBySubject(entries: DueEntry[]): SubjectGroup[] {
  const map = new Map<string, SubjectGroup>();
  for (const e of entries) {
    const subject = e.question.folder.split("/").filter(Boolean)[0] ?? NO_SUBJECT;
    let g = map.get(subject);
    if (!g) {
      g = { subject, due: [], fresh: [] };
      map.set(subject, g);
    }
    (e.card.state === "new" ? g.fresh : g.due).push(e);
  }
  return [...map.values()].sort((a, b) =>
    a.subject === NO_SUBJECT ? 1 : b.subject === NO_SUBJECT ? -1 : a.subject.localeCompare(b.subject),
  );
}

/** "due 2h ago" / "due just now" for due cards; "new" for unseen ones. */
function dueLabel(e: DueEntry, now: Date): string {
  if (e.card.state === "new") return "new";
  if (!e.card.due) return "due now";
  const due = new Date(e.card.due);
  return due <= now ? `due ${fmtInterval(due, now)} ago` : `due in ${fmtInterval(now, due)}`;
}

/** The next 7 calendar days with how many cards fall due on each. Days are
 *  keyed the way the backend buckets them (UTC date of the due timestamp). */
function forecast(upcoming: [string, number][], now: Date) {
  const counts = new Map(upcoming);
  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(now.getTime() + i * 86_400_000);
    return {
      key: day.toISOString().slice(0, 10),
      label: i === 0 ? "Today" : day.toLocaleDateString(undefined, { weekday: "short" }),
      count: counts.get(day.toISOString().slice(0, 10)) ?? 0,
    };
  });
}

function Stat({ value, label }: { value: React.ReactNode; label: string }) {
  return (
    <div>
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      <div className="text-xs text-neutral-500 dark:text-neutral-400">{label}</div>
    </div>
  );
}

export function ReviewSetup({
  onStart,
}: {
  onStart(entries: DueEntry[], mode: SessionMode): void;
}) {
  const [tab, setTab] = useState<Tab>("due");
  const session = useSettings((s) => s.settings.session);
  const now = useMemo(() => new Date(), []);
  // Re-query when the bank changes underneath us (first index of a vault,
  // files edited or dropped in from outside).
  const bank = useQuestions((s) => s.allRows);
  const stats: ReviewStats | null = useAsync(
    () => ipc.reviewStats(now.toISOString(), todayStartIso(now)),
    [bank],
    { reset: false },
  );
  const entries = useAsync(() => ipc.cardsDue(EMPTY_SEARCH).catch(() => []), [bank], {
    reset: false,
  });

  const newToday = stats?.new_today ?? 0;
  // What "Start review" actually contains, after the daily new-card budget
  // and the session size cap.
  const ready = entries
    ? applyDailyNewLimit(entries, newToday, session.dailyNewLimit).slice(0, session.defaultMaxCards)
    : null;
  const days = stats ? forecast(stats.upcoming, now) : [];
  const peak = Math.max(1, ...days.map((d) => d.count));

  // Enter starts the default session straight from the dashboard.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.key !== "Enter" || e.metaKey || e.ctrlKey || el.closest("input, textarea, button, .cm-editor, [role=dialog]"))
        return;
      if (tab === "due" && ready && ready.length > 0) onStart(ready, session.defaultMode);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tab, ready, session.defaultMode, onStart]);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex max-w-3xl flex-col gap-6 px-8 py-10">
        {/* Hero: the one thing to do next */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              {now.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
            </p>
            <h1 className="mt-1 font-display text-4xl font-semibold tracking-tight">
              {ready === null
                ? " "
                : ready.length === 0
                  ? "You're all caught up"
                  : `${ready.length} card${ready.length === 1 ? "" : "s"} to review`}
            </h1>
            {ready !== null && (
              <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
                {ready.length === 0
                  ? "Nothing is due right now. Add questions, or review ahead with a custom session."
                  : (() => {
                      const fresh = ready.filter((e) => e.card.state === "new").length;
                      const parts = [
                        ready.length - fresh > 0 && `${ready.length - fresh} due`,
                        fresh > 0 && `${fresh} new`,
                      ].filter(Boolean);
                      const more = (entries?.length ?? 0) - ready.length;
                      return `${parts.join(" and ")}${more > 0 ? ` · ${more} more waiting after this session` : ""}`;
                    })()}
              </p>
            )}
          </div>
          {ready !== null && ready.length > 0 && (
            <Button size="lg" onClick={() => onStart(ready, session.defaultMode)}>
              <span className="flex items-center gap-2">
                Start review
                <kbd className="rounded border border-current/25 px-1 font-sans text-[10px] leading-4 opacity-70">
                  Enter
                </kbd>
              </span>
            </Button>
          )}
        </div>

        {/* Stats + 7-day forecast */}
        {stats && (
          <div className="grid gap-6 rounded-xl border border-edge bg-surface p-5 sm:grid-cols-[auto_1fr]">
            <div className="flex gap-8 sm:flex-col sm:justify-between sm:gap-3 sm:border-r sm:border-edge sm:pr-8">
              <Stat value={stats.reviews_today} label="reviewed today" />
              <Stat value={stats.new_count} label="not yet started" />
              <Stat value={stats.total_reviews} label="reviews all-time" />
            </div>
            <div className="flex min-w-0 flex-col">
              <div className="mb-3 text-xs font-medium text-neutral-500 dark:text-neutral-400">
                Coming up — cards falling due over the next 7 days
              </div>
              <div className="grid flex-1 grid-cols-7 items-end gap-2">
                {days.map((d) => (
                  <div key={d.key} className="flex flex-col items-center gap-1" title={`${d.key}: ${d.count} due`}>
                    <span className={`text-xs tabular-nums ${d.count ? "font-medium" : "text-neutral-400"}`}>
                      {d.count}
                    </span>
                    <div className="flex h-16 w-full items-end">
                      <div
                        className={`mx-auto w-full max-w-8 rounded-t-md ${d.count ? "bg-neutral-700 dark:bg-neutral-300" : "bg-neutral-200 dark:bg-neutral-800"}`}
                        style={{ height: d.count ? `${Math.max(12, (d.count / peak) * 100)}%` : "2px" }}
                      />
                    </div>
                    <span className="text-[11px] text-neutral-500 dark:text-neutral-400">{d.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold">
            {tab === "due" ? "By subject" : "Custom session"}
          </h2>
          <Segmented<Tab>
            value={tab}
            options={[
              ["due", "Due now"],
              ["custom", "Custom session"],
            ]}
            onChange={setTab}
          />
        </div>

        {tab === "due" ? (
          <DueDashboard entries={entries} newToday={newToday} onStart={onStart} />
        ) : (
          <CustomSession newToday={newToday} onStart={onStart} />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Due-now dashboard
// ---------------------------------------------------------------------------

function DueDashboard({
  entries,
  newToday,
  onStart,
}: {
  entries: DueEntry[] | null;
  newToday: number;
  onStart(entries: DueEntry[], mode: SessionMode): void;
}) {
  const session = useSettings((s) => s.settings.session);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const now = useMemo(() => new Date(), []);

  const groups = useMemo(() => (entries ? groupBySubject(entries) : []), [entries]);

  const sessionOf = (pool: DueEntry[]) =>
    applyDailyNewLimit(pool, newToday, session.dailyNewLimit).slice(0, session.defaultMaxCards);

  const toggle = (subject: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(subject)) next.delete(subject);
      else next.add(subject);
      return next;
    });

  if (entries === null) {
    return <p className="text-sm text-neutral-400">…</p>;
  }
  if (groups.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-edge p-8 text-center text-sm text-neutral-500 dark:text-neutral-400">
        No subjects have cards waiting.
      </div>
    );
  }

  return (
    <div className="divide-y divide-edge overflow-hidden rounded-xl border border-edge bg-surface">
      {groups.map((g) => {
        const pool = [...g.due, ...g.fresh];
        const subjectSession = sessionOf(pool);
        const open = expanded.has(g.subject);
        return (
          <div key={g.subject}>
            <div className="flex items-center gap-3 px-4 py-3">
              <button
                onClick={() => toggle(g.subject)}
                aria-expanded={open}
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
                title={open ? "Collapse" : "Show questions"}
              >
                <ChevronIcon
                  className={`h-3.5 w-3.5 shrink-0 text-neutral-400 transition-transform ${open ? "rotate-90" : ""}`}
                />
                <span className="truncate text-sm font-medium capitalize">{g.subject}</span>
              </button>
              <span className="flex shrink-0 items-center gap-1.5 text-xs">
                {g.due.length > 0 && (
                  <span className="rounded-full bg-accent-soft px-2 py-0.5 font-medium text-accent-text">
                    {g.due.length} due
                  </span>
                )}
                {g.fresh.length > 0 && (
                  <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                    {g.fresh.length} new
                  </span>
                )}
              </span>
              <Button
                variant="ghost"
                className="shrink-0"
                onClick={() => onStart(subjectSession, session.defaultMode)}
                disabled={subjectSession.length === 0}
              >
                Review
              </Button>
            </div>
            {open && (
              <ul className="space-y-1.5 border-t border-edge bg-neutral-50 px-4 py-3 pl-10 dark:bg-neutral-900/40">
                {pool.map((e) => (
                  <li key={e.question.id} className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="truncate text-neutral-700 dark:text-neutral-300">
                      <TitleText text={e.question.title ?? e.question.id} />
                    </span>
                    <span className="shrink-0 text-xs text-neutral-500 dark:text-neutral-400">
                      {dueLabel(e, now)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Custom session builder
// ---------------------------------------------------------------------------

function CustomSession({
  newToday,
  onStart,
}: {
  newToday: number;
  onStart(entries: DueEntry[], mode: SessionMode): void;
}) {
  const session = useSettings((s) => s.settings.session);
  const { allTags, recentFolders } = useQuestions();
  const [subject, setSubject] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [mode, setMode] = useState<SessionMode>(session.defaultMode);
  const [limit, setLimit] = useState(session.defaultMaxCards);

  const params: SearchParams = useMemo(
    () => searchParams({ folder: subject.trim() || null, tags }),
    [subject, tags],
  );

  const entries = useAsync(() => ipc.cardsDue(params), [params]);

  const queue = entries
    ? applyDailyNewLimit(entries, newToday, session.dailyNewLimit).slice(0, limit)
    : null;

  return (
    <div className="space-y-4">
      <Field label="Subject (leave empty for all)">
        <SubjectSelect value={subject} onChange={setSubject} recent={recentFolders()} />
      </Field>
      <Field label="Tags" as="div">
        <TagInput value={tags} onChange={setTags} suggestions={allTags()} />
      </Field>
      <div className="flex items-end gap-4">
        <Field label="Mode" as="div">
          <Segmented<SessionMode> value={mode} options={SESSION_MODE_OPTIONS} onChange={setMode} />
        </Field>
        <Field label="Max cards">
          <input
            type="number"
            min={1}
            max={500}
            value={limit}
            onChange={(e) => setLimit(Math.max(1, Number(e.target.value) || session.defaultMaxCards))}
            className={`w-20 ${INPUT}`}
          />
        </Field>
      </div>

      <Button
        size="lg"
        className="w-full"
        onClick={() => queue && queue.length > 0 && onStart(queue, mode)}
        disabled={!queue || queue.length === 0}
      >
        {queue === null
          ? "…"
          : queue.length === 0
            ? "Nothing due in this selection"
            : `Start reviewing ${queue.length} card${queue.length > 1 ? "s" : ""}`}
      </Button>
    </div>
  );
}
