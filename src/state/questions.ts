// Question bank state: filters + search results + save/load/delete +
// rescan (which keeps the index true to the files on disk).
// Saving = serialize markdown → write file → mirror into the SQLite index.

import { create } from "zustand";
import { ipc } from "../lib/ipc";
import { deriveBodyKind, parseQuestionFile, serializeQuestionFile } from "../domain/format";
import { deriveTitle, slugify } from "../domain/title";
import type { BodyKind, QuestionDoc, QuestionRow } from "../domain/types";
import { useVault } from "./vault";

export interface Filters {
  text: string;
  folder: string | null; // null = all folders
  tags: string[];
  minDifficulty: number | null;
  maxDifficulty: number | null;
  kind: BodyKind | null;
}

export const EMPTY_FILTERS: Filters = {
  text: "",
  folder: null,
  tags: [],
  minDifficulty: null,
  maxDifficulty: null,
  kind: null,
};

interface QuestionsStore {
  rows: QuestionRow[];
  /** Rows matching no filters — used for folder/tag option lists + counts. */
  allRows: QuestionRow[];
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
  openDoc(row: QuestionRow): Promise<QuestionDoc>;
  remove(row: QuestionRow): Promise<void>;
  removeMany(rows: QuestionRow[]): Promise<void>;

  allTags(): string[];
  allFolders(): string[];
}

function questionPath(doc: QuestionDoc, folder: string): string {
  const dir = folder.replace(/^\/+|\/+$/g, "");
  const slug = slugify(deriveTitle(doc.question));
  const suffix = doc.meta.id.slice(-6).toLowerCase();
  return `questions/${dir ? `${dir}/` : ""}${slug}-${suffix}.md`;
}

function toSearchParams(f: Filters) {
  return {
    text: f.text.trim() || null,
    folder: f.folder,
    tags: f.tags,
    min_difficulty: f.minDifficulty,
    max_difficulty: f.maxDifficulty,
    body_kind: f.kind,
  };
}

/** Parse one file and mirror it into the index. Returns false if the file
 *  isn't a valid question (those are simply skipped — never fatal). */
async function indexFile(rel: string, mtime: number): Promise<boolean> {
  let doc: QuestionDoc;
  try {
    doc = parseQuestionFile(await ipc.readFile(rel));
  } catch {
    return false; // not a question file / malformed — ignore
  }
  const folder = rel.replace(/^questions\//, "").split("/").slice(0, -1).join("/");
  await ipc.upsertQuestion({
    id: doc.meta.id,
    path: rel,
    title: deriveTitle(doc.question),
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
      const [rows, allRows] = await Promise.all([
        ipc.search(toSearchParams(get().filters)),
        ipc.listQuestions(),
      ]);
      set({ rows, allRows, loaded: true, error: null });
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
      // Files deleted/moved outside the app → prune their index rows.
      for (const row of indexed) {
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

  async openDoc(row) {
    return parseQuestionFile(await ipc.readFile(row.path));
  },

  async remove(row) {
    await get().removeMany([row]);
  },

  async removeMany(rows) {
    for (const row of rows) {
      await ipc.removeFile(row.path).catch(() => {}); // file may already be gone
      await ipc.removeQuestion(row.id);
    }
    await get().load();
    void useVault.getState().refreshStats();
  },

  allTags() {
    return [...new Set(get().allRows.flatMap((r) => r.tags))].sort((a, b) => a.localeCompare(b));
  },

  allFolders() {
    return [...new Set(get().allRows.map((r) => r.folder).filter(Boolean))].sort();
  },
}));
