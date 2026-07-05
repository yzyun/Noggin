import { describe, expect, it } from "vitest";
import {
  buildStagedRows,
  guessMapping,
  parseJson,
  splitTags,
  type ImportDefaults,
  type ParsedTable,
} from "./import";

const DEFAULTS: ImportDefaults = { subject: "", tags: [], difficulty: null, source: "" };

describe("guessMapping", () => {
  it("matches common header names", () => {
    const m = guessMapping(["Question", "Answer", "Difficulty", "Tags", "Source", "Subject"]);
    expect(m.question).toBe(0);
    expect(m.answer).toBe(1);
    expect(m.difficulty).toBe(2);
    expect(m.tags).toBe(3);
    expect(m.source).toBe(4);
    expect(m.subject).toBe(5);
  });
  it("matches loose synonyms and leaves unknowns null", () => {
    const m = guessMapping(["Problem statement", "Result", "Level", "Topics", "unrelated"]);
    expect(m.question).toBe(0);
    expect(m.answer).toBe(1);
    expect(m.difficulty).toBe(2);
    expect(m.tags).toBe(3);
    expect(m.hint).toBeNull();
  });
});

describe("parseJson", () => {
  it("flattens objects into headers + rows, arrays joined", () => {
    const t = parseJson(
      JSON.stringify([
        { question: "Q1", tags: ["a", "b"], difficulty: 2 },
        { question: "Q2", answer: "A2" },
      ]),
    );
    expect(t.headers).toEqual(["question", "tags", "difficulty", "answer"]);
    expect(t.rows[0]).toEqual(["Q1", "a, b", "2", ""]);
    expect(t.rows[1][3]).toBe("A2");
  });
  it("rejects non-arrays", () => {
    expect(() => parseJson("{}")).toThrow();
  });
});

describe("buildStagedRows", () => {
  const table = (rows: string[][]): ParsedTable => ({
    headers: ["question", "answer", "difficulty", "tags", "subject"],
    rows,
  });
  const mapping = guessMapping(["question", "answer", "difficulty", "tags", "subject"]);

  it("builds docs with parsed fields", () => {
    const staged = buildStagedRows(
      table([["What is $2+2$?", "4", "1", "arithmetic; basics", "math"]]),
      mapping,
      DEFAULTS,
      new Set(),
    );
    expect(staged[0].status).toBe("ok");
    expect(staged[0].doc?.meta.difficulty).toBe(1);
    expect(staged[0].doc?.meta.tags).toEqual(["arithmetic", "basics"]);
    expect(staged[0].doc?.meta.body).toBe("math");
    expect(staged[0].subject).toBe("math");
  });

  it("rejects empty questions and bad difficulty", () => {
    const staged = buildStagedRows(
      table([
        ["", "x", "", "", ""],
        ["Q", "", "3.5", "", ""],
        ["Q2", "", "9", "", ""],
      ]),
      mapping,
      DEFAULTS,
      new Set(),
    );
    expect(staged.map((s) => s.status)).toEqual(["invalid", "invalid", "invalid"]);
    expect(staged[1].reason).toContain("3.5");
  });

  it("flags duplicates within the file and against the bank", () => {
    const staged = buildStagedRows(
      table([
        ["Same question", "", "", "", ""],
        ["same   QUESTION", "", "", "", ""],
        ["What is the probability of a 3 coin flips?", "", "", "", ""],
      ]),
      mapping,
      DEFAULTS,
      new Set(["what is the probability of a 3 coin flips?"]),
    );
    expect(staged[0].status).toBe("ok");
    expect(staged[1].status).toBe("duplicate");
    expect(staged[2].status).toBe("duplicate");
  });

  it("applies defaults for subject/tags/difficulty/source", () => {
    const staged = buildStagedRows(
      table([["Q only", "", "", "", ""]]),
      mapping,
      { subject: "physics/waves", tags: ["imported"], difficulty: 2, source: "Batch A" },
      new Set(),
    );
    expect(staged[0].subject).toBe("physics/waves");
    expect(staged[0].doc?.meta.tags).toEqual(["imported"]);
    expect(staged[0].doc?.meta.difficulty).toBe(2);
    expect(staged[0].doc?.meta.source).toBe("Batch A");
  });
});

describe("splitTags", () => {
  it("splits on commas and semicolons, trims empties", () => {
    expect(splitTags("a, b; c,,")).toEqual(["a", "b", "c"]);
  });
});
