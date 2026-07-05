// Typed wrappers around the Rust tauri commands (src-tauri/src/vault.rs).
// Keep all `invoke` strings in this one file.

import { invoke } from "@tauri-apps/api/core";
import type { IndexStats } from "../domain/types";

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
};
