// ⌘K command palette over the commands registry.

import { useEffect, useMemo, useRef, useState } from "react";
import { commands } from "../domain/registries";
import { useUi } from "../state/ui";
import { Modal } from "./ui/Modal";

export function CommandPalette() {
  const { paletteOpen, closePalette } = useUi();
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    const all = commands.all();
    return q ? all.filter((c) => c.title.toLowerCase().includes(q)) : all;
  }, [query]);

  useEffect(() => {
    if (paletteOpen) {
      setQuery("");
      setCursor(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [paletteOpen]);

  useEffect(() => setCursor(0), [query]);

  if (!paletteOpen) return null;

  const run = (idx: number) => {
    const cmd = items[idx];
    if (!cmd) return;
    closePalette();
    void cmd.run();
  };

  return (
    <Modal onClose={closePalette} width="max-w-md" top="pt-24" padded={false}>
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") closePalette();
            else if (e.key === "ArrowDown") {
              e.preventDefault();
              setCursor((c) => Math.min(c + 1, items.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setCursor((c) => Math.max(c - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              run(cursor);
            }
          }}
          placeholder="Type a command…"
          className="w-full border-b border-edge bg-transparent px-4 py-3 text-sm outline-none"
        />
        <ul className="max-h-72 overflow-y-auto py-1">
          {items.map((cmd, i) => (
            <li key={cmd.id}>
              <button
                onClick={() => run(i)}
                onMouseEnter={() => setCursor(i)}
                className={`flex w-full items-center justify-between px-4 py-2 text-left text-sm ${
                  i === cursor
                    ? "bg-accent-soft text-accent-text"
                    : "text-neutral-700 dark:text-neutral-200"
                }`}
              >
                <span>{cmd.title}</span>
                {cmd.shortcut && (
                  <span className="text-xs text-neutral-400">{cmd.shortcut}</span>
                )}
              </button>
            </li>
          ))}
          {items.length === 0 && (
            <li className="px-4 py-3 text-center text-sm text-neutral-400">No matching commands</li>
          )}
        </ul>
    </Modal>
  );
}
