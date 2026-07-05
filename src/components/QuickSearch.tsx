// ⌘P quick-open: search the whole bank, jump straight to a question.

import { useEffect, useMemo, useRef, useState } from "react";
import type { QuestionRow } from "../domain/types";
import { ipc } from "../lib/ipc";
import { useQuestions } from "../state/questions";
import { useUi } from "../state/ui";

const MAX_RESULTS = 20;

export function QuickSearch() {
  const { quickSearchOpen, closeQuickSearch } = useUi();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<QuestionRow[]>([]);
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (quickSearchOpen) {
      setQuery("");
      setResults([]);
      setCursor(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [quickSearchOpen]);

  // Debounced live search; empty query shows the most recent questions.
  useEffect(() => {
    if (!quickSearchOpen) return;
    const t = setTimeout(() => {
      void ipc
        .search({ text: query.trim() || null, folder: null, tags: [] })
        .then((rows) => {
          setResults(rows.slice(0, MAX_RESULTS));
          setCursor(0);
        })
        .catch(() => setResults([]));
    }, 150);
    return () => clearTimeout(t);
  }, [query, quickSearchOpen]);

  const pick = useMemo(
    () => (row: QuestionRow | undefined) => {
      if (!row) return;
      closeQuickSearch();
      useQuestions.getState().clearFilters();
      useUi.getState().focusQuestion(row.id);
    },
    [closeQuickSearch],
  );

  if (!quickSearchOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 pt-24"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) closeQuickSearch();
      }}
    >
      <div className="w-full max-w-lg overflow-hidden rounded-xl border border-edge bg-surface shadow-2xl">
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") closeQuickSearch();
            else if (e.key === "ArrowDown") {
              e.preventDefault();
              setCursor((c) => Math.min(c + 1, results.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setCursor((c) => Math.max(c - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              pick(results[cursor]);
            }
          }}
          placeholder="Search questions…"
          className="w-full border-b border-edge bg-transparent px-4 py-3 text-sm outline-none"
        />
        <ul className="max-h-80 overflow-y-auto py-1">
          {results.map((row, i) => (
            <li key={row.id}>
              <button
                onClick={() => pick(row)}
                onMouseEnter={() => setCursor(i)}
                className={`flex w-full items-center gap-2 px-4 py-2 text-left text-sm ${
                  i === cursor
                    ? "bg-accent-soft text-accent-text"
                    : "text-neutral-700 dark:text-neutral-200"
                }`}
              >
                <span className="min-w-0 flex-1 truncate">{row.title ?? row.id}</span>
                {row.folder && (
                  <span className="shrink-0 rounded bg-neutral-100 px-1.5 py-0.5 text-xs text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
                    {row.folder}
                  </span>
                )}
                {row.difficulty !== null && (
                  <span className="shrink-0 text-xs text-neutral-400">d{row.difficulty}</span>
                )}
              </button>
            </li>
          ))}
          {results.length === 0 && (
            <li className="px-4 py-3 text-center text-sm text-neutral-400">
              {query.trim() ? "No matches" : "Type to search your questions"}
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
