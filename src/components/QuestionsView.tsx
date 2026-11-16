// Questions section: filter panel + result list + bulk actions + editor.

import { useEffect, useRef, useState } from "react";
import type { QuestionDoc, QuestionRow } from "../domain/types";
import { isDue, stageOf } from "../domain/progress";
import { fmtInterval } from "../domain/srs";
import { useQuestions } from "../state/questions";
import { useReview } from "../state/review";
import { confirmDialog, errorDialog, useUi } from "../state/ui";
import { DND_QUESTIONS, FilterPanel } from "./FilterPanel";
import { Markdown } from "./Markdown";
import { PencilIcon, PlusIcon, QuestionIcon, TrashIcon } from "./icons";
import { TitleText } from "./TitleText";
import { Button } from "./ui/Button";
import { Callout } from "./ui/Callout";
import { QuestionEditor } from "./QuestionEditor";

export function QuestionsView() {
  const { rows, loaded, scanning, error, load, openDoc, removeMany } = useQuestions();
  const newQuestionSignal = useUi((s) => s.newQuestionSignal);
  const focusQuestionId = useUi((s) => s.focusQuestionId);
  const [mode, setMode] = useState<"list" | "edit">("list");
  const [editing, setEditing] = useState<{ row: QuestionRow; doc: QuestionDoc } | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    void load();
  }, [load]);

  // ⌘N / palette "New question" opens a blank editor.
  useEffect(() => {
    if (newQuestionSignal > 0) {
      setEditing(null);
      setMode("edit");
      // Consume it — otherwise every later visit to Questions re-opens the editor.
      useUi.getState().consumeNewQuestion();
    }
  }, [newQuestionSignal]);

  // ⌘P quick search picked a question: make sure we're on the list.
  useEffect(() => {
    if (focusQuestionId) setMode("list");
  }, [focusQuestionId]);

  // Drop selections that fell out of the current result set.
  useEffect(() => {
    setSelected((prev) => {
      const visible = new Set(rows.map((r) => r.id));
      const next = new Set([...prev].filter((id) => visible.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [rows]);

  if (mode === "edit") {
    return (
      <QuestionEditor
        editing={editing}
        onClose={() => {
          setEditing(null);
          setMode("list");
        }}
      />
    );
  }

  const allSelected = rows.length > 0 && selected.size === rows.length;
  const bankEmpty = useQuestions.getState().allRows.length === 0;

  return (
    <div className="flex h-full">
      <FilterPanel />

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-edge px-5">
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              aria-label="Select all"
              title="Select all"
              checked={allSelected}
              onChange={() =>
                setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)))
              }
            />
            {selected.size > 0 ? (
              <>
                <span className="text-sm font-medium">{selected.size} selected</span>
                <Button
                  variant="ghost"
                  className="text-red-600 dark:text-red-400"
                  onClick={async () => {
                    const doomed = rows.filter((r) => selected.has(r.id));
                    const ok = await confirmDialog({
                      title: `Delete ${doomed.length} question${doomed.length > 1 ? "s" : ""}?`,
                      message: "The .md files will be removed from the vault.",
                    });
                    if (ok) {
                      await removeMany(doomed);
                      setSelected(new Set());
                    }
                  }}
                >
                  Delete
                </Button>
                <button
                  onClick={() => setSelected(new Set())}
                  className="text-xs text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-100"
                >
                  Clear
                </button>
                <span className="text-xs text-neutral-400">or drag onto a folder to move</span>
              </>
            ) : (
              <h2 className="text-sm font-semibold">
                {rows.length} question{rows.length === 1 ? "" : "s"}
              </h2>
            )}
            {scanning && <span className="text-xs text-neutral-400">syncing…</span>}
          </div>
          <Button
            onClick={() => {
              setEditing(null);
              setMode("edit");
            }}
          >
            <span className="flex items-center gap-1.5">
              <PlusIcon className="h-3.5 w-3.5" /> New question
            </span>
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {error && <p className="mb-3 text-sm text-red-600 dark:text-red-400">{error}</p>}
          {loaded && rows.length === 0 ? (
            <div className="mx-auto mt-20 max-w-sm text-center">
              <QuestionIcon className="mx-auto h-8 w-8 text-neutral-300 dark:text-neutral-600" />
              <p className="mt-3 text-sm font-medium">
                {bankEmpty ? "Your question bank is empty" : "No questions match these filters"}
              </p>
              <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
                {bankEmpty ? (
                  <>
                    Write your first question, import a spreadsheet, or drop .md files into the
                    vault's <code className="rounded bg-neutral-100 px-1 dark:bg-neutral-800">questions/</code>{" "}
                    folder.
                  </>
                ) : (
                  "Try a broader search, or clear the filters in the panel on the left."
                )}
              </p>
              {bankEmpty && (
                <div className="mt-4 flex justify-center gap-2">
                  <Button onClick={() => setMode("edit")}>New question</Button>
                  <Button variant="ghost" onClick={() => useUi.getState().setView("import")}>
                    Import…
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <ul className="divide-y divide-edge overflow-hidden rounded-xl border border-edge bg-surface">
              {rows.map((row) => (
                <QuestionCard
                  key={row.id}
                  row={row}
                  autoFocus={row.id === focusQuestionId}
                  dragIds={selected.has(row.id) ? [...selected] : [row.id]}
                  selected={selected.has(row.id)}
                  onSelect={(on) =>
                    setSelected((prev) => {
                      const next = new Set(prev);
                      if (on) next.add(row.id);
                      else next.delete(row.id);
                      return next;
                    })
                  }
                  onEdit={async () => {
                    try {
                      setEditing({ row, doc: await openDoc(row) });
                      setMode("edit");
                    } catch (e) {
                      void errorDialog(`Could not open ${row.path}`, String(e));
                    }
                  }}
                  onDelete={async () => {
                    const ok = await confirmDialog({
                      title: `Delete "${row.title ?? row.id}"?`,
                      message: "The .md file will be removed from the vault.",
                    });
                    if (ok) await removeMany([row]);
                  }}
                  openDoc={openDoc}
                />
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function QuestionCard({
  row,
  autoFocus,
  dragIds,
  selected,
  onSelect,
  onEdit,
  onDelete,
  openDoc,
}: {
  row: QuestionRow;
  /** Set when ⌘P picked this question: expand + scroll into view. */
  autoFocus?: boolean;
  /** Question ids carried when this card is dragged onto a folder. */
  dragIds: string[];
  selected: boolean;
  onSelect(on: boolean): void;
  onEdit(): void;
  onDelete(): void;
  openDoc(row: QuestionRow): Promise<QuestionDoc>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [doc, setDoc] = useState<QuestionDoc | null>(null);
  const [showAnswer, setShowAnswer] = useState(false);
  const liRef = useRef<HTMLLIElement>(null);

  const toggle = async (e: React.MouseEvent) => {
    // ⌘/Ctrl+click selects (for bulk actions / drag) instead of expanding.
    if (e.metaKey || e.ctrlKey) {
      onSelect(!selected);
      return;
    }
    if (!expanded && !doc) {
      try {
        setDoc(await openDoc(row));
      } catch {
        /* show metadata only */
      }
    }
    setExpanded((v) => !v);
    setShowAnswer(false);
  };

  useEffect(() => {
    if (!autoFocus) return;
    void (async () => {
      try {
        setDoc(await openDoc(row));
        setExpanded(true);
      } catch {
        /* metadata only */
      }
      liRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
      useUi.getState().clearFocusQuestion();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoFocus]);

  return (
    <li
      ref={liRef}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(DND_QUESTIONS, JSON.stringify(dragIds));
        e.dataTransfer.effectAllowed = "move";
      }}
      className={`group/row ${
        selected
          ? "bg-accent-soft/50"
          : autoFocus
            ? "bg-accent-soft/30"
            : expanded
              ? ""
              : "hover:bg-neutral-50 dark:hover:bg-neutral-800/40"
      }`}
    >
      {/* Row */}
      <div className="flex cursor-pointer items-center gap-3 px-4 py-2.5" onClick={toggle}>
        <input
          type="checkbox"
          aria-label="Select question"
          checked={selected}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => onSelect(e.target.checked)}
        />
        <span className={`min-w-0 flex-1 truncate text-sm ${expanded ? "font-medium" : ""}`}>
          <TitleText text={row.title ?? row.id} />
        </span>
        {row.tags.length > 0 && (
          <div className="no-scrollbar flex max-w-[35%] shrink-0 gap-1 overflow-x-auto">
            {row.tags.map((t) => (
              <span
                key={t}
                className="shrink-0 rounded-full border border-edge px-2 py-px text-xs text-neutral-500 dark:text-neutral-400"
              >
                {t}
              </span>
            ))}
          </div>
        )}
        <ReviewStatus id={row.id} />
        <Difficulty level={row.difficulty} />
        <div className="flex shrink-0 gap-0.5 opacity-0 transition-opacity group-focus-within/row:opacity-100 group-hover/row:opacity-100">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
            title="Edit"
            aria-label="Edit question"
            className="rounded p-1 text-neutral-400 hover:bg-neutral-200/70 hover:text-neutral-800 dark:hover:bg-neutral-700 dark:hover:text-neutral-100"
          >
            <PencilIcon className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            title="Delete"
            aria-label="Delete question"
            className="rounded p-1 text-neutral-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950"
          >
            <TrashIcon className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Expanded content */}
      {expanded && doc && (
        <div className="space-y-3 px-4 pt-1 pb-4 pl-11">
          <Markdown text={doc.question} />
          {doc.answer &&
            (showAnswer ? (
              <Callout tone="answer">
                <Markdown text={doc.answer} />
              </Callout>
            ) : (
              <Button variant="ghost" onClick={() => setShowAnswer(true)}>
                Reveal answer
              </Button>
            ))}
          {(row.folder || row.source) && (
            <div className="text-xs text-neutral-400">
              {[row.folder && row.folder.split("/").join(" › "), row.source && `Source: ${row.source}`]
                .filter(Boolean)
                .join(" · ")}
            </div>
          )}
        </div>
      )}
    </li>
  );
}

/** Difficulty as five pips — readable at a glance, unlike a "d3" code. */
function Difficulty({ level }: { level: number | null }) {
  if (level === null) return <span className="w-[42px] shrink-0" />;
  return (
    <span
      className="flex w-[42px] shrink-0 gap-[3px]"
      title={`Difficulty ${level} of 5`}
      aria-label={`Difficulty ${level} of 5`}
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <span
          key={n}
          className={`h-1.5 w-1.5 rounded-full ${
            n <= level ? "bg-neutral-700 dark:bg-neutral-200" : "bg-neutral-200 dark:bg-neutral-700"
          }`}
        />
      ))}
    </span>
  );
}

/** Where the question stands in the review schedule: New, Learning, Due, or
 *  when it next comes up. */
function ReviewStatus({ id }: { id: string }) {
  const card = useReview((s) => s.cards.get(id));
  if (!card) return <span className="w-16 shrink-0" />;
  const now = new Date();
  const base = "w-16 shrink-0 text-right text-xs whitespace-nowrap";

  if (card.state === "new") {
    return (
      <span className={`${base} text-neutral-400`} title="Not reviewed yet">
        New
      </span>
    );
  }
  if (isDue(card, now)) {
    return (
      <span className={base} title={`Due ${fmtInterval(new Date(card.due!), now)} ago`}>
        <span className="rounded-full bg-accent-soft px-2 py-0.5 font-medium text-accent-text">
          Due
        </span>
      </span>
    );
  }
  const next = card.due ? `in ${fmtInterval(now, new Date(card.due))}` : "";
  const stage = stageOf(card);
  return (
    <span
      className={`${base} text-neutral-500 tabular-nums dark:text-neutral-400`}
      title={`${stage === "learning" ? "Learning" : stage === "mature" ? "Mature" : "Young"} · next review ${next} · reviewed ${card.reps} time${card.reps === 1 ? "" : "s"}`}
    >
      {next}
    </span>
  );
}
