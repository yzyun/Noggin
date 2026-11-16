# 🧠 Noggin

**A local-first study app for students.** Collect the questions worth practicing — with full
LaTeX math, diagrams and images — organise them into subjects, and master them with
**spaced repetition** and **active recall**. Built like Obsidian: your data is a plain folder
of Markdown files (a **vault**) that you own, sync, and edit however you like. No account,
no cloud, no internet required.

Made for physics & math, where `$E = mc^2$` should just render.

---

## Download & install

Get the installer for your computer from the
[**Releases page**](https://github.com/yzyun/Noggin/releases):

| Your computer | File to download |
|---|---|
| Mac with Apple Silicon (M1 or later) | `Noggin_0.8.0_aarch64.dmg` |
| Mac with an Intel chip | `Noggin_0.8.0_x64.dmg` |
| Windows | `Noggin_0.8.0_x64-setup.exe` |
| Linux | `.AppImage` (any distro) or `.deb` (Debian/Ubuntu) |

macOS is the platform Noggin is developed and used on. The Windows and Linux installers are
built automatically from the same code but have had far less hands-on testing.

**macOS**

1. Open the `.dmg` and drag **Noggin** into **Applications**.
2. First launch: right-click **Noggin.app → Open → Open**. The app is ad-hoc signed but not
   notarized with Apple, so macOS warns once. If macOS says the app is **"damaged and can't be
   opened"**, that's just the download-quarantine flag — clear it in Terminal and open it again:

   ```bash
   xattr -cr /Applications/Noggin.app
   ```

**Windows** — run the `-setup.exe`. The installer isn't code-signed, so SmartScreen may show
"Windows protected your PC": choose **More info → Run anyway**.

**Linux** — make the AppImage executable (`chmod +x Noggin_*.AppImage`) and run it, or
install the `.deb` with `sudo apt install ./Noggin_*.deb`.

On Windows and Linux, read every `⌘` in this guide as `Ctrl`.

---

## Quick start

1. **Pick a vault.** On first launch, choose (or create) an empty folder — for example
   `Documents/Study Vault`. Everything Noggin stores lives in that folder, and it reopens
   automatically next time.
2. **Add a question.** Press `⌘N`, type the question and its answer — LaTeX goes between
   dollar signs, e.g. `Solve $x^2 - 4 = 0$` — choose a subject, and press `⌘Enter`. The form
   clears for the next one.
3. **Or bring in many at once.** Open **Import** and drop in a spreadsheet — or click
   *Try it with sample questions* to see how it works.
4. **Review.** Open **Review** and press `Enter`. Think of the answer, press `Space` to
   reveal it, then grade yourself with `1`–`4`. Noggin decides when each card comes back.
5. **Come back tomorrow.** The Review screen tells you what's due each day; **Progress**
   shows your streak and how well things are sticking.

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

The sidebar is split into **Study** (Review, Progress, Quiz) and **Library** (Questions,
Notes, Papers), with **Import**, **Settings** and the command palette at the bottom. The
number beside Review is how many cards are due right now. To open a different vault, click
the small arrows next to the vault's name at the top.

### 🧠 Review (spaced repetition)

Noggin opens here. It schedules reviews with **FSRS**, the modern successor to Anki's
algorithm, aiming for about 90% recall with as few reviews as possible.

- The headline says how many cards are ready; **Start review** (or `Enter`) begins a session
  with your default settings.
- Below it: how many you've reviewed today, and a **7-day forecast** of cards coming due.
- **By subject** lists each subject with its due and new counts. Expand one to see the
  individual questions, or press **Review** on a row to study just that subject.
- **Custom session** (the toggle on the right) lets you scope a session by subject and tags,
  choose the answer mode, and cap its size.

During a session the sidebar hides and the card takes the whole window:

- **Answer modes**: **Flashcard** (think → reveal → grade), **Type-in** (write your answer
  first — text or LaTeX — then compare it with the stored one), or **Per question** (each
  card uses its own setting).
- `Space` reveals the answer. Grade with **Again / Hard / Good / Easy** (keys `1`–`4`); each
  button shows when you'd next see the card (`10m`, `3d`, `2.0mo`…). Cards graded **Again**
  come back later in the same session.
- **Need a hint?** and **Show full solution** appear only when the question has them, and
  only reveal on request.
- `Esc` ends the session early; you get a summary of whatever you graded.

### 📈 Progress

A read-only view of how study is going (`⌘7`):

- **Headline numbers** — current streak, reviews and recall rate over the last 30 days, and
  how many cards are mature (review interval of 3 weeks or more).
- **Reviews per day** for the last 30 days, and an **activity calendar** for the last 26 weeks.
- **Where your cards are** — not started, learning, young, mature — and the same picture
  **per subject**, with what's due now.

Hover any bar or square for its exact value.

### 📄 Quiz → PDF

Turn any slice of the bank into a printable worksheet, in three steps:

1. **Choose a pool** — pick subjects (*Show sub-topics* reveals nested ones) and tags.
2. **Pick questions** — untick any you don't want; **Shuffle** randomises the order.
3. **Set up the page** — title, where answers go (**None**, **Under each**, or **Key at end**
   on its own page), and whether to print each question's source and difficulty.

**Print or save as PDF** opens the system print dialog. The preview on the right is exactly
what prints — math and diagrams fully typeset.

### ✍️ Writing questions

- **New question** in the sidebar, or `⌘N`. Write the **question** and **answer** in
  Markdown; text and LaTeX mix freely — `$…$` for inline math, `$$…$$` for display math. The
  **Preview** pane on the right shows the card as it will look in review.
- **Hint** and **Worked solution** are optional — add them with the `+` buttons.
- **Images**: paste a screenshot straight into a text box, drag one onto it, or use
  **Add image**. Images are saved to the vault's `attachments/` folder.
- The **Details** card files the question:
  - **Subject** — pick a recent one or type a new one; nest with `/`
    (e.g. `mechanics/kinematics`). Subjects are real folders in the vault.
  - **Tags**, **Difficulty** 1–5, and **Source**.
  - **Review as** — flashcard, type-in, or either.
  - **Title** — optional; left blank, the list shows the question's first line.
- **Batch entry**: `⌘Enter` (**Save & next**) saves and clears only the writing; the Details
  stay for the next question. **Reset** clears those too.
- Leaving with unsaved writing asks before discarding it.

### 🔍 Browsing questions

- Each row shows the question (math typeset), its tags, its **review status** — **New**,
  **Due**, or when it's next up ("in 3d") — and its difficulty as five dots.
- **Click a row** to read it and reveal the answer. Hover for the **edit** and **delete**
  buttons.
- **Filters** (left panel), all combinable:
  - a **search box** matching text anywhere in the question, answer, source, tags or folder
    ("synth" finds "photosynthesis");
  - the **folder tree** — a subject includes everything nested under it;
    `⌘`-click selects several at once;
  - **review status** (due / new / later, with counts), **tags**, **difficulty range**, and
    **kind** (text / math / image).
- **Organise**: drag a question onto a folder to move it. Tick several (or `⌘`-click rows)
  to move or delete them together.
- **Folders**: the `+` beside *Folders* creates one (nest with `/`). Hover a folder for new
  subfolder, rename/move (edit the full path to move it), and delete — deleting a folder
  moves its contents up to the parent, so nothing is lost. Drag a folder onto another to
  nest it.
- `⌘P` jumps straight to any question from anywhere in the app.

### 📝 Notes

Markdown, LaTeX and PDF files side by side — for summaries, derivations and formula sheets.

- **New** creates a Markdown note (give it a `.tex` name for LaTeX); **Import** brings in
  existing files, including PDFs.
- Markdown notes open in **Read** mode with math and images rendered; switch to **Edit** to
  change them, and `⌘S` to save. PDFs are view-only.
- Folders work exactly as in the question bank, including drag & drop.

### 📑 Papers

A home for **exam papers and worksheets**: **Import** any PDF, read it in the built-in
viewer, and organise past papers into folders by subject or year.

### 📥 Importing questions in bulk

Three ways:

1. **A spreadsheet** — open **Import** and drop a **CSV, Excel or JSON** file (one question
   per row). Then:
   1. **Match your columns** — Noggin guesses from the headers and shows the first row so you
      can check;
   2. **Fill the gaps** — defaults for rows with no subject, tags, difficulty or source;
   3. **Review** — every row is marked Ready, Duplicate or Can't import before anything is
      saved.

   [`sample-import.csv`](./sample-import.csv) shows the expected shape, and *Try it with
   sample questions* loads it for you.
2. **Markdown files** — any file following [`QUESTION_FORMAT.md`](./QUESTION_FORMAT.md)
   placed in the vault's `questions/` folder is picked up within seconds. No import step.
3. **Ask an AI** — **Copy format** on the Import screen copies the format description; paste
   it into any AI ("generate 20 kinematics questions in this format") and save the output
   into your vault.

### ⚙️ Settings

Open with `⌘,`. Changes save automatically to `.studydb/config.json`, so they travel with
the vault.

- **Appearance** — seven themes: Paper (default), Ink (dark), Blue, Sepia, Nord, Forest and
  Violet.
- **Review sessions** — cards per session, **new cards per day** (so a big import doesn't
  flood you), and the default answer mode.
- **Scheduler** — the defaults suit most people. **Adaptive (FSRS)** lets you tune desired
  retention, learning and relearning steps, the longest interval, and whether due dates are
  spread out. **Fixed intervals** sets a time for each of Again / Hard / Good / Easy plus a
  growth factor. **Reset to defaults** undoes any changes.
- **Quiz** — default answer placement and whether source and difficulty are printed.

### ⌨️ Shortcuts

| Shortcut | Action |
|---|---|
| `⌘K` | Command palette (every action, searchable) |
| `⌘P` | Quick search — jump straight to any question |
| `⌘N` | New question |
| `⌘1`–`⌘7` | Review · Questions · Notes · Papers · Quiz · Import · Progress |
| `⌘,` | Settings |
| `⌘Enter` | Save question (and start the next) |
| `Enter` | Start review (on the Review screen) |
| `Space` / `1`–`4` / `Esc` | In a session: reveal / grade / end |
| `⌘S` | Save note |

---

## Building from source

You need [Node.js](https://nodejs.org) 20+ and [Rust](https://rustup.rs); on Linux also the
[Tauri system libraries](https://tauri.app/start/prerequisites/).

```bash
git clone https://github.com/yzyun/Noggin.git && cd Noggin
npm install
```

```bash
npm run tauri dev      # run the desktop app in development
```

```bash
npm run dev            # UI only, in a browser, against an in-memory demo vault (no Rust needed)
```

```bash
npm run tauri build    # produce the installer for your platform (src-tauri/target/release/bundle/)
```

```bash
npm test               # unit tests
```

**Releases** are built by GitHub Actions ([`build.yml`](./.github/workflows/build.yml)).
Every pull request gets installers for all platforms as downloadable artifacts on its
workflow run. Pushing a version tag builds them again and attaches them to a draft release
to review and publish:

```bash
git tag v0.8.0 && git push origin v0.8.0
```

---

## Tech

Tauri v2 (Rust core: rusqlite + FTS5, notify file watcher) · React 19 + TypeScript + Vite ·
Tailwind v4 · CodeMirror 6 · react-markdown + KaTeX · [ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs).

The codebase keeps extension points (content-renderer / card-type / importer / command
registries, an `AIProvider` seam) for what's next: cloze & image-occlusion cards, Anki
import/export, TikZ/plot rendering, AI-assisted card generation, and a
mobile companion (Tauri mobile targets).

## License

Personal project — all rights reserved for now.
