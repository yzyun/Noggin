// Modal text input — replaces window.prompt, which Tauri's WKWebView
// silently ignores. Driven by textPrompt() in src/state/ui.ts.

import { useEffect, useRef, useState } from "react";
import { useUi } from "../state/ui";

export function PromptDialog() {
  const request = useUi((s) => s.promptRequest);
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (request) {
      setValue(request.initial ?? "");
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 0);
    }
  }, [request]);

  if (!request) return null;

  const submit = () => request.resolve(value.trim() || null);
  const cancel = () => request.resolve(null);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 pt-32"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) cancel();
      }}
    >
      <div className="w-full max-w-sm rounded-xl border border-edge bg-surface p-4 shadow-2xl">
        <h3 className="mb-2 text-sm font-semibold">{request.title}</h3>
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
            if (e.key === "Escape") cancel();
          }}
          placeholder={request.placeholder}
          className="w-full rounded-md border border-edge bg-surface px-2.5 py-1.5 text-sm outline-none focus:border-accent"
        />
        <div className="mt-3 flex justify-end gap-2">
          <button
            onClick={cancel}
            className="rounded-md border border-edge px-3 py-1 text-xs text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            className="rounded-md bg-accent px-3 py-1 text-xs font-medium text-on-accent hover:bg-accent-hover"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
