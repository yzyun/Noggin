// Question bank state: index rows + save/load/delete orchestration.
// Saving = serialize markdown → write file → mirror into the SQLite index.

import { create } from "zustand";
import { ipc } from "../lib/ipc";
import { parseQuestionFile, serializeQuestionFile } from "../domain/format";
import { deriveTitle, slugify } from "../domain/title";
import type { QuestionDoc, QuestionRow } from "../domain/types";
import { useVault } from "./vault";

interface QuestionsStore {
  rows: QuestionRow[];
  loaded: boolean;
  error: string | null;

  load(): Promise<void>;
  /** Write doc to disk (at its existing path, or a new one under folder)
   *  and update the index. Returns the saved path. */
  save(doc: QuestionDoc, folder: string, existingPath?: string): Promise<string>;
  /** Read + parse the file behind an index row. */
  openDoc(row: QuestionRow): Promise<QuestionDoc>;
  remove(row: QuestionRow): Promise<void>;

  /** All distinct tags in the bank (for suggestions). */
  allTags(): string[];
  /** All distinct folders in the bank (for the folder field datalist). */
  allFolders(): string[];
}

/** Compute the vault-relative path for a question file. */
function questionPath(doc: QuestionDoc, folder: string): string {
  const dir = folder.replace(/^\/+|\/+$/g, "");
  const slug = slugify(deriveTitle(doc.question));
  const suffix = doc.meta.id.slice(-6).toLowerCase();
  return `questions/${dir ? `${dir}/` : ""}${slug}-${suffix}.md`;
}

export const useQuestions = create<QuestionsStore>((set, get) => ({
  rows: [],
  loaded: false,
  error: null,

  async load() {
    try {
      set({ rows: await ipc.listQuestions(), loaded: true, error: null });
    } catch (e) {
      set({ error: String(e), loaded: true });
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

    const title = deriveTitle(doc.question);
    await ipc.upsertQuestion({
      id: doc.meta.id,
      path,
      title,
      body_kind: doc.meta.body,
      difficulty: doc.meta.difficulty ?? null,
      folder: dir,
      source: doc.meta.source ?? null,
      tags: doc.meta.tags,
      recall: doc.meta.recall,
      created: doc.meta.created || null,
      mtime: Math.floor(Date.now() / 1000),
      question_text: doc.question,
      answer_text: doc.answer ?? null,
    });

    await get().load();
    void useVault.getState().refreshStats();
    return path;
  },

  async openDoc(row) {
    return parseQuestionFile(await ipc.readFile(row.path));
  },

  async remove(row) {
    await ipc.removeFile(row.path).catch(() => {}); // file may already be gone
    await ipc.removeQuestion(row.id);
    await get().load();
    void useVault.getState().refreshStats();
  },

  allTags() {
    return [...new Set(get().rows.flatMap((r) => r.tags))].sort((a, b) => a.localeCompare(b));
  },

  allFolders() {
    return [...new Set(get().rows.map((r) => r.folder).filter(Boolean))].sort();
  },
}));
