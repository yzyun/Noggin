// CodeMirror markdown field with image paste/drop: images land in
// attachments/ and a ![](attachments/…) reference is inserted at the cursor.

import { useCallback, useRef } from "react";
import CodeMirror, { EditorView } from "@uiw/react-codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { imagesFromDataTransfer, saveImageToAttachments } from "../../lib/images";

const theme = EditorView.theme({
  "&": { fontSize: "13px", backgroundColor: "transparent" },
  ".cm-content": {
    fontFamily: "var(--font-mono)",
    padding: "8px 10px",
    caretColor: "currentColor",
  },
  // CodeMirror draws its own cursor; give it a visible color in both themes.
  ".cm-cursor, .cm-dropCursor": {
    borderLeftColor: "currentColor",
    borderLeftWidth: "1.5px",
  },
  ".cm-line": { padding: "0" },
  "&.cm-focused": { outline: "none" },
});

interface Props {
  value: string;
  onChange(value: string): void;
  placeholder?: string;
  minHeight?: string;
  autoFocus?: boolean;
}

export function MarkdownField({ value, onChange, placeholder, minHeight = "80px", autoFocus }: Props) {
  const viewRef = useRef<EditorView | null>(null);

  const insertAtCursor = useCallback((text: string) => {
    const view = viewRef.current;
    if (!view) return;
    const { from, to } = view.state.selection.main;
    view.dispatch({ changes: { from, to, insert: text }, selection: { anchor: from + text.length } });
  }, []);

  const handleImages = useCallback(
    async (files: File[]) => {
      for (const file of files) {
        const rel = await saveImageToAttachments(file, file.name);
        insertAtCursor(`![](${rel})\n`);
      }
    },
    [insertAtCursor],
  );

  return (
    <div
      className="overflow-hidden rounded-md border border-edge bg-surface focus-within:border-accent"
      onPaste={(e) => {
        const images = imagesFromDataTransfer(e.clipboardData);
        if (images.length) {
          e.preventDefault();
          void handleImages(images);
        }
      }}
      onDrop={(e) => {
        const images = imagesFromDataTransfer(e.dataTransfer);
        if (images.length) {
          e.preventDefault();
          void handleImages(images);
        }
      }}
      onDragOver={(e) => e.preventDefault()}
    >
      <CodeMirror
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        autoFocus={autoFocus}
        minHeight={minHeight}
        theme={theme}
        extensions={[markdown(), EditorView.lineWrapping]}
        basicSetup={{ lineNumbers: false, foldGutter: false, highlightActiveLine: false }}
        onCreateEditor={(view) => {
          viewRef.current = view;
        }}
      />
    </div>
  );
}
