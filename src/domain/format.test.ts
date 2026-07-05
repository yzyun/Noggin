import { describe, expect, it } from "vitest";
import {
  deriveBodyKind,
  parseQuestionFile,
  serializeQuestionFile,
  newQuestionMeta,
  FormatError,
} from "./format";

const SAMPLE = `---
id: 01J8XTESTULID0000000000000
schemaVersion: 1
type: question
body: math
difficulty: 3
tags: [mechanics, projectile]
source: "Halliday & Resnick Ch.4 Q17"
recall: both
created: 2026-07-05
futureKey: some value the app does not know yet
---

# Question
A projectile is launched at $30^\\circ$ with speed $v_0$.

![setup](../../attachments/proj-01.png)

# Answer
$R = \\dfrac{v_0^2 \\sin 2\\theta}{g}$

# Hint
Split into $x$ and $y$ components.
`;

describe("parseQuestionFile", () => {
  it("parses frontmatter and sections", () => {
    const doc = parseQuestionFile(SAMPLE);
    expect(doc.meta.id).toBe("01J8XTESTULID0000000000000");
    expect(doc.meta.body).toBe("math");
    expect(doc.meta.difficulty).toBe(3);
    expect(doc.meta.tags).toEqual(["mechanics", "projectile"]);
    expect(doc.question).toContain("projectile is launched");
    expect(doc.question).toContain("![setup]");
    expect(doc.answer).toContain("\\sin 2\\theta");
    expect(doc.hint).toContain("components");
    expect(doc.solution).toBeUndefined();
  });

  it("preserves unknown frontmatter keys (forward compat)", () => {
    const doc = parseQuestionFile(SAMPLE);
    expect(doc.meta.futureKey).toBe("some value the app does not know yet");
  });

  it("parses an explicit title and round-trips it", () => {
    const raw = `---\nid: t1\ntitle: Projectile range\n---\n# Question\nFind $R$.`;
    const doc = parseQuestionFile(raw);
    expect(doc.meta.title).toBe("Projectile range");
    const doc2 = parseQuestionFile(serializeQuestionFile(doc));
    expect(doc2.meta.title).toBe("Projectile range");
  });

  it("treats a blank title as absent", () => {
    const doc = parseQuestionFile(`---\nid: t2\ntitle: "  "\n---\n# Question\nq`);
    expect(doc.meta.title).toBeUndefined();
  });

  it("defaults missing optional keys leniently", () => {
    const doc = parseQuestionFile(`---\nid: abc\n---\n# Question\nhi`);
    expect(doc.meta.body).toBe("text");
    expect(doc.meta.recall).toBe("both");
    expect(doc.meta.tags).toEqual([]);
    expect(doc.meta.difficulty).toBeUndefined();
  });

  it("rejects out-of-range and non-integer difficulty", () => {
    expect(
      parseQuestionFile(`---\nid: a\ndifficulty: 9\n---\n# Question\nq`).meta.difficulty,
    ).toBeUndefined();
    expect(
      parseQuestionFile(`---\nid: a\ndifficulty: 3.5\n---\n# Question\nq`).meta.difficulty,
    ).toBeUndefined();
  });

  it("throws on missing frontmatter / question section / id", () => {
    expect(() => parseQuestionFile("# Question\nhi")).toThrow(FormatError);
    expect(() => parseQuestionFile("---\nid: x\n---\n# Answer\nfoo")).toThrow(FormatError);
    expect(() => parseQuestionFile("---\ntype: question\n---\n# Question\nq")).toThrow(FormatError);
  });

  it("rejects non-question files", () => {
    expect(() => parseQuestionFile("---\nid: x\ntype: note\n---\n# Question\nq")).toThrow(
      FormatError,
    );
  });
});

describe("deriveBodyKind", () => {
  it("detects math via inline and display LaTeX", () => {
    expect(deriveBodyKind("Solve $x^2-4=0$ for x")).toBe("math");
    expect(deriveBodyKind("Evaluate:\n$$\\int_0^1 x\\,dx$$")).toBe("math");
  });
  it("detects image-dominant questions", () => {
    expect(deriveBodyKind("![diagram](attachments/d.png)")).toBe("image");
    expect(deriveBodyKind("See figure.\n![f](attachments/f.png)")).toBe("image");
  });
  it("long text with an image is still text/math", () => {
    const q = `${"Describe the experimental setup shown and explain the result. "}![f](attachments/f.png)`;
    expect(deriveBodyKind(q)).toBe("text");
  });
  it("plain prose is text", () => {
    expect(deriveBodyKind("State Newton's third law.")).toBe("text");
  });
  it("derived on parse when body is missing", () => {
    const doc = parseQuestionFile("---\nid: k\n---\n# Question\nSolve $x=1$");
    expect(doc.meta.body).toBe("math");
  });
});

describe("round-trip", () => {
  it("parse → serialize → parse is stable", () => {
    const doc = parseQuestionFile(SAMPLE);
    const doc2 = parseQuestionFile(serializeQuestionFile(doc));
    expect(doc2).toEqual(doc);
  });

  it("serializes a new question with defaults", () => {
    const meta = newQuestionMeta("01TESTNEWID");
    const text = serializeQuestionFile({ meta, question: "What is $2+2$?", answer: "4" });
    const doc = parseQuestionFile(text);
    expect(doc.meta.id).toBe("01TESTNEWID");
    expect(doc.meta.schemaVersion).toBe(1);
    expect(doc.question).toBe("What is $2+2$?");
    expect(doc.answer).toBe("4");
  });

  it("omits empty sections", () => {
    const text = serializeQuestionFile({ meta: newQuestionMeta("x"), question: "q" });
    expect(text).not.toContain("# Answer");
    expect(text).not.toContain("# Hint");
  });
});
