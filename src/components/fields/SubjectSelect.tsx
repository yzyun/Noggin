// Subject (folder) combobox: type freely to create a new subject, or pick
// from recent subjects in the dropdown. Nested subjects use "/" —
// e.g. "mechanics/kinematics".

import { useEffect, useMemo, useRef, useState } from "react";

interface Props {
  value: string;
  onChange(v: string): void;
  /** Existing subjects, most recently used first. */
  recent: string[];
}

export function SubjectSelect({ value, onChange, recent }: Props) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const options = useMemo(() => {
    const q = value.trim().toLowerCase();
    const filtered = q ? recent.filter((f) => f.toLowerCase().includes(q)) : recent;
    return filtered.slice(0, 8);
  }, [value, recent]);

  // Close when clicking anywhere outside.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <div ref={wrapRef} className="relative">
      <div className="flex overflow-hidden rounded-md border border-neutral-300 bg-white focus-within:border-blue-500 dark:border-neutral-700 dark:bg-neutral-900">
        <input
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false);
            if (e.key === "Enter" && open && options[0]) {
              e.preventDefault();
              onChange(options[0]);
              setOpen(false);
            }
          }}
          placeholder="e.g. mechanics/kinematics"
          className="w-full bg-transparent px-2.5 py-1.5 text-sm outline-none"
        />
        <button
          type="button"
          tabIndex={-1}
          onClick={() => setOpen((o) => !o)}
          className="px-2 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
          aria-label="show recent subjects"
        >
          ▾
        </button>
      </div>

      {open && options.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-neutral-200 bg-white py-1 shadow-lg dark:border-neutral-700 dark:bg-neutral-900">
          {options.map((f) => (
            <li key={f}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault() /* keep input focus */}
                onClick={() => {
                  onChange(f);
                  setOpen(false);
                }}
                className={`w-full px-2.5 py-1.5 text-left text-sm hover:bg-blue-50 dark:hover:bg-blue-950 ${
                  f === value ? "font-medium text-blue-700 dark:text-blue-300" : ""
                }`}
              >
                📁 {f}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
