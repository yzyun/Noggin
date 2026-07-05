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
import { SubjectSelect } from "./fields/SubjectSelect";
import { TagInput } from "./fields/TagInput";

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

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-4xl space-y-5 p-6">
        <div>
          <h2 className="text-xl font-semibold">Import questions</h2>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            CSV, Excel or JSON → standard markdown files in your vault. Tip: you can also skip
            this entirely — any file following <code>QUESTION_FORMAT.md</code> dropped into{" "}
            <code>questions/</code> imports itself.
          </p>
        </div>

        {/* File pick */}
        <button
          onClick={() => fileInput.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files[0];
            if (f) void loadFile(f);
          }}
          className="flex w-full items-center justify-center rounded-lg border-2 border-dashed border-neutral-300 px-4 py-6 text-sm text-neutral-500 transition hover:border-blue-400 hover:text-neutral-700 dark:border-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200"
        >
          {fileName ? `📄 ${fileName} — click to replace` : "Drop a .csv / .xlsx / .json file here, or click to browse"}
        </button>
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

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        {result && <p className="text-sm font-medium text-green-600 dark:text-green-400">{result}</p>}

        {table && mapping && (
          <>
            {/* Column mapping */}
            <div>
              <h3 className="mb-2 text-sm font-semibold">Column mapping</h3>
              <div className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
                {TARGET_FIELDS.map((field) => (
                  <label key={field} className="block">
                    <span className="mb-0.5 block text-xs text-neutral-500 dark:text-neutral-400">
                      {FIELD_LABELS[field]}
                    </span>
                    <select
                      value={mapping[field] ?? ""}
                      onChange={(e) =>
                        setMapping({
                          ...mapping,
                          [field]: e.target.value === "" ? null : Number(e.target.value),
                        })
                      }
                      className="w-full rounded-md border border-neutral-300 bg-white px-1.5 py-1 text-xs dark:border-neutral-700 dark:bg-neutral-900"
                    >
                      <option value="">—</option>
                      {table.headers.map((h, i) => (
                        <option key={i} value={i}>
                          {h || `column ${i + 1}`}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
            </div>

            {/* Defaults for unmapped fields */}
            <div>
              <h3 className="mb-2 text-sm font-semibold">Defaults (used when a row has no value)</h3>
              <div className="grid grid-cols-2 gap-4">
                <label className="block">
                  <span className="mb-0.5 block text-xs text-neutral-500 dark:text-neutral-400">Subject</span>
                  <SubjectSelect
                    value={defaults.subject}
                    onChange={(v) => setDefaults({ ...defaults, subject: v })}
                    recent={recentFolders()}
                  />
                </label>
                <label className="block">
                  <span className="mb-0.5 block text-xs text-neutral-500 dark:text-neutral-400">Tags</span>
                  <TagInput
                    value={defaults.tags}
                    onChange={(tags) => setDefaults({ ...defaults, tags })}
                    suggestions={allTags()}
                  />
                </label>
                <label className="block">
                  <span className="mb-0.5 block text-xs text-neutral-500 dark:text-neutral-400">Difficulty</span>
                  <select
                    value={defaults.difficulty ?? ""}
                    onChange={(e) =>
                      setDefaults({
                        ...defaults,
                        difficulty: e.target.value === "" ? null : Number(e.target.value),
                      })
                    }
                    className="w-full rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900"
                  >
                    <option value="">none</option>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-0.5 block text-xs text-neutral-500 dark:text-neutral-400">Source</span>
                  <input
                    value={defaults.source}
                    onChange={(e) => setDefaults({ ...defaults, source: e.target.value })}
                    className="w-full rounded-md border border-neutral-300 bg-white px-2.5 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900"
                  />
                </label>
              </div>
            </div>

            {/* Preview */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold">
                  Preview{" "}
                  <span className="font-normal text-neutral-400">
                    {counts.ok} ok · {counts.duplicate} duplicate · {counts.invalid} invalid
                  </span>
                </h3>
                <label className="flex items-center gap-1.5 text-xs text-neutral-500 dark:text-neutral-400">
                  <input
                    type="checkbox"
                    checked={includeDupes}
                    onChange={(e) => setIncludeDupes(e.target.checked)}
                  />
                  import duplicates too
                </label>
              </div>
              <div className="max-h-80 overflow-y-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-neutral-50 dark:bg-neutral-900">
                    <tr className="text-left text-neutral-500 dark:text-neutral-400">
                      <th className="px-2 py-1.5">#</th>
                      <th className="px-2 py-1.5">Status</th>
                      <th className="px-2 py-1.5">Question</th>
                      <th className="px-2 py-1.5">Subject</th>
                      <th className="px-2 py-1.5">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {staged.slice(0, 200).map((s) => (
                      <tr
                        key={s.rowIndex}
                        className="border-t border-neutral-100 dark:border-neutral-800"
                      >
                        <td className="px-2 py-1 text-neutral-400">{s.rowIndex + 2}</td>
                        <td className="px-2 py-1">
                          <span
                            className={
                              s.status === "ok"
                                ? "text-green-600 dark:text-green-400"
                                : s.status === "duplicate"
                                  ? "text-amber-600 dark:text-amber-400"
                                  : "text-red-600 dark:text-red-400"
                            }
                          >
                            {s.status}
                          </span>
                        </td>
                        <td className="max-w-96 truncate px-2 py-1">
                          {s.doc ? deriveTitle(s.doc.question) : "—"}
                        </td>
                        <td className="px-2 py-1 text-neutral-500">{s.subject || "(root)"}</td>
                        <td className="px-2 py-1 text-neutral-400">{s.reason ?? ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {staged.length > 200 && (
                  <p className="px-2 py-1.5 text-center text-xs text-neutral-400">
                    …and {staged.length - 200} more rows
                  </p>
                )}
              </div>
            </div>

            <button
              onClick={commit}
              disabled={busy || toImport.length === 0}
              className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-blue-500 disabled:opacity-40"
            >
              {busy
                ? "Importing…"
                : `Import ${toImport.length} question${toImport.length === 1 ? "" : "s"}`}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
