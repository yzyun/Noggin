// Vault session state: which vault is open, its stats, open/close actions.

import { create } from "zustand";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { ipc } from "../lib/ipc";
import type { IndexStats } from "../domain/types";

interface VaultStore {
  root: string | null;
  stats: IndexStats | null;
  /** true while restoring the last vault on launch */
  restoring: boolean;
  error: string | null;

  /** On launch: reopen the last vault if it still exists. */
  init(): Promise<void>;
  /** Show a folder picker, then open the chosen folder as a vault. */
  pickAndOpen(): Promise<void>;
  open(path: string): Promise<void>;
  close(): Promise<void>;
  refreshStats(): Promise<void>;
}

export const useVault = create<VaultStore>((set, get) => ({
  root: null,
  stats: null,
  restoring: true,
  error: null,

  async init() {
    try {
      const last = await ipc.getLastVault();
      if (last) await get().open(last);
    } catch (e) {
      set({ error: String(e) });
    } finally {
      set({ restoring: false });
    }
  },

  async pickAndOpen() {
    const picked = await openDialog({
      directory: true,
      multiple: false,
      title: "Choose (or create) a vault folder",
    });
    if (typeof picked === "string") await get().open(picked);
  },

  async open(path: string) {
    set({ error: null });
    try {
      const info = await ipc.openVault(path);
      set({ root: info.root, stats: info.stats });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  async close() {
    await ipc.closeVault();
    set({ root: null, stats: null });
  },

  async refreshStats() {
    if (!get().root) return;
    try {
      set({ stats: await ipc.indexStats() });
    } catch {
      /* vault may have just closed */
    }
  },
}));
