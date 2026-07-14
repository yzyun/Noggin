// Core commands, registered once into the commands registry. The command
// palette (and future keyboard shortcuts / plugins) read from the registry.

import { commands } from "../domain/registries";
import { THEMES } from "./theme";
import { useQuestions } from "../state/questions";
import { useSettings } from "../state/settings";
import { useUi } from "../state/ui";
import { useVault } from "../state/vault";

let registered = false;

export function registerCoreCommands(): void {
  if (registered) return;
  registered = true;

  const ui = () => useUi.getState();

  commands.register({
    id: "new-question",
    title: "New question",
    shortcut: "⌘N",
    run: () => ui().requestNewQuestion(),
  });
  commands.register({
    id: "search-questions",
    title: "Search questions…",
    shortcut: "⌘P",
    run: () => ui().openQuickSearch(),
  });
  commands.register({
    id: "go-questions",
    title: "Go to Questions",
    shortcut: "⌘1",
    run: () => ui().setView("questions"),
  });
  commands.register({
    id: "go-notes",
    title: "Go to Notes",
    shortcut: "⌘2",
    run: () => ui().setView("notes"),
  });
  commands.register({
    id: "go-papers",
    title: "Go to Papers",
    shortcut: "⌘3",
    run: () => ui().setView("papers"),
  });
  commands.register({
    id: "go-review",
    title: "Go to Review",
    shortcut: "⌘4",
    run: () => ui().setView("review"),
  });
  commands.register({
    id: "go-quiz",
    title: "Go to Quiz",
    shortcut: "⌘5",
    run: () => ui().setView("quiz"),
  });
  commands.register({
    id: "go-import",
    title: "Go to Import",
    shortcut: "⌘6",
    run: () => ui().setView("import"),
  });
  commands.register({
    id: "go-settings",
    title: "Go to Settings",
    shortcut: "⌘7",
    run: () => ui().setView("settings"),
  });
  for (const theme of THEMES) {
    commands.register({
      id: `theme-${theme.id}`,
      title: `Theme: ${theme.label}`,
      // Through the settings store so config.json stays in sync.
      run: () => useSettings.getState().update({ theme: theme.id }),
    });
  }
  commands.register({
    id: "rescan-vault",
    title: "Rescan vault (re-index files)",
    run: () => void useQuestions.getState().rescan(),
  });
  commands.register({
    id: "switch-vault",
    title: "Switch vault…",
    run: () => void useVault.getState().close(),
  });
}

/** Global shortcut handling (⌘K palette, ⌘P search, ⌘N, ⌘1–7). */
export function handleGlobalShortcut(e: KeyboardEvent): boolean {
  if (!(e.metaKey || e.ctrlKey)) return false;
  const key = e.key.toLowerCase();
  if (key === "k") {
    useUi.getState().openPalette();
    return true;
  }
  if (key === "p") {
    // Also swallows the webview's print dialog.
    useUi.getState().openQuickSearch();
    return true;
  }
  if (key === "n") {
    useUi.getState().requestNewQuestion();
    return true;
  }
  const views = ["questions", "notes", "papers", "review", "quiz", "import", "settings"] as const;
  const idx = Number(e.key) - 1;
  if (idx >= 0 && idx < views.length && e.key === String(idx + 1)) {
    useUi.getState().setView(views[idx]);
    return true;
  }
  return false;
}
