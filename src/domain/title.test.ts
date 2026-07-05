import { describe, expect, it } from "vitest";
import { deriveTitle, effectiveTitle, slugify } from "./title";

describe("effectiveTitle", () => {
  it("prefers the explicit title", () => {
    expect(effectiveTitle("My title", "Some question")).toBe("My title");
  });
  it("falls back to the derived title when blank or missing", () => {
    expect(effectiveTitle("   ", "Some question")).toBe("Some question");
    expect(effectiveTitle(undefined, "Some question")).toBe("Some question");
  });
});

describe("deriveTitle", () => {
  it("takes the first meaningful line, stripped of markup", () => {
    expect(deriveTitle("A ball is thrown at $30^\\circ$ upward.\nMore text")).toBe(
      "A ball is thrown at [math] upward.",
    );
  });
  it("skips images and blank lines", () => {
    expect(deriveTitle("![setup](attachments/a.png)\n\nFind the range.")).toBe("Find the range.");
  });
  it("strips headings, emphasis and links", () => {
    expect(deriveTitle("## **Bold** [link](http://x)")).toBe("Bold link");
  });
  it("truncates long lines", () => {
    const t = deriveTitle("x".repeat(200));
    expect(t.length).toBe(80);
    expect(t.endsWith("…")).toBe(true);
  });
  it("falls back for image-only questions", () => {
    expect(deriveTitle("![diagram](attachments/d.png)")).toBe("Untitled question");
  });
});

describe("slugify", () => {
  it("lowercases and dashes", () => {
    expect(slugify("A ball is thrown!")).toBe("a-ball-is-thrown");
  });
  it("handles math placeholders and symbols", () => {
    expect(slugify("Solve [math] for x = 2")).toBe("solve-math-for-x-2");
  });
  it("never returns empty", () => {
    expect(slugify("$$$")).toBe("question");
  });
  it("caps length without trailing dash", () => {
    const s = slugify("word ".repeat(30));
    expect(s.length).toBeLessThanOrEqual(40);
    expect(s.endsWith("-")).toBe(false);
  });
});
