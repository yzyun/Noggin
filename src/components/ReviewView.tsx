// Spaced-repetition review: setup (see ReviewSetup — due dashboard + custom
// session builder), the session itself (flashcard or type-in-then-check,
// graded by the scheduler configured in Settings), and an end-of-session
// summary.
//
// Keyboard: Space = reveal · 1–4 = Again/Hard/Good/Easy · Esc = end session.

import { useCallback, useEffect, useMemo, useState } from "react";
import { Rating } from "ts-fsrs";
import { gradeCard, previewIntervals, type Grade } from "../domain/srs";
import type { SessionMode } from "../domain/settings";
import { ipc, type DueEntry } from "../lib/ipc";
import { useAsync } from "../lib/useAsync";
import { useSettings } from "../state/settings";
import { useUi } from "../state/ui";
import { Markdown } from "./Markdown";
import { MarkdownField } from "./fields/MarkdownField";
import { ReviewSetup } from "./ReviewSetup";
import { Button } from "./ui/Button";
import { Callout } from "./ui/Callout";
import { LABEL } from "./ui/Field";

type Phase = "setup" | "session" | "done";

// Grade colours are tints, not solid blocks: the answer stays the loudest
// thing on screen, and the four choices still read apart at a glance.
const RATINGS: { grade: Grade; key: string; label: string; cls: string; bar: string }[] = [
  {
    grade: Rating.Again,
    key: "1",
    label: "Again",
    cls: "border-red-200 bg-red-50 text-red-800 hover:bg-red-100 dark:border-red-900/70 dark:bg-red-950/40 dark:text-red-200 dark:hover:bg-red-950/70",
    bar: "bg-red-500",
  },
  {
    grade: Rating.Hard,
    key: "2",
    label: "Hard",
    cls: "border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-200 dark:hover:bg-amber-950/70",
    bar: "bg-amber-500",
  },
  {
    grade: Rating.Good,
    key: "3",
    label: "Good",
    cls: "border-green-200 bg-green-50 text-green-900 hover:bg-green-100 dark:border-green-900/70 dark:bg-green-950/40 dark:text-green-200 dark:hover:bg-green-950/70",
    bar: "bg-green-500",
  },
  {
    grade: Rating.Easy,
    key: "4",
    label: "Easy",
    cls: "border-sky-200 bg-sky-50 text-sky-900 hover:bg-sky-100 dark:border-sky-900/70 dark:bg-sky-950/40 dark:text-sky-200 dark:hover:bg-sky-950/70",
    bar: "bg-sky-500",
  },
];

function Key({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-current/25 px-1 font-sans text-[10px] leading-4 opacity-70">
      {children}
    </kbd>
  );
}

export function ReviewView() {
  const [phase, setPhase] = useState<Phase>("setup");
  const [queue, setQueue] = useState<DueEntry[]>([]);
  const [mode, setMode] = useState<SessionMode>("auto");
  const [summary, setSummary] = useState<Record<number, number>>({});
  const reviewed = Object.values(summary).reduce((a, b) => a + b, 0);

  // A running session takes the whole window (the shell hides its sidebar).
  useEffect(() => {
    useUi.getState().setFocusMode(phase === "session");
    return () => useUi.getState().setFocusMode(false);
  }, [phase]);

  return phase === "setup" ? (
    <ReviewSetup
      onStart={(entries, sessionMode) => {
        setQueue(entries);
        setMode(sessionMode);
        setSummary({});
        setPhase("session");
      }}
    />
  ) : phase === "session" ? (
    <Session
      queue={queue}
      mode={mode}
      onRated={(g) => setSummary((s) => ({ ...s, [g]: (s[g] ?? 0) + 1 }))}
      // Leaving before grading anything isn't a "completed session".
      onEnd={() => setPhase(reviewed > 0 ? "done" : "setup")}
    />
  ) : (
    <Done summary={summary} onBack={() => setPhase("setup")} />
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
  const scheduler = useSettings((s) => s.settings.scheduler);
  const [queue, setQueue] = useState(initialQueue);
  const [idx, setIdx] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [showSolution, setShowSolution] = useState(false);
  const [attempt, setAttempt] = useState("");
  const [doneCount, setDoneCount] = useState(0);

  const entry = queue[idx];
  const cardMode: "flashcard" | "typein" =
    mode === "auto" ? (entry?.question.recall === "typein" ? "typein" : "flashcard") : mode;

  // Load the question file for the current card.
  const doc = useAsync(
    () => (entry ? ipc.readDoc(entry.question.path) : Promise.resolve(null)),
    [entry],
  );

  // Fresh card: back to the unrevealed state.
  useEffect(() => {
    setRevealed(false);
    setShowHint(false);
    setShowSolution(false);
    setAttempt("");
  }, [entry]);

  const previews = useMemo(
    () => (entry ? previewIntervals(entry.card, new Date(), scheduler) : null),
    [entry, scheduler],
  );

  const rate = useCallback(
    async (grade: Grade) => {
      if (!entry || !revealed) return;
      const { updated, log } = gradeCard(entry.card, grade, cardMode, new Date(), scheduler);
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
    [entry, revealed, cardMode, scheduler, idx, queue.length, onRated, onEnd],
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

  // Defensive: an empty queue ends the session (never setState in render).
  useEffect(() => {
    if (!entry) onEnd();
  }, [entry, onEnd]);
  if (!entry) return null;

  const progress = Math.round((doneCount / queue.length) * 100);

  return (
    <div className="flex h-full flex-col">
      {/* Header: progress + context */}
      <div className="h-1 bg-neutral-200 dark:bg-neutral-800">
        <div
          className="h-full bg-accent transition-[width] duration-300"
          style={{ width: `${progress}%` }}
          role="progressbar"
          aria-valuenow={doneCount}
          aria-valuemax={queue.length}
        />
      </div>
      <div className="grid grid-cols-3 items-center px-4 py-2.5 text-xs text-neutral-500 dark:text-neutral-400">
        <button
          onClick={onEnd}
          className="flex w-fit items-center gap-1.5 rounded-md px-2 py-1 hover:bg-neutral-100 hover:text-neutral-800 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
        >
          End session <Key>Esc</Key>
        </button>
        <span className="text-center font-medium text-neutral-700 tabular-nums dark:text-neutral-200">
          {doneCount + 1} of {queue.length}
        </span>
        <span className="truncate text-right">
          {entry.question.folder.split("/").join(" › ")}
        </span>
      </div>

      {/* Card */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto flex min-h-full max-w-2xl flex-col justify-center gap-4 px-6 py-8">
          <div className="rounded-2xl border border-edge bg-surface px-7 py-8 text-lg shadow-sm">
            {doc ? <Markdown text={doc.question} /> : <p className="text-sm text-neutral-400">…</p>}
          </div>

          {/* Hint */}
          {doc?.hint && !revealed && (
            <div>
              {showHint ? (
                <Callout tone="hint" label="Hint">
                  <Markdown text={doc.hint} />
                </Callout>
              ) : (
                <button
                  onClick={() => setShowHint(true)}
                  className="rounded-md px-2 py-1 text-xs text-neutral-500 underline decoration-dotted underline-offset-4 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-100"
                >
                  Need a hint?
                </button>
              )}
            </div>
          )}

          {/* Type-in attempt */}
          {cardMode === "typein" && (
            <div>
              <span className={LABEL}>Your answer {revealed && "(as submitted)"}</span>
              {revealed ? (
                <div className="rounded-lg border border-edge bg-surface p-3">
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

          {revealed && (
            <>
              <Callout tone="answer" label="Answer" className="rounded-2xl px-7 py-5 text-lg">
                {doc?.answer ? (
                  <Markdown text={doc.answer} />
                ) : (
                  <p className="text-sm text-neutral-400">(no stored answer — grade your recall)</p>
                )}
              </Callout>

              {doc?.solution && (
                <div>
                  {showSolution ? (
                    <Callout tone="neutral" label="Solution">
                      <Markdown text={doc.solution} />
                    </Callout>
                  ) : (
                    <Button variant="ghost" onClick={() => setShowSolution(true)}>
                      Show full solution
                    </Button>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Action dock — always in the same place, so grading is muscle memory */}
      <div className="border-t border-edge bg-surface px-6 py-4">
        <div className="mx-auto max-w-2xl">
          {!revealed ? (
            <Button size="lg" className="w-full" onClick={() => setRevealed(true)}>
              <span className="flex items-center justify-center gap-2">
                {cardMode === "typein" ? "Check answer" : "Show answer"}
                <Key>{cardMode === "typein" ? "⌘ Enter" : "Space"}</Key>
              </span>
            </Button>
          ) : (
            <div className="grid grid-cols-4 gap-2">
              {RATINGS.map(({ grade, key, label, cls }) => (
                <button
                  key={key}
                  onClick={() => void rate(grade)}
                  className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${cls}`}
                >
                  <span className="flex items-center justify-center gap-1.5">
                    {label} <Key>{key}</Key>
                  </span>
                  <span className="block text-xs font-normal opacity-75">
                    {previews?.[label.toLowerCase() as keyof typeof previews]}
                  </span>
                </button>
              ))}
            </div>
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
  const recalled = total - (summary[Rating.Again] ?? 0);

  // Enter / Esc / Space all lead back — no need to reach for the mouse.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === "Escape") onBack();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onBack]);

  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 px-6">
      <div className="text-center">
        <h2 className="font-display text-3xl font-semibold tracking-tight">Session complete</h2>
        <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
          {total} review{total === 1 ? "" : "s"} · {Math.round((recalled / Math.max(1, total)) * 100)}%
          recalled
        </p>
      </div>

      <div className="w-full max-w-sm">
        <div className="flex h-2 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
          {RATINGS.map(({ grade, label, bar }) => (
            <div
              key={label}
              className={bar}
              style={{ width: `${((summary[grade] ?? 0) / Math.max(1, total)) * 100}%` }}
            />
          ))}
        </div>
        <div className="mt-3 grid grid-cols-4 text-center text-xs text-neutral-500 dark:text-neutral-400">
          {RATINGS.map(({ grade, label, bar }) => (
            <div key={label}>
              <div className="text-lg font-semibold text-neutral-900 tabular-nums dark:text-neutral-100">
                {summary[grade] ?? 0}
              </div>
              <span className="inline-flex items-center gap-1.5">
                <span className={`h-1.5 w-1.5 rounded-full ${bar}`} />
                {label}
              </span>
            </div>
          ))}
        </div>
      </div>

      <Button size="lg" onClick={onBack} autoFocus>
        Back to Review
      </Button>
    </div>
  );
}
