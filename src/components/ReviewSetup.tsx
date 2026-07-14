// Review setup, two tabs:
//  - "Due now": subjects grouped with due/new counts, expandable to the
//    individual questions, per-subject Review buttons and Review all.
//  - "Custom session": scope a session by subject/tags, pick mode and size.
// Both converge on onStart(entries, mode); the daily new-card limit is
// applied at every entry point.

import { useEffect, useMemo, useState } from "react";
import { applyDailyNewLimit, fmtInterval, todayStartIso } from "../domain/srs";
import type { SessionMode } from "../domain/settings";
import { ipc, type DueEntry, type ReviewStats, type SearchParams } from "../lib/ipc";
import { useQuestions } from "../state/questions";
import { useSettings } from "../state/settings";
import { SubjectSelect } from "./fields/SubjectSelect";
import { TagInput } from "./fields/TagInput";

type Tab = "due" | "custom";

const LABEL = "mb-1 block text-xs font-medium text-neutral-500 dark:text-neutral-400";
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

export function ReviewSetup({
  onStart,
}: {
  onStart(entries: DueEntry[], mode: SessionMode): void;
}) {
  const [tab, setTab] = useState<Tab>("due");
  const [stats, setStats] = useState<ReviewStats | null>(null);

  useEffect(() => {
    const now = new Date();
    void ipc.reviewStats(now.toISOString(), todayStartIso(now)).then(setStats).catch(() => {});
  }, []);

  const newToday = stats?.new_today ?? 0;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
        <div>
          <h2 className="text-xl font-semibold">Review</h2>
          {stats && (
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
              {stats.due_now} due · {stats.new_count} new · {stats.reviews_today} reviewed today ·{" "}
              {stats.total_reviews} all-time
            </p>
          )}
        </div>

        {/* Upcoming load */}
        {stats && stats.upcoming.length > 0 && (
          <div className="flex items-end gap-1">
            {stats.upcoming.map(([day, n]) => (
              <div key={day} className="flex flex-col items-center gap-0.5">
                <div
                  className="w-8 rounded-t bg-accent/60"
                  style={{ height: `${Math.min(60, 8 + n * 6)}px` }}
                  title={`${day}: ${n} due`}
                />
                <span className="text-[10px] text-neutral-400">{day.slice(5)}</span>
              </div>
            ))}
          </div>
        )}

        {/* Tabs */}
        <div className="flex w-fit overflow-hidden rounded-md border border-edge">
          {(
            [
              ["due", "Due now"],
              ["custom", "Custom session"],
            ] as [Tab, string][]
          ).map(([t, label]) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-1.5 text-xs ${
                tab === t
                  ? "bg-accent font-medium text-on-accent"
                  : "bg-surface text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "due" ? (
          <DueDashboard newToday={newToday} onStart={onStart} />
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
  newToday,
  onStart,
}: {
  newToday: number;
  onStart(entries: DueEntry[], mode: SessionMode): void;
}) {
  const session = useSettings((s) => s.settings.session);
  const [entries, setEntries] = useState<DueEntry[] | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const now = useMemo(() => new Date(), []);

  useEffect(() => {
    let alive = true;
    void ipc
      .cardsDue({ text: null, folder: null, tags: [], body_kind: null }, new Date().toISOString(), 10_000)
      .then((es) => alive && setEntries(es))
      .catch(() => alive && setEntries([]));
    return () => {
      alive = false;
    };
  }, []);

  const groups = useMemo(() => (entries ? groupBySubject(entries) : []), [entries]);

  // What a session over `pool` would actually contain, after the daily
  // new-card budget and session size cap.
  const sessionOf = (pool: DueEntry[]) =>
    applyDailyNewLimit(pool, newToday, session.dailyNewLimit).slice(0, session.defaultMaxCards);

  const allSession = sessionOf(entries ?? []);

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
      <div className="rounded-lg border border-edge bg-surface p-8 text-center">
        <p className="text-lg">Nothing due 🎉</p>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          Come back later, or start a custom session to review ahead.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="divide-y divide-edge rounded-lg border border-edge bg-surface">
        {groups.map((g) => {
          const pool = [...g.due, ...g.fresh];
          const subjectSession = sessionOf(pool);
          const open = expanded.has(g.subject);
          return (
            <div key={g.subject}>
              <div className="flex items-center gap-2 px-3 py-2">
                <button
                  onClick={() => toggle(g.subject)}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  title={open ? "Collapse" : "Show questions"}
                >
                  <span
                    className={`text-xs text-neutral-400 transition-transform ${open ? "rotate-90" : ""}`}
                  >
                    ▶
                  </span>
                  <span className="truncate text-sm font-medium">{g.subject}</span>
                  <span className="shrink-0 text-xs text-neutral-500 dark:text-neutral-400">
                    {g.due.length} due · {g.fresh.length} new
                  </span>
                </button>
                <button
                  onClick={() => onStart(subjectSession, session.defaultMode)}
                  disabled={subjectSession.length === 0}
                  className="shrink-0 rounded-md border border-edge px-2.5 py-1 text-xs text-neutral-600 hover:bg-neutral-100 disabled:opacity-40 dark:text-neutral-300 dark:hover:bg-neutral-800"
                >
                  Review
                </button>
              </div>
              {open && (
                <ul className="space-y-0.5 px-3 pb-2 pl-9">
                  {pool.map((e) => (
                    <li
                      key={e.question.id}
                      className="flex items-baseline justify-between gap-3 text-xs"
                    >
                      <span className="truncate text-neutral-700 dark:text-neutral-300">
                        {e.question.title ?? e.question.id}
                      </span>
                      <span
                        className={`shrink-0 ${
                          e.card.state === "new"
                            ? "text-accent-text"
                            : "text-neutral-400 dark:text-neutral-500"
                        }`}
                      >
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

      <button
        onClick={() => onStart(allSession, session.defaultMode)}
        disabled={allSession.length === 0}
        className="w-full rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-on-accent shadow-sm transition hover:bg-accent-hover disabled:opacity-40"
      >
        {allSession.length === 0
          ? "Nothing to review 🎉"
          : `Review all (${allSession.length} card${allSession.length > 1 ? "s" : ""})`}
      </button>
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
  const [entries, setEntries] = useState<DueEntry[] | null>(null);

  const params: SearchParams = useMemo(
    () => ({ text: null, folder: subject.trim() || null, tags, body_kind: null }),
    [subject, tags],
  );

  useEffect(() => {
    let alive = true;
    void ipc
      .cardsDue(params, new Date().toISOString(), 10_000)
      .then((es) => alive && setEntries(es))
      .catch(() => alive && setEntries(null));
    return () => {
      alive = false;
    };
  }, [params]);

  const queue = entries
    ? applyDailyNewLimit(entries, newToday, session.dailyNewLimit).slice(0, limit)
    : null;

  return (
    <div className="space-y-4">
      <label className="block">
        <span className={LABEL}>Subject (leave empty for all)</span>
        <SubjectSelect value={subject} onChange={setSubject} recent={recentFolders()} />
      </label>
      <label className="block">
        <span className={LABEL}>Tags</span>
        <TagInput value={tags} onChange={setTags} suggestions={allTags()} />
      </label>
      <div className="flex items-end gap-4">
        <label className="block">
          <span className={LABEL}>Mode</span>
          <div className="flex overflow-hidden rounded-md border border-edge">
            {(
              [
                ["auto", "Per question"],
                ["flashcard", "Flashcard"],
                ["typein", "Type-in"],
              ] as [SessionMode, string][]
            ).map(([m, label]) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`px-3 py-1.5 text-xs ${
                  mode === m
                    ? "bg-accent font-medium text-on-accent"
                    : "bg-surface text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </label>
        <label className="block">
          <span className={LABEL}>Max cards</span>
          <input
            type="number"
            min={1}
            max={500}
            value={limit}
            onChange={(e) => setLimit(Math.max(1, Number(e.target.value) || session.defaultMaxCards))}
            className="w-20 rounded-md border border-edge bg-surface px-2 py-1.5 text-sm"
          />
        </label>
      </div>

      <button
        onClick={() => queue && queue.length > 0 && onStart(queue, mode)}
        disabled={!queue || queue.length === 0}
        className="w-full rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-on-accent shadow-sm transition hover:bg-accent-hover disabled:opacity-40"
      >
        {queue === null
          ? "…"
          : queue.length === 0
            ? "Nothing due for this deck 🎉"
            : `Start reviewing ${queue.length} card${queue.length > 1 ? "s" : ""}`}
      </button>
    </div>
  );
}
