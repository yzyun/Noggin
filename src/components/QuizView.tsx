// Quiz builder: filter a question pool, pick & order questions, choose
// answer placement, then print — the macOS print dialog's "Save as PDF"
// produces a worksheet with fully typeset math and images.

import { TitleText } from "./TitleText";
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
import { PrintIcon, ShuffleIcon } from "./icons";
import { Button } from "./ui/Button";
import { Toggle } from "./ui/Toggle";
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
  const [showNested, setShowNested] = useState(false);

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

  // Subjects as chosen: picking a parent already covers its children, so
  // only offer top-level subjects unless the bank is flat anyway.
  const folders = allFolders();
  const topLevel = [...new Set(folders.map((f) => f.split("/")[0]))];
  const subjectOptions = showNested ? folders : topLevel;
  const toggleSubject = (f: string) =>
    setSubjects(subjects.includes(f) ? subjects.filter((s) => s !== f) : [...subjects, f]);
  const allPicked = pool.length > 0 && picked.size === pool.length;

  return (
    <div className="flex h-full">
      {/* Controls */}
      <div className="flex w-[22rem] shrink-0 flex-col border-r border-edge">
        <div className="flex h-12 shrink-0 items-center border-b border-edge px-5">
          <h2 className="text-sm font-semibold">Quiz builder</h2>
        </div>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5">
          {/* 1 — what goes in */}
          <section className="space-y-3">
            <Step n={1} title="Choose a pool" />
            <Field
              label={subjects.length > 0 ? `Subjects (${subjects.length})` : "Subjects — all"}
              as="div"
            >
              <div className="flex flex-wrap gap-1">
                {subjectOptions.map((f) => (
                  <TagToggle key={f} label={f} on={subjects.includes(f)} onClick={() => toggleSubject(f)} />
                ))}
                {folders.length === 0 && (
                  <span className="text-xs text-neutral-400">No subjects yet</span>
                )}
                {folders.length > topLevel.length && (
                  <button
                    onClick={() => setShowNested((v) => !v)}
                    className="px-1 text-xs text-neutral-500 underline underline-offset-2 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
                  >
                    {showNested ? "Top-level only" : "Show sub-topics"}
                  </button>
                )}
              </div>
            </Field>
            <Field label="Tags" as="div">
              <TagInput value={tags} onChange={setTags} suggestions={allTags()} />
            </Field>
          </section>

          {/* 2 — which questions */}
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <Step n={2} title="Pick questions" />
              <button
                onClick={shuffle}
                disabled={picked.size < 2}
                title="Shuffle the order"
                className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 disabled:opacity-40 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
              >
                <ShuffleIcon className="h-3.5 w-3.5" /> Shuffle
              </button>
            </div>
            <div className="overflow-hidden rounded-lg border border-edge bg-surface">
              <label className="flex items-center gap-2 border-b border-edge bg-neutral-50 px-2.5 py-1.5 text-xs text-neutral-500 dark:bg-neutral-900/40 dark:text-neutral-400">
                <input
                  type="checkbox"
                  checked={allPicked}
                  onChange={() => setPicked(allPicked ? new Set() : new Set(pool.map((r) => r.id)))}
                />
                {picked.size} of {pool.length} selected
              </label>
              <ul className="max-h-64 overflow-y-auto py-1">
                {pool.map((row) => (
                  <li key={row.id}>
                    <label className="flex items-center gap-2 px-2.5 py-1 text-[13px] hover:bg-neutral-50 dark:hover:bg-neutral-800/50">
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
                      <span className="truncate"><TitleText text={row.title ?? row.id} /></span>
                    </label>
                  </li>
                ))}
                {pool.length === 0 && (
                  <li className="px-3 py-4 text-center text-xs text-neutral-400">
                    No questions match this pool.
                  </li>
                )}
              </ul>
            </div>
          </section>

          {/* 3 — how it prints */}
          <section className="space-y-3">
            <Step n={3} title="Set up the page" />
            <Field label="Title">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className={`w-full ${INPUT}`}
              />
            </Field>
            <Field label="Answers" as="div">
              <Segmented<AnswerPlacement>
                grow
                value={answers}
                options={ANSWER_PLACEMENT_OPTIONS}
                onChange={setAnswers}
              />
            </Field>
            <div className="flex items-center justify-between gap-3 text-sm">
              <span>Show source and difficulty</span>
              <Toggle label="Show source and difficulty" checked={showMeta} onChange={setShowMeta} />
            </div>
          </section>
        </div>

        {/* Always-visible primary action */}
        <div className="shrink-0 space-y-2 border-t border-edge bg-surface px-5 py-4">
          <Button
            size="lg"
            className="w-full"
            onClick={() => void doPrint()}
            disabled={selectedRows.length === 0}
          >
            <span className="flex items-center justify-center gap-2">
              <PrintIcon /> Print or save as PDF
            </span>
          </Button>
          <p className="text-center text-xs text-neutral-400">
            {selectedRows.length === 0
              ? "Select at least one question"
              : `${selectedRows.length} question${selectedRows.length === 1 ? "" : "s"}${
                  answers === "key" ? " + answer key" : answers === "inline" ? " with answers" : ""
                }`}
          </p>
          {printError && <p className="text-xs text-red-600 dark:text-red-400">{printError}</p>}
        </div>
      </div>

      {/* On-screen preview: a sheet of paper, whatever the app theme */}
      <div className="flex-1 overflow-y-auto bg-neutral-200/70 px-6 py-8 dark:bg-neutral-950">
        <div className="mx-auto min-h-[60rem] max-w-[46rem] rounded-sm bg-white px-14 py-12 text-neutral-950 shadow-lg ring-1 ring-black/5 [color-scheme:light]">
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

function Step({ n, title }: { n: number; title: string }) {
  return (
    <h3 className="flex items-center gap-2 text-sm font-semibold">
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-neutral-200 text-[11px] tabular-nums dark:bg-neutral-700">
        {n}
      </span>
      {title}
    </h3>
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
    return (
      <p className="py-24 text-center text-sm text-neutral-400">
        Your worksheet will appear here once you pick some questions.
      </p>
    );
  }
  return (
    <div className="quiz-doc space-y-5">
      <h1 className="border-b border-neutral-300 pb-3 font-display text-2xl font-semibold tracking-tight">
        {title}
      </h1>
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
                    <p className="mt-1 text-xs text-neutral-500">
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
          <h2 className="mb-3 border-b border-neutral-300 pb-2 font-display text-xl font-semibold">Answer key</h2>
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
