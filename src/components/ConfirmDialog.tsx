// Modal confirmation — replaces window.confirm, which is unreliable in
// Tauri's WKWebView. Driven by confirmDialog() in src/state/ui.ts.

import { useEffect, useRef } from "react";
import { useUi } from "../state/ui";

export function ConfirmDialog() {
  const request = useUi((s) => s.confirmRequest);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (request) setTimeout(() => confirmRef.current?.focus(), 0);
  }, [request]);

  useEffect(() => {
    if (!request) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") request.resolve(false);
      if (e.key === "Enter") request.resolve(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [request]);

  if (!request) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 pt-32"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) request.resolve(false);
      }}
    >
      <div className="w-full max-w-sm rounded-xl border border-edge bg-surface p-4 shadow-2xl">
        <h3 className="text-sm font-semibold">{request.title}</h3>
        {request.message && (
          <p className="mt-1.5 text-xs leading-relaxed text-neutral-500 dark:text-neutral-400">
            {request.message}
          </p>
        )}
        <div className="mt-3 flex justify-end gap-2">
          <button
            onClick={() => request.resolve(false)}
            className="rounded-md border border-edge px-3 py-1 text-xs text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            Cancel
          </button>
          <button
            ref={confirmRef}
            onClick={() => request.resolve(true)}
            className="rounded-md bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-500 focus:outline-none focus:ring-2 focus:ring-red-400"
          >
            {request.confirmLabel ?? "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}
