# 🧠 Noggin

**A local-first study app for students.** Collect the questions worth practicing — with full
LaTeX math, diagrams and images — organise them into subjects, and master them with
**spaced repetition** and **active recall**. Built like Obsidian: your data is a plain folder
of Markdown files (a **vault**) that you own, sync, and edit however you like. No account,
no cloud, no internet required.

Made for physics & math, where `$E = mc^2$` should just render.

---

## Install (macOS)

1. Download **`Noggin_0.7.0_aarch64.dmg`** (or the latest version) from the
   [Releases page](https://github.com/yzyun/Noggin/releases) (Apple Silicon).
2. Open the `.dmg` and drag **Noggin** into **Applications**.
3. First launch: right-click **Noggin.app → Open → Open**. The app is ad-hoc signed but not
   notarized with Apple, so macOS warns once. If macOS says the app is **"damaged and can't be
   opened"**, that's just the download-quarantine flag — clear it with
   `xattr -cr /Applications/Noggin.app` in Terminal, then open it again.
4. Pick (or create) an empty folder as your **vault** — e.g. `~/Documents/Study Vault`.
   That's it. Noggin remembers your vault and reopens it next launch.

### Build from source (any platform Tauri supports)

```bash
git clone https://github.com/yzyun/Noggin.git && cd Noggin
npm install                 # frontend deps
npm run tauri dev           # run in development (needs Rust — rustup.rs)
npm run tauri build         # produce the installable app/dmg
npm test                    # unit tests
```

---

## How your data is stored

```
<your vault>/
  questions/               one .md file per question — the source of truth
    mechanics/
      kinematics/…         nested folders = subjects
  notes/                   markdown / LaTeX / PDF notes, organised in folders
  papers/                  exam papers & worksheets (PDF), organised in folders
  attachments/             images referenced by questions/notes
  .studydb/                app-owned state
    index.sqlite           search index + spaced-repetition schedule
    review-log.jsonl       append-only review history (portable backup)
    config.json            settings
```

- Every question is a **human-readable Markdown file** with YAML frontmatter — see
  [`QUESTION_FORMAT.md`](./QUESTION_FORMAT.md) for the exact format.
- The SQLite index is **rebuildable from your files**; the one thing it owns is your review
  schedule, which is additionally mirrored to `review-log.jsonl`.
- **Sync/backup**: the vault is just a folder — put it in iCloud Drive, Dropbox, or a git
  repo. Everything (including your review schedule) travels with it.
- Edit files in any editor while Noggin is running — the app watches the folder and
  re-indexes automatically.

---

## Using Noggin

### ✍️ Questions

- **+ New question** (or `⌘N`): write the question and answer in Markdown. **Text and LaTeX
  mix freely** — `Solve $x^2-4=0$` renders live in the preview pane. `$…$` for inline math,
  `$$…$$` for display math (KaTeX).
- Give the question an optional **title** for the browser list — leave it blank and Noggin
  derives one from the question's first line.
- **Images**: paste a screenshot straight into the text box, drag & drop onto it, or use the
  **image dropzone** under each field to browse files. Images are stored in `attachments/`
  and referenced from the markdown.
- Each question can carry an **answer**, an optional **hint**, and a full **worked solution**
  (revealed separately during review), plus:
  - **Subject** — a dropdown of your recent subjects; type to create new ones, nest with `/`
    (e.g. `mechanics/kinematics`). Subjects are real folders in the vault.
  - **Tags**, **difficulty 1–5**, **source**, and a **recall mode** (flashcard / type-in / both).
- **Batch entry**: `⌘Enter` saves and clears only the content — subject, tags, difficulty and
  source stick around for the next question. **Clear all** resets everything.

### 🔍 Browse & search

- **Folder tree** with per-subject counts — selecting a subject includes everything nested
  under it, and **⌘/Ctrl+click selects several subjects at once** (the list shows their
  combined questions). **Manage folders right in the tree**: the `+` button creates folders
  (nest with `/`), and hovering a folder reveals `+` (new subfolder), `✎` (rename — edit the
  full path to move it anywhere), and `×` (delete — its contents move up to the parent,
  nothing is lost). Folders are real directories in the vault, so empty ones show up too.
- **Drag & drop to organise**: drag a question card onto a folder to move it there (drag any
  selected card to move the whole selection); drag a folder onto another folder to nest it,
  or onto "All questions" to move it to the top level.
- **⌘/Ctrl+click a question card** to add it to the selection without expanding it — then
  drag the whole selection into a folder, or bulk-delete it.
- Searching also matches a question's **tags and folder path**, not just its text.
- Combinable filters: **tags** (AND), **difficulty range**, **content kind** (text/math/image),
  and a **search box** that matches substrings anywhere in the question, answer, source or
  tags ("synth" finds "photosynthesis").
- Expand a question card to read it, **reveal the answer**, edit, or delete. Select many with
  checkboxes for **bulk delete**.

### 📝 Notes

Markdown, LaTeX, and PDF files, side by side — for summaries, derivations, formula sheets, and
reference papers.

- **Markdown** notes get the same math/image rendering as questions, with `⌘S` to save and a
  toggle between edit and preview.
- **LaTeX** (`.tex`) notes open in the same text editor — create one by giving it a `.tex` name
  when prompted, or drop an existing file in with **Import**.
- **PDF** notes are view-only, rendered in an embedded viewer — bring one in with **Import**.
- **Folders** work exactly like the question bank's: the `+` button creates folders (nest with
  `/`), hovering a folder reveals `+` (subfolder), `✎` (rename/move), and `×` (delete — contents
  move up to the parent). **Drag & drop** a note onto a folder to file it there, or a folder
  onto another to nest it. **⌘/Ctrl+click** folders to view several at once.
- **Deleting** a note, question, or folder always asks for confirmation first — nothing goes
  away on a stray click.

### 📑 Papers

A home for **exam papers and worksheets**: hit **Import** to bring in any PDF, read it in the
embedded viewer, and organise past papers into folders by subject or year — same folder tree,
drag & drop, and multi-select as everywhere else.

### 🧠 Review (spaced repetition)

Noggin schedules reviews with **FSRS**, the modern successor to Anki's algorithm, targeting
~90% retention with the fewest reviews — and everything about the schedule is tunable in
**Settings** (see below), including a fully manual fixed-interval mode.

The Review screen has two tabs:

- **Due now** — your subjects listed with **due + new counts**, each expandable to the
  individual questions inside (with "due 2h ago"-style timestamps). Hit **Review** on a
  single subject or **Review all** to start immediately with your default session settings.
  The header shows what's due, what's new, today's count, and a 7-day forecast.
- **Custom session** — scope a session by subject/tags, pick the mode, and cap its size.

During a session:

- **Modes**: **Flashcard** (think → reveal → grade), **Type-in** (write your answer first —
  text or LaTeX — then compare against the stored answer), or **Per question** (each card
  uses its own recall setting).
- Grade with **Again / Hard / Good / Easy** (keys `1–4`) — each button shows exactly when
  you'd next see the card (`10m`, `3d`, `2.0mo`…). Cards graded **Again** return later in the
  same session. `Space` reveals; `Esc` ends.
- **Hints and solutions** are revealed only on request, so they never spoil recall.
- Every review is appended to `review-log.jsonl` — your complete study history, forever.

### ⚙️ Settings

A dedicated **Settings** section (`⌘7`) — stored in `.studydb/config.json`, so your
preferences sync and back up with the vault:

- **Scheduler** — choose the algorithm:
  - **FSRS (adaptive)**: edit the **learning steps** for new cards (e.g. change `1m 10m` to
    `10m 1d` if the defaults feel too quick), the **relearning steps** for lapsed cards, the
    **desired retention** (lower = fewer, more spaced reviews), the **maximum interval**, and
    interval **fuzz**.
  - **Manual intervals**: set a fixed time for each of **Again / Hard / Good / Easy**, plus a
    **growth factor** that multiplies a card's interval on each Good/Easy once it has
    graduated. Predictable, Anki-classic-style scheduling.
- **Review sessions** — default max cards, default mode, and a **new-cards-per-day limit**
  so a big import doesn't flood your queue.
- **Quiz defaults** — default answer placement and metadata visibility for the quiz builder.
- **Appearance** — the theme picker also lives here.

### 📄 Quiz → PDF

Turn any slice of the bank into a printable worksheet: filter by subject/tags, tick the
questions (shuffle if you like), choose where answers go (**none**, **under each question**,
or an **answer key on its own page**), then **Print / Save as PDF** — math and diagrams come
out exactly as typeset.

### 📥 Getting questions in bulk

Three ways:

1. **Import tab** — drop a **CSV / Excel / JSON** file. Columns are auto-mapped from headers
   (remappable), defaults fill the gaps, and a validated preview flags empty questions, bad
   difficulties, and duplicates before anything is written. Try
   [`sample-import.csv`](./sample-import.csv).
2. **Drop markdown files** — anything following [`QUESTION_FORMAT.md`](./QUESTION_FORMAT.md)
   placed into `questions/` is indexed automatically within seconds. No import step.
3. **Ask an AI** — paste `QUESTION_FORMAT.md` into any AI ("generate 20 kinematics questions
   in this format"), save the output into your vault, done.

### ⌨️ Command palette & shortcuts

| Shortcut | Action |
|---|---|
| `⌘K` | Command palette (every action, searchable) |
| `⌘P` | Quick search — jump straight to any question |
| `⌘N` | New question |
| `⌘1–⌘7` | Questions · Notes · Papers · Review · Quiz · Import · Settings |
| `⌘Enter` | Save question (batch entry) |
| `Space` / `1–4` / `Esc` | Review: reveal / grade / end session |
| `⌘S` | Save note |

### 🎨 Themes

Six presets — Light, Dark, Sepia (warm paper + serif), Nord, Forest, and Violet — each
restyling the accent colour, backgrounds, borders and font. Pick one from the sidebar's
**Theme** menu or the **Settings** page; your choice persists across launches (and travels
with the vault).

---

## Tech

Tauri v2 (Rust core: rusqlite + FTS5, notify file watcher) · React 19 + TypeScript + Vite ·
Tailwind v4 · CodeMirror 6 · react-markdown + KaTeX · [ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs).

The codebase keeps extension points (content-renderer / card-type / importer / command
registries, an `AIProvider` seam) for what's next: cloze & image-occlusion cards, Anki
import/export, TikZ/plot rendering, analytics dashboards, AI-assisted card generation, and a
mobile companion (Tauri mobile targets).

## License

Personal project — all rights reserved for now.
