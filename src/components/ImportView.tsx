// Bulk import: pick a CSV / Excel / JSON file, map its columns, review the
// validated preview, and commit — each accepted row becomes a standard
// markdown question file in the vault.

import { useMemo, useRef, useState } from "react";
import {
  buildStagedRows,
  guessMapping,
  parseImportFile,
  TARGET_FIELDS,
  type ImportDefaults,
  type Mapping,
  type ParsedTable,
  type StagedRow,
  type TargetField,
} from "../lib/import";
import { deriveTitle } from "../domain/title";
import { useQuestions } from "../state/questions";
import { Markdown } from "./Markdown";
import { SubjectSelect } from "./fields/SubjectSelect";
import { useUi } from "../state/ui";
import { DifficultyPicker } from "./fields/DifficultyPicker";
import { CheckIcon, UploadIcon } from "./icons";
import { TitleText } from "./TitleText";
import { Button } from "./ui/Button";
import { Field, INPUT } from "./ui/Field";
import { Toggle } from "./ui/Toggle";
import { TagInput } from "./fields/TagInput";
// The full format spec, rendered inline below so nobody has to hunt for the file.
import formatSpec from "../../QUESTION_FORMAT.md?raw";
import sampleCsv from "../../sample-import.csv?raw";

const FIELD_LABELS: Record<TargetField, string> = {
  question: "Question *",
  title: "Title",
  answer: "Answer",
  hint: "Hint",
  solution: "Solution",
  difficulty: "Difficulty",
  tags: "Tags",
  source: "Source",
  subject: "Subject",
};

export function ImportView() {
  const { allRows, allTags, recentFolders, importMany } = useQuestions();
  const fileInput = useRef<HTMLInputElement>(null);

  const [fileName, setFileName] = useState<string | null>(null);
  const [table, setTable] = useState<ParsedTable | null>(null);
  const [mapping, setMapping] = useState<Mapping | null>(null);
  const [defaults, setDefaults] = useState<ImportDefaults>({
    subject: "",
    tags: [],
    difficulty: null,
    source: "",
  });
  const [includeDupes, setIncludeDupes] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showSpec, setShowSpec] = useState(false);
  const [copied, setCopied] = useState(false);
  const [over, setOver] = useState(false);

  const existingTitles = useMemo(
    () => new Set(allRows.map((r) => (r.title ?? "").toLowerCase()).filter(Boolean)),
    [allRows],
  );

  const staged: StagedRow[] = useMemo(() => {
    if (!table || !mapping) return [];
    return buildStagedRows(table, mapping, defaults, existingTitles);
  }, [table, mapping, defaults, existingTitles]);

  const counts = useMemo(() => {
    const c = { ok: 0, duplicate: 0, invalid: 0 };
    for (const s of staged) c[s.status]++;
    return c;
  }, [staged]);

  const toImport = staged.filter(
    (s) => s.doc && (s.status === "ok" || (includeDupes && s.status === "duplicate")),
  );

  const loadFile = async (file: File) => {
    setError(null);
    setResult(null);
    try {
      const parsed = await parseImportFile(file);
      if (!parsed.headers.length) throw new Error("No header row found");
      setTable(parsed);
      setMapping(guessMapping(parsed.headers));
      setFileName(file.name);
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
      setTable(null);
      setMapping(null);
      setFileName(null);
    }
  };

  const commit = async () => {
    if (!toImport.length) return;
    setBusy(true);
    setError(null);
    try {
      const n = await importMany(
        toImport.map((s) => ({ doc: s.doc!, folder: s.subject })),
      );
      setResult(
        `Imported ${n} question${n === 1 ? "" : "s"} · skipped ${staged.length - toImport.length}`,
      );
      setTable(null);
      setMapping(null);
      setFileName(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setTable(null);
    setMapping(null);
    setFileName(null);
  };

  const loadSample = () =>
    void loadFile(new File([sampleCsv], "sample-import.csv", { type: "text/csv" }));

  const copySpec = async () => {
    try {
      await navigator.clipboard.writeText(formatSpec);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setShowSpec(true); // clipboard unavailable — show it to copy by hand
    }
  };

  const mapped = table && mapping;
  const firstRow = table?.rows[0] ?? [];

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl space-y-6 px-8 py-10">
          <div>
            <h1 className="font-display text-3xl font-semibold tracking-tight">Import questions</h1>
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
              Bring in questions in bulk. Each one becomes a Markdown file in your vault.
            </p>
          </div>

          {error && (
            <p
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
            >
              {error}
            </p>
          )}
          {result && (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-900 dark:border-green-900 dark:bg-green-950/40 dark:text-green-200">
              <span className="flex items-center gap-2">
                <CheckIcon /> {result}
              </span>
              <Button variant="ghost" onClick={() => useUi.getState().setView("questions")}>
                View questions
              </Button>
            </div>
          )}

          <input
            ref={fileInput}
            type="file"
            accept=".csv,.tsv,.xlsx,.xls,.json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void loadFile(f);
              e.target.value = "";
            }}
          />

          {!mapped ? (
            <>
              {/* Way 1: a spreadsheet */}
              <button
                onClick={() => fileInput.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  setOver(true);
                }}
                onDragLeave={() => setOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setOver(false);
                  const f = e.dataTransfer.files[0];
                  if (f) void loadFile(f);
                }}
                className={`flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed px-4 py-12 text-center transition-colors ${
                  over
                    ? "border-accent bg-accent-soft/60"
                    : "border-edge bg-surface hover:border-neutral-400 dark:hover:border-neutral-500"
                }`}
              >
                <UploadIcon className="h-7 w-7 text-neutral-400" />
                <span className="text-sm font-medium">Drop a spreadsheet here, or click to browse</span>
                <span className="text-xs text-neutral-500 dark:text-neutral-400">
                  CSV, Excel (.xlsx) or JSON · one question per row · you'll review everything
                  before it's saved
                </span>
              </button>
              <p className="-mt-3 text-center text-xs text-neutral-500 dark:text-neutral-400">
                No file handy?{" "}
                <button onClick={loadSample} className="underline underline-offset-2 hover:text-neutral-900 dark:hover:text-neutral-100">
                  Try it with sample questions
                </button>
              </p>

              {/* Ways 2 & 3: no import step at all */}
              <div>
                <h2 className="mb-2 text-sm font-semibold">Other ways in</h2>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-edge bg-surface p-4">
                    <h3 className="text-sm font-medium">Drop Markdown files into the vault</h3>
                    <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                      Any <code>.md</code> file in the right format placed in the vault's{" "}
                      <code>questions/</code> folder shows up within seconds. Subfolders become
                      subjects.
                    </p>
                  </div>
                  <div className="rounded-xl border border-edge bg-surface p-4">
                    <h3 className="text-sm font-medium">Ask an AI to write them</h3>
                    <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                      Paste the format into any AI — "generate 20 kinematics questions in this
                      format" — and save what it gives you into the vault.
                    </p>
                    <div className="mt-3 flex gap-2">
                      <Button variant="ghost" onClick={() => void copySpec()}>
                        {copied ? "Copied" : "Copy format"}
                      </Button>
                      <Button variant="ghost" onClick={() => setShowSpec((v) => !v)}>
                        {showSpec ? "Hide format" : "Read format"}
                      </Button>
                    </div>
                  </div>
                </div>
                {showSpec && (
                  <div className="mt-3 rounded-xl border border-edge bg-surface px-5 py-4 text-sm">
                    <Markdown text={formatSpec} />
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              {/* Loaded file */}
              <div className="flex items-center justify-between gap-3 rounded-xl border border-edge bg-surface px-4 py-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{fileName}</div>
                  <div className="text-xs text-neutral-500 dark:text-neutral-400">
                    {table.rows.length} row{table.rows.length === 1 ? "" : "s"} · {table.headers.length}{" "}
                    columns
                  </div>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button variant="ghost" onClick={() => fileInput.current?.click()}>
                    Choose another
                  </Button>
                  <Button variant="ghost" onClick={reset}>
                    Cancel
                  </Button>
                </div>
              </div>

              {/* 1 — mapping */}
              <section>
                <StepHeading n={1} title="Match your columns" hint="We guessed from the headers — fix anything that's off." />
                <div className="overflow-hidden rounded-xl border border-edge bg-surface">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-edge bg-neutral-50 text-left text-xs text-neutral-500 dark:bg-neutral-900/40 dark:text-neutral-400">
                        <th className="w-32 px-4 py-2 font-medium">Noggin field</th>
                        <th className="w-56 px-2 py-2 font-medium">Your column</th>
                        <th className="px-4 py-2 font-medium">First row</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-edge">
                      {TARGET_FIELDS.map((field) => {
                        const col = mapping[field];
                        const sample = col != null ? String(firstRow[col] ?? "") : "";
                        return (
                          <tr key={field}>
                            <td className="px-4 py-1.5">
                              {FIELD_LABELS[field].replace(" *", "")}
                              {field === "question" && (
                                <span className="ml-1.5 text-xs text-neutral-400">required</span>
                              )}
                            </td>
                            <td className="px-2 py-1.5">
                              <select
                                aria-label={`Column for ${field}`}
                                value={col ?? ""}
                                onChange={(e) =>
                                  setMapping({
                                    ...mapping,
                                    [field]: e.target.value === "" ? null : Number(e.target.value),
                                  })
                                }
                                className={`w-full rounded-md border bg-surface px-2 py-1 text-[13px] ${
                                  field === "question" && col == null ? "border-red-400" : "border-edge"
                                } ${col == null ? "text-neutral-400" : ""}`}
                              >
                                <option value="">Not in my file</option>
                                {table.headers.map((h, i) => (
                                  <option key={i} value={i}>
                                    {h || `column ${i + 1}`}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="max-w-0 truncate px-4 py-1.5 text-[13px] text-neutral-500 dark:text-neutral-400">
                              {sample || "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>

              {/* 2 — defaults */}
              <section>
                <StepHeading n={2} title="Fill the gaps" hint="Used for any row that has no value of its own." />
                <div className="grid grid-cols-2 gap-4 rounded-xl border border-edge bg-surface p-4">
                  <Field label="Subject">
                    <SubjectSelect
                      value={defaults.subject}
                      onChange={(v) => setDefaults({ ...defaults, subject: v })}
                      recent={recentFolders()}
                    />
                  </Field>
                  <Field label="Tags" as="div">
                    <TagInput
                      value={defaults.tags}
                      onChange={(tags) => setDefaults({ ...defaults, tags })}
                      suggestions={allTags()}
                    />
                  </Field>
                  <Field label="Difficulty" as="div">
                    <DifficultyPicker
                      value={defaults.difficulty}
                      onChange={(difficulty) => setDefaults({ ...defaults, difficulty })}
                    />
                  </Field>
                  <Field label="Source">
                    <input
                      value={defaults.source}
                      onChange={(e) => setDefaults({ ...defaults, source: e.target.value })}
                      className={`w-full ${INPUT}`}
                    />
                  </Field>
                </div>
              </section>

              {/* 3 — review */}
              <section>
                <StepHeading n={3} title="Review" />
                <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
                  <StatusPill status="ok" count={counts.ok} />
                  {counts.duplicate > 0 && <StatusPill status="duplicate" count={counts.duplicate} />}
                  {counts.invalid > 0 && <StatusPill status="invalid" count={counts.invalid} />}
                  {counts.duplicate > 0 && (
                    <label className="ml-auto flex items-center gap-2 text-neutral-600 dark:text-neutral-300">
                      Import duplicates anyway
                      <Toggle checked={includeDupes} onChange={setIncludeDupes} label="Import duplicates anyway" />
                    </label>
                  )}
                </div>
                <div className="max-h-80 overflow-y-auto rounded-xl border border-edge bg-surface">
                  <table className="w-full text-[13px]">
                    <thead className="sticky top-0 bg-neutral-50 dark:bg-neutral-900">
                      <tr className="text-left text-xs text-neutral-500 dark:text-neutral-400">
                        <th className="w-12 px-3 py-2 font-medium">Row</th>
                        <th className="px-2 py-2 font-medium">Question</th>
                        <th className="px-2 py-2 font-medium">Subject</th>
                        <th className="px-3 py-2 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-edge">
                      {staged.slice(0, 200).map((s) => {
                        const skipped =
                          s.status === "invalid" || (s.status === "duplicate" && !includeDupes);
                        return (
                          <tr key={s.rowIndex} className={skipped ? "text-neutral-400" : ""}>
                            <td className="px-3 py-1.5 text-neutral-400 tabular-nums">{s.rowIndex + 2}</td>
                            <td className="max-w-0 px-2 py-1.5">
                              <div className="truncate">
                                {s.doc ? <TitleText text={deriveTitle(s.doc.question)} /> : "—"}
                              </div>
                              {s.reason && s.status !== "ok" && (
                                <div className="truncate text-xs text-neutral-500 dark:text-neutral-400">
                                  {s.reason}
                                </div>
                              )}
                            </td>
                            <td className="w-40 truncate px-2 py-1.5 text-neutral-500 dark:text-neutral-400">
                              {s.subject || "—"}
                            </td>
                            <td className="w-28 px-3 py-1.5 whitespace-nowrap">
                              <StatusPill status={s.status} />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {staged.length > 200 && (
                    <p className="border-t border-edge px-2 py-1.5 text-center text-xs text-neutral-400">
                      …and {staged.length - 200} more rows
                    </p>
                  )}
                </div>
              </section>
            </>
          )}
        </div>
      </div>

      {/* Pinned commit bar */}
      {mapped && (
        <div className="shrink-0 border-t border-edge bg-surface px-8 py-3">
          <div className="mx-auto flex max-w-3xl items-center justify-between gap-4">
            <span className="text-sm text-neutral-500 dark:text-neutral-400">
              {staged.length - toImport.length > 0
                ? `${staged.length - toImport.length} row${staged.length - toImport.length === 1 ? "" : "s"} will be skipped`
                : "Every row is ready"}
            </span>
            <Button size="lg" onClick={commit} disabled={busy || toImport.length === 0}>
              {busy
                ? "Importing…"
                : `Import ${toImport.length} question${toImport.length === 1 ? "" : "s"}`}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function StepHeading({ n, title, hint }: { n: number; title: string; hint?: string }) {
  return (
    <div className="mb-2 flex items-baseline gap-2">
      <span className="flex h-5 w-5 shrink-0 items-center justify-center self-center rounded-full bg-neutral-200 text-[11px] font-semibold tabular-nums dark:bg-neutral-700">
        {n}
      </span>
      <h2 className="text-sm font-semibold">{title}</h2>
      {hint && <span className="text-xs text-neutral-500 dark:text-neutral-400">{hint}</span>}
    </div>
  );
}

const STATUS = {
  ok: { label: "Ready", cls: "bg-green-50 text-green-800 dark:bg-green-950/50 dark:text-green-300" },
  duplicate: {
    label: "Duplicate",
    cls: "bg-amber-50 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300",
  },
  invalid: { label: "Can't import", cls: "bg-red-50 text-red-800 dark:bg-red-950/50 dark:text-red-300" },
} as const;

function StatusPill({ status, count }: { status: keyof typeof STATUS; count?: number }) {
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS[status].cls}`}>
      {count !== undefined && `${count} `}
      {count !== undefined ? STATUS[status].label.toLowerCase() : STATUS[status].label}
    </span>
  );
}
