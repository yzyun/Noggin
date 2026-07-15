// Main app layout once a vault is open: sidebar navigation + content area.

import { useEffect } from "react";
import { useVault } from "../state/vault";
import { useQuestions } from "../state/questions";
import { useSettings } from "../state/settings";
import { useUi, type View } from "../state/ui";
import { startVaultWatch } from "../lib/watch";
import { handleGlobalShortcut, registerCoreCommands } from "../lib/commands";
import { CommandPalette } from "./CommandPalette";
import { QuickSearch } from "./QuickSearch";
import { PromptDialog } from "./PromptDialog";
import { ConfirmDialog } from "./ConfirmDialog";
import { QuestionsView } from "./QuestionsView";
import { NotesView, PapersView } from "./FileLibrary";
import { ReviewView } from "./ReviewView";
import { ImportView } from "./ImportView";
import { QuizView } from "./QuizView";
import { SettingsView } from "./SettingsView";

const NAV: { id: View; label: string }[] = [
  { id: "questions", label: "Questions" },
  { id: "notes", label: "Notes" },
  { id: "papers", label: "Papers" },
  { id: "review", label: "Review" },
  { id: "quiz", label: "Quiz" },
  { id: "import", label: "Import" },
];

export function Shell() {
  const { root, stats, close } = useVault();
  const { view, setView } = useUi();

  // On vault open: reconcile the index with the files on disk, then keep
  // it live via the folder watcher (catches external edits & drops).
  useEffect(() => {
    if (!root) return;
    registerCoreCommands();
    void useSettings.getState().load();
    void useQuestions.getState().rescan();
    let cleanup: (() => void) | undefined;
    void startVaultWatch().then((fn) => {
      cleanup = fn;
    });
    return () => cleanup?.();
  }, [root]);

  // Global shortcuts (⌘K palette, ⌘P search, ⌘N, ⌘, settings, ⌘1–6).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (handleGlobalShortcut(e)) e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const vaultName = root?.split("/").filter(Boolean).pop() ?? "";

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <aside className="flex w-56 shrink-0 flex-col border-r border-edge bg-sidebar">
        <div className="border-b border-edge px-4 py-3">
          <div className="truncate text-sm font-semibold" title={root ?? ""}>
            {vaultName}
          </div>
          <div className="text-xs text-neutral-500 dark:text-neutral-400">
            {stats ? `${stats.questions} questions · ${stats.reviews} reviews` : "…"}
          </div>
        </div>

        <nav className="flex-1 space-y-0.5 p-2">
          {NAV.map((item, i) => (
            <button
              key={item.id}
              onClick={() => setView(item.id)}
              className={`flex w-full items-center justify-between rounded-md px-3 py-1.5 text-left text-sm transition ${
                view === item.id
                  ? "bg-accent-soft font-medium text-accent-text"
                  : "text-neutral-700 hover:bg-neutral-200/60 dark:text-neutral-300 dark:hover:bg-neutral-800"
              }`}
            >
              {item.label}
              <span className="text-[10px] text-neutral-400">⌘{i + 1}</span>
            </button>
          ))}
        </nav>

        <div className="space-y-1 border-t border-edge p-2">
          <button
            onClick={() => useUi.getState().openQuickSearch()}
            className="flex w-full items-center justify-between rounded-md px-3 py-1.5 text-left text-sm text-neutral-600 hover:bg-neutral-200/60 dark:text-neutral-400 dark:hover:bg-neutral-800"
          >
            Search <span className="text-[10px] text-neutral-400">⌘P</span>
          </button>
          <button
            onClick={() => useUi.getState().openPalette()}
            className="flex w-full items-center justify-between rounded-md px-3 py-1.5 text-left text-sm text-neutral-600 hover:bg-neutral-200/60 dark:text-neutral-400 dark:hover:bg-neutral-800"
          >
            Commands <span className="text-[10px] text-neutral-400">⌘K</span>
          </button>
          <button
            onClick={() => setView("settings")}
            className={`flex w-full items-center justify-between rounded-md px-3 py-1.5 text-left text-sm ${
              view === "settings"
                ? "bg-accent-soft font-medium text-accent-text"
                : "text-neutral-600 hover:bg-neutral-200/60 dark:text-neutral-400 dark:hover:bg-neutral-800"
            }`}
          >
            Settings <span className="text-[10px] text-neutral-400">⌘,</span>
          </button>
          <button
            onClick={close}
            className="w-full rounded-md px-3 py-1.5 text-left text-sm text-neutral-600 hover:bg-neutral-200/60 dark:text-neutral-400 dark:hover:bg-neutral-800"
          >
            Switch vault…
          </button>
        </div>
      </aside>

      {/* Content */}
      <main className="min-w-0 flex-1 overflow-hidden">
        {view === "questions" ? (
          <QuestionsView />
        ) : view === "notes" ? (
          <NotesView />
        ) : view === "papers" ? (
          <PapersView />
        ) : view === "review" ? (
          <ReviewView />
        ) : view === "import" ? (
          <ImportView />
        ) : view === "settings" ? (
          <SettingsView />
        ) : (
          <QuizView />
        )}
      </main>

      <CommandPalette />
      <QuickSearch />
      <PromptDialog />
      <ConfirmDialog />
    </div>
  );
}
