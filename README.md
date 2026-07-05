# Noggin

A local-first study app for students: a question bank + notes + spaced repetition,
built like Obsidian — your data is a plain folder of Markdown files (a **vault**)
that you own, sync, and edit however you like. Made for physics & math, so LaTeX
(KaTeX) and images are first-class everywhere.

## How it stores data

```
<your vault>/
  questions/           one .md file per question (see QUESTION_FORMAT.md)
    mechanics/…        subfolders = topics
  notes/               plain markdown notes
  attachments/         images referenced by questions/notes
  .studydb/            app-owned: SQLite search index + review schedule + config
```

- **Markdown files are the source of truth** — portable, hand-editable, scrape-friendly.
- The SQLite index (search, filters, FSRS spaced-repetition schedule) lives *inside* the
  vault, so syncing the folder carries everything.
- The question file format is specified in [QUESTION_FORMAT.md](./QUESTION_FORMAT.md) —
  hand that file to any AI or scraper to generate importable questions.

## Development

```bash
npm install          # frontend deps
npm run tauri dev    # launch the desktop app (needs Rust: rustup.rs)
npm test             # domain-layer unit tests (vitest)
```

Stack: Tauri v2 (Rust: rusqlite + FTS5, notify watcher) · React 19 + TypeScript + Vite ·
Tailwind v4 · CodeMirror 6 · react-markdown + KaTeX · ts-fsrs (spaced repetition).

## Status

- ✅ Phase 0 — vault, SQLite index, file format, app shell
- ✅ Phase 1 — question editor (LaTeX + images), question list, notes
- 🚧 Phase 2 — folder tree, filters, full-text search, external-edit sync
- ⏳ Phase 3 — spaced repetition (FSRS) + review sessions
- ⏳ Phase 4 — bulk import (CSV/Excel/JSON → markdown)
- ⏳ Phase 5 — quiz/PDF export, command palette, more card types
