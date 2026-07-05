// Combinable filters for the question bank: search, folder tree, tags,
// difficulty range, content kind. Selecting a folder includes everything
// nested under it (matching the Rust index_search semantics).

import { useEffect, useMemo, useState } from "react";
import type { BodyKind, QuestionRow } from "../domain/types";
import { useQuestions } from "../state/questions";

interface FolderNode {
  name: string;
  path: string;
  children: FolderNode[];
}

function buildFolderTree(folders: string[]): FolderNode[] {
  const roots: FolderNode[] = [];
  for (const folder of folders) {
    let level = roots;
    let acc = "";
    for (const part of folder.split("/")) {
      acc = acc ? `${acc}/${part}` : part;
      let node = level.find((n) => n.path === acc);
      if (!node) {
        node = { name: part, path: acc, children: [] };
        level.push(node);
        level.sort((a, b) => a.name.localeCompare(b.name));
      }
      level = node.children;
    }
  }
  return roots;
}

function countIn(rows: QuestionRow[], folder: string): number {
  return rows.filter((r) => r.folder === folder || r.folder.startsWith(`${folder}/`)).length;
}

export function FilterPanel() {
  const { filters, setFilters, clearFilters, allRows, allTags } = useQuestions();
  const [searchDraft, setSearchDraft] = useState(filters.text);

  // Debounced search box.
  useEffect(() => {
    const t = setTimeout(() => {
      if (searchDraft !== filters.text) setFilters({ text: searchDraft });
    }, 250);
    return () => clearTimeout(t);
  }, [searchDraft, filters.text, setFilters]);

  const tree = useMemo(
    () => buildFolderTree([...new Set(allRows.map((r) => r.folder).filter(Boolean))]),
    [allRows],
  );
  const tags = allTags();

  const hasFilters =
    filters.text ||
    filters.folder !== null ||
    filters.tags.length > 0 ||
    filters.minDifficulty !== null ||
    filters.maxDifficulty !== null ||
    filters.kind !== null;

  const FolderRow = ({ node, depth }: { node: FolderNode; depth: number }) => (
    <>
      <button
        onClick={() => setFilters({ folder: filters.folder === node.path ? null : node.path })}
        className={`flex w-full items-center justify-between rounded px-2 py-1 text-left text-xs ${
          filters.folder === node.path
            ? "bg-blue-100 font-medium text-blue-900 dark:bg-blue-950 dark:text-blue-200"
            : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
        }`}
        style={{ paddingLeft: `${8 + depth * 12}px` }}
      >
        <span className="truncate">📁 {node.name}</span>
        <span className="text-neutral-400">{countIn(allRows, node.path)}</span>
      </button>
      {node.children.map((c) => (
        <FolderRow key={c.path} node={c} depth={depth + 1} />
      ))}
    </>
  );

  return (
    <div className="flex w-60 shrink-0 flex-col gap-4 overflow-y-auto border-r border-neutral-200 p-3 dark:border-neutral-800">
      {/* Search */}
      <input
        value={searchDraft}
        onChange={(e) => setSearchDraft(e.target.value)}
        placeholder="Search questions…"
        className="w-full rounded-md border border-neutral-300 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-blue-500 dark:border-neutral-700 dark:bg-neutral-900"
      />

      {/* Folders */}
      <div>
        <div className="mb-1 flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-wide text-neutral-400">Folders</span>
        </div>
        <button
          onClick={() => setFilters({ folder: null })}
          className={`flex w-full items-center justify-between rounded px-2 py-1 text-left text-xs ${
            filters.folder === null
              ? "bg-blue-100 font-medium text-blue-900 dark:bg-blue-950 dark:text-blue-200"
              : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
          }`}
        >
          <span>All questions</span>
          <span className="text-neutral-400">{allRows.length}</span>
        </button>
        {tree.map((n) => (
          <FolderRow key={n.path} node={n} depth={0} />
        ))}
      </div>

      {/* Tags */}
      {tags.length > 0 && (
        <div>
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-neutral-400">
            Tags {filters.tags.length > 0 && `(${filters.tags.length})`}
          </span>
          <div className="flex flex-wrap gap-1">
            {tags.map((tag) => {
              const on = filters.tags.includes(tag);
              return (
                <button
                  key={tag}
                  onClick={() =>
                    setFilters({
                      tags: on ? filters.tags.filter((t) => t !== tag) : [...filters.tags, tag],
                    })
                  }
                  className={`rounded-full px-2 py-0.5 text-xs transition ${
                    on
                      ? "bg-blue-600 text-white"
                      : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700"
                  }`}
                >
                  {tag}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Difficulty range */}
      <div>
        <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-neutral-400">
          Difficulty
        </span>
        <div className="flex items-center gap-2">
          {(["minDifficulty", "maxDifficulty"] as const).map((key, i) => (
            <select
              key={key}
              value={filters[key] ?? ""}
              onChange={(e) =>
                setFilters({ [key]: e.target.value === "" ? null : Number(e.target.value) })
              }
              className="flex-1 rounded-md border border-neutral-300 bg-white px-1.5 py-1 text-xs dark:border-neutral-700 dark:bg-neutral-900"
            >
              <option value="">{i === 0 ? "min" : "max"}</option>
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          ))}
        </div>
      </div>

      {/* Content kind */}
      <div>
        <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-neutral-400">Kind</span>
        <div className="flex overflow-hidden rounded-md border border-neutral-300 dark:border-neutral-700">
          {([null, "text", "math", "image"] as (BodyKind | null)[]).map((k) => (
            <button
              key={k ?? "any"}
              onClick={() => setFilters({ kind: k })}
              className={`flex-1 px-1 py-1 text-xs ${
                filters.kind === k
                  ? "bg-blue-600 font-medium text-white"
                  : "bg-white text-neutral-600 hover:bg-neutral-100 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800"
              }`}
            >
              {k ?? "any"}
            </button>
          ))}
        </div>
      </div>

      {hasFilters && (
        <button
          onClick={() => {
            setSearchDraft("");
            clearFilters();
          }}
          className="rounded-md border border-neutral-300 px-2 py-1 text-xs text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
        >
          Clear all filters
        </button>
      )}
    </div>
  );
}
