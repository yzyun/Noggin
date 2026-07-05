// Core commands, registered once into the commands registry. The command
// palette (and future keyboard shortcuts / plugins) read from the registry.

import { commands } from "../domain/registries";
import { toggleTheme } from "./theme";
import { useQuestions } from "../state/questions";
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
    id: "go-review",
    title: "Go to Review",
    shortcut: "⌘3",
    run: () => ui().setView("review"),
  });
  commands.register({
    id: "go-import",
    title: "Go to Import",
    shortcut: "⌘4",
    run: () => ui().setView("import"),
  });
  commands.register({
    id: "go-quiz",
    title: "Go to Quiz",
    shortcut: "⌘5",
    run: () => ui().setView("quiz"),
  });
  commands.register({
    id: "toggle-theme",
    title: "Toggle light/dark theme",
    run: () => void toggleTheme(),
  });
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

/** Global shortcut handling (palette itself is opened with ⌘K). */
export function handleGlobalShortcut(e: KeyboardEvent): boolean {
  if (!(e.metaKey || e.ctrlKey)) return false;
  const key = e.key.toLowerCase();
  if (key === "k") {
    useUi.getState().openPalette();
    return true;
  }
  if (key === "n") {
    useUi.getState().requestNewQuestion();
    return true;
  }
  const views = ["questions", "notes", "review", "import", "quiz"] as const;
  const idx = Number(e.key) - 1;
  if (idx >= 0 && idx < views.length && e.key === String(idx + 1)) {
    useUi.getState().setView(views[idx]);
    return true;
  }
  return false;
}
