// Modal confirmation — replaces window.confirm, which is unreliable in
// Tauri's WKWebView. Driven by confirmDialog() in src/state/ui.ts.

import { useEffect, useRef } from "react";
import { useUi } from "../state/ui";
import { Button } from "./ui/Button";
import { Modal } from "./ui/Modal";

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

  // "info" = a plain notice (errorDialog): single accent OK, no Cancel.
  const info = request.variant === "info";

  return (
    <Modal onClose={() => request.resolve(false)}>
      <h3 className="text-sm font-semibold">{request.title}</h3>
      {request.message && (
        <p className="mt-1.5 text-xs leading-relaxed text-neutral-500 dark:text-neutral-400">
          {request.message}
        </p>
      )}
      <div className="mt-3 flex justify-end gap-2">
        {!info && (
          <Button variant="ghost" className="px-3" onClick={() => request.resolve(false)}>
            Cancel
          </Button>
        )}
        <Button
          ref={confirmRef}
          variant={info ? "primary" : "danger"}
          className={`focus:outline-none focus:ring-2 ${info ? "focus:ring-accent" : "focus:ring-red-400"}`}
          onClick={() => request.resolve(true)}
        >
          {request.confirmLabel ?? "Delete"}
        </Button>
      </div>
    </Modal>
  );
}
