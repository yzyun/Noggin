// A vault file library: files under one root dir (notes/ or papers/),
// organised into folders like the question bank. Markdown gets edit +
// preview, LaTeX is edited as plain text, PDFs are view-only (embedded
// viewer). Files can be imported; markdown/LaTeX can be authored in-app.
//
// Drag & drop: drop a file onto a folder (or the "All …" row for the root)
// to move it; drag a folder onto another folder to nest it. ⌘/Ctrl+click
// folders to view several subtrees at once.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ipc, type DirEntry } from "../lib/ipc";
import { slugify } from "../domain/title";
import { confirmDialog, textPrompt } from "../state/ui";
import { buildFolderTree, type FolderNode } from "../lib/folderTree";
import { MarkdownField } from "./fields/MarkdownField";
import { Markdown } from "./Markdown";
import { FolderIcon } from "./icons";

interface LibraryConfig {
  /** Vault dir this library lives in ("notes", "papers"). */
  root: string;
  title: string;
  /** Singular noun for UI copy ("note", "paper"). */
  noun: string;
  exts: readonly string[];
  /** Whether files can be authored in-app (markdown/LaTeX); PDFs are import-only. */
  canCreate: boolean;
  importHint: string;
}

const NOTES: LibraryConfig = {
  root: "notes",
  title: "Notes",
  noun: "note",
  exts: ["md", "tex", "pdf"],
  canCreate: true,
  importHint: "Import a .md, .tex or .pdf file",
};

const PAPERS: LibraryConfig = {
  root: "papers",
  title: "Papers",
  noun: "paper",
  exts: ["pdf"],
  canCreate: false,
  importHint: "Import an exam paper or worksheet (.pdf)",
};

export function NotesView() {
  return <FileLibrary cfg={NOTES} />;
}

export function PapersView() {
  return <FileLibrary cfg={PAPERS} />;
}

function inSubtree(fileFolder: string, folder: string): boolean {
  return fileFolder === folder || fileFolder.startsWith(`${folder}/`);
}

const TEX_TEMPLATE = "\\documentclass{article}\n\\begin{document}\n\n\\end{document}\n";

function FileLibrary({ cfg }: { cfg: LibraryConfig }) {
  const DND_FILE = `application/x-noggin-file-${cfg.root}`;
  const DND_DIR = `application/x-noggin-dir-${cfg.root}`;

  const extOf = useCallback(
    (name: string): string | null => {
      const ext = name.split(".").pop()?.toLowerCase();
      return ext && cfg.exts.includes(ext) ? ext : null;
    },
    [cfg],
  );

  /** Folder of a file rel ("<root>/a/b/x.md" → "a/b", root files → ""). */
  const folderOf = useCallback(
    (rel: string) => rel.slice(cfg.root.length + 1).split("/").slice(0, -1).join("/"),
    [cfg],
  );

  const [files, setFiles] = useState<DirEntry[]>([]);
  const [folderDirs, setFolderDirs] = useState<string[]>([]);
  /** Selected folders (empty = all). ⌘/Ctrl+click multi-selects. */
  const [selFolders, setSelFolders] = useState<string[]>([]);
  /** Folder path currently hovered by a drag ("" = the root row). */
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
        ipc.listRecursive(cfg.root),
        ipc.listDirs(cfg.root),
      ]);
      setFiles(
        entries
          .filter((e) => extOf(e.name) !== null)
          .sort((a, b) => a.name.localeCompare(b.name)),
      );
      setFolderDirs(dirs);
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  }, [cfg, extOf]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Real directories (includes empty folders) ∪ folders referenced by files.
  const tree = useMemo(
    () =>
      buildFolderTree([
        ...new Set([...folderDirs, ...files.map((f) => folderOf(f.rel)).filter(Boolean)]),
      ]),
    [folderDirs, files, folderOf],
  );

  const visibleFiles = useMemo(
    () =>
      selFolders.length === 0
        ? files
        : files.filter((f) => selFolders.some((s) => inSubtree(folderOf(f.rel), s))),
    [files, selFolders, folderOf],
  );

  const countIn = useCallback(
    (folder: string) => files.filter((f) => inSubtree(folderOf(f.rel), folder)).length,
    [files, folderOf],
  );

  // Plain click selects one folder (or deselects it); ⌘/Ctrl+click toggles
  // the folder in/out of a multi-selection.
  const clickFolder = (path: string) => (e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey) {
      setSelFolders((sel) =>
        sel.includes(path) ? sel.filter((f) => f !== path) : [...sel, path],
      );
    } else {
      setSelFolders((sel) => (sel.length === 1 && sel[0] === path ? [] : [path]));
    }
  };

  // Revoke the PDF blob URL when it's replaced or the view unmounts.
  useEffect(() => {
    if (!pdfUrl) return;
    return () => URL.revokeObjectURL(pdfUrl);
  }, [pdfUrl]);

  const openFile = async (rel: string) => {
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

  const saveFile = useCallback(async () => {
    if (!openRel || extOf(openRel) === "pdf") return;
    await ipc.writeFile(openRel, text);
    setDirty(false);
    void refresh();
  }, [openRel, text, refresh, extOf]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        void saveFile();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [saveFile]);

  // --- file actions --------------------------------------------------------

  // New/imported files land in the selected folder when exactly one is
  // selected, otherwise at the root.
  const targetDir = selFolders.length === 1 ? `${cfg.root}/${selFolders[0]}` : cfg.root;

  const createFile = async () => {
    const name = await textPrompt({
      title:
        selFolders.length === 1
          ? `New ${cfg.noun} in "${selFolders[0]}"`
          : `New ${cfg.noun}`,
      placeholder: `${cfg.noun} name (add .tex for LaTeX)`,
    });
    if (!name?.trim()) return;
    let base = name.trim();
    const m = /\.(md|tex)$/i.exec(base);
    const ext = m ? (m[1].toLowerCase() as "md" | "tex") : "md";
    if (m) base = base.slice(0, -m[0].length).trim();
    const rel = `${targetDir}/${slugify(base, 60)}.${ext}`;
    await ipc.writeFile(rel, ext === "tex" ? TEX_TEMPLATE : `# ${base}\n\n`);
    await refresh();
    await openFile(rel);
  };

  const importFile = async (f: File) => {
    const ext = extOf(f.name);
    if (!ext) return;
    const base = slugify(f.name.replace(/\.[^.]+$/, ""), 60);
    const taken = new Set(files.map((n) => n.rel));
    let rel = `${targetDir}/${base}.${ext}`;
    for (let i = 2; taken.has(rel); i++) rel = `${targetDir}/${base}-${i}.${ext}`;
    const bytes = Array.from(new Uint8Array(await f.arrayBuffer()));
    await ipc.writeBinary(rel, bytes);
    await refresh();
    await openFile(rel);
  };

  const deleteFile = async (rel: string) => {
    const ok = await confirmDialog({
      title: `Delete "${rel.split("/").pop()}"?`,
      message: "The file will be removed from the vault.",
    });
    if (!ok) return;
    await ipc.removeFile(rel);
    if (openRel === rel) setOpenRel(null);
    await refresh();
  };

  const moveFile = async (rel: string, folder: string) => {
    const to = `${cfg.root}${folder ? `/${folder}` : ""}/${rel.split("/").pop()!}`;
    if (to === rel) return;
    await ipc.renamePath(rel, to);
    if (openRel === rel) setOpenRel(to);
    await refresh();
  };

  // --- folder actions ------------------------------------------------------

  const remapSelection = (from: string, to: string | null) => {
    setSelFolders((sel) =>
      to === null
        ? sel.filter((f) => !inSubtree(f, from))
        : sel.map((f) => (inSubtree(f, from) ? to + f.slice(from.length) : f)),
    );
  };

  const promptCreateFolder = (parent?: string) => {
    void (async () => {
      const name = (
        await textPrompt({
          title: parent ? `New folder inside "${parent}"` : "New folder",
          placeholder: parent ? "subfolder name" : "e.g. physics/waves (nest with /)",
        })
      )?.trim();
      if (!name) return;
      await ipc
        .createDir(`${cfg.root}/${parent ? `${parent}/` : ""}${name.replace(/^\/+|\/+$/g, "")}`)
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
      )
        ?.trim()
        .replace(/^\/+|\/+$/g, "");
      if (!next || next === path) return;
      try {
        await ipc.renamePath(`${cfg.root}/${path}`, `${cfg.root}/${next}`);
      } catch (e) {
        alert(String(e));
        return;
      }
      // Follow the rename if the selection / open file lived inside.
      remapSelection(path, next);
      if (openRel && openRel.startsWith(`${cfg.root}/${path}/`)) {
        setOpenRel(`${cfg.root}/${next}/${openRel.slice(`${cfg.root}/${path}/`.length)}`);
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
          ? `Its ${n} ${cfg.noun}${n > 1 ? "s" : ""} (and any subfolders) move up to the parent — nothing is lost.`
          : "The folder is empty.",
        confirmLabel: "Delete folder",
      });
      if (!ok) return;
      await ipc.deleteFolder(`${cfg.root}/${path}`).catch((e) => alert(String(e)));
      remapSelection(path, null);
      // Contents moved up (possibly renamed on collision) — close the open
      // file if it lived inside rather than guess its new path.
      if (openRel && openRel.startsWith(`${cfg.root}/${path}/`)) setOpenRel(null);
      await refresh();
    })();
  };

  // --- drag & drop ---------------------------------------------------------

  const dragOver = (target: string) => (e: React.DragEvent) => {
    const types = [...e.dataTransfer.types];
    if (types.includes(DND_FILE) || types.includes(DND_DIR)) {
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

    const fileRel = e.dataTransfer.getData(DND_FILE);
    if (fileRel) {
      void moveFile(fileRel, target).catch((err) => alert(String(err)));
      return;
    }

    const src = e.dataTransfer.getData(DND_DIR);
    if (src) {
      // Not into itself or its own subtree.
      if (src === target || target.startsWith(`${src}/`)) return;
      const to = target ? `${target}/${src.split("/").pop()!}` : src.split("/").pop()!;
      if (to === src) return;
      void (async () => {
        await ipc.renamePath(`${cfg.root}/${src}`, `${cfg.root}/${to}`);
        remapSelection(src, to);
        if (openRel && openRel.startsWith(`${cfg.root}/${src}/`)) {
          setOpenRel(`${cfg.root}/${to}/${openRel.slice(`${cfg.root}/${src}/`.length)}`);
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
          e.dataTransfer.setData(DND_DIR, node.path);
          e.dataTransfer.effectAllowed = "move";
        }}
        onDragOver={dragOver(node.path)}
        onDragLeave={() => setDropTarget((t) => (t === node.path ? null : t))}
        onDrop={drop(node.path)}
        className={`group flex w-full items-center gap-1 rounded pr-1 text-xs ${
          dropTarget === node.path
            ? "bg-accent-soft ring-1 ring-accent"
            : selFolders.includes(node.path)
              ? "bg-accent-soft font-medium text-accent-text"
              : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
        }`}
      >
        <button
          onClick={clickFolder(node.path)}
          title="⌘/Ctrl+click to select multiple folders"
          className="flex min-w-0 flex-1 items-center justify-between py-1 text-left"
          style={{ paddingLeft: `${8 + depth * 12}px` }}
        >
          <span className="flex min-w-0 items-center gap-1.5">
            <FolderIcon />
            <span className="truncate">{node.name}</span>
          </span>
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
      {/* Sidebar: folders + file list */}
      <div className="flex w-64 shrink-0 flex-col border-r border-edge">
        <div className="flex items-center justify-between border-b border-edge px-3 py-2.5">
          <h2 className="text-sm font-semibold">{cfg.title}</h2>
          <div className="flex gap-1">
            <button
              onClick={() => fileInput.current?.click()}
              className={`rounded-md px-2 py-0.5 text-xs ${
                cfg.canCreate
                  ? "border border-edge text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
                  : "bg-accent font-medium text-on-accent hover:bg-accent-hover"
              }`}
              title={cfg.importHint}
            >
              Import
            </button>
            {cfg.canCreate && (
              <button
                onClick={createFile}
                className="rounded-md bg-accent px-2 py-0.5 text-xs font-medium text-on-accent hover:bg-accent-hover"
              >
                + New
              </button>
            )}
          </div>
        </div>
        <input
          ref={fileInput}
          type="file"
          accept={cfg.exts.map((e) => `.${e}`).join(",")}
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
              onClick={() => setSelFolders([])}
              onDragOver={dragOver("")}
              onDragLeave={() => setDropTarget((t) => (t === "" ? null : t))}
              onDrop={drop("")}
              className={`flex w-full items-center justify-between rounded px-2 py-1 text-left text-xs ${
                dropTarget === ""
                  ? "bg-accent-soft ring-1 ring-accent"
                  : selFolders.length === 0
                    ? "bg-accent-soft font-medium text-accent-text"
                    : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
              }`}
            >
              <span>All {cfg.noun}s</span>
              <span className="text-neutral-400">{files.length}</span>
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

        {/* File list */}
        <ul className="min-h-0 flex-1 overflow-y-auto p-2">
          {visibleFiles.map((n) => {
            const ext = extOf(n.name);
            const fileFolder = folderOf(n.rel);
            const showExt = ext !== "md" && cfg.exts.length > 1;
            return (
              <li
                key={n.rel}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData(DND_FILE, n.rel);
                  e.dataTransfer.effectAllowed = "move";
                }}
                className="group flex items-center"
              >
                <button
                  onClick={() => openFile(n.rel)}
                  title={n.rel}
                  className={`flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-2 py-1 text-left text-sm ${
                    openRel === n.rel
                      ? "bg-accent-soft text-accent-text"
                      : "text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
                  }`}
                >
                  <span className="truncate">{n.name.replace(/\.[^.]+$/, "")}</span>
                  {showExt && (
                    <span className="shrink-0 rounded bg-neutral-200 px-1 text-[10px] font-medium uppercase text-neutral-600 dark:bg-neutral-700 dark:text-neutral-300">
                      {ext}
                    </span>
                  )}
                  {selFolders.length === 0 && fileFolder && (
                    <span className="shrink-0 max-w-20 truncate text-[10px] text-neutral-400">
                      {fileFolder}
                    </span>
                  )}
                </button>
                <button
                  onClick={() => deleteFile(n.rel)}
                  className="hidden px-1 text-xs text-neutral-400 hover:text-red-600 group-hover:block"
                  aria-label={`delete ${n.name}`}
                >
                  ×
                </button>
              </li>
            );
          })}
          {visibleFiles.length === 0 && (
            <li className="px-2 py-4 text-center text-xs text-neutral-400">
              {selFolders.length
                ? `No ${cfg.noun}s in the selected folder${selFolders.length > 1 ? "s" : ""}`
                : `No ${cfg.noun}s yet`}
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
                    onClick={saveFile}
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
            {cfg.canCreate
              ? `Select or create a ${cfg.noun}`
              : `Select a ${cfg.noun}, or use Import to add one`}
          </div>
        )}
      </div>
    </div>
  );
}
