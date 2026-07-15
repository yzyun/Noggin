// Combinable filters for the question bank. Layout: search on top, the
// folder tree gets most of the space (scrollable), and tags / difficulty /
// kind live in a pinned section at the bottom.
//
// Drag & drop: drop question cards onto a folder to move them there; drag
// a folder onto another folder (or "All questions" for top level) to move it.
// ⌘/Ctrl+click folders to combine several subtrees into one filter.

import { useEffect, useMemo, useState } from "react";
import type { BodyKind, QuestionRow } from "../domain/types";
import { useQuestions } from "../state/questions";
import { confirmDialog, errorDialog, textPrompt } from "../state/ui";
import { INPUT } from "./ui/Field";
import { FolderTree } from "./ui/FolderTree";
import { Segmented } from "./ui/Segmented";
import { buildFolderTree } from "../lib/folderTree";

export const DND_QUESTIONS = "application/x-noggin-questions";
const DND_FOLDER = "application/x-noggin-folder";

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
    moveQuestions,
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

  // Tags scoped to the selected folders: "All questions" shows every tag,
  // otherwise only tags used inside the selected subtrees.
  const tags = useMemo(() => {
    const sel = filters.folders;
    const inScope = sel.length
      ? allRows.filter((r) => sel.some((f) => r.folder === f || r.folder.startsWith(`${f}/`)))
      : allRows;
    return [...new Set(inScope.flatMap((r) => r.tags))].sort((a, b) => a.localeCompare(b));
  }, [allRows, filters.folders]);

  // Selected tags that fell out of scope after a folder change are dropped.
  useEffect(() => {
    const kept = filters.tags.filter((t) => tags.includes(t));
    if (kept.length !== filters.tags.length) setFilters({ tags: kept });
  }, [tags, filters.tags, setFilters]);

  // --- folder actions ------------------------------------------------------

  const promptCreate = (parent?: string) => {
    void (async () => {
      const name = (
        await textPrompt({
          title: parent ? `New folder inside "${parent}"` : "New folder",
          placeholder: parent ? "subfolder name" : "e.g. physics/waves (nest with /)",
        })
      )?.trim();
      if (!name) return;
      await createFolder(parent ? `${parent}/${name}` : name).catch((e) =>
        errorDialog("Couldn't create folder", String(e)),
      );
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
      await renameFolder(path, next).catch((e) =>
        errorDialog("Couldn't rename folder", String(e)),
      );
    })();
  };

  const confirmDelete = (path: string) => {
    void (async () => {
      const n = countIn(allRows, path);
      const ok = await confirmDialog({
        title: `Delete folder "${path}"?`,
        message: n
          ? `Its ${n} question${n > 1 ? "s" : ""} (and any subfolders) move up to the parent — nothing is lost.`
          : "The folder is empty.",
        confirmLabel: "Delete folder",
      });
      if (ok)
        await deleteFolder(path).catch((e) => errorDialog("Couldn't delete folder", String(e)));
    })();
  };

  const hasFilters =
    filters.text ||
    filters.folders.length > 0 ||
    filters.tags.length > 0 ||
    filters.minDifficulty !== null ||
    filters.maxDifficulty !== null ||
    filters.kind !== null;

  return (
    <div className="flex w-60 shrink-0 flex-col border-r border-edge">
      {/* Search */}
      <div className="p-3 pb-2">
        <input
          value={searchDraft}
          onChange={(e) => setSearchDraft(e.target.value)}
          placeholder="Search questions…"
          className={`w-full ${INPUT}`}
        />
      </div>

      {/* Folders — the main, scrollable area */}
      <div className="flex min-h-0 flex-1 flex-col px-3">
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
        <div className="min-h-0 flex-1 overflow-y-auto pb-2">
          <FolderTree
            nodes={tree}
            rootLabel="All questions"
            rootCount={allRows.length}
            countFor={(path) => countIn(allRows, path)}
            selected={filters.folders}
            onSelect={(folders) => setFilters({ folders })}
            itemDndType={DND_QUESTIONS}
            folderDndType={DND_FOLDER}
            onDropItem={(payload, folder) => {
              const ids = new Set<string>(JSON.parse(payload));
              const rows = allRows.filter((r) => ids.has(r.id));
              if (rows.length)
                void moveQuestions(rows, folder).catch((err) =>
                  errorDialog("Couldn't move questions", String(err)),
                );
            }}
            onMoveFolder={(from, to) =>
              void renameFolder(from, to).catch((err) =>
                errorDialog("Couldn't move folder", String(err)),
              )
            }
            onCreate={promptCreate}
            onRename={promptRename}
            onDelete={confirmDelete}
          />
        </div>
      </div>

      {/* Pinned filter section: tags / difficulty / kind */}
      <div className="max-h-[45%] space-y-3 overflow-y-auto border-t border-edge p-3">
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

        <div>
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-neutral-400">Kind</span>
          <Segmented<BodyKind | "any">
            grow
            size="xs"
            value={filters.kind ?? "any"}
            options={[
              ["any", "any"],
              ["text", "text"],
              ["math", "math"],
              ["image", "image"],
            ]}
            onChange={(k) => setFilters({ kind: k === "any" ? null : k })}
          />
        </div>

        {hasFilters && (
          <button
            onClick={() => {
              setSearchDraft("");
              clearFilters();
            }}
            className="w-full rounded-md border border-edge px-2 py-1 text-xs text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            Clear all filters
          </button>
        )}
      </div>
    </div>
  );
}
