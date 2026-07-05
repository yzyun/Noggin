// Questions section: list of the bank (Phase 1: simple, newest first) with
// expandable cards + the editor. Phase 2 adds the folder tree and filters.

import { useEffect, useState } from "react";
import type { QuestionDoc, QuestionRow } from "../domain/types";
import { useQuestions } from "../state/questions";
import { Markdown } from "./Markdown";
import { QuestionEditor } from "./QuestionEditor";

export function QuestionsView() {
  const { rows, loaded, error, load, openDoc, remove } = useQuestions();
  const [mode, setMode] = useState<"list" | "edit">("list");
  const [editing, setEditing] = useState<{ row: QuestionRow; doc: QuestionDoc } | null>(null);

  useEffect(() => {
    void load();
  }, [load]);

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

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-2.5 dark:border-neutral-800">
        <h2 className="text-sm font-semibold">
          Questions <span className="font-normal text-neutral-400">({rows.length})</span>
        </h2>
        <button
          onClick={() => {
            setEditing(null);
            setMode("edit");
          }}
          className="rounded-md bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-500"
        >
          + New question
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {error && <p className="mb-3 text-sm text-red-600 dark:text-red-400">{error}</p>}
        {loaded && rows.length === 0 ? (
          <div className="mt-16 text-center text-sm text-neutral-400">
            No questions yet — create one, or drop .md files into the vault's{" "}
            <code className="rounded bg-neutral-100 px-1 dark:bg-neutral-800">questions/</code> folder.
          </div>
        ) : (
          <ul className="space-y-2">
            {rows.map((row) => (
              <QuestionCard
                key={row.id}
                row={row}
                onEdit={async () => {
                  try {
                    setEditing({ row, doc: await openDoc(row) });
                    setMode("edit");
                  } catch (e) {
                    alert(`Could not open ${row.path}: ${e}`);
                  }
                }}
                onDelete={async () => {
                  if (confirm(`Delete "${row.title ?? row.id}"? The .md file will be removed.`)) {
                    await remove(row);
                  }
                }}
                openDoc={openDoc}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function QuestionCard({
  row,
  onEdit,
  onDelete,
  openDoc,
}: {
  row: QuestionRow;
  onEdit(): void;
  onDelete(): void;
  openDoc(row: QuestionRow): Promise<QuestionDoc>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [doc, setDoc] = useState<QuestionDoc | null>(null);
  const [showAnswer, setShowAnswer] = useState(false);

  const toggle = async () => {
    if (!expanded && !doc) {
      try {
        setDoc(await openDoc(row));
      } catch {
        /* show metadata only */
      }
    }
    setExpanded((e) => !e);
    setShowAnswer(false);
  };

  return (
    <li className="rounded-lg border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
      {/* Card header */}
      <div className="flex cursor-pointer items-center gap-2 px-3 py-2" onClick={toggle}>
        <span className="flex-1 truncate text-sm">{row.title ?? row.id}</span>
        {row.difficulty !== null && (
          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-300">
            d{row.difficulty}
          </span>
        )}
        {row.folder && (
          <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
            {row.folder}
          </span>
        )}
        {row.tags.slice(0, 3).map((t) => (
          <span
            key={t}
            className="rounded-full bg-blue-100 px-1.5 py-0.5 text-xs text-blue-800 dark:bg-blue-950 dark:text-blue-300"
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
        <div className="space-y-3 border-t border-neutral-200 px-3 py-3 dark:border-neutral-800">
          <Markdown text={doc.question} />
          {doc.answer &&
            (showAnswer ? (
              <div className="rounded-md border border-green-200 bg-green-50/50 p-2.5 dark:border-green-900 dark:bg-green-950/30">
                <Markdown text={doc.answer} />
              </div>
            ) : (
              <button
                onClick={() => setShowAnswer(true)}
                className="rounded-md border border-neutral-300 px-2.5 py-1 text-xs text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
              >
                Reveal answer
              </button>
            ))}
          {row.source && <div className="text-xs text-neutral-400">Source: {row.source}</div>}
        </div>
      )}
    </li>
  );
}
