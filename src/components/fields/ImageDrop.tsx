// Dedicated image intake: drag & drop or click to browse. Saves to
// attachments/ and hands back the vault-relative path to insert into the
// section's markdown. (Pasting directly into the textbox also still works.)

import { useRef, useState } from "react";
import { imagesFromDataTransfer, saveImageToAttachments } from "../../lib/images";

interface Props {
  onInsert(rel: string): void;
}

export function ImageDrop({ onInsert }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);

  const handleFiles = async (files: File[]) => {
    if (!files.length) return;
    setBusy(true);
    try {
      for (const file of files) {
        onInsert(await saveImageToAttachments(file, file.name));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          void handleFiles(imagesFromDataTransfer(e.dataTransfer));
        }}
        className={`mt-1 flex w-full items-center justify-center gap-2 rounded-md border border-dashed px-3 py-2 text-xs transition ${
          over
            ? "border-accent bg-accent-soft text-accent-text"
            : "border-edge text-neutral-400 hover:border-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
        }`}
      >
        {busy ? "Adding image…" : "🖼 Drop an image here, or click to browse"}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml"
        multiple
        hidden
        onChange={(e) => {
          void handleFiles([...(e.target.files ?? [])]);
          e.target.value = "";
        }}
      />
    </>
  );
}
