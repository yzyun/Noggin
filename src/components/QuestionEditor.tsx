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
import { SubjectSelect } from "./fields/SubjectSelect";
import { TagInput } from "./fields/TagInput";
import { Button } from "./ui/Button";
import { Callout } from "./ui/Callout";
import { Field, INPUT, LABEL } from "./ui/Field";
import { Segmented } from "./ui/Segmented";

interface Props {
  /** Row + parsed doc when editing; null when creating. */
  editing: { row: QuestionRow; doc: QuestionDoc } | null;
  onClose(): void;
}

const RECALL_MODES: [RecallMode, string][] = [
  ["both", "Both"],
  ["flashcard", "Flashcard"],
  ["typein", "Type-in"],
];

export function QuestionEditor({ editing, onClose }: Props) {
  const { save, allTags, recentFolders } = useQuestions();

  const [title, setTitle] = useState(editing?.doc.meta.title ?? "");
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

  // Keep subject/tags/source/difficulty for the next question in a batch;
  // only the content fields reset.
  const [savedFlash, setSavedFlash] = useState(false);
  // Bumped after each batch save to remount + refocus the question field.
  const [resetKey, setResetKey] = useState(0);

  const clearContent = useCallback(() => {
    setTitle("");
    setQuestion("");
    setAnswer("");
    setHint("");
    setSolution("");
    setResetKey((k) => k + 1);
  }, []);

  const clearAll = useCallback(() => {
    clearContent();
    setTags([]);
    setDifficulty(null);
    setSource("");
    setRecall("both");
    setFolder("");
    setError(null);
  }, [clearContent]);

  const buildDoc = useCallback((): QuestionDoc => {
    // Body kind is derived from the content — text, LaTeX and images all
    // live in the same markdown box.
    const body = deriveBodyKind(question);
    const meta = editing
      ? {
          ...editing.doc.meta,
          title: title.trim() || undefined,
          body,
          difficulty: difficulty ?? undefined,
          tags,
          source: source.trim() || undefined,
          recall,
        }
      : newQuestionMeta(newId(), {
          title: title.trim() || undefined,
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
  }, [editing, title, difficulty, tags, source, recall, question, answer, hint, solution]);

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
        // Batch entry: clear only the content; subject, tags, difficulty,
        // source and recall stay put for the next question.
        clearContent();
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
      <div className="flex items-center justify-between border-b border-edge px-4 py-2.5">
        <h2 className="text-sm font-semibold">
          {editing ? "Edit question" : "New question"}
        </h2>
        <div className="flex items-center gap-2">
          {savedFlash && <span className="text-xs text-green-600 dark:text-green-400">Saved ✓</span>}
          {error && <span className="max-w-64 truncate text-xs text-red-600 dark:text-red-400">{error}</span>}
          {!editing && (
            <Button variant="ghost" onClick={clearAll} title="Clear content and all metadata">
              Clear all
            </Button>
          )}
          <Button variant="ghost" onClick={() => setShowPreview((p) => !p)}>
            {showPreview ? "Hide preview" : "Show preview"}
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving} title="Cmd/Ctrl+Enter">
            {saving ? "Saving…" : editing ? "Save" : "Save & next"}
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Form */}
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          <Field label="Title (optional — shown in lists; auto-generated from the question if blank)">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Projectile range at 30°"
              className={`w-full ${INPUT}`}
            />
          </Field>

          {/* Metadata row */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Subject">
              <SubjectSelect value={folder} onChange={setFolder} recent={recentFolders()} />
            </Field>
            <Field label="Source">
              <input
                value={source}
                onChange={(e) => setSource(e.target.value)}
                placeholder="e.g. Halliday & Resnick Ch.4 Q17"
                className={`w-full ${INPUT}`}
              />
            </Field>
          </div>

          <div className="flex flex-wrap items-end gap-4">
            <Field label="Difficulty" as="div">
              <DifficultyPicker value={difficulty} onChange={setDifficulty} />
            </Field>
            <Field label="Recall" as="div">
              <Segmented<RecallMode> value={recall} options={RECALL_MODES} onChange={setRecall} />
            </Field>
          </div>

          <Field label="Tags" as="div">
            <TagInput value={tags} onChange={setTags} suggestions={allTags()} />
          </Field>

          {/* Content sections */}
          <div>
            <span className={LABEL}>
              Question — type text and LaTeX together, e.g. Solve $x^2 - 4 = 0$
            </span>
            <MarkdownField
              key={resetKey}
              value={question}
              onChange={setQuestion}
              placeholder={"A projectile is launched at $30^\\circ$ with speed $v_0$…"}
              minHeight="120px"
              autoFocus
            />
            <ImageDrop onInsert={(rel) => setQuestion((q) => `${q.trimEnd()}\n\n![](${rel})\n`)} />
          </div>

          <div>
            <span className={LABEL}>Answer (optional)</span>
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
                <span className={LABEL}>Hint</span>
                <MarkdownField value={hint} onChange={setHint} minHeight="60px" />
              </div>
              <div>
                <span className={LABEL}>Solution (full worked solution)</span>
                <MarkdownField value={solution} onChange={setSolution} minHeight="80px" />
              </div>
            </>
          )}
        </div>

        {/* Live preview */}
        {showPreview && (
          <div className="w-2/5 shrink-0 overflow-y-auto border-l border-edge bg-neutral-50 p-4 dark:bg-neutral-900/50">
            <div className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-400">Preview</div>
            {previewDoc.question ? (
              <div className="space-y-4">
                <Callout tone="neutral">
                  <Markdown text={previewDoc.question} />
                </Callout>
                {previewDoc.answer && (
                  <Callout tone="answer" label="Answer">
                    <Markdown text={previewDoc.answer} />
                  </Callout>
                )}
                {previewDoc.hint && (
                  <Callout tone="hint" label="Hint">
                    <Markdown text={previewDoc.hint} />
                  </Callout>
                )}
                {previewDoc.solution && (
                  <Callout tone="neutral" label="Solution">
                    <Markdown text={previewDoc.solution} />
                  </Callout>
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
