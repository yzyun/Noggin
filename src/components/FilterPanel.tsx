// Combinable filters for the question bank: search, folder tree, tags,
// difficulty range, content kind. Selecting a folder includes everything
// nested under it (matching the Rust index_search semantics).

import { useEffect, useMemo, useState } from "react";
import type { BodyKind, QuestionRow } from "../domain/types";
import { useQuestions } from "../state/questions";
import { textPrompt } from "../state/ui";

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
  const {
    filters,
    setFilters,
    clearFilters,
    allRows,
    folderDirs,
    createFolder,
    renameFolder,
    deleteFolder,
  } = useQuestions();
  const [searchDraft, setSearchDraft] = useState(filters.text);

  // Debounced search box.
  useEffect(() => {
    const t = setTimeout(() => {
      if (searchDraft !== filters.text) setFilters({ text: searchDraft });
    }, 250);
    return () => clearTimeout(t);
  }, [searchDraft, filters.text, setFilters]);

  // Real directories (includes empty folders) ∪ folders referenced by rows.
  const tree = useMemo(
    () =>
      buildFolderTree([
        ...new Set([...folderDirs, ...allRows.map((r) => r.folder).filter(Boolean)]),
      ]),
    [folderDirs, allRows],
  );

  // Tags scoped to the selected folder: "All questions" shows every tag,
  // a selected folder shows only tags used inside its subtree.
  const tags = useMemo(() => {
    const f = filters.folder;
    const inScope = f
      ? allRows.filter((r) => r.folder === f || r.folder.startsWith(`${f}/`))
      : allRows;
    return [...new Set(inScope.flatMap((r) => r.tags))].sort((a, b) => a.localeCompare(b));
  }, [allRows, filters.folder]);

  // Selected tags that fell out of scope after a folder change are dropped.
  useEffect(() => {
    const kept = filters.tags.filter((t) => tags.includes(t));
    if (kept.length !== filters.tags.length) setFilters({ tags: kept });
  }, [tags, filters.tags, setFilters]);

  const promptCreate = (parent?: string) => {
    void (async () => {
      const name = (
        await textPrompt({
          title: parent ? `New folder inside "${parent}"` : "New folder",
          placeholder: parent ? "subfolder name" : "e.g. physics/waves (nest with /)",
        })
      )?.trim();
      if (!name) return;
      await createFolder(parent ? `${parent}/${name}` : name).catch((e) => alert(String(e)));
    })();
  };

  const promptRename = (path: string) => {
    void (async () => {
      const next = (
        await textPrompt({
          title: "Rename / move folder (edit the full path to move it)",
          initial: path,
        })
      )?.trim();
      if (!next || next === path) return;
      await renameFolder(path, next).catch((e) => alert(String(e)));
    })();
  };

  const confirmDelete = (path: string) => {
    const n = countIn(allRows, path);
    const msg = n
      ? `Delete folder "${path}"? Its ${n} question${n > 1 ? "s" : ""} (and any subfolders) move up to the parent — nothing is lost.`
      : `Delete empty folder "${path}"?`;
    if (confirm(msg)) void deleteFolder(path).catch((e) => alert(String(e)));
  };

  const hasFilters =
    filters.text ||
    filters.folder !== null ||
    filters.tags.length > 0 ||
    filters.minDifficulty !== null ||
    filters.maxDifficulty !== null ||
    filters.kind !== null;

  const FolderRow = ({ node, depth }: { node: FolderNode; depth: number }) => (
    <>
      <div
        className={`group flex w-full items-center gap-1 rounded pr-1 text-xs ${
          filters.folder === node.path
            ? "bg-accent-soft font-medium text-accent-text"
            : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
        }`}
      >
        <button
          onClick={() => setFilters({ folder: filters.folder === node.path ? null : node.path })}
          className="flex min-w-0 flex-1 items-center justify-between py-1 text-left"
          style={{ paddingLeft: `${8 + depth * 12}px` }}
        >
          <span className="truncate">📁 {node.name}</span>
          <span className="pl-1 text-neutral-400 group-hover:hidden">
            {countIn(allRows, node.path)}
          </span>
        </button>
        <span className="hidden shrink-0 gap-0.5 group-hover:flex">
          <button
            onClick={() => promptCreate(node.path)}
            title="New subfolder"
            className="rounded px-1 text-neutral-400 hover:text-accent"
          >
            +
          </button>
          <button
            onClick={() => promptRename(node.path)}
            title="Rename / move"
            className="rounded px-1 text-neutral-400 hover:text-accent"
          >
            ✎
          </button>
          <button
            onClick={() => confirmDelete(node.path)}
            title="Delete folder"
            className="rounded px-1 text-neutral-400 hover:text-red-600"
          >
            ×
          </button>
        </span>
      </div>
      {node.children.map((c) => (
        <FolderRow key={c.path} node={c} depth={depth + 1} />
      ))}
    </>
  );

  return (
    <div className="flex w-60 shrink-0 flex-col gap-4 overflow-y-auto border-r border-edge p-3">
      {/* Search */}
      <input
        value={searchDraft}
        onChange={(e) => setSearchDraft(e.target.value)}
        placeholder="Search questions…"
        className="w-full rounded-md border border-edge bg-surface px-2.5 py-1.5 text-sm outline-none focus:border-accent"
      />

      {/* Folders */}
      <div>
        <div className="mb-1 flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-wide text-neutral-400">Folders</span>
          <button
            onClick={() => promptCreate()}
            title="New folder"
            className="rounded border border-edge px-1.5 text-xs text-neutral-500 hover:bg-neutral-100 hover:text-accent dark:hover:bg-neutral-800"
          >
            +
          </button>
        </div>
        <button
          onClick={() => setFilters({ folder: null })}
          className={`flex w-full items-center justify-between rounded px-2 py-1 text-left text-xs ${
            filters.folder === null
              ? "bg-accent-soft font-medium text-accent-text"
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
                      ? "bg-accent text-on-accent"
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
              className="flex-1 rounded-md border border-edge bg-surface px-1.5 py-1 text-xs"
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
        <div className="flex overflow-hidden rounded-md border border-edge">
          {([null, "text", "math", "image"] as (BodyKind | null)[]).map((k) => (
            <button
              key={k ?? "any"}
              onClick={() => setFilters({ kind: k })}
              className={`flex-1 px-1 py-1 text-xs ${
                filters.kind === k
                  ? "bg-accent font-medium text-on-accent"
                  : "bg-surface text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
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
          className="rounded-md border border-edge px-2 py-1 text-xs text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
        >
          Clear all filters
        </button>
      )}
    </div>
  );
}
