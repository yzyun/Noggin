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
import { Markdown } from "./Markdown";
import { MarkdownField } from "./fields/MarkdownField";
import { ReviewSetup } from "./ReviewSetup";
import { Button } from "./ui/Button";
import { Callout } from "./ui/Callout";
import { LABEL } from "./ui/Field";

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
      onEnd={() => setPhase("done")}
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

  if (!entry) {
    onEnd();
    return null;
  }

  const remaining = queue.length - idx;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-edge px-4 py-2.5">
        <div className="flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
          <span className="font-medium text-neutral-700 dark:text-neutral-200">
            {doneCount + 1} / {queue.length}
          </span>
          <span>· {remaining} left</span>
          {entry.question.folder && <span>· 📁 {entry.question.folder}</span>}
          <span>· {cardMode === "typein" ? "type-in" : "flashcard"}</span>
        </div>
        <Button variant="ghost" onClick={onEnd}>
          End session (Esc)
        </Button>
      </div>

      {/* Card */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl space-y-4 p-6">
          <div className="rounded-lg border border-edge bg-surface p-4">
            {doc ? <Markdown text={doc.question} /> : <p className="text-sm text-neutral-400">…</p>}
          </div>

          {/* Hint */}
          {doc?.hint && !revealed && (
            <div>
              {showHint ? (
                <Callout tone="hint">
                  <Markdown text={doc.hint} />
                </Callout>
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

          {/* Reveal / answer */}
          {!revealed ? (
            <Button size="lg" className="w-full" onClick={() => setRevealed(true)}>
              {cardMode === "typein" ? "Check answer (⌘/Ctrl+Enter)" : "Show answer (Space)"}
            </Button>
          ) : (
            <>
              <Callout tone="answer" label="Answer" className="p-4">
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
      <Button size="lg" className="mt-2" onClick={onBack}>
        Back to review setup
      </Button>
    </div>
  );
}
