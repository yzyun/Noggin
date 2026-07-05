// Quiz builder: filter a question pool, pick & order questions, choose
// answer placement, then print — the macOS print dialog's "Save as PDF"
// produces a worksheet with fully typeset math and images.

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { parseQuestionFile } from "../domain/format";
import type { QuestionDoc, QuestionRow } from "../domain/types";
import { ipc, type SearchParams } from "../lib/ipc";
import { useQuestions } from "../state/questions";
import { Markdown } from "./Markdown";
import { SubjectSelect } from "./fields/SubjectSelect";
import { TagInput } from "./fields/TagInput";

type AnswerPlacement = "none" | "inline" | "key";

export function QuizView() {
  const { allTags, recentFolders } = useQuestions();

  // Pool filters
  const [subject, setSubject] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [pool, setPool] = useState<QuestionRow[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [order, setOrder] = useState<string[]>([]);

  // Options
  const [title, setTitle] = useState("Practice quiz");
  const [answers, setAnswers] = useState<AnswerPlacement>("key");
  const [showMeta, setShowMeta] = useState(false);

  const [docs, setDocs] = useState<Map<string, QuestionDoc>>(new Map());

  const params: SearchParams = useMemo(
    () => ({ text: null, folder: subject.trim() || null, tags, body_kind: null }),
    [subject, tags],
  );

  useEffect(() => {
    let alive = true;
    void ipc.search(params).then((rows) => {
      if (!alive) return;
      setPool(rows);
      setPicked(new Set(rows.map((r) => r.id)));
      setOrder(rows.map((r) => r.id));
    });
    return () => {
      alive = false;
    };
  }, [params]);

  // Load docs for picked questions (for preview/print).
  useEffect(() => {
    let alive = true;
    void (async () => {
      const next = new Map<string, QuestionDoc>();
      for (const row of pool) {
        if (!picked.has(row.id)) continue;
        try {
          next.set(row.id, parseQuestionFile(await ipc.readFile(row.path)));
        } catch {
          /* skip unreadable */
        }
      }
      if (alive) setDocs(next);
    })();
    return () => {
      alive = false;
    };
  }, [pool, picked]);

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

  return (
    <div className="flex h-full">
      {/* Controls */}
      <div className="w-80 shrink-0 space-y-4 overflow-y-auto border-r border-neutral-200 p-4 dark:border-neutral-800">
        <h2 className="text-sm font-semibold">Quiz builder</h2>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-neutral-500 dark:text-neutral-400">Title</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-md border border-neutral-300 bg-white px-2.5 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-neutral-500 dark:text-neutral-400">Subject</span>
          <SubjectSelect value={subject} onChange={setSubject} recent={recentFolders()} />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-neutral-500 dark:text-neutral-400">Tags</span>
          <TagInput value={tags} onChange={setTags} suggestions={allTags()} />
        </label>

        <div>
          <span className="mb-1 block text-xs font-medium text-neutral-500 dark:text-neutral-400">Answers</span>
          <div className="flex overflow-hidden rounded-md border border-neutral-300 dark:border-neutral-700">
            {(
              [
                ["none", "None"],
                ["inline", "Under each"],
                ["key", "Key at end"],
              ] as [AnswerPlacement, string][]
            ).map(([v, label]) => (
              <button
                key={v}
                onClick={() => setAnswers(v)}
                className={`flex-1 px-2 py-1.5 text-xs ${
                  answers === v
                    ? "bg-blue-600 font-medium text-white"
                    : "bg-white text-neutral-600 hover:bg-neutral-100 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

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
                className="rounded border border-neutral-300 px-1.5 py-0.5 text-[11px] text-neutral-500 hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
              >
                all
              </button>
              <button
                onClick={() => setPicked(new Set())}
                className="rounded border border-neutral-300 px-1.5 py-0.5 text-[11px] text-neutral-500 hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
              >
                none
              </button>
              <button
                onClick={shuffle}
                className="rounded border border-neutral-300 px-1.5 py-0.5 text-[11px] text-neutral-500 hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
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

        <button
          onClick={() => window.print()}
          disabled={selectedRows.length === 0}
          className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-40"
        >
          Print / Save as PDF ({selectedRows.length})
        </button>
      </div>

      {/* On-screen preview */}
      <div className="flex-1 overflow-y-auto bg-neutral-100 p-6 dark:bg-neutral-950">
        <div className="mx-auto max-w-2xl rounded-lg bg-white p-8 shadow dark:bg-neutral-900">
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
