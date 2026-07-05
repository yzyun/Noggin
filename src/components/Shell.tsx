// Main app layout once a vault is open: sidebar navigation + content area.
// Phase 0: the sections are placeholders; each later phase fills one in.

import { useState } from "react";
import { useVault } from "../state/vault";
import { toggleTheme } from "../lib/theme";
import { QuestionsView } from "./QuestionsView";
import { NotesView } from "./NotesView";

const NAV = [
  { id: "questions", label: "Questions", hint: "Browse & edit (Phase 1–2)" },
  { id: "notes", label: "Notes", hint: "Markdown notes (Phase 1)" },
  { id: "review", label: "Review", hint: "Spaced repetition (Phase 3)" },
  { id: "import", label: "Import", hint: "CSV / Excel / JSON (Phase 4)" },
] as const;

type NavId = (typeof NAV)[number]["id"];

export function Shell() {
  const { root, stats, close } = useVault();
  const [active, setActive] = useState<NavId>("questions");
  const [, rerender] = useState(0);

  const vaultName = root?.split("/").filter(Boolean).pop() ?? "";

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <aside className="flex w-56 shrink-0 flex-col border-r border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900">
        <div className="border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
          <div className="truncate text-sm font-semibold" title={root ?? ""}>
            {vaultName}
          </div>
          <div className="text-xs text-neutral-500 dark:text-neutral-400">
            {stats ? `${stats.questions} questions · ${stats.reviews} reviews` : "…"}
          </div>
        </div>

        <nav className="flex-1 space-y-0.5 p-2">
          {NAV.map((item) => (
            <button
              key={item.id}
              onClick={() => setActive(item.id)}
              className={`w-full rounded-md px-3 py-1.5 text-left text-sm transition ${
                active === item.id
                  ? "bg-blue-100 font-medium text-blue-900 dark:bg-blue-950 dark:text-blue-200"
                  : "text-neutral-700 hover:bg-neutral-200/60 dark:text-neutral-300 dark:hover:bg-neutral-800"
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="space-y-1 border-t border-neutral-200 p-2 dark:border-neutral-800">
          <button
            onClick={() => {
              toggleTheme();
              rerender((n) => n + 1);
            }}
            className="w-full rounded-md px-3 py-1.5 text-left text-sm text-neutral-600 hover:bg-neutral-200/60 dark:text-neutral-400 dark:hover:bg-neutral-800"
          >
            Toggle theme
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
        {active === "questions" ? (
          <QuestionsView />
        ) : active === "notes" ? (
          <NotesView />
        ) : (
          <div className="flex h-full items-center justify-center">
            {NAV.filter((n) => n.id === active).map((n) => (
              <div key={n.id} className="text-center">
                <h2 className="text-xl font-semibold">{n.label}</h2>
                <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">{n.hint}</p>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
