// Bulk import: CSV / Excel / JSON → staged QuestionDocs ready to write as
// vault markdown files. Parsing needs the browser File API; the mapping and
// validation logic is pure and unit-tested.

import Papa from "papaparse";
import * as XLSX from "xlsx";
import { deriveBodyKind, newQuestionMeta } from "../domain/format";
import { newId } from "../domain/ids";
import { deriveTitle } from "../domain/title";
import type { QuestionDoc } from "../domain/types";

// ---------------------------------------------------------------------------
// Parsing (File → headers + string rows)
// ---------------------------------------------------------------------------

export interface ParsedTable {
  headers: string[];
  rows: string[][];
}

export async function parseImportFile(file: File): Promise<ParsedTable> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv") || name.endsWith(".tsv")) return parseCsv(file);
  if (name.endsWith(".xlsx") || name.endsWith(".xls")) return parseExcel(file);
  if (name.endsWith(".json")) return parseJson(await file.text());
  throw new Error("Unsupported file type — use .csv, .xlsx or .json");
}

function parseCsv(file: File): Promise<ParsedTable> {
  return new Promise((resolve, reject) => {
    Papa.parse<string[]>(file, {
      skipEmptyLines: "greedy",
      complete: (res) => {
        const [headers = [], ...rows] = res.data;
        resolve({ headers: headers.map(String), rows: rows.map((r) => r.map(String)) });
      },
      error: reject,
    });
  });
}

async function parseExcel(file: File): Promise<ParsedTable> {
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
  const [headers = [], ...rows] = aoa;
  return {
    headers: headers.map(String),
    rows: rows.filter((r) => r.some((c) => String(c).trim())).map((r) => r.map(String)),
  };
}

/** JSON: an array of objects; keys become headers. */
export function parseJson(text: string): ParsedTable {
  const data = JSON.parse(text);
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error("JSON must be a non-empty array of objects");
  }
  const headers = [...new Set(data.flatMap((o) => Object.keys(o as object)))];
  const rows = data.map((o) =>
    headers.map((h) => {
      const v = (o as Record<string, unknown>)[h];
      if (v == null) return "";
      if (Array.isArray(v)) return v.map(String).join(", ");
      return String(v);
    }),
  );
  return { headers, rows };
}

// ---------------------------------------------------------------------------
// Mapping (pure)
// ---------------------------------------------------------------------------

export const TARGET_FIELDS = [
  "question",
  "title",
  "answer",
  "hint",
  "solution",
  "difficulty",
  "tags",
  "source",
  "subject",
] as const;
export type TargetField = (typeof TARGET_FIELDS)[number];

/** column index per target field; null = not mapped */
export type Mapping = Record<TargetField, number | null>;

const HEADER_HINTS: Record<TargetField, RegExp> = {
  question: /question|prompt|problem|front|body/i,
  title: /^title|^name|heading/i,
  answer: /^answer|back|solution_short|result/i,
  hint: /hint|clue/i,
  solution: /^solution|worked|working|explanation/i,
  difficulty: /difficult|level|rating/i,
  tags: /tags?|topics?|keywords?/i,
  source: /source|origin|book|reference|ref/i,
  subject: /subject|folder|category|chapter|unit/i,
};

/** Guess which column feeds which field from the header names. */
export function guessMapping(headers: string[]): Mapping {
  const mapping = Object.fromEntries(TARGET_FIELDS.map((f) => [f, null])) as Mapping;
  const taken = new Set<number>();
  for (const field of TARGET_FIELDS) {
    const idx = headers.findIndex((h, i) => !taken.has(i) && HEADER_HINTS[field].test(h.trim()));
    if (idx >= 0) {
      mapping[field] = idx;
      taken.add(idx);
    }
  }
  return mapping;
}

// ---------------------------------------------------------------------------
// Row → QuestionDoc (pure)
// ---------------------------------------------------------------------------

export interface ImportDefaults {
  subject: string;
  tags: string[];
  difficulty: number | null;
  source: string;
}

export type RowStatus = "ok" | "duplicate" | "invalid";

export interface StagedRow {
  rowIndex: number; // 0-based data row
  status: RowStatus;
  reason?: string;
  doc?: QuestionDoc;
  subject: string;
}

export function splitTags(raw: string): string[] {
  return raw
    .split(/[,;]/)
    .map((t) => t.trim())
    .filter(Boolean);
}

/** Build staged questions from parsed rows. `existingTitles` (lowercased)
 *  enables duplicate detection against the current bank. */
export function buildStagedRows(
  table: ParsedTable,
  mapping: Mapping,
  defaults: ImportDefaults,
  existingTitles: Set<string>,
): StagedRow[] {
  const staged: StagedRow[] = [];
  const seenInFile = new Set<string>();

  const cell = (row: string[], field: TargetField): string => {
    const idx = mapping[field];
    return idx === null || idx === undefined ? "" : (row[idx] ?? "").trim();
  };

  for (let i = 0; i < table.rows.length; i++) {
    const row = table.rows[i];
    const subject = cell(row, "subject") || defaults.subject;

    const question = cell(row, "question");
    if (!question) {
      staged.push({ rowIndex: i, status: "invalid", reason: "empty question", subject });
      continue;
    }

    // Difficulty: integer 1–5 or blank; anything else is rejected loudly
    // rather than silently truncated.
    let difficulty: number | undefined;
    const rawDiff = cell(row, "difficulty");
    if (rawDiff) {
      const n = Number(rawDiff);
      if (!Number.isInteger(n) || n < 1 || n > 5) {
        staged.push({
          rowIndex: i,
          status: "invalid",
          reason: `difficulty "${rawDiff}" is not an integer 1–5`,
          subject,
        });
        continue;
      }
      difficulty = n;
    } else if (defaults.difficulty !== null) {
      difficulty = defaults.difficulty;
    }

    // Duplicates: same normalized question text within the file or an
    // existing question with the same (explicit or derived) title.
    const explicitTitle = cell(row, "title") || undefined;
    const normalized = question.toLowerCase().replace(/\s+/g, " ");
    const title = (explicitTitle ?? deriveTitle(question)).toLowerCase();
    const isDup = seenInFile.has(normalized) || existingTitles.has(title);
    seenInFile.add(normalized);

    const tags = [...new Set([...splitTags(cell(row, "tags")), ...defaults.tags])];
    const doc: QuestionDoc = {
      meta: newQuestionMeta(newId(), {
        title: explicitTitle,
        body: deriveBodyKind(question),
        difficulty,
        tags,
        source: cell(row, "source") || defaults.source || undefined,
      }),
      question,
      answer: cell(row, "answer") || undefined,
      hint: cell(row, "hint") || undefined,
      solution: cell(row, "solution") || undefined,
    };

    staged.push({
      rowIndex: i,
      status: isDup ? "duplicate" : "ok",
      reason: isDup ? "same question already exists" : undefined,
      doc,
      subject,
    });
  }
  return staged;
}
