// Deriving a display title and a filename slug from question markdown.
// Pure functions — unit-tested alongside format.ts.

/** The title shown in lists: the user's explicit title if set, otherwise
 *  derived from the question text. */
export function effectiveTitle(explicit: string | undefined, questionMarkdown: string): string {
  return explicit?.trim() || deriveTitle(questionMarkdown);
}

/** First meaningful line of the question, stripped to plain-ish text. */
export function deriveTitle(questionMarkdown: string, maxLen = 80): string {
  for (const rawLine of questionMarkdown.split("\n")) {
    const line = rawLine
      .replace(/!\[[^\]]*\]\([^)]*\)/g, "") // images
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // links → text
      .replace(/\$\$[\s\S]*?\$\$/g, "[math]") // display math
      .replace(/\$[^$]*\$/g, "[math]") // inline math
      .replace(/^#+\s*/, "") // headings
      .replace(/[*_`>]/g, "") // emphasis/quote markers
      .trim();
    if (line) {
      return line.length > maxLen ? `${line.slice(0, maxLen - 1)}…` : line;
    }
  }
  return "Untitled question";
}

/** Filesystem-safe slug for filenames. */
export function slugify(text: string, maxLen = 40): string {
  const slug = text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip diacritics
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLen)
    .replace(/-+$/, "");
  return slug || "question";
}
