# Noggin Question File Format (v1)

This document is self-contained. Give it to any AI, script, or scraper and ask it to produce
files in this format — they will import cleanly into Noggin by dropping them into the vault's
`questions/` folder (any subfolder = the question's folder/topic).

## One file = one question

Each question is a single UTF-8 Markdown file (`.md`) with:

1. **YAML frontmatter** between `---` lines (metadata)
2. **Sections** introduced by exact level-1 headings: `# Question`, `# Answer`, `# Hint`, `# Solution`

## Frontmatter fields

| Field | Required | Type | Meaning |
|---|---|---|---|
| `id` | **yes** | string | Unique identity. ULID recommended (26 chars, sortable), but any globally-unique string works. Never reuse or change it. |
| `schemaVersion` | recommended | integer | Format version. Currently `1`. |
| `type` | recommended | string | Must be `question` (files with another `type` are ignored). |
| `body` | optional | `text` \| `math` \| `image` | Dominant content kind. Auto-derived if omitted. |
| `difficulty` | optional | integer 1–5 | 1 = easiest, 5 = hardest. Non-integers are ignored. |
| `tags` | optional | list of strings | Topic tags, e.g. `[mechanics, projectile]`. |
| `source` | optional | string | Where the question came from (book, paper, exam, URL). |
| `recall` | optional | `flashcard` \| `typein` \| `both` | How the question is reviewed. Default `both`. |
| `created` | optional | `YYYY-MM-DD` | Creation date. |

Unknown extra fields are allowed and preserved — never a parse error.

## Sections

- `# Question` — **required**. The question body.
- `# Answer` — optional. The short answer (revealed during review).
- `# Hint` — optional. A nudge shown on request before revealing the answer.
- `# Solution` — optional. Full worked solution.

Section content is ordinary Markdown (GFM):

- **Math**: LaTeX between `$…$` (inline) or `$$…$$` (display). Rendered with KaTeX.
- **Images**: standard Markdown images referencing the vault's attachments folder:
  `![optional alt](attachments/figure-name.png)`. Put the image file in `attachments/` at the
  vault root. Relative prefixes like `../../attachments/…` are also accepted.
- Tables, lists, code fences, links all work.

## Complete example

```markdown
---
id: 01J8XABCDEF0123456789ABCDE
schemaVersion: 1
type: question
body: math
difficulty: 3
tags: [mechanics, kinematics, projectile]
source: "Halliday & Resnick Ch.4 Q17"
recall: both
created: 2026-07-05
---

# Question
A projectile is launched at $30^\circ$ above the horizontal with speed $v_0$.
Ignoring air resistance, find an expression for its horizontal range.

![setup diagram](attachments/proj-01.png)

# Answer
$$R = \frac{v_0^2 \sin 2\theta}{g}$$

# Hint
Treat the horizontal and vertical motions independently.

# Solution
Time of flight from vertical motion: $t = \dfrac{2 v_0 \sin\theta}{g}$.
Horizontal distance: $R = v_0 \cos\theta \cdot t = \dfrac{v_0^2 \sin 2\theta}{g}$.
Maximum at $\theta = 45^\circ$.
```

## Rules for generators (AIs / scrapers)

1. Emit **one file per question**; filename: lowercase words joined by `-`, ending in `.md`
   (e.g. `projectile-range-x7k2p9.md`). A short unique suffix avoids collisions.
2. Always include `id`, `type: question`, and a non-empty `# Question` section — everything
   else is optional.
3. Escape a literal dollar sign as `\$` so it isn't parsed as math.
4. Keep LaTeX KaTeX-compatible (no custom packages; `\dfrac`, `\sin`, matrices, `align*` are fine).
5. Don't invent new section headings — extra prose belongs inside the four standard sections.
6. To organise by topic, place files in nested subfolders of `questions/`
   (e.g. `questions/mechanics/kinematics/…`); the folder path becomes the question's folder.
