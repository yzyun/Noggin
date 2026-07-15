// Question bank state: filters + search results + save/load/delete +
// rescan (which keeps the index true to the files on disk).
// Saving = serialize markdown → write file → mirror into the SQLite index.

import { create } from "zustand";
import { ipc, searchParams } from "../lib/ipc";
import { deriveBodyKind, serializeQuestionFile } from "../domain/format";
import { effectiveTitle, slugify } from "../domain/title";
import type { BodyKind, QuestionDoc, QuestionRow } from "../domain/types";
import { useVault } from "./vault";

export interface Filters {
  text: string;
  /** Selected folders (OR of subtrees); empty = all. ⌘/Ctrl+click multi-selects. */
  folders: string[];
  tags: string[];
  minDifficulty: number | null;
  maxDifficulty: number | null;
  kind: BodyKind | null;
}

export const EMPTY_FILTERS: Filters = {
  text: "",
  folders: [],
  tags: [],
  minDifficulty: null,
  maxDifficulty: null,
  kind: null,
};

interface QuestionsStore {
  rows: QuestionRow[];
  /** Rows matching no filters — used for folder/tag option lists + counts. */
  allRows: QuestionRow[];
  /** Real directories under questions/ (includes empty folders). */
  folderDirs: string[];
  filters: Filters;
  loaded: boolean;
  scanning: boolean;
  error: string | null;

  setFilters(patch: Partial<Filters>): void;
  clearFilters(): void;
  /** Re-run the search with current filters (also refreshes allRows). */
  load(): Promise<void>;
  /** Reconcile the index with the files on disk (mtime-skip, prune stale). */
  rescan(): Promise<void>;
  save(doc: QuestionDoc, folder: string, existingPath?: string): Promise<string>;
  /** Bulk import: write many docs, then refresh once. Returns count written. */
  importMany(items: { doc: QuestionDoc; folder: string }[]): Promise<number>;

  createFolder(path: string): Promise<void>;
  /** Rename or move a folder (new path may have a different parent). */
  renameFolder(from: string, to: string): Promise<void>;
  /** Delete a folder; its contents move up to the parent. */
  deleteFolder(path: string): Promise<void>;
  /** Move questions into another folder (drag & drop). Keeps ids/history. */
  moveQuestions(rows: QuestionRow[], folder: string): Promise<void>;
  openDoc(row: QuestionRow): Promise<QuestionDoc>;
  removeMany(rows: QuestionRow[]): Promise<void>;

  allTags(): string[];
  allFolders(): string[];
  /** Subjects ordered by most recent use (newest question first). */
  recentFolders(): string[];
}

function questionPath(doc: QuestionDoc, folder: string): string {
  const dir = folder.replace(/^\/+|\/+$/g, "");
  const slug = slugify(effectiveTitle(doc.meta.title, doc.question));
  const suffix = doc.meta.id.slice(-6).toLowerCase();
  return `questions/${dir ? `${dir}/` : ""}${slug}-${suffix}.md`;
}

function toSearchParams(f: Filters) {
  return searchParams({
    text: f.text.trim() || null,
    folders: f.folders,
    tags: f.tags,
    min_difficulty: f.minDifficulty,
    max_difficulty: f.maxDifficulty,
    body_kind: f.kind,
  });
}

/** Parse one file and mirror it into the index. Returns false if the file
 *  isn't a valid question (those are simply skipped — never fatal). */
async function indexFile(rel: string, mtime: number): Promise<boolean> {
  let doc: QuestionDoc;
  try {
    doc = await ipc.readDoc(rel);
  } catch {
    return false; // not a question file / malformed — ignore
  }
  const folder = rel.replace(/^questions\//, "").split("/").slice(0, -1).join("/");
  await ipc.upsertQuestion({
    id: doc.meta.id,
    path: rel,
    title: effectiveTitle(doc.meta.title, doc.question),
    body_kind: doc.meta.body ?? deriveBodyKind(doc.question),
    difficulty: doc.meta.difficulty ?? null,
    folder,
    source: doc.meta.source ?? null,
    tags: doc.meta.tags,
    recall: doc.meta.recall,
    created: doc.meta.created || null,
    mtime,
    question_text: doc.question,
    answer_text: doc.answer ?? null,
  });
  return true;
}

export const useQuestions = create<QuestionsStore>((set, get) => ({
  rows: [],
  allRows: [],
  folderDirs: [],
  filters: EMPTY_FILTERS,
  loaded: false,
  scanning: false,
  error: null,

  setFilters(patch) {
    set({ filters: { ...get().filters, ...patch } });
    void get().load();
  },

  clearFilters() {
    set({ filters: EMPTY_FILTERS });
    void get().load();
  },

  async load() {
    try {
      const [rows, allRows, folderDirs] = await Promise.all([
        ipc.search(toSearchParams(get().filters)),
        ipc.listQuestions(),
        ipc.listDirs("questions"),
      ]);
      set({ rows, allRows, folderDirs, loaded: true, error: null });
    } catch (e) {
      set({ error: String(e), loaded: true });
    }
  },

  async rescan() {
    if (get().scanning) return;
    set({ scanning: true });
    try {
      const [files, indexed] = await Promise.all([
        ipc.listRecursive("questions", "md"),
        ipc.listQuestions(),
      ]);
      const byPath = new Map(indexed.map((r) => [r.path, r]));
      const onDisk = new Set(files.map((f) => f.rel));

      // New or modified files (±2s tolerance: our upserts stamp wall-clock
      // time, not the file's exact mtime).
      for (const f of files) {
        const row = byPath.get(f.rel);
        if (!row || Math.abs(row.mtime - f.mtime) > 2) {
          await indexFile(f.rel, f.mtime);
        }
      }
      // Prune rows whose file no longer exists. Re-fetch first: a moved
      // file was just re-upserted under a NEW path with the SAME id, and
      // pruning from the stale snapshot would delete that fresh row.
      for (const row of await ipc.listQuestions()) {
        if (!onDisk.has(row.path)) {
          await ipc.removeQuestion(row.id);
        }
      }
      await get().load();
      void useVault.getState().refreshStats();
    } catch (e) {
      set({ error: String(e) });
    } finally {
      set({ scanning: false });
    }
  },

  async save(doc, folder, existingPath) {
    const dir = folder.replace(/^\/+|\/+$/g, "");
    const newPath = questionPath(doc, folder);
    // Keep the existing filename unless the folder changed (renames on every
    // title edit would churn the vault).
    let path = existingPath ?? newPath;
    if (existingPath) {
      const existingDir = existingPath.split("/").slice(0, -1).join("/");
      const wantedDir = `questions${dir ? `/${dir}` : ""}`;
      if (existingDir !== wantedDir) path = newPath;
    }

    await ipc.writeFile(path, serializeQuestionFile(doc));
    if (existingPath && existingPath !== path) {
      await ipc.removeFile(existingPath).catch(() => {});
    }
    await indexFile(path, Math.floor(Date.now() / 1000));

    await get().load();
    void useVault.getState().refreshStats();
    return path;
  },

  async importMany(items) {
    let written = 0;
    for (const { doc, folder } of items) {
      const path = questionPath(doc, folder);
      await ipc.writeFile(path, serializeQuestionFile(doc));
      await indexFile(path, Math.floor(Date.now() / 1000));
      written++;
    }
    await get().load();
    void useVault.getState().refreshStats();
    return written;
  },

  async openDoc(row) {
    return ipc.readDoc(row.path);
  },

  async removeMany(rows) {
    for (const row of rows) {
      await ipc.removeFile(row.path).catch(() => {}); // file may already be gone
      await ipc.removeQuestion(row.id);
    }
    await get().load();
    void useVault.getState().refreshStats();
  },

  async createFolder(path) {
    const clean = path.replace(/^\/+|\/+$/g, "");
    if (!clean) return;
    await ipc.createDir(`questions/${clean}`);
    await get().load();
  },

  async renameFolder(from, to) {
    const cleanTo = to.replace(/^\/+|\/+$/g, "");
    if (!cleanTo || cleanTo === from) return;
    await ipc.renamePath(`questions/${from}`, `questions/${cleanTo}`);
    // Follow the selection if the renamed folder (or an ancestor) was active.
    const folders = get().filters.folders.map((f) =>
      f === from || f.startsWith(`${from}/`) ? cleanTo + f.slice(from.length) : f,
    );
    set({ filters: { ...get().filters, folders } });
    await get().rescan();
  },

  async deleteFolder(path) {
    await ipc.deleteFolder(`questions/${path}`);
    const folders = get().filters.folders.filter(
      (f) => f !== path && !f.startsWith(`${path}/`),
    );
    set({ filters: { ...get().filters, folders } });
    await get().rescan();
  },

  async moveQuestions(rows, folder) {
    const dir = folder.replace(/^\/+|\/+$/g, "");
    for (const row of rows) {
      const filename = row.path.split("/").pop()!;
      const newPath = `questions/${dir ? `${dir}/` : ""}${filename}`;
      if (newPath === row.path) continue;
      await ipc.renamePath(row.path, newPath);
      await indexFile(newPath, Math.floor(Date.now() / 1000));
    }
    await get().load();
  },

  allTags() {
    return [...new Set(get().allRows.flatMap((r) => r.tags))].sort((a, b) => a.localeCompare(b));
  },

  allFolders() {
    return [
      ...new Set([...get().allRows.map((r) => r.folder).filter(Boolean), ...get().folderDirs]),
    ].sort();
  },

  recentFolders() {
    // allRows is ordered newest-first, so first sighting = most recent use;
    // empty (never-used) folders follow alphabetically.
    const seen: string[] = [];
    for (const r of get().allRows) {
      if (r.folder && !seen.includes(r.folder)) seen.push(r.folder);
    }
    for (const d of get().folderDirs) {
      if (!seen.includes(d)) seen.push(d);
    }
    return seen;
  },
}));
