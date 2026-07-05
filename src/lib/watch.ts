// Live sync: the Rust watcher emits `vault:changed` with the affected
// absolute paths whenever anything in the vault changes (including edits
// made in other apps, or scraped files dropped in). We debounce and rescan.

import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useQuestions } from "../state/questions";

const DEBOUNCE_MS = 600;

export async function startVaultWatch(): Promise<UnlistenFn> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let questionsChanged = false;

  const unlisten = await listen<string[]>("vault:changed", (event) => {
    if (event.payload.some((p) => p.includes("/questions/"))) {
      questionsChanged = true;
    }
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      if (questionsChanged) {
        questionsChanged = false;
        void useQuestions.getState().rescan();
      }
    }, DEBOUNCE_MS);
  });

  return () => {
    if (timer) clearTimeout(timer);
    unlisten();
  };
}
