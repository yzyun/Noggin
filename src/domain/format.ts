// The question file format: YAML frontmatter + markdown sections split on
// `# Question` / `# Answer` / `# Hint` / `# Solution` headings.
//
// This module is the single place that understands the on-disk format.
// It is pure (no fs, no Tauri) so scrapers/importers/tests can reuse it.
//
// Design rules:
//  - Unknown frontmatter keys are preserved on round-trip (forward compat).
//  - Parsing is lenient (missing keys get defaults); serializing is strict.

import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import {
  SCHEMA_VERSION,
  type BodyKind,
  type QuestionDoc,
  type QuestionMeta,
  type RecallMode,
} from "./types";

const SECTION_NAMES = ["Question", "Answer", "Hint", "Solution"] as const;
type SectionName = (typeof SECTION_NAMES)[number];

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;
const SECTION_RE = /^#\s+(Question|Answer|Hint|Solution)\s*$/gim;

export class FormatError extends Error {}

const BODY_KINDS: BodyKind[] = ["text", "math", "image"];
const RECALL_MODES: RecallMode[] = ["flashcard", "typein", "both"];

/** Parse the raw text of a question `.md` file. Throws FormatError if the
 *  file is not a question file or has no `# Question` section. */
export function parseQuestionFile(raw: string): QuestionDoc {
  const fm = raw.match(FRONTMATTER_RE);
  if (!fm) throw new FormatError("missing YAML frontmatter");

  let parsed: unknown;
  try {
    parsed = parseYaml(fm[1]);
  } catch (e) {
    throw new FormatError(`invalid YAML frontmatter: ${(e as Error).message}`);
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new FormatError("frontmatter must be a YAML mapping");
  }
  const rawMeta = parsed as Record<string, unknown>;
  if (rawMeta.type !== undefined && rawMeta.type !== "question") {
    throw new FormatError(`not a question file (type: ${String(rawMeta.type)})`);
  }
  if (typeof rawMeta.id !== "string" || rawMeta.id.length === 0) {
    throw new FormatError("frontmatter must include a string `id`");
  }

  // Lenient defaults; unknown keys ride along untouched.
  const meta: QuestionMeta = {
    ...rawMeta,
    id: rawMeta.id,
    schemaVersion:
      typeof rawMeta.schemaVersion === "number" ? rawMeta.schemaVersion : SCHEMA_VERSION,
    type: "question",
    body: BODY_KINDS.includes(rawMeta.body as BodyKind) ? (rawMeta.body as BodyKind) : "text",
    tags: Array.isArray(rawMeta.tags) ? rawMeta.tags.map(String) : [],
    recall: RECALL_MODES.includes(rawMeta.recall as RecallMode)
      ? (rawMeta.recall as RecallMode)
      : "both",
    created: typeof rawMeta.created === "string" ? rawMeta.created : "",
    difficulty: clampDifficulty(rawMeta.difficulty),
    source: typeof rawMeta.source === "string" ? rawMeta.source : undefined,
  };

  const body = raw.slice(fm[0].length);
  const sections = splitSections(body);
  const question = sections.get("Question")?.trim();
  if (!question) throw new FormatError("missing `# Question` section");

  return {
    meta,
    question,
    answer: sections.get("Answer")?.trim() || undefined,
    hint: sections.get("Hint")?.trim() || undefined,
    solution: sections.get("Solution")?.trim() || undefined,
  };
}

/** Serialize a QuestionDoc back to file text. */
export function serializeQuestionFile(doc: QuestionDoc): string {
  const { meta } = doc;
  if (!meta.id) throw new FormatError("meta.id is required");
  if (!doc.question.trim()) throw new FormatError("question body is required");

  // Emit known keys in a stable order first, then any unknown extras.
  const KNOWN_ORDER = [
    "id",
    "schemaVersion",
    "type",
    "body",
    "difficulty",
    "tags",
    "source",
    "recall",
    "created",
  ];
  const ordered: Record<string, unknown> = {};
  for (const k of KNOWN_ORDER) {
    if (meta[k] !== undefined) ordered[k] = meta[k];
  }
  for (const k of Object.keys(meta)) {
    if (!(k in ordered)) ordered[k] = meta[k];
  }

  const parts = [`---\n${stringifyYaml(ordered).trimEnd()}\n---`, ""];
  const push = (name: SectionName, content?: string) => {
    if (content?.trim()) parts.push(`# ${name}\n${content.trim()}`, "");
  };
  push("Question", doc.question);
  push("Answer", doc.answer);
  push("Hint", doc.hint);
  push("Solution", doc.solution);
  return parts.join("\n").trimEnd() + "\n";
}

/** Create the frontmatter for a brand-new question. */
export function newQuestionMeta(id: string, overrides: Partial<QuestionMeta> = {}): QuestionMeta {
  return {
    id,
    schemaVersion: SCHEMA_VERSION,
    type: "question",
    body: "text",
    tags: [],
    recall: "both",
    created: new Date().toISOString().slice(0, 10),
    ...overrides,
  };
}

function splitSections(body: string): Map<SectionName, string> {
  const out = new Map<SectionName, string>();
  const matches = [...body.matchAll(SECTION_RE)];
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const name = capitalize(m[1]) as SectionName;
    const start = m.index! + m[0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index! : body.length;
    // First heading of a given name wins; later duplicates are ignored.
    if (!out.has(name)) out.set(name, body.slice(start, end));
  }
  return out;
}

function clampDifficulty(v: unknown): number | undefined {
  if (typeof v !== "number" || !Number.isInteger(v)) return undefined;
  return v >= 1 && v <= 5 ? v : undefined;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}
