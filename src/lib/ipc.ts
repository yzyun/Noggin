// Typed wrappers around the Rust tauri commands (src-tauri/src/vault.rs).
// Keep all `invoke` strings in this one file.

import { invoke } from "@tauri-apps/api/core";
import type { IndexStats, QuestionRow } from "../domain/types";
import type { CardRow, ReviewLogEntry } from "../domain/srs";

export interface DueEntry {
  question: QuestionRow;
  card: CardRow;
}

export interface ReviewStats {
  due_now: number;
  new_count: number;
  reviews_today: number;
  total_reviews: number;
  upcoming: [string, number][];
}

/** Payload for index_upsert_question (mirrors Rust QuestionUpsert). */
export interface QuestionUpsert {
  id: string;
  path: string;
  title: string | null;
  body_kind: string;
  difficulty: number | null;
  folder: string;
  source: string | null;
  tags: string[];
  recall: string;
  created: string | null;
  mtime: number;
  question_text: string;
  answer_text: string | null;
}

export interface VaultInfo {
  root: string;
  stats: IndexStats;
}

export interface DirEntry {
  name: string;
  rel: string;
  is_dir: boolean;
  mtime: number;
}

export const ipc = {
  openVault: (path: string) => invoke<VaultInfo>("open_vault", { path }),
  getLastVault: () => invoke<string | null>("get_last_vault"),
  closeVault: () => invoke<void>("close_vault"),
  indexStats: () => invoke<IndexStats>("index_stats"),

  readFile: (rel: string) => invoke<string>("vault_read_file", { rel }),
  writeFile: (rel: string, contents: string) =>
    invoke<void>("vault_write_file", { rel, contents }),
  writeBinary: (rel: string, contents: number[]) =>
    invoke<void>("vault_write_binary", { rel, contents }),
  readBinary: (rel: string) => invoke<number[]>("vault_read_binary", { rel }),
  removeFile: (rel: string) => invoke<void>("vault_remove_file", { rel }),
  listDir: (rel: string) => invoke<DirEntry[]>("vault_list", { rel }),

  upsertQuestion: (q: QuestionUpsert) => invoke<void>("index_upsert_question", { q }),
  removeQuestion: (id: string) => invoke<void>("index_remove_question", { id }),
  listQuestions: () => invoke<QuestionRow[]>("index_list_questions"),
  getQuestion: (id: string) => invoke<QuestionRow | null>("index_get_question", { id }),
  search: (params: SearchParams) => invoke<QuestionRow[]>("index_search", { params }),
  listRecursive: (rel: string, ext?: string) =>
    invoke<DirEntry[]>("vault_list_recursive", { rel, ext: ext ?? null }),

  createDir: (rel: string) => invoke<void>("vault_create_dir", { rel }),
  renamePath: (from: string, to: string) => invoke<void>("vault_rename", { from, to }),
  deleteFolder: (rel: string) => invoke<void>("vault_delete_folder", { rel }),
  listDirs: (rel: string) => invoke<string[]>("vault_list_dirs", { rel }),

  cardsDue: (params: SearchParams, now: string, limit: number) =>
    invoke<DueEntry[]>("cards_due", { params, now, limit }),
  cardUpdate: (card: CardRow) => invoke<void>("card_update", { card }),
  reviewLogAdd: (entry: ReviewLogEntry) => invoke<void>("review_log_add", { entry }),
  reviewStats: (now: string, todayStart: string) =>
    invoke<ReviewStats>("review_stats", { now, todayStart }),
};

/** Mirrors Rust SearchParams. All filters optional; AND semantics
 *  (except `folders`, which ORs its entries). */
export interface SearchParams {
  text?: string | null;
  folder?: string | null;
  /** Multiple subjects (OR of subtrees) — quiz builder. */
  folders?: string[];
  tags: string[];
  min_difficulty?: number | null;
  max_difficulty?: number | null;
  body_kind?: string | null;
}
