// Questions section: filter panel + result list + bulk actions + editor.

import { useEffect, useRef, useState } from "react";
import type { QuestionDoc, QuestionRow } from "../domain/types";
import { useQuestions } from "../state/questions";
import { confirmDialog, errorDialog, useUi } from "../state/ui";
import { DND_QUESTIONS, FilterPanel } from "./FilterPanel";
import { Markdown } from "./Markdown";
import { Button } from "./ui/Button";
import { Callout } from "./ui/Callout";
import { FolderBadge } from "./ui/chips";
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

  return (
    <div className="flex h-full">
      <FilterPanel />

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-between gap-3 border-b border-edge px-4 py-2.5">
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 text-xs text-neutral-500 dark:text-neutral-400">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={() =>
                  setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)))
                }
              />
              all
            </label>
            <h2 className="text-sm font-semibold">
              Questions <span className="font-normal text-neutral-400">({rows.length})</span>
            </h2>
            {scanning && <span className="text-xs text-neutral-400">syncing…</span>}
          </div>
          <div className="flex items-center gap-2">
            {selected.size > 0 && (
              <Button
                variant="danger"
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
                Delete {selected.size}
              </Button>
            )}
            <Button
              onClick={() => {
                setEditing(null);
                setMode("edit");
              }}
            >
              + New question
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {error && <p className="mb-3 text-sm text-red-600 dark:text-red-400">{error}</p>}
          {loaded && rows.length === 0 ? (
            <div className="mt-16 text-center text-sm text-neutral-400">
              No questions match — adjust the filters, create one, or drop .md files into the
              vault's <code className="rounded bg-neutral-100 px-1 dark:bg-neutral-800">questions/</code>{" "}
              folder.
            </div>
          ) : (
            <ul className="space-y-2">
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
      className={`rounded-lg border bg-surface ${
        selected || autoFocus ? "border-accent" : "border-edge"
      }`}
    >
      {/* Card header */}
      <div className="flex cursor-pointer items-center gap-2 px-3 py-2" onClick={toggle}>
        <input
          type="checkbox"
          checked={selected}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => onSelect(e.target.checked)}
        />
        <span className="flex-1 truncate text-sm">{row.title ?? row.id}</span>
        {row.difficulty !== null && (
          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-300">
            d{row.difficulty}
          </span>
        )}
        {row.folder && <FolderBadge folder={row.folder} />}
        {row.tags.slice(0, 3).map((t) => (
          <span
            key={t}
            className="rounded-full bg-accent-soft px-1.5 py-0.5 text-xs text-accent-text"
          >
            {t}
          </span>
        ))}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
          className="rounded px-1.5 py-0.5 text-xs text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
        >
          edit
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="rounded px-1.5 py-0.5 text-xs text-neutral-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950"
        >
          delete
        </button>
      </div>

      {/* Expanded content */}
      {expanded && doc && (
        <div className="space-y-3 border-t border-edge px-3 py-3">
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
          {row.source && <div className="text-xs text-neutral-400">Source: {row.source}</div>}
        </div>
      )}
    </li>
  );
}
