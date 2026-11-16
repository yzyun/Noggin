// Main app layout once a vault is open: sidebar navigation + content area.

import { useEffect, type ReactNode } from "react";
import { useVault } from "../state/vault";
import { useQuestions } from "../state/questions";
import { useReview } from "../state/review";
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
import { ProgressView } from "./ProgressView";
import { ImportView } from "./ImportView";
import { QuizView } from "./QuizView";
import { SettingsView } from "./SettingsView";
import {
  Logo,
  ImportIcon,
  NoteIcon,
  PaperIcon,
  PlusIcon,
  ProgressIcon,
  QuestionIcon,
  QuizIcon,
  ReviewIcon,
  SearchIcon,
  SettingsIcon,
  SwapIcon,
} from "./icons";

interface NavItem {
  id: View;
  label: string;
  shortcut: string;
  icon: ReactNode;
}

// Study first, library second — the order ⌘1–⌘6 follow (lib/commands.ts).
const STUDY: NavItem[] = [
  { id: "review", label: "Review", shortcut: "⌘1", icon: <ReviewIcon /> },
  { id: "progress", label: "Progress", shortcut: "⌘7", icon: <ProgressIcon /> },
  { id: "quiz", label: "Quiz", shortcut: "⌘5", icon: <QuizIcon /> },
];
const LIBRARY: NavItem[] = [
  { id: "questions", label: "Questions", shortcut: "⌘2", icon: <QuestionIcon /> },
  { id: "notes", label: "Notes", shortcut: "⌘3", icon: <NoteIcon /> },
  { id: "papers", label: "Papers", shortcut: "⌘4", icon: <PaperIcon /> },
];
const FOOTER: NavItem[] = [
  { id: "import", label: "Import", shortcut: "⌘6", icon: <ImportIcon /> },
  { id: "settings", label: "Settings", shortcut: "⌘,", icon: <SettingsIcon /> },
];

const ROW =
  "group flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors";
const ROW_IDLE =
  "text-neutral-600 hover:bg-neutral-200/60 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100";
const ROW_ACTIVE = "bg-accent-soft font-medium text-accent-text";

function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="ml-auto font-sans text-[11px] text-neutral-400 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
      {children}
    </kbd>
  );
}

function NavRow({ item, badge }: { item: NavItem; badge?: ReactNode }) {
  const active = useUi((s) => s.view === item.id);
  return (
    <button
      onClick={() => useUi.getState().setView(item.id)}
      aria-current={active ? "page" : undefined}
      className={`${ROW} ${active ? ROW_ACTIVE : ROW_IDLE}`}
    >
      {item.icon}
      {item.label}
      {badge ?? <Kbd>{item.shortcut}</Kbd>}
    </button>
  );
}

function GroupLabel({ children }: { children: ReactNode }) {
  return (
    <div className="px-2.5 pt-4 pb-1 text-[11px] font-medium tracking-wider text-neutral-400 uppercase">
      {children}
    </div>
  );
}

export function Shell() {
  const { root, stats, close } = useVault();
  const view = useUi((s) => s.view);
  const focusMode = useUi((s) => s.focusMode);
  const bankSize = useQuestions((s) => s.allRows.length);
  const review = useReview((s) => s.stats);

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

  // Keep the sidebar's due badge honest: on navigation, when the bank
  // changes, and once a minute (cards come due while the app sits open).
  useEffect(() => {
    void useReview.getState().refresh();
    const timer = setInterval(() => void useReview.getState().refresh(), 60_000);
    return () => clearInterval(timer);
  }, [view, bankSize, focusMode]);

  // Global shortcuts (⌘K palette, ⌘P search, ⌘N, ⌘, settings, ⌘1–7).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (handleGlobalShortcut(e)) e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const vaultName = root?.split("/").filter(Boolean).pop() ?? "";
  const due = review?.due_now ?? 0;

  return (
    <div className="flex h-full">
      {!focusMode && (
        <aside className="flex w-60 shrink-0 flex-col border-r border-edge bg-sidebar">
          {/* Vault */}
          <div className="flex items-center gap-2.5 px-4 pt-4 pb-3" title={root ?? ""}>
            <Logo />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm leading-tight font-semibold">{vaultName}</div>
              <div className="text-xs text-neutral-500 dark:text-neutral-400">
                {stats ? `${stats.questions} questions` : "…"}
              </div>
            </div>
            <button
              onClick={close}
              title="Switch vault…"
              aria-label="Switch vault"
              className="rounded-md p-1 text-neutral-400 hover:bg-neutral-200/60 hover:text-neutral-800 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
            >
              <SwapIcon />
            </button>
          </div>

          {/* Search + create */}
          <div className="space-y-1.5 px-2">
            <button
              onClick={() => useUi.getState().openQuickSearch()}
              className="group flex w-full items-center gap-2 rounded-md border border-edge bg-surface px-2.5 py-1.5 text-left text-sm text-neutral-400 transition-colors hover:border-neutral-300 dark:hover:border-neutral-600"
            >
              <SearchIcon className="h-3.5 w-3.5 shrink-0" />
              Search
              <kbd className="ml-auto font-sans text-[11px]">⌘P</kbd>
            </button>
            <button
              onClick={() => useUi.getState().requestNewQuestion()}
              className={`${ROW} ${ROW_IDLE}`}
            >
              <PlusIcon />
              New question
              <Kbd>⌘N</Kbd>
            </button>
          </div>

          <nav className="flex-1 overflow-y-auto px-2">
            <GroupLabel>Study</GroupLabel>
            <div className="space-y-0.5">
              <NavRow
                item={STUDY[0]}
                badge={
                  due > 0 ? (
                    <span
                      className="ml-auto rounded-full bg-accent px-1.5 text-[11px] leading-[18px] font-semibold text-on-accent tabular-nums"
                      title={`${due} card${due === 1 ? "" : "s"} due now`}
                    >
                      {due}
                    </span>
                  ) : undefined
                }
              />
              <NavRow item={STUDY[1]} />
              <NavRow item={STUDY[2]} />
            </div>

            <GroupLabel>Library</GroupLabel>
            <div className="space-y-0.5">
              {LIBRARY.map((item) => (
                <NavRow key={item.id} item={item} />
              ))}
            </div>
          </nav>

          <div className="space-y-0.5 border-t border-edge p-2">
            {FOOTER.map((item) => (
              <NavRow key={item.id} item={item} />
            ))}
            <button
              onClick={() => useUi.getState().openPalette()}
              className={`${ROW} ${ROW_IDLE}`}
            >
              <span className="flex h-4 w-4 shrink-0 items-center justify-center text-[13px]">
                ⌘
              </span>
              Commands
              <Kbd>⌘K</Kbd>
            </button>
          </div>
        </aside>
      )}

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
        ) : view === "progress" ? (
          <ProgressView />
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
