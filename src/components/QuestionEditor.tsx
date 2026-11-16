// Create/edit a question: metadata + markdown sections + live KaTeX preview.
// Cmd/Ctrl+Enter saves. Images can be pasted or dropped into any section.

import { useCallback, useEffect, useMemo, useState } from "react";
import { deriveBodyKind, newQuestionMeta } from "../domain/format";
import { newId } from "../domain/ids";
import type { QuestionDoc, QuestionRow, RecallMode } from "../domain/types";
import { useQuestions } from "../state/questions";
import { confirmDialog, useUi } from "../state/ui";
import { Markdown } from "./Markdown";
import { DifficultyPicker } from "./fields/DifficultyPicker";
import { ImageDrop } from "./fields/ImageDrop";
import { MarkdownField } from "./fields/MarkdownField";
import { SubjectSelect } from "./fields/SubjectSelect";
import { TagInput } from "./fields/TagInput";
import { CheckIcon, PlusIcon } from "./icons";
import { Button } from "./ui/Button";
import { Callout } from "./ui/Callout";
import { Field, INPUT } from "./ui/Field";
import { Segmented } from "./ui/Segmented";

interface Props {
  /** Row + parsed doc when editing; null when creating. */
  editing: { row: QuestionRow; doc: QuestionDoc } | null;
  onClose(): void;
}

const RECALL_MODES: [RecallMode, string][] = [
  ["both", "Either"],
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
  const [showHint, setShowHint] = useState(Boolean(editing?.doc.hint));
  const [showSolution, setShowSolution] = useState(Boolean(editing?.doc.solution));
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
    setShowHint(false);
    setShowSolution(false);
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

  // Unsaved writing is never thrown away on a stray Esc / Cancel.
  const initial = editing?.doc;
  const dirty =
    question.trim() !== (initial?.question ?? "") ||
    answer.trim() !== (initial?.answer ?? "") ||
    hint.trim() !== (initial?.hint ?? "") ||
    solution.trim() !== (initial?.solution ?? "") ||
    title.trim() !== (initial?.meta.title ?? "");

  const requestClose = useCallback(async () => {
    if (
      dirty &&
      !(await confirmDialog({
        title: "Discard this question?",
        message: "What you've written hasn't been saved.",
        confirmLabel: "Discard",
      }))
    )
      return;
    onClose();
  }, [dirty, onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        void handleSave();
      }
      // A dialog (e.g. the discard prompt itself) owns Esc while it is open.
      if (e.key === "Escape" && !useUi.getState().confirmRequest) void requestClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleSave, requestClose]);

  const previewDoc = useMemo(buildDoc, [buildDoc]);

  const append = (setter: React.Dispatch<React.SetStateAction<string>>) => (rel: string) =>
    setter((v) => `${v.trimEnd()}\n\n![](${rel})\n`);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-edge px-5">
        <div className="flex min-w-0 items-center gap-3">
          <h2 className="text-sm font-semibold">{editing ? "Edit question" : "New question"}</h2>
          {savedFlash && (
            <span className="flex items-center gap-1 text-xs text-green-700 dark:text-green-400">
              <CheckIcon className="h-3.5 w-3.5" /> Saved — ready for the next one
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Segmented<"on" | "off">
            value={showPreview ? "on" : "off"}
            options={[
              ["on", "Preview"],
              ["off", "Write only"],
            ]}
            onChange={(v) => setShowPreview(v === "on")}
          />
          <Button variant="ghost" onClick={() => void requestClose()}>
            {editing ? "Cancel" : "Done"}
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            <span className="flex items-center gap-1.5">
              {saving ? "Saving…" : editing ? "Save" : "Save & next"}
              <kbd className="font-sans text-[10px] opacity-60">⌘↵</kbd>
            </span>
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Form: the writing comes first, filing details after */}
        <div className="min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-2xl space-y-5 px-6 py-6">
            {error && (
              <p
                role="alert"
                className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
              >
                {error}
              </p>
            )}

            <div>
              <div className="mb-1 flex items-baseline justify-between">
                <span className="text-sm font-semibold">Question</span>
                <span className="text-xs text-neutral-400">
                  Markdown, with LaTeX between <code>$…$</code>
                </span>
              </div>
              <MarkdownField
                key={resetKey}
                value={question}
                onChange={setQuestion}
                placeholder={"A projectile is launched at $30^\\circ$ with speed $v_0$…"}
                minHeight="140px"
                autoFocus
              />
              <ImageDrop onInsert={append(setQuestion)} />
            </div>

            <div>
              <div className="mb-1 flex items-baseline justify-between">
                <span className="text-sm font-semibold">Answer</span>
                <span className="text-xs text-neutral-400">optional</span>
              </div>
              <MarkdownField
                key={`a${resetKey}`}
                value={answer}
                onChange={setAnswer}
                placeholder={"$R = \\dfrac{v_0^2 \\sin 2\\theta}{g}$"}
                minHeight="80px"
              />
              <ImageDrop onInsert={append(setAnswer)} />
            </div>

            {showHint && (
              <div>
                <div className="mb-1 flex items-baseline justify-between">
                  <span className="text-sm font-semibold">Hint</span>
                  <span className="text-xs text-neutral-400">shown on request, before the answer</span>
                </div>
                <MarkdownField key={`h${resetKey}`} value={hint} onChange={setHint} minHeight="60px" />
              </div>
            )}
            {showSolution && (
              <div>
                <div className="mb-1 flex items-baseline justify-between">
                  <span className="text-sm font-semibold">Worked solution</span>
                  <span className="text-xs text-neutral-400">shown on request, after the answer</span>
                </div>
                <MarkdownField
                  key={`s${resetKey}`}
                  value={solution}
                  onChange={setSolution}
                  minHeight="100px"
                />
                <ImageDrop onInsert={append(setSolution)} />
              </div>
            )}
            {(!showHint || !showSolution) && (
              <div className="flex gap-2">
                {!showHint && (
                  <Button variant="ghost" onClick={() => setShowHint(true)}>
                    <span className="flex items-center gap-1">
                      <PlusIcon className="h-3 w-3" /> Hint
                    </span>
                  </Button>
                )}
                {!showSolution && (
                  <Button variant="ghost" onClick={() => setShowSolution(true)}>
                    <span className="flex items-center gap-1">
                      <PlusIcon className="h-3 w-3" /> Worked solution
                    </span>
                  </Button>
                )}
              </div>
            )}

            {/* Filing details */}
            <div className="rounded-xl border border-edge bg-surface">
              <div className="flex items-baseline justify-between border-b border-edge px-4 py-2.5">
                <span className="text-sm font-semibold">Details</span>
                {!editing && (
                  <span className="flex items-center gap-3 text-xs text-neutral-400">
                    kept for the next question
                    <button
                      type="button"
                      onClick={clearAll}
                      className="underline underline-offset-2 hover:text-neutral-800 dark:hover:text-neutral-100"
                    >
                      Reset
                    </button>
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-4 p-4">
                <Field label="Subject">
                  <SubjectSelect value={folder} onChange={setFolder} recent={recentFolders()} />
                </Field>
                <Field label="Tags" as="div">
                  <TagInput value={tags} onChange={setTags} suggestions={allTags()} />
                </Field>
                <Field label="Difficulty" as="div">
                  <DifficultyPicker value={difficulty} onChange={setDifficulty} />
                </Field>
                <Field label="Review as" as="div">
                  <Segmented<RecallMode> value={recall} options={RECALL_MODES} onChange={setRecall} />
                </Field>
                <Field label="Source">
                  <input
                    value={source}
                    onChange={(e) => setSource(e.target.value)}
                    placeholder="e.g. Halliday & Resnick Ch.4 Q17"
                    className={`w-full ${INPUT}`}
                  />
                </Field>
                <Field label="Title">
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Optional — defaults to the first line"
                    className={`w-full ${INPUT}`}
                  />
                </Field>
              </div>
            </div>
          </div>
        </div>

        {/* Live preview: the card as it will look in review */}
        {showPreview && (
          <div className="w-2/5 shrink-0 overflow-y-auto border-l border-edge bg-neutral-100/60 p-6 dark:bg-neutral-900/50">
            <div className="mb-3 text-[11px] font-medium tracking-wider text-neutral-400 uppercase">
              Preview
            </div>
            {previewDoc.question ? (
              <div className="space-y-3">
                <div className="rounded-2xl border border-edge bg-surface px-5 py-5 shadow-sm">
                  <Markdown text={previewDoc.question} />
                </div>
                {previewDoc.hint && (
                  <Callout tone="hint" label="Hint">
                    <Markdown text={previewDoc.hint} />
                  </Callout>
                )}
                {previewDoc.answer && (
                  <Callout tone="answer" label="Answer" className="rounded-2xl px-5 py-4">
                    <Markdown text={previewDoc.answer} />
                  </Callout>
                )}
                {previewDoc.solution && (
                  <Callout tone="neutral" label="Solution">
                    <Markdown text={previewDoc.solution} />
                  </Callout>
                )}
              </div>
            ) : (
              <p className="rounded-2xl border border-dashed border-edge px-5 py-8 text-center text-sm text-neutral-400">
                Your card appears here as you type — math typeset, images in place.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
