// Quiz builder: filter a question pool, pick & order questions, choose
// answer placement, then print — the macOS print dialog's "Save as PDF"
// produces a worksheet with fully typeset math and images.

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ANSWER_PLACEMENT_OPTIONS, type AnswerPlacement } from "../domain/settings";
import type { QuestionDoc, QuestionRow } from "../domain/types";
import { ipc, searchParams, type SearchParams } from "../lib/ipc";
import { useAsync } from "../lib/useAsync";
import { useQuestions } from "../state/questions";
import { useSettings } from "../state/settings";
import { Markdown } from "./Markdown";
import { TagInput } from "./fields/TagInput";
import { Button } from "./ui/Button";
import { TagToggle } from "./ui/chips";
import { Field, INPUT } from "./ui/Field";
import { Segmented } from "./ui/Segmented";


export function QuizView() {
  const { allTags, allFolders } = useQuestions();

  // Pool filters — multiple subjects, OR-combined; none selected = all.
  const [subjects, setSubjects] = useState<string[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [order, setOrder] = useState<string[]>([]);

  // Options (placement/meta start from the Settings-page quiz defaults;
  // the view unmounts on tab switch, so a mount-time read stays fresh).
  const quizDefaults = useSettings.getState().settings.quiz;
  const [title, setTitle] = useState("Practice quiz");
  const [answers, setAnswers] = useState<AnswerPlacement>(quizDefaults.defaultAnswers);
  const [showMeta, setShowMeta] = useState(quizDefaults.defaultShowMeta);

  const [printError, setPrintError] = useState<string | null>(null);

  const params: SearchParams = useMemo(
    () => searchParams({ folders: subjects, tags }),
    [subjects, tags],
  );

  const pool = useAsync(() => ipc.search(params), [params], { reset: false }) ?? [];

  // A fresh pool starts fully picked, in listing order.
  useEffect(() => {
    setPicked(new Set(pool.map((r) => r.id)));
    setOrder(pool.map((r) => r.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pool]);

  // Load docs for picked questions (for preview/print).
  const docs =
    useAsync(
      async () => {
        const next = new Map<string, QuestionDoc>();
        for (const row of pool) {
          if (!picked.has(row.id)) continue;
          try {
            next.set(row.id, await ipc.readDoc(row.path));
          } catch {
            /* skip unreadable */
          }
        }
        return next;
      },
      [pool, picked],
      { reset: false },
    ) ?? new Map<string, QuestionDoc>();

  const shuffle = useCallback(() => {
    setOrder((o) => {
      const a = [...o];
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    });
  }, []);

  const selectedRows = order
    .map((id) => pool.find((r) => r.id === id))
    .filter((r): r is QuestionRow => Boolean(r && picked.has(r.id) && docs.has(r.id)));

  // window.print() is a silent no-op in macOS WKWebView — go through the
  // Rust command, which opens the native print dialog (with Save as PDF).
  const doPrint = async () => {
    setPrintError(null);
    try {
      const handled = await ipc.printPage();
      if (!handled) window.print();
    } catch (e) {
      setPrintError(`Print failed: ${String(e)}`);
      window.print();
    }
  };

  return (
    <div className="flex h-full">
      {/* Controls */}
      <div className="w-80 shrink-0 space-y-4 overflow-y-auto border-r border-edge p-4">
        <h2 className="text-sm font-semibold">Quiz builder</h2>

        <Field label="Title">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={`w-full ${INPUT}`}
          />
        </Field>

        <Field label={`Subjects ${subjects.length > 0 ? `(${subjects.length})` : "(all)"}`} as="div">
          <div className="flex flex-wrap gap-1">
            {allFolders().map((f) => (
              <TagToggle
                key={f}
                label={`📁 ${f}`}
                on={subjects.includes(f)}
                onClick={() =>
                  setSubjects(
                    subjects.includes(f) ? subjects.filter((s) => s !== f) : [...subjects, f],
                  )
                }
              />
            ))}
            {allFolders().length === 0 && (
              <span className="text-xs text-neutral-400">no subjects yet</span>
            )}
          </div>
        </Field>

        <Field label="Tags" as="div">
          <TagInput value={tags} onChange={setTags} suggestions={allTags()} />
        </Field>

        <Field label="Answers" as="div">
          <Segmented<AnswerPlacement>
            grow
            value={answers}
            options={ANSWER_PLACEMENT_OPTIONS}
            onChange={setAnswers}
          />
        </Field>

        <label className="flex items-center gap-2 text-xs text-neutral-600 dark:text-neutral-300">
          <input type="checkbox" checked={showMeta} onChange={(e) => setShowMeta(e.target.checked)} />
          show source & difficulty
        </label>

        {/* Question picker */}
        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
              Questions ({picked.size}/{pool.length})
            </span>
            <div className="flex gap-1">
              <button
                onClick={() => setPicked(new Set(pool.map((r) => r.id)))}
                className="rounded border border-edge px-1.5 py-0.5 text-[11px] text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
              >
                all
              </button>
              <button
                onClick={() => setPicked(new Set())}
                className="rounded border border-edge px-1.5 py-0.5 text-[11px] text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
              >
                none
              </button>
              <button
                onClick={shuffle}
                className="rounded border border-edge px-1.5 py-0.5 text-[11px] text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
              >
                shuffle
              </button>
            </div>
          </div>
          <ul className="max-h-72 space-y-0.5 overflow-y-auto">
            {pool.map((row) => (
              <li key={row.id}>
                <label className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-xs hover:bg-neutral-100 dark:hover:bg-neutral-800">
                  <input
                    type="checkbox"
                    checked={picked.has(row.id)}
                    onChange={(e) =>
                      setPicked((prev) => {
                        const next = new Set(prev);
                        if (e.target.checked) next.add(row.id);
                        else next.delete(row.id);
                        return next;
                      })
                    }
                  />
                  <span className="truncate">{row.title ?? row.id}</span>
                </label>
              </li>
            ))}
          </ul>
        </div>

        <Button
          size="lg"
          className="w-full"
          onClick={() => void doPrint()}
          disabled={selectedRows.length === 0}
        >
          Print / Save as PDF ({selectedRows.length})
        </Button>
        {printError && (
          <p className="text-xs text-red-600 dark:text-red-400">{printError}</p>
        )}
      </div>

      {/* On-screen preview */}
      <div className="flex-1 overflow-y-auto bg-neutral-100 p-6 dark:bg-neutral-950">
        <div className="mx-auto max-w-2xl rounded-lg bg-surface p-8 shadow">
          <QuizDocument
            title={title}
            rows={selectedRows}
            docs={docs}
            answers={answers}
            showMeta={showMeta}
          />
        </div>
      </div>

      {/* Print-only copy (white background, no app chrome) */}
      {createPortal(
        <div className="print-root">
          <QuizDocument
            title={title}
            rows={selectedRows}
            docs={docs}
            answers={answers}
            showMeta={showMeta}
          />
        </div>,
        document.body,
      )}
    </div>
  );
}

function QuizDocument({
  title,
  rows,
  docs,
  answers,
  showMeta,
}: {
  title: string;
  rows: QuestionRow[];
  docs: Map<string, QuestionDoc>;
  answers: AnswerPlacement;
  showMeta: boolean;
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-neutral-400">No questions selected.</p>;
  }
  return (
    <div className="quiz-doc space-y-5">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <ol className="space-y-5">
        {rows.map((row, i) => {
          const doc = docs.get(row.id)!;
          return (
            <li key={row.id} className="break-inside-avoid">
              <div className="flex gap-2">
                <span className="font-semibold">{i + 1}.</span>
                <div className="min-w-0 flex-1">
                  <Markdown text={doc.question} />
                  {showMeta && (row.source || row.difficulty !== null) && (
                    <p className="mt-1 text-xs text-neutral-400">
                      {[row.source, row.difficulty !== null ? `difficulty ${row.difficulty}` : null]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  )}
                  {answers === "inline" && doc.answer && (
                    <div className="mt-2 border-l-2 border-green-300 pl-3">
                      <Markdown text={doc.answer} />
                    </div>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      {answers === "key" && (
        <div className="answer-key break-before-page">
          <h2 className="mb-3 text-xl font-semibold">Answer key</h2>
          <ol className="space-y-3">
            {rows.map((row, i) => {
              const doc = docs.get(row.id)!;
              return (
                <li key={row.id} className="flex gap-2 break-inside-avoid">
                  <span className="font-semibold">{i + 1}.</span>
                  <div className="min-w-0 flex-1">
                    {doc.answer ? (
                      <Markdown text={doc.answer} />
                    ) : (
                      <span className="text-sm text-neutral-400">—</span>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </div>
  );
}
