// Modal text input — replaces window.prompt, which Tauri's WKWebView
// silently ignores. Driven by textPrompt() in src/state/ui.ts.

import { useEffect, useRef, useState } from "react";
import { useUi } from "../state/ui";
import { Button } from "./ui/Button";
import { INPUT } from "./ui/Field";
import { Modal } from "./ui/Modal";

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
    <Modal onClose={cancel}>
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
          className={`w-full ${INPUT}`}
        />
        <div className="mt-3 flex justify-end gap-2">
          <Button variant="ghost" className="px-3" onClick={cancel}>
            Cancel
          </Button>
          <Button onClick={submit}>OK</Button>
        </div>
    </Modal>
  );
}
