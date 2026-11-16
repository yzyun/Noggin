// Deriving a display title and a filename slug from question markdown.
// Pure functions — unit-tested alongside format.ts.

/** The title shown in lists: the user's explicit title if set, otherwise
 *  derived from the question text. */
export function effectiveTitle(explicit: string | undefined, questionMarkdown: string): string {
  return explicit?.trim() || deriveTitle(questionMarkdown);
}

/** Cut to maxLen without splitting a `$…$` span in half. */
function truncate(line: string, maxLen: number): string {
  if (line.length <= maxLen) return line;
  let cut = line.slice(0, maxLen - 1);
  if ((cut.match(/\$/g)?.length ?? 0) % 2 === 1) cut = cut.slice(0, cut.lastIndexOf("$"));
  return `${cut.trimEnd()}…`;
}

/** First meaningful line of the question, stripped to plain-ish text. Inline
 *  math is kept as `$…$` so lists can typeset it (see TitleText). */
export function deriveTitle(questionMarkdown: string, maxLen = 80): string {
  for (const rawLine of questionMarkdown.split("\n")) {
    const line = rawLine
      .replace(/!\[[^\]]*\]\([^)]*\)/g, "") // images
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // links → text
      .replace(/\$\$([\s\S]*?)\$\$/g, "$$$1$$") // display math → inline
      .replace(/^#+\s*/, "") // headings
      // emphasis/quote markers — but never inside math, where _ and * mean something
      .split(/(\$[^$]*\$)/)
      .map((part, i) => (i % 2 ? part : part.replace(/[*_`>]/g, "")))
      .join("")
      .trim();
    if (line) return truncate(line, maxLen);
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
