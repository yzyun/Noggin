// Dedicated image intake: drag & drop or click to browse. Saves to
// attachments/ and hands back the vault-relative path to insert into the
// section's markdown. (Pasting directly into the textbox also still works.)

import { useRef, useState } from "react";
import { ImageIcon } from "../icons";
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
        title="Browse for an image, or drop one here. You can also paste straight into the text box."
        className={`mt-1.5 flex items-center gap-1.5 rounded-md border border-dashed px-2 py-1 text-xs transition-colors ${
          over
            ? "border-accent bg-accent-soft text-accent-text"
            : "border-transparent text-neutral-500 hover:border-edge hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-100"
        }`}
      >
        <ImageIcon className="h-3.5 w-3.5" />
        {busy ? "Adding image…" : over ? "Drop to add" : "Add image"}
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
