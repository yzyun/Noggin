// Tag chips + free-text entry with suggestions from existing tags.
// Casing is normalised against existing tags so "Algebra" and "algebra"
// don't fragment the tag space.

import { useMemo, useState } from "react";

interface Props {
  value: string[];
  onChange(tags: string[]): void;
  /** All tags already used in the vault, for suggestions + case folding. */
  suggestions: string[];
}

export function TagInput({ value, onChange, suggestions }: Props) {
  const [draft, setDraft] = useState("");

  const canonical = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of suggestions) map.set(t.toLowerCase(), t);
    return map;
  }, [suggestions]);

  const matches = useMemo(() => {
    const q = draft.trim().toLowerCase();
    if (!q) return [];
    return suggestions
      .filter((t) => t.toLowerCase().includes(q) && !value.includes(t))
      .slice(0, 6);
  }, [draft, suggestions, value]);

  const add = (raw: string) => {
    const trimmed = raw.trim().replace(/,+$/, "");
    if (!trimmed) return;
    const tag = canonical.get(trimmed.toLowerCase()) ?? trimmed;
    if (!value.includes(tag)) onChange([...value, tag]);
    setDraft("");
  };

  return (
    <div className="rounded-md border border-edge bg-surface p-1.5 focus-within:border-accent">
      <div className="flex flex-wrap items-center gap-1">
        {value.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-xs text-accent-text"
          >
            {tag}
            <button
              type="button"
              onClick={() => onChange(value.filter((t) => t !== tag))}
              className="opacity-60 hover:opacity-100"
              aria-label={`remove ${tag}`}
            >
              ×
            </button>
          </span>
        ))}
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              add(draft);
            } else if (e.key === "Tab" && matches[0] && draft) {
              e.preventDefault();
              add(matches[0]);
            } else if (e.key === "Backspace" && !draft && value.length) {
              onChange(value.slice(0, -1));
            }
          }}
          onBlur={() => draft.trim() && add(draft)}
          placeholder={value.length ? "" : "add tags…"}
          className="min-w-24 flex-1 bg-transparent px-1 py-0.5 text-sm outline-none"
        />
      </div>
      {matches.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1 border-t border-edge pt-1">
          {matches.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => add(m)}
              className="rounded-full border border-edge px-2 py-0.5 text-xs text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
            >
              {m}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
