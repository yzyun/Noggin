// Notes: plain markdown files in notes/. List + edit with preview.
// Deliberately simple in Phase 1 — the vault is the feature, not the editor.

import { useCallback, useEffect, useState } from "react";
import { ipc, type DirEntry } from "../lib/ipc";
import { slugify } from "../domain/title";
import { textPrompt } from "../state/ui";
import { MarkdownField } from "./fields/MarkdownField";
import { Markdown } from "./Markdown";

export function NotesView() {
  const [notes, setNotes] = useState<DirEntry[]>([]);
  const [openRel, setOpenRel] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [dirty, setDirty] = useState(false);
  const [preview, setPreview] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const entries = await ipc.listDir("notes");
      setNotes(entries.filter((e) => !e.is_dir && e.name.endsWith(".md")));
    } catch (e) {
      setError(String(e));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const openNote = async (rel: string) => {
    setText(await ipc.readFile(rel));
    setOpenRel(rel);
    setDirty(false);
    setPreview(false);
  };

  const saveNote = useCallback(async () => {
    if (!openRel) return;
    await ipc.writeFile(openRel, text);
    setDirty(false);
    void refresh();
  }, [openRel, text, refresh]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        void saveNote();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [saveNote]);

  const createNote = async () => {
    const name = await textPrompt({ title: "New note", placeholder: "note name" });
    if (!name?.trim()) return;
    const rel = `notes/${slugify(name.trim(), 60)}.md`;
    await ipc.writeFile(rel, `# ${name.trim()}\n\n`);
    await refresh();
    await openNote(rel);
  };

  const deleteNote = async (rel: string) => {
    if (!confirm(`Delete ${rel}?`)) return;
    await ipc.removeFile(rel);
    if (openRel === rel) setOpenRel(null);
    await refresh();
  };

  return (
    <div className="flex h-full">
      {/* Note list */}
      <div className="w-64 shrink-0 border-r border-edge">
        <div className="flex items-center justify-between border-b border-edge px-3 py-2.5">
          <h2 className="text-sm font-semibold">Notes</h2>
          <button
            onClick={createNote}
            className="rounded-md bg-accent px-2 py-0.5 text-xs font-medium text-on-accent hover:bg-accent-hover"
          >
            + New
          </button>
        </div>
        <ul className="overflow-y-auto p-2">
          {notes.map((n) => (
            <li key={n.rel} className="group flex items-center">
              <button
                onClick={() => openNote(n.rel)}
                className={`flex-1 truncate rounded-md px-2 py-1 text-left text-sm ${
                  openRel === n.rel
                    ? "bg-accent-soft text-accent-text"
                    : "text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
                }`}
              >
                {n.name.replace(/\.md$/, "")}
              </button>
              <button
                onClick={() => deleteNote(n.rel)}
                className="hidden px-1 text-xs text-neutral-400 hover:text-red-600 group-hover:block"
                aria-label={`delete ${n.name}`}
              >
                ×
              </button>
            </li>
          ))}
          {notes.length === 0 && (
            <li className="px-2 py-4 text-center text-xs text-neutral-400">No notes yet</li>
          )}
        </ul>
        {error && <p className="px-3 text-xs text-red-600">{error}</p>}
      </div>

      {/* Editor */}
      <div className="flex min-w-0 flex-1 flex-col">
        {openRel ? (
          <>
            <div className="flex items-center justify-between border-b border-edge px-4 py-2.5">
              <span className="truncate text-sm font-medium">
                {openRel.split("/").pop()?.replace(/\.md$/, "")}
                {dirty && <span className="ml-1 text-neutral-400">•</span>}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPreview((p) => !p)}
                  className="rounded-md border border-edge px-2.5 py-1 text-xs text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
                >
                  {preview ? "Edit" : "Preview"}
                </button>
                <button
                  onClick={saveNote}
                  disabled={!dirty}
                  className="rounded-md bg-accent px-3 py-1 text-xs font-medium text-on-accent hover:bg-accent-hover disabled:opacity-40"
                  title="Cmd/Ctrl+S"
                >
                  Save
                </button>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {preview ? (
                <Markdown text={text} />
              ) : (
                <MarkdownField
                  value={text}
                  onChange={(v) => {
                    setText(v);
                    setDirty(true);
                  }}
                  minHeight="400px"
                />
              )}
            </div>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center text-sm text-neutral-400">
            Select or create a note
          </div>
        )}
      </div>
    </div>
  );
}
