// Create/edit a question: metadata + markdown sections + live KaTeX preview.
// Cmd/Ctrl+Enter saves. Images can be pasted or dropped into any section.

import { useCallback, useEffect, useMemo, useState } from "react";
import { deriveBodyKind, newQuestionMeta } from "../domain/format";
import { newId } from "../domain/ids";
import type { QuestionDoc, QuestionRow, RecallMode } from "../domain/types";
import { useQuestions } from "../state/questions";
import { Markdown } from "./Markdown";
import { DifficultyPicker } from "./fields/DifficultyPicker";
import { ImageDrop } from "./fields/ImageDrop";
import { MarkdownField } from "./fields/MarkdownField";
import { TagInput } from "./fields/TagInput";

interface Props {
  /** Row + parsed doc when editing; null when creating. */
  editing: { row: QuestionRow; doc: QuestionDoc } | null;
  onClose(): void;
}

const RECALL_MODES: { id: RecallMode; label: string }[] = [
  { id: "both", label: "Both" },
  { id: "flashcard", label: "Flashcard" },
  { id: "typein", label: "Type-in" },
];

export function QuestionEditor({ editing, onClose }: Props) {
  const { save, allTags, allFolders } = useQuestions();

  const [question, setQuestion] = useState(editing?.doc.question ?? "");
  const [answer, setAnswer] = useState(editing?.doc.answer ?? "");
  const [hint, setHint] = useState(editing?.doc.hint ?? "");
  const [solution, setSolution] = useState(editing?.doc.solution ?? "");
  const [difficulty, setDifficulty] = useState<number | null>(editing?.doc.meta.difficulty ?? null);
  const [tags, setTags] = useState<string[]>(editing?.doc.meta.tags ?? []);
  const [source, setSource] = useState(editing?.doc.meta.source ?? "");
  const [recall, setRecall] = useState<RecallMode>(editing?.doc.meta.recall ?? "both");
  const [folder, setFolder] = useState(editing?.row.folder ?? "");
  const [showPreview, setShowPreview] = useState(true);
  const [showExtras, setShowExtras] = useState(Boolean(editing?.doc.hint || editing?.doc.solution));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Keep folder/tags/source/difficulty for the next question in a batch;
  // only the content fields reset.
  const [savedFlash, setSavedFlash] = useState(false);

  const buildDoc = useCallback((): QuestionDoc => {
    // Body kind is derived from the content — text, LaTeX and images all
    // live in the same markdown box.
    const body = deriveBodyKind(question);
    const meta = editing
      ? {
          ...editing.doc.meta,
          body,
          difficulty: difficulty ?? undefined,
          tags,
          source: source.trim() || undefined,
          recall,
        }
      : newQuestionMeta(newId(), {
          body,
          difficulty: difficulty ?? undefined,
          tags,
          source: source.trim() || undefined,
          recall,
        });
    return {
      meta,
      question: question.trim(),
      answer: answer.trim() || undefined,
      hint: hint.trim() || undefined,
      solution: solution.trim() || undefined,
    };
  }, [editing, difficulty, tags, source, recall, question, answer, hint, solution]);

  const handleSave = useCallback(async () => {
    if (!question.trim()) {
      setError("The question body is empty.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await save(buildDoc(), folder, editing?.row.path);
      if (editing) {
        onClose();
      } else {
        // Batch entry: clear content, keep metadata.
        setQuestion("");
        setAnswer("");
        setHint("");
        setSolution("");
        setSavedFlash(true);
        setTimeout(() => setSavedFlash(false), 1500);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }, [question, save, buildDoc, folder, editing, onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        void handleSave();
      }
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleSave, onClose]);

  const previewDoc = useMemo(buildDoc, [buildDoc]);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-2.5 dark:border-neutral-800">
        <h2 className="text-sm font-semibold">
          {editing ? "Edit question" : "New question"}
        </h2>
        <div className="flex items-center gap-2">
          {savedFlash && <span className="text-xs text-green-600 dark:text-green-400">Saved ✓</span>}
          {error && <span className="max-w-64 truncate text-xs text-red-600 dark:text-red-400">{error}</span>}
          <button
            onClick={() => setShowPreview((p) => !p)}
            className="rounded-md border border-neutral-300 px-2.5 py-1 text-xs text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            {showPreview ? "Hide preview" : "Show preview"}
          </button>
          <button
            onClick={onClose}
            className="rounded-md border border-neutral-300 px-2.5 py-1 text-xs text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-md bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-50"
            title="Cmd/Ctrl+Enter"
          >
            {saving ? "Saving…" : editing ? "Save" : "Save & next"}
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Form */}
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {/* Metadata row */}
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-neutral-500 dark:text-neutral-400">Folder</span>
              <input
                value={folder}
                onChange={(e) => setFolder(e.target.value)}
                placeholder="e.g. mechanics/kinematics"
                list="folder-suggestions"
                className="w-full rounded-md border border-neutral-300 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-blue-500 dark:border-neutral-700 dark:bg-neutral-900"
              />
              <datalist id="folder-suggestions">
                {allFolders().map((f) => (
                  <option key={f} value={f} />
                ))}
              </datalist>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-neutral-500 dark:text-neutral-400">Source</span>
              <input
                value={source}
                onChange={(e) => setSource(e.target.value)}
                placeholder="e.g. Halliday & Resnick Ch.4 Q17"
                className="w-full rounded-md border border-neutral-300 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-blue-500 dark:border-neutral-700 dark:bg-neutral-900"
              />
            </label>
          </div>

          <div className="flex flex-wrap items-end gap-4">
            <div>
              <span className="mb-1 block text-xs font-medium text-neutral-500 dark:text-neutral-400">Difficulty</span>
              <DifficultyPicker value={difficulty} onChange={setDifficulty} />
            </div>
            <div>
              <span className="mb-1 block text-xs font-medium text-neutral-500 dark:text-neutral-400">Recall</span>
              <div className="flex overflow-hidden rounded-md border border-neutral-300 dark:border-neutral-700">
                {RECALL_MODES.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setRecall(m.id)}
                    className={`px-3 py-1.5 text-xs ${
                      recall === m.id
                        ? "bg-blue-600 font-medium text-white"
                        : "bg-white text-neutral-600 hover:bg-neutral-100 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800"
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div>
            <span className="mb-1 block text-xs font-medium text-neutral-500 dark:text-neutral-400">Tags</span>
            <TagInput value={tags} onChange={setTags} suggestions={allTags()} />
          </div>

          {/* Content sections */}
          <div>
            <span className="mb-1 block text-xs font-medium text-neutral-500 dark:text-neutral-400">
              Question — type text and LaTeX together, e.g. Solve $x^2 - 4 = 0$
            </span>
            <MarkdownField
              value={question}
              onChange={setQuestion}
              placeholder={"A projectile is launched at $30^\\circ$ with speed $v_0$…"}
              minHeight="120px"
              autoFocus
            />
            <ImageDrop onInsert={(rel) => setQuestion((q) => `${q.trimEnd()}\n\n![](${rel})\n`)} />
          </div>

          <div>
            <span className="mb-1 block text-xs font-medium text-neutral-500 dark:text-neutral-400">
              Answer (optional)
            </span>
            <MarkdownField
              value={answer}
              onChange={setAnswer}
              placeholder={"$R = \\dfrac{v_0^2 \\sin 2\\theta}{g}$"}
              minHeight="80px"
            />
            <ImageDrop onInsert={(rel) => setAnswer((a) => `${a.trimEnd()}\n\n![](${rel})\n`)} />
          </div>

          <button
            type="button"
            onClick={() => setShowExtras((s) => !s)}
            className="text-xs text-neutral-500 underline dark:text-neutral-400"
          >
            {showExtras ? "Hide hint & solution" : "Add hint / solution…"}
          </button>

          {showExtras && (
            <>
              <div>
                <span className="mb-1 block text-xs font-medium text-neutral-500 dark:text-neutral-400">Hint</span>
                <MarkdownField value={hint} onChange={setHint} minHeight="60px" />
              </div>
              <div>
                <span className="mb-1 block text-xs font-medium text-neutral-500 dark:text-neutral-400">
                  Solution (full worked solution)
                </span>
                <MarkdownField value={solution} onChange={setSolution} minHeight="80px" />
              </div>
            </>
          )}
        </div>

        {/* Live preview */}
        {showPreview && (
          <div className="w-2/5 shrink-0 overflow-y-auto border-l border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-800 dark:bg-neutral-900/50">
            <div className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-400">Preview</div>
            {previewDoc.question ? (
              <div className="space-y-4">
                <div className="rounded-lg border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900">
                  <Markdown text={previewDoc.question} />
                </div>
                {previewDoc.answer && (
                  <div className="rounded-lg border border-green-200 bg-green-50/50 p-3 dark:border-green-900 dark:bg-green-950/30">
                    <div className="mb-1 text-xs font-medium text-green-700 dark:text-green-400">Answer</div>
                    <Markdown text={previewDoc.answer} />
                  </div>
                )}
                {previewDoc.hint && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-3 dark:border-amber-900 dark:bg-amber-950/30">
                    <div className="mb-1 text-xs font-medium text-amber-700 dark:text-amber-400">Hint</div>
                    <Markdown text={previewDoc.hint} />
                  </div>
                )}
                {previewDoc.solution && (
                  <div className="rounded-lg border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900">
                    <div className="mb-1 text-xs font-medium text-neutral-500">Solution</div>
                    <Markdown text={previewDoc.solution} />
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-neutral-400">Start typing to see the preview.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
