// Notes: markdown, LaTeX and PDF files under notes/, organised into
// folders like the question bank. Markdown gets edit + preview, LaTeX is
// edited as plain text, PDFs are view-only (embedded viewer).
//
// Drag & drop: drop a note onto a folder (or "All notes" for the root) to
// move it; drag a folder onto another folder to nest it.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ipc, type DirEntry } from "../lib/ipc";
import { slugify } from "../domain/title";
import { confirmDialog, textPrompt } from "../state/ui";
import { buildFolderTree, type FolderNode } from "../lib/folderTree";
import { MarkdownField } from "./fields/MarkdownField";
import { Markdown } from "./Markdown";

const DND_NOTE = "application/x-noggin-note";
const DND_NOTE_FOLDER = "application/x-noggin-note-folder";

const NOTE_EXTS = ["md", "tex", "pdf"] as const;
type NoteExt = (typeof NOTE_EXTS)[number];

function extOf(name: string): NoteExt | null {
  const ext = name.split(".").pop()?.toLowerCase();
  return (NOTE_EXTS as readonly string[]).includes(ext ?? "") ? (ext as NoteExt) : null;
}

/** Folder of a note rel ("notes/a/b/x.md" → "a/b", root notes → ""). */
function folderOf(rel: string): string {
  return rel.replace(/^notes\//, "").split("/").slice(0, -1).join("/");
}

function inSubtree(noteFolder: string, folder: string): boolean {
  return noteFolder === folder || noteFolder.startsWith(`${folder}/`);
}

const TEX_TEMPLATE = "\\documentclass{article}\n\\begin{document}\n\n\\end{document}\n";

export function NotesView() {
  const [notes, setNotes] = useState<DirEntry[]>([]);
  const [folderDirs, setFolderDirs] = useState<string[]>([]);
  /** Selected folder (null = all notes). */
  const [selFolder, setSelFolder] = useState<string | null>(null);
  /** Folder path currently hovered by a drag ("" = the All-notes root). */
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [openRel, setOpenRel] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [preview, setPreview] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const openExt = openRel ? extOf(openRel) : null;

  const refresh = useCallback(async () => {
    try {
      const [entries, dirs] = await Promise.all([
        ipc.listRecursive("notes"),
        ipc.listDirs("notes"),
      ]);
      setNotes(
        entries
          .filter((e) => extOf(e.name) !== null)
          .sort((a, b) => a.name.localeCompare(b.name)),
      );
      setFolderDirs(dirs);
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Real directories (includes empty folders) ∪ folders referenced by notes.
  const tree = useMemo(
    () =>
      buildFolderTree([
        ...new Set([...folderDirs, ...notes.map((n) => folderOf(n.rel)).filter(Boolean)]),
      ]),
    [folderDirs, notes],
  );

  const visibleNotes = useMemo(
    () => (selFolder === null ? notes : notes.filter((n) => inSubtree(folderOf(n.rel), selFolder))),
    [notes, selFolder],
  );

  const countIn = useCallback(
    (folder: string) => notes.filter((n) => inSubtree(folderOf(n.rel), folder)).length,
    [notes],
  );

  // Revoke the PDF blob URL when it's replaced or the view unmounts.
  useEffect(() => {
    if (!pdfUrl) return;
    return () => URL.revokeObjectURL(pdfUrl);
  }, [pdfUrl]);

  const openNote = async (rel: string) => {
    if (extOf(rel) === "pdf") {
      const bytes = await ipc.readBinary(rel);
      const blob = new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
      setPdfUrl(URL.createObjectURL(blob));
      setText("");
    } else {
      setText(await ipc.readFile(rel));
      setPdfUrl(null);
    }
    setOpenRel(rel);
    setDirty(false);
    setPreview(false);
  };

  const saveNote = useCallback(async () => {
    if (!openRel || extOf(openRel) === "pdf") return;
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

  // --- note actions --------------------------------------------------------

  const notesDir = selFolder ? `notes/${selFolder}` : "notes";

  const createNote = async () => {
    const name = await textPrompt({
      title: selFolder ? `New note in "${selFolder}"` : "New note",
      placeholder: "note name (add .tex for LaTeX)",
    });
    if (!name?.trim()) return;
    let base = name.trim();
    const m = /\.(md|tex)$/i.exec(base);
    const ext = m ? (m[1].toLowerCase() as "md" | "tex") : "md";
    if (m) base = base.slice(0, -m[0].length).trim();
    const rel = `${notesDir}/${slugify(base, 60)}.${ext}`;
    await ipc.writeFile(rel, ext === "tex" ? TEX_TEMPLATE : `# ${base}\n\n`);
    await refresh();
    await openNote(rel);
  };

  const importFile = async (f: File) => {
    const ext = extOf(f.name);
    if (!ext) return;
    const base = slugify(f.name.replace(/\.[^.]+$/, ""), 60);
    const taken = new Set(notes.map((n) => n.rel));
    let rel = `${notesDir}/${base}.${ext}`;
    for (let i = 2; taken.has(rel); i++) rel = `${notesDir}/${base}-${i}.${ext}`;
    const bytes = Array.from(new Uint8Array(await f.arrayBuffer()));
    await ipc.writeBinary(rel, bytes);
    await refresh();
    await openNote(rel);
  };

  const deleteNote = async (rel: string) => {
    const ok = await confirmDialog({
      title: `Delete "${rel.split("/").pop()}"?`,
      message: "The file will be removed from the vault.",
    });
    if (!ok) return;
    await ipc.removeFile(rel);
    if (openRel === rel) setOpenRel(null);
    await refresh();
  };

  const moveNote = async (rel: string, folder: string) => {
    const to = `notes${folder ? `/${folder}` : ""}/${rel.split("/").pop()!}`;
    if (to === rel) return;
    await ipc.renamePath(rel, to);
    if (openRel === rel) setOpenRel(to);
    await refresh();
  };

  // --- folder actions ------------------------------------------------------

  const promptCreateFolder = (parent?: string) => {
    void (async () => {
      const name = (
        await textPrompt({
          title: parent ? `New folder inside "${parent}"` : "New folder",
          placeholder: parent ? "subfolder name" : "e.g. physics/waves (nest with /)",
        })
      )?.trim();
      if (!name) return;
      await ipc.createDir(`notes/${parent ? `${parent}/` : ""}${name.replace(/^\/+|\/+$/g, "")}`)
        .catch((e) => alert(String(e)));
      await refresh();
    })();
  };

  const promptRenameFolder = (path: string) => {
    void (async () => {
      const next = (
        await textPrompt({
          title: "Rename / move folder (edit the full path to move it)",
          initial: path,
        })
      )?.trim().replace(/^\/+|\/+$/g, "");
      if (!next || next === path) return;
      try {
        await ipc.renamePath(`notes/${path}`, `notes/${next}`);
      } catch (e) {
        alert(String(e));
        return;
      }
      // Follow the rename if the selection / open note lived inside.
      if (selFolder && inSubtree(selFolder, path)) {
        setSelFolder(next + selFolder.slice(path.length));
      }
      if (openRel && openRel.startsWith(`notes/${path}/`)) {
        setOpenRel(`notes/${next}/${openRel.slice(`notes/${path}/`.length)}`);
      }
      await refresh();
    })();
  };

  const confirmDeleteFolder = (path: string) => {
    void (async () => {
      const n = countIn(path);
      const ok = await confirmDialog({
        title: `Delete folder "${path}"?`,
        message: n
          ? `Its ${n} note${n > 1 ? "s" : ""} (and any subfolders) move up to the parent — nothing is lost.`
          : "The folder is empty.",
        confirmLabel: "Delete folder",
      });
      if (!ok) return;
      await ipc.deleteFolder(`notes/${path}`).catch((e) => alert(String(e)));
      if (selFolder && inSubtree(selFolder, path)) setSelFolder(null);
      // Contents moved up (possibly renamed on collision) — close the open
      // note if it lived inside rather than guess its new path.
      if (openRel && openRel.startsWith(`notes/${path}/`)) setOpenRel(null);
      await refresh();
    })();
  };

  // --- drag & drop ---------------------------------------------------------

  const dragOver = (target: string) => (e: React.DragEvent) => {
    const types = [...e.dataTransfer.types];
    if (types.includes(DND_NOTE) || types.includes(DND_NOTE_FOLDER)) {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = "move";
      if (dropTarget !== target) setDropTarget(target);
    }
  };

  const drop = (target: string) => (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDropTarget(null);

    const noteRel = e.dataTransfer.getData(DND_NOTE);
    if (noteRel) {
      void moveNote(noteRel, target).catch((err) => alert(String(err)));
      return;
    }

    const src = e.dataTransfer.getData(DND_NOTE_FOLDER);
    if (src) {
      // Not into itself or its own subtree.
      if (src === target || target.startsWith(`${src}/`)) return;
      const to = target ? `${target}/${src.split("/").pop()!}` : src.split("/").pop()!;
      if (to === src) return;
      void (async () => {
        await ipc.renamePath(`notes/${src}`, `notes/${to}`);
        if (selFolder && inSubtree(selFolder, src)) {
          setSelFolder(to + selFolder.slice(src.length));
        }
        if (openRel && openRel.startsWith(`notes/${src}/`)) {
          setOpenRel(`notes/${to}/${openRel.slice(`notes/${src}/`.length)}`);
        }
        await refresh();
      })().catch((err) => alert(String(err)));
    }
  };

  const FolderRow = ({ node, depth }: { node: FolderNode; depth: number }) => (
    <>
      <div
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData(DND_NOTE_FOLDER, node.path);
          e.dataTransfer.effectAllowed = "move";
        }}
        onDragOver={dragOver(node.path)}
        onDragLeave={() => setDropTarget((t) => (t === node.path ? null : t))}
        onDrop={drop(node.path)}
        className={`group flex w-full items-center gap-1 rounded pr-1 text-xs ${
          dropTarget === node.path
            ? "bg-accent-soft ring-1 ring-accent"
            : selFolder === node.path
              ? "bg-accent-soft font-medium text-accent-text"
              : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
        }`}
      >
        <button
          onClick={() => setSelFolder((f) => (f === node.path ? null : node.path))}
          className="flex min-w-0 flex-1 items-center justify-between py-1 text-left"
          style={{ paddingLeft: `${8 + depth * 12}px` }}
        >
          <span className="truncate">📁 {node.name}</span>
          <span className="pl-1 text-neutral-400 group-hover:hidden">{countIn(node.path)}</span>
        </button>
        <span className="hidden shrink-0 gap-0.5 group-hover:flex">
          <button
            onClick={() => promptCreateFolder(node.path)}
            title="New subfolder"
            className="rounded px-1 text-neutral-400 hover:text-accent"
          >
            +
          </button>
          <button
            onClick={() => promptRenameFolder(node.path)}
            title="Rename / move"
            className="rounded px-1 text-neutral-400 hover:text-accent"
          >
            ✎
          </button>
          <button
            onClick={() => confirmDeleteFolder(node.path)}
            title="Delete folder"
            className="rounded px-1 text-neutral-400 hover:text-red-600"
          >
            ×
          </button>
        </span>
      </div>
      {node.children.map((c) => (
        <FolderRow key={c.path} node={c} depth={depth + 1} />
      ))}
    </>
  );

  const openName = openRel?.split("/").pop() ?? "";

  return (
    <div className="flex h-full">
      {/* Sidebar: folders + note list */}
      <div className="flex w-64 shrink-0 flex-col border-r border-edge">
        <div className="flex items-center justify-between border-b border-edge px-3 py-2.5">
          <h2 className="text-sm font-semibold">Notes</h2>
          <div className="flex gap-1">
            <button
              onClick={() => fileInput.current?.click()}
              className="rounded-md border border-edge px-2 py-0.5 text-xs text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
              title="Import a .md, .tex or .pdf file"
            >
              Import
            </button>
            <button
              onClick={createNote}
              className="rounded-md bg-accent px-2 py-0.5 text-xs font-medium text-on-accent hover:bg-accent-hover"
            >
              + New
            </button>
          </div>
        </div>
        <input
          ref={fileInput}
          type="file"
          accept=".md,.tex,.pdf"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void importFile(f);
            e.target.value = "";
          }}
        />

        {/* Folder tree */}
        <div className="border-b border-edge px-2 py-2">
          <div className="mb-1 flex items-center justify-between px-1">
            <span className="text-xs font-medium uppercase tracking-wide text-neutral-400">
              Folders
            </span>
            <button
              onClick={() => promptCreateFolder()}
              title="New folder"
              className="rounded border border-edge px-1.5 text-xs text-neutral-500 hover:bg-neutral-100 hover:text-accent dark:hover:bg-neutral-800"
            >
              +
            </button>
          </div>
          <div className="max-h-48 overflow-y-auto">
            <button
              onClick={() => setSelFolder(null)}
              onDragOver={dragOver("")}
              onDragLeave={() => setDropTarget((t) => (t === "" ? null : t))}
              onDrop={drop("")}
              className={`flex w-full items-center justify-between rounded px-2 py-1 text-left text-xs ${
                dropTarget === ""
                  ? "bg-accent-soft ring-1 ring-accent"
                  : selFolder === null
                    ? "bg-accent-soft font-medium text-accent-text"
                    : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
              }`}
            >
              <span>All notes</span>
              <span className="text-neutral-400">{notes.length}</span>
            </button>
            {tree.map((n) => (
              <FolderRow key={n.path} node={n} depth={0} />
            ))}
            {tree.length === 0 && (
              <p className="px-2 py-2 text-center text-xs text-neutral-400">
                No folders yet — create one with +
              </p>
            )}
          </div>
        </div>

        {/* Note list */}
        <ul className="min-h-0 flex-1 overflow-y-auto p-2">
          {visibleNotes.map((n) => {
            const ext = extOf(n.name);
            const noteFolder = folderOf(n.rel);
            return (
              <li
                key={n.rel}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData(DND_NOTE, n.rel);
                  e.dataTransfer.effectAllowed = "move";
                }}
                className="group flex items-center"
              >
                <button
                  onClick={() => openNote(n.rel)}
                  title={n.rel}
                  className={`flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-2 py-1 text-left text-sm ${
                    openRel === n.rel
                      ? "bg-accent-soft text-accent-text"
                      : "text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
                  }`}
                >
                  <span className="truncate">{n.name.replace(/\.[^.]+$/, "")}</span>
                  {ext !== "md" && (
                    <span className="shrink-0 rounded bg-neutral-200 px-1 text-[10px] font-medium uppercase text-neutral-600 dark:bg-neutral-700 dark:text-neutral-300">
                      {ext}
                    </span>
                  )}
                  {selFolder === null && noteFolder && (
                    <span className="shrink-0 max-w-20 truncate text-[10px] text-neutral-400">
                      {noteFolder}
                    </span>
                  )}
                </button>
                <button
                  onClick={() => deleteNote(n.rel)}
                  className="hidden px-1 text-xs text-neutral-400 hover:text-red-600 group-hover:block"
                  aria-label={`delete ${n.name}`}
                >
                  ×
                </button>
              </li>
            );
          })}
          {visibleNotes.length === 0 && (
            <li className="px-2 py-4 text-center text-xs text-neutral-400">
              {selFolder ? "No notes in this folder" : "No notes yet"}
            </li>
          )}
        </ul>
        {error && <p className="px-3 pb-2 text-xs text-red-600">{error}</p>}
      </div>

      {/* Editor / viewer */}
      <div className="flex min-w-0 flex-1 flex-col">
        {openRel ? (
          <>
            <div className="flex items-center justify-between border-b border-edge px-4 py-2.5">
              <span className="truncate text-sm font-medium">
                {openExt === "md" ? openName.replace(/\.md$/, "") : openName}
                {dirty && <span className="ml-1 text-neutral-400">•</span>}
              </span>
              {openExt !== "pdf" && (
                <div className="flex gap-2">
                  {openExt === "md" && (
                    <button
                      onClick={() => setPreview((p) => !p)}
                      className="rounded-md border border-edge px-2.5 py-1 text-xs text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
                    >
                      {preview ? "Edit" : "Preview"}
                    </button>
                  )}
                  <button
                    onClick={saveNote}
                    disabled={!dirty}
                    className="rounded-md bg-accent px-3 py-1 text-xs font-medium text-on-accent hover:bg-accent-hover disabled:opacity-40"
                    title="Cmd/Ctrl+S"
                  >
                    Save
                  </button>
                </div>
              )}
            </div>
            {openExt === "pdf" ? (
              <div className="min-h-0 flex-1">
                {pdfUrl && <iframe src={pdfUrl} title={openName} className="h-full w-full" />}
              </div>
            ) : (
              <div className="min-h-0 flex-1 overflow-y-auto p-4">
                {preview && openExt === "md" ? (
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
            )}
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
