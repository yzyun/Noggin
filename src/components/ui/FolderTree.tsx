// Shared folder tree: selection (⌘/Ctrl multi-select), drag & drop of items
// onto folders and folders onto folders, and hover create/rename/delete
// actions. Used by the question bank filter and the Notes/Papers libraries —
// they differ only in DnD payloads, counts, and what the mutations do.

import { useState } from "react";
import type { FolderNode } from "../../lib/folderTree";
import { FolderIcon } from "../icons";
import { EmptyState } from "./EmptyState";

export interface FolderTreeProps {
  /** Tree from buildFolderTree (lib/folderTree). */
  nodes: FolderNode[];
  /** Top "all" row: label + count. Clicking it clears the selection. */
  rootLabel: string;
  rootCount: number;
  /** Subtree-inclusive count for a folder path. */
  countFor(path: string): number;
  /** Selected folder paths; empty = root/all selected. */
  selected: string[];
  /** Replace the selection. The tree owns the click semantics: plain click =
   *  select-one / deselect-if-only, ⌘/Ctrl+click = toggle into a
   *  multi-selection, root row = []. */
  onSelect(folders: string[]): void;
  /** DataTransfer MIME type of item payloads dragged from outside (question
   *  ids JSON / file rel). The tree only ACCEPTS these drops. */
  itemDndType: string;
  /** DataTransfer MIME type for folder drags — per-instance, so e.g. Notes
   *  folders can't be dropped on the Papers tree. */
  folderDndType: string;
  /** Raw item payload dropped onto `folder` ("" = the root row). */
  onDropItem(payload: string, folder: string): void;
  /** Folder move via drag. `to` is already computed (target + basename);
   *  self/own-subtree/no-op drops are filtered out before this fires. */
  onMoveFolder(from: string, to: string): void;
  onCreate(parent: string): void;
  onRename(path: string): void;
  onDelete(path: string): void;
  emptyText?: string;
}

export function FolderTree({
  nodes,
  rootLabel,
  rootCount,
  countFor,
  selected,
  onSelect,
  itemDndType,
  folderDndType,
  onDropItem,
  onMoveFolder,
  onCreate,
  onRename,
  onDelete,
  emptyText = "No folders yet — create one with +",
}: FolderTreeProps) {
  /** Folder path currently hovered by a drag ("" = the root row). */
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  const dragOver = (target: string) => (e: React.DragEvent) => {
    const types = [...e.dataTransfer.types];
    if (types.includes(itemDndType) || types.includes(folderDndType)) {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = "move";
      if (dropTarget !== target) setDropTarget(target);
    }
  };

  const dragLeave = (target: string) => () =>
    setDropTarget((t) => (t === target ? null : t));

  const drop = (target: string) => (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDropTarget(null);

    const payload = e.dataTransfer.getData(itemDndType);
    if (payload) {
      onDropItem(payload, target);
      return;
    }

    const src = e.dataTransfer.getData(folderDndType);
    if (src) {
      // Not into itself or its own subtree.
      if (src === target || target.startsWith(`${src}/`)) return;
      const to = target ? `${target}/${src.split("/").pop()!}` : src.split("/").pop()!;
      if (to === src) return;
      onMoveFolder(src, to);
    }
  };

  // Plain click selects one folder (or deselects it); ⌘/Ctrl+click toggles
  // the folder in/out of a multi-selection.
  const clickFolder = (path: string) => (e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey) {
      onSelect(selected.includes(path) ? selected.filter((f) => f !== path) : [...selected, path]);
    } else {
      onSelect(selected.length === 1 && selected[0] === path ? [] : [path]);
    }
  };

  const Row = ({ node, depth }: { node: FolderNode; depth: number }) => (
    <>
      <div
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData(folderDndType, node.path);
          e.dataTransfer.effectAllowed = "move";
        }}
        onDragOver={dragOver(node.path)}
        onDragLeave={dragLeave(node.path)}
        onDrop={drop(node.path)}
        className={`group flex w-full items-center gap-1 rounded pr-1 text-xs ${
          dropTarget === node.path
            ? "bg-accent-soft ring-1 ring-accent"
            : selected.includes(node.path)
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
          <span className="flex min-w-0 items-center gap-1.5 truncate">
            <FolderIcon />
            <span className="truncate">{node.name}</span>
          </span>
          <span className="pl-1 text-neutral-400 group-hover:hidden">{countFor(node.path)}</span>
        </button>
        <span className="hidden shrink-0 gap-0.5 group-hover:flex">
          <button
            onClick={() => onCreate(node.path)}
            title="New subfolder"
            aria-label={`New subfolder in ${node.path}`}
            className="rounded px-1 text-neutral-400 hover:text-accent"
          >
            +
          </button>
          <button
            onClick={() => onRename(node.path)}
            title="Rename / move"
            aria-label={`Rename folder ${node.path}`}
            className="rounded px-1 text-neutral-400 hover:text-accent"
          >
            ✎
          </button>
          <button
            onClick={() => onDelete(node.path)}
            title="Delete folder"
            aria-label={`Delete folder ${node.path}`}
            className="rounded px-1 text-neutral-400 hover:text-red-600"
          >
            ×
          </button>
        </span>
      </div>
      {node.children.map((c) => (
        <Row key={c.path} node={c} depth={depth + 1} />
      ))}
    </>
  );

  return (
    <>
      <button
        onClick={() => onSelect([])}
        onDragOver={dragOver("")}
        onDragLeave={dragLeave("")}
        onDrop={drop("")}
        className={`flex w-full items-center justify-between rounded px-2 py-1 text-left text-xs ${
          dropTarget === ""
            ? "bg-accent-soft ring-1 ring-accent"
            : selected.length === 0
              ? "bg-accent-soft font-medium text-accent-text"
              : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
        }`}
      >
        <span>{rootLabel}</span>
        <span className="text-neutral-400">{rootCount}</span>
      </button>
      {nodes.map((n) => (
        <Row key={n.path} node={n} depth={0} />
      ))}
      {nodes.length === 0 && <EmptyState title={emptyText} />}
    </>
  );
}
