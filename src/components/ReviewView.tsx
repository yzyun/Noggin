// Spaced-repetition review: session setup (deck filters + mode + stats),
// the session itself (flashcard or type-in-then-check, FSRS-graded), and
// an end-of-session summary.
//
// Keyboard: Space = reveal · 1–4 = Again/Hard/Good/Easy · Esc = end session.

import { useCallback, useEffect, useMemo, useState } from "react";
import { Rating } from "ts-fsrs";
import { gradeCard, previewIntervals, todayStartIso, type Grade } from "../domain/srs";
import type { QuestionDoc } from "../domain/types";
import { ipc, type DueEntry, type ReviewStats, type SearchParams } from "../lib/ipc";
import { parseQuestionFile } from "../domain/format";
import { useQuestions } from "../state/questions";
import { Markdown } from "./Markdown";
import { MarkdownField } from "./fields/MarkdownField";
import { SubjectSelect } from "./fields/SubjectSelect";
import { TagInput } from "./fields/TagInput";

type SessionMode = "flashcard" | "typein" | "auto";
type Phase = "setup" | "session" | "done";

const RATINGS: { grade: Grade; key: string; label: string; cls: string }[] = [
  { grade: Rating.Again, key: "1", label: "Again", cls: "bg-red-600 hover:bg-red-500" },
  { grade: Rating.Hard, key: "2", label: "Hard", cls: "bg-amber-600 hover:bg-amber-500" },
  { grade: Rating.Good, key: "3", label: "Good", cls: "bg-green-600 hover:bg-green-500" },
  { grade: Rating.Easy, key: "4", label: "Easy", cls: "bg-blue-600 hover:bg-blue-500" },
];

export function ReviewView() {
  const [phase, setPhase] = useState<Phase>("setup");
  const [queue, setQueue] = useState<DueEntry[]>([]);
  const [mode, setMode] = useState<SessionMode>("auto");
  const [summary, setSummary] = useState<Record<number, number>>({});

  return phase === "setup" ? (
    <Setup
      mode={mode}
      setMode={setMode}
      onStart={(entries) => {
        setQueue(entries);
        setSummary({});
        setPhase("session");
      }}
    />
  ) : phase === "session" ? (
    <Session
      queue={queue}
      mode={mode}
      onRated={(g) => setSummary((s) => ({ ...s, [g]: (s[g] ?? 0) + 1 }))}
      onEnd={() => setPhase("done")}
    />
  ) : (
    <Done summary={summary} onBack={() => setPhase("setup")} />
  );
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

function Setup({
  mode,
  setMode,
  onStart,
}: {
  mode: SessionMode;
  setMode(m: SessionMode): void;
  onStart(entries: DueEntry[]): void;
}) {
  const { allTags, recentFolders } = useQuestions();
  const [subject, setSubject] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [limit, setLimit] = useState(20);
  const [stats, setStats] = useState<ReviewStats | null>(null);
  const [queueCount, setQueueCount] = useState<number | null>(null);
  const [starting, setStarting] = useState(false);

  const params: SearchParams = useMemo(
    () => ({ text: null, folder: subject.trim() || null, tags, body_kind: null }),
    [subject, tags],
  );

  useEffect(() => {
    const now = new Date();
    void ipc.reviewStats(now.toISOString(), todayStartIso(now)).then(setStats).catch(() => {});
  }, []);

  useEffect(() => {
    let alive = true;
    void ipc
      .cardsDue(params, new Date().toISOString(), 10_000)
      .then((entries) => alive && setQueueCount(entries.length))
      .catch(() => alive && setQueueCount(null));
    return () => {
      alive = false;
    };
  }, [params]);

  const start = async () => {
    setStarting(true);
    try {
      const entries = await ipc.cardsDue(params, new Date().toISOString(), limit);
      if (entries.length) onStart(entries);
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="mx-auto flex h-full max-w-xl flex-col justify-center gap-6 p-6">
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
                className="w-8 rounded-t bg-blue-300 dark:bg-blue-800"
                style={{ height: `${Math.min(60, 8 + n * 6)}px` }}
                title={`${day}: ${n} due`}
              />
              <span className="text-[10px] text-neutral-400">{day.slice(5)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Deck filters */}
      <div className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-neutral-500 dark:text-neutral-400">
            Subject (leave empty for all)
          </span>
          <SubjectSelect value={subject} onChange={setSubject} recent={recentFolders()} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-neutral-500 dark:text-neutral-400">Tags</span>
          <TagInput value={tags} onChange={setTags} suggestions={allTags()} />
        </label>
        <div className="flex items-end gap-4">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-neutral-500 dark:text-neutral-400">Mode</span>
            <div className="flex overflow-hidden rounded-md border border-neutral-300 dark:border-neutral-700">
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
                      ? "bg-blue-600 font-medium text-white"
                      : "bg-white text-neutral-600 hover:bg-neutral-100 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-neutral-500 dark:text-neutral-400">
              Max cards
            </span>
            <input
              type="number"
              min={1}
              max={500}
              value={limit}
              onChange={(e) => setLimit(Math.max(1, Number(e.target.value) || 20))}
              className="w-20 rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900"
            />
          </label>
        </div>
      </div>

      <button
        onClick={start}
        disabled={starting || !queueCount}
        className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-blue-500 disabled:opacity-40"
      >
        {queueCount === null
          ? "…"
          : queueCount === 0
            ? "Nothing due for this deck 🎉"
            : `Start reviewing ${Math.min(queueCount, limit)} card${Math.min(queueCount, limit) > 1 ? "s" : ""}`}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

function Session({
  queue: initialQueue,
  mode,
  onRated,
  onEnd,
}: {
  queue: DueEntry[];
  mode: SessionMode;
  onRated(g: Grade): void;
  onEnd(): void;
}) {
  const [queue, setQueue] = useState(initialQueue);
  const [idx, setIdx] = useState(0);
  const [doc, setDoc] = useState<QuestionDoc | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [showSolution, setShowSolution] = useState(false);
  const [attempt, setAttempt] = useState("");
  const [doneCount, setDoneCount] = useState(0);

  const entry = queue[idx];
  const cardMode: "flashcard" | "typein" =
    mode === "auto" ? (entry?.question.recall === "typein" ? "typein" : "flashcard") : mode;

  // Load the question file for the current card.
  useEffect(() => {
    if (!entry) return;
    let alive = true;
    setDoc(null);
    setRevealed(false);
    setShowHint(false);
    setShowSolution(false);
    setAttempt("");
    void ipc
      .readFile(entry.question.path)
      .then((raw) => alive && setDoc(parseQuestionFile(raw)))
      .catch(() => alive && setDoc(null));
    return () => {
      alive = false;
    };
  }, [entry]);

  const previews = useMemo(
    () => (entry ? previewIntervals(entry.card) : null),
    [entry],
  );

  const rate = useCallback(
    async (grade: Grade) => {
      if (!entry || !revealed) return;
      const { updated, log } = gradeCard(entry.card, grade, cardMode);
      await ipc.cardUpdate(updated);
      await ipc.reviewLogAdd(log);
      onRated(grade);
      setDoneCount((n) => n + 1);

      setQueue((q) => {
        const next = [...q];
        // Lapsed cards come back at the end of this session.
        if (grade === Rating.Again) next.push({ question: entry.question, card: updated });
        return next;
      });
      if (idx + 1 < queue.length + (grade === Rating.Again ? 1 : 0)) {
        setIdx((i) => i + 1);
      } else {
        onEnd();
      }
    },
    [entry, revealed, cardMode, idx, queue.length, onRated, onEnd],
  );

  // Keyboard shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onEnd();
        return;
      }
      const typingInEditor = (e.target as HTMLElement)?.closest(".cm-editor");
      if (!revealed && e.key === " " && !typingInEditor) {
        e.preventDefault();
        setRevealed(true);
        return;
      }
      if (revealed && !typingInEditor) {
        const r = RATINGS.find((x) => x.key === e.key);
        if (r) {
          e.preventDefault();
          void rate(r.grade);
        }
      }
      if (cardMode === "typein" && !revealed && (e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        setRevealed(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [revealed, rate, onEnd, cardMode]);

  if (!entry) {
    onEnd();
    return null;
  }

  const remaining = queue.length - idx;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-2.5 dark:border-neutral-800">
        <div className="flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
          <span className="font-medium text-neutral-700 dark:text-neutral-200">
            {doneCount + 1} / {queue.length}
          </span>
          <span>· {remaining} left</span>
          {entry.question.folder && <span>· 📁 {entry.question.folder}</span>}
          <span>· {cardMode === "typein" ? "type-in" : "flashcard"}</span>
        </div>
        <button
          onClick={onEnd}
          className="rounded-md border border-neutral-300 px-2.5 py-1 text-xs text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
        >
          End session (Esc)
        </button>
      </div>

      {/* Card */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl space-y-4 p-6">
          <div className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
            {doc ? <Markdown text={doc.question} /> : <p className="text-sm text-neutral-400">…</p>}
          </div>

          {/* Hint */}
          {doc?.hint && !revealed && (
            <div>
              {showHint ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-3 dark:border-amber-900 dark:bg-amber-950/30">
                  <Markdown text={doc.hint} />
                </div>
              ) : (
                <button
                  onClick={() => setShowHint(true)}
                  className="rounded-md border border-amber-300 px-2.5 py-1 text-xs text-amber-700 hover:bg-amber-50 dark:border-amber-800 dark:text-amber-300 dark:hover:bg-amber-950"
                >
                  Show hint
                </button>
              )}
            </div>
          )}

          {/* Type-in attempt */}
          {cardMode === "typein" && (
            <div>
              <span className="mb-1 block text-xs font-medium text-neutral-500 dark:text-neutral-400">
                Your answer {revealed && "(as submitted)"}
              </span>
              {revealed ? (
                <div className="rounded-lg border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900">
                  {attempt.trim() ? <Markdown text={attempt} /> : <p className="text-sm text-neutral-400">(blank)</p>}
                </div>
              ) : (
                <MarkdownField
                  value={attempt}
                  onChange={setAttempt}
                  placeholder="Work it out here — text and $\LaTeX$…"
                  minHeight="100px"
                  autoFocus
                />
              )}
            </div>
          )}

          {/* Reveal / answer */}
          {!revealed ? (
            <button
              onClick={() => setRevealed(true)}
              className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-500"
            >
              {cardMode === "typein" ? "Check answer (⌘/Ctrl+Enter)" : "Show answer (Space)"}
            </button>
          ) : (
            <>
              <div className="rounded-lg border border-green-200 bg-green-50/50 p-4 dark:border-green-900 dark:bg-green-950/30">
                <div className="mb-1 text-xs font-medium text-green-700 dark:text-green-400">Answer</div>
                {doc?.answer ? (
                  <Markdown text={doc.answer} />
                ) : (
                  <p className="text-sm text-neutral-400">(no stored answer — grade your recall)</p>
                )}
              </div>

              {doc?.solution && (
                <div>
                  {showSolution ? (
                    <div className="rounded-lg border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900">
                      <div className="mb-1 text-xs font-medium text-neutral-500">Solution</div>
                      <Markdown text={doc.solution} />
                    </div>
                  ) : (
                    <button
                      onClick={() => setShowSolution(true)}
                      className="rounded-md border border-neutral-300 px-2.5 py-1 text-xs text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
                    >
                      Show full solution
                    </button>
                  )}
                </div>
              )}

              {/* Rating */}
              <div className="grid grid-cols-4 gap-2 pt-2">
                {RATINGS.map(({ grade, key, label, cls }) => (
                  <button
                    key={key}
                    onClick={() => void rate(grade)}
                    className={`rounded-lg px-3 py-2 text-sm font-medium text-white ${cls}`}
                  >
                    {label}
                    <span className="block text-[11px] font-normal opacity-80">
                      {previews?.[label.toLowerCase() as keyof typeof previews]} · {key}
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Done
// ---------------------------------------------------------------------------

function Done({ summary, onBack }: { summary: Record<number, number>; onBack(): void }) {
  const total = Object.values(summary).reduce((a, b) => a + b, 0);
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4">
      <h2 className="text-2xl font-semibold">Session complete 🎉</h2>
      <p className="text-sm text-neutral-500 dark:text-neutral-400">{total} reviews</p>
      <div className="flex gap-3 text-sm">
        {RATINGS.map(({ grade, label }) => (
          <span key={label} className="text-neutral-600 dark:text-neutral-300">
            {label}: <span className="font-semibold">{summary[grade] ?? 0}</span>
          </span>
        ))}
      </div>
      <button
        onClick={onBack}
        className="mt-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-500"
      >
        Back to review setup
      </button>
    </div>
  );
}
