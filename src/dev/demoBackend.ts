// In-memory stand-in for the Rust backend, so the UI runs in a plain browser
// (`npm run dev` without Tauri). Mirrors the command semantics in
// src-tauri/src/{vault,index,cards}.rs closely enough for design work and
// click-through testing. Nothing persists — every reload starts from the
// seeded demo vault.

import { mockIPC } from "@tauri-apps/api/mocks";
import type { CardRow, ReviewLogEntry } from "../domain/srs";
import type { QuestionRow } from "../domain/types";
import type { QuestionUpsert, SearchParams } from "../lib/ipc";

interface File {
  text?: string;
  bin?: number[];
  mtime: number;
}

const ROOT = "/Demo/Study Vault";
const nowSec = () => Math.floor(Date.now() / 1000);

const files = new Map<string, File>();
const dirs = new Set<string>(["questions", "notes", "papers", "attachments", ".studydb"]);
const index = new Map<string, QuestionRow & { fts: string }>();
const cards = new Map<string, CardRow>();
const log: ReviewLogEntry[] = [];

const clean = (p: string) => p.replace(/^\/+|\/+$/g, "");
const parentOf = (p: string) => p.split("/").slice(0, -1).join("/");
const nameOf = (p: string) => p.split("/").pop()!;

function mkdirp(dir: string) {
  const parts = clean(dir).split("/").filter(Boolean);
  for (let i = 1; i <= parts.length; i++) dirs.add(parts.slice(0, i).join("/"));
}

function write(rel: string, f: Omit<File, "mtime">) {
  mkdirp(parentOf(rel));
  files.set(rel, { ...f, mtime: nowSec() });
}

function read(rel: string): File {
  const f = files.get(clean(rel));
  if (!f) throw `No such file: ${rel}`;
  return f;
}

const hidden = (rel: string) => rel.split("/").some((s) => s.startsWith("."));
const under = (p: string, dir: string) => dir === "" || p === dir || p.startsWith(`${dir}/`);

function rename(from: string, to: string) {
  from = clean(from);
  to = clean(to);
  if (files.has(to) || dirs.has(to)) throw `'${to}' already exists`;
  mkdirp(parentOf(to));
  if (files.has(from)) {
    files.set(to, files.get(from)!);
    files.delete(from);
    return;
  }
  if (!dirs.has(from)) throw `No such path: ${from}`;
  for (const d of [...dirs]) {
    if (under(d, from)) {
      dirs.delete(d);
      dirs.add(to + d.slice(from.length));
    }
  }
  for (const [p, f] of [...files]) {
    if (under(p, from)) {
      files.delete(p);
      files.set(to + p.slice(from.length), f);
    }
  }
}

function matches(q: QuestionRow & { fts: string }, p: SearchParams): boolean {
  const inFolder = (f: string) => q.folder === f || q.folder.startsWith(`${f}/`);
  if (p.folder && !inFolder(p.folder)) return false;
  if (p.folders?.length && !p.folders.some(inFolder)) return false;
  if (!p.tags.every((t) => q.tags.includes(t))) return false;
  if (p.min_difficulty != null && !(q.difficulty != null && q.difficulty >= p.min_difficulty))
    return false;
  if (p.max_difficulty != null && !(q.difficulty != null && q.difficulty <= p.max_difficulty))
    return false;
  if (p.body_kind && q.body_kind !== p.body_kind) return false;
  for (const term of (p.text ?? "").toLowerCase().split(/\s+/).filter(Boolean)) {
    if (!q.fts.includes(term) && !q.folder.toLowerCase().includes(term)) return false;
  }
  return true;
}

function writeLog() {
  write(".studydb/review-log.jsonl", { text: log.map((e) => JSON.stringify(e)).join("\n") + "\n" });
}

const toRow = ({ fts: _fts, ...row }: QuestionRow & { fts: string }): QuestionRow => row;
const byIdDesc = (a: QuestionRow, b: QuestionRow) => (a.id < b.id ? 1 : -1);

type Args = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const handlers: Record<string, (a: Args) => unknown> = {
  "plugin:dialog|open": () => ROOT,
  open_vault: () => ({ root: ROOT, stats: handlers.index_stats({}) }),
  get_last_vault: () => ROOT,
  close_vault: () => undefined,
  index_stats: () => ({
    questions: index.size,
    cards: cards.size,
    reviews: log.length,
    schema_version: 1,
  }),

  vault_read_file: ({ rel }) => {
    const f = read(rel);
    if (f.text == null) throw `${rel} is not a text file`;
    return f.text;
  },
  vault_write_file: ({ rel, contents }) => write(clean(rel), { text: contents }),
  vault_write_binary: ({ rel, contents }) => write(clean(rel), { bin: contents }),
  vault_read_binary: ({ rel }) => {
    const f = read(rel);
    return f.bin ?? [...new TextEncoder().encode(f.text ?? "")];
  },
  vault_remove_file: ({ rel }) => {
    if (!files.delete(clean(rel))) throw `No such file: ${rel}`;
  },
  vault_list: ({ rel }) => {
    const dir = clean(rel);
    const out = [
      ...[...dirs]
        .filter((d) => parentOf(d) === dir && d !== dir)
        .map((d) => ({ name: nameOf(d), rel: d, is_dir: true, mtime: 0 })),
      ...[...files]
        .filter(([p]) => parentOf(p) === dir)
        .map(([p, f]) => ({ name: nameOf(p), rel: p, is_dir: false, mtime: f.mtime })),
    ].filter((e) => !e.name.startsWith("."));
    return out.sort(
      (a, b) => Number(b.is_dir) - Number(a.is_dir) || a.name.localeCompare(b.name),
    );
  },
  vault_list_recursive: ({ rel, ext }) =>
    [...files]
      .filter(([p]) => under(p, clean(rel)) && !hidden(p))
      .filter(([p]) => !ext || p.toLowerCase().endsWith(`.${ext}`))
      .map(([p, f]) => ({ name: nameOf(p), rel: p, is_dir: false, mtime: f.mtime })),
  vault_list_dirs: ({ rel }) => {
    const base = clean(rel);
    return [...dirs]
      .filter((d) => d !== base && under(d, base) && !hidden(d))
      .map((d) => d.slice(base.length + 1))
      .sort();
  },
  vault_create_dir: ({ rel }) => mkdirp(rel),
  vault_rename: ({ from, to }) => rename(from, to),
  vault_delete_folder: ({ rel }) => {
    const dir = clean(rel);
    if (!dirs.has(dir)) throw `'${dir}' is not a folder`;
    const parent = parentOf(dir);
    const children = [
      ...[...dirs].filter((d) => parentOf(d) === dir),
      ...[...files.keys()].filter((p) => parentOf(p) === dir),
    ];
    for (const child of children) {
      const name = nameOf(child);
      const dot = files.has(child) ? name.lastIndexOf(".") : -1;
      const [stem, ext] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ""];
      const join = (n: string) => (parent ? `${parent}/${n}` : n);
      let target = join(name);
      for (let n = 1; files.has(target) || dirs.has(target); n++) {
        target = join(`${stem}-${n}${ext}`);
      }
      rename(child, target);
    }
    dirs.delete(dir);
  },

  index_upsert_question: (a) => {
    const q = a.q as QuestionUpsert;
    const { question_text, answer_text, ...row } = q;
    index.set(q.id, {
      ...(row as QuestionRow),
      fts: [q.title, question_text, answer_text, q.source, q.tags.join(" ")]
        .join("\n")
        .toLowerCase(),
    });
    if (!cards.has(q.id)) cards.set(q.id, seededCard(q.id));
  },
  index_remove_question: ({ id }) => {
    index.delete(id);
    cards.delete(id);
  },
  index_list_questions: () => [...index.values()].map(toRow).sort(byIdDesc),
  index_search: ({ params }) =>
    [...index.values()].filter((q) => matches(q, params)).map(toRow).sort(byIdDesc),

  cards_due: ({ params, now, limit }) =>
    [...index.values()]
      .filter((q) => matches(q, params))
      .map((q) => ({ question: toRow(q), card: cards.get(q.id)! }))
      .filter(({ card }) => card.state === "new" || !card.due || card.due <= now)
      .sort(
        (a, b) =>
          Number(a.card.state === "new") - Number(b.card.state === "new") ||
          (a.card.due ?? "").localeCompare(b.card.due ?? "") ||
          a.question.id.localeCompare(b.question.id),
      )
      .slice(0, limit),
  card_update: (a) => {
    const card = a.card as CardRow;
    if (!cards.has(card.question_id)) throw `no card for question ${card.question_id}`;
    cards.set(card.question_id, card);
  },
  review_log_add: ({ entry }) => {
    log.push(entry);
    writeLog();
  },
  review_stats: ({ now, todayStart }) => {
    const all = [...cards.values()];
    const first = new Map<string, string>();
    for (const e of log) {
      const prev = first.get(e.question_id);
      if (!prev || e.reviewed_at < prev) first.set(e.question_id, e.reviewed_at);
    }
    const upcoming = new Map<string, number>();
    for (const c of all) {
      if (c.state !== "new" && c.due && c.due > now) {
        const day = c.due.slice(0, 10);
        upcoming.set(day, (upcoming.get(day) ?? 0) + 1);
      }
    }
    return {
      due_now: all.filter((c) => c.state !== "new" && c.due && c.due <= now).length,
      new_count: all.filter((c) => c.state === "new").length,
      reviews_today: log.filter((e) => e.reviewed_at >= todayStart).length,
      new_today: [...first.values()].filter((t) => t >= todayStart).length,
      total_reviews: log.length,
      upcoming: [...upcoming].sort().slice(0, 7),
    };
  },
  print_page: () => false,
};

// ---------------------------------------------------------------------------
// Demo vault
// ---------------------------------------------------------------------------

/** Due offset in hours for seeded questions that already have history
 *  (negative = overdue). Anything not listed is born "new". */
const SEED_DUE_HOURS: Record<string, number> = {};

function seededCard(id: string): CardRow {
  const blank: CardRow = {
    question_id: id,
    state: "new",
    stability: 0,
    difficulty: 0,
    due: null,
    reps: 0,
    lapses: 0,
    last_review: null,
    elapsed_days: 0,
    scheduled_days: 0,
    learning_steps: 0,
  };
  const hours = SEED_DUE_HOURS[id];
  if (hours == null) return blank;
  const at = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();
  return {
    ...blank,
    state: "review",
    stability: 6,
    difficulty: 5,
    due: at(hours),
    reps: 3,
    last_review: at(hours - 96),
    elapsed_days: 4,
    // Far-off cards are the well-known ones.
    scheduled_days: hours > 72 ? 34 : hours > 24 ? 9 : 4,
  };
}

interface Seed {
  folder: string;
  title?: string;
  q: string;
  a: string;
  hint?: string;
  solution?: string;
  tags: string[];
  difficulty: number;
  source?: string;
  /** Hours until due; omit for a brand-new card. */
  due?: number;
}

const SEEDS: Seed[] = [
  {
    folder: "physics/mechanics",
    title: "Range of a projectile",
    q: "A projectile is launched at angle $\\theta$ above the horizontal with speed $v_0$. Ignoring air resistance, find its horizontal range.",
    a: "$$R = \\frac{v_0^2 \\sin 2\\theta}{g}$$",
    hint: "Treat the horizontal and vertical motions independently.",
    solution:
      "Time of flight: $t = \\dfrac{2 v_0 \\sin\\theta}{g}$.\n\nRange: $R = v_0\\cos\\theta \\cdot t = \\dfrac{v_0^2 \\sin 2\\theta}{g}$, maximised at $\\theta = 45^\\circ$.",
    tags: ["kinematics", "projectile"],
    difficulty: 3,
    source: "Halliday & Resnick Ch.4 Q17",
    due: -26,
  },
  {
    folder: "physics/mechanics",
    q: "State Hooke's law for a spring.",
    a: "$F = -kx$, where $k$ is the spring constant.",
    tags: ["oscillations"],
    difficulty: 1,
    due: -3,
  },
  {
    folder: "physics/mechanics",
    title: "Period of a simple pendulum",
    q: "Derive the period of a simple pendulum of length $L$ for small oscillations.",
    a: "$$T = 2\\pi\\sqrt{\\frac{L}{g}}$$",
    hint: "Use $\\sin\\theta \\approx \\theta$.",
    tags: ["oscillations", "shm"],
    difficulty: 3,
    due: 30,
  },
  {
    folder: "physics/mechanics",
    q: "A block slides down a frictionless incline of angle $\\alpha$. What is its acceleration?",
    a: "$a = g\\sin\\alpha$",
    tags: ["dynamics"],
    difficulty: 2,
  },
  {
    folder: "physics/electricity",
    title: "Energy stored in a capacitor",
    q: "A capacitor of capacitance $C$ is charged to voltage $V$. How much energy is stored?",
    a: "$E = \\frac{1}{2}CV^2$",
    hint: "Integrate $q/C$ as charge builds from $0$ to $Q$.",
    tags: ["capacitors"],
    difficulty: 2,
    due: -50,
  },
  {
    folder: "physics/electricity",
    q: "State Gauss's law in integral form.",
    a: "$$\\oint \\mathbf{E}\\cdot d\\mathbf{A} = \\frac{Q_{\\text{enc}}}{\\varepsilon_0}$$",
    tags: ["fields", "maxwell"],
    difficulty: 3,
    due: 54,
  },
  {
    folder: "physics/electricity",
    q: "Two resistors $R_1$ and $R_2$ are connected in parallel. What is the equivalent resistance?",
    a: "$R = \\dfrac{R_1 R_2}{R_1 + R_2}$",
    tags: ["circuits"],
    difficulty: 1,
  },
  {
    folder: "physics/thermo",
    q: "State the first law of thermodynamics.",
    a: "$\\Delta U = Q - W$: the change in internal energy equals heat added minus work done by the system.",
    tags: ["laws"],
    difficulty: 1,
    due: 100,
  },
  {
    folder: "math/algebra",
    q: "Solve $x^2 - 5x + 6 = 0$.",
    a: "$x = 2$ or $x = 3$",
    hint: "Factor the quadratic.",
    tags: ["quadratics"],
    difficulty: 2,
    due: -1,
  },
  {
    folder: "math/algebra",
    title: "Sum of a geometric series",
    q: "Find $\\sum_{k=0}^{n-1} ar^k$ for $r \\ne 1$.",
    a: "$$S_n = a\\,\\frac{1 - r^n}{1 - r}$$",
    tags: ["series"],
    difficulty: 3,
  },
  {
    folder: "math/calculus",
    q: "Differentiate $f(x) = x^2 \\sin x$.",
    a: "$f'(x) = 2x\\sin x + x^2\\cos x$",
    hint: "Product rule.",
    tags: ["differentiation"],
    difficulty: 3,
    due: -8,
  },
  {
    folder: "math/calculus",
    title: "Gaussian integral",
    q: "Evaluate $\\displaystyle\\int_{-\\infty}^{\\infty} e^{-x^2}\\,dx$.",
    a: "$\\sqrt{\\pi}$",
    hint: "Square the integral and switch to polar coordinates.",
    solution:
      "$I^2 = \\iint e^{-(x^2+y^2)}\\,dx\\,dy = \\int_0^{2\\pi}\\!\\!\\int_0^\\infty e^{-r^2} r\\,dr\\,d\\theta = \\pi$, so $I = \\sqrt\\pi$.",
    tags: ["integration", "classic"],
    difficulty: 5,
    source: "Spivak, Calculus",
  },
  {
    folder: "math/calculus",
    q: "State the fundamental theorem of calculus (part 1).",
    a: "If $F(x) = \\int_a^x f(t)\\,dt$ with $f$ continuous, then $F'(x) = f(x)$.",
    tags: ["integration", "theorems"],
    difficulty: 2,
    due: 78,
  },
  {
    folder: "chemistry",
    q: "What is Avogadro's number, and what does it count?",
    a: "$N_A \\approx 6.022 \\times 10^{23}$ — the number of constituent particles in one mole.",
    tags: ["constants"],
    difficulty: 1,
  },
];

function seedVault() {
  SEEDS.forEach((s, i) => {
    // ULID-shaped ids that sort oldest → newest in seed order.
    const id = `01JDEMO${String(i).padStart(3, "0")}`.padEnd(26, "0");
    if (s.due != null) SEED_DUE_HOURS[id] = s.due;
    const front = [
      `id: ${id}`,
      "schemaVersion: 1",
      "type: question",
      ...(s.title ? [`title: ${JSON.stringify(s.title)}`] : []),
      `difficulty: ${s.difficulty}`,
      `tags: [${s.tags.join(", ")}]`,
      ...(s.source ? [`source: ${JSON.stringify(s.source)}`] : []),
      "recall: both",
      "created: 2026-10-01",
    ].join("\n");
    const sections = [
      `# Question\n${s.q}`,
      `# Answer\n${s.a}`,
      ...(s.hint ? [`# Hint\n${s.hint}`] : []),
      ...(s.solution ? [`# Solution\n${s.solution}`] : []),
    ].join("\n\n");
    write(`questions/${s.folder}/demo-${i}.md`, { text: `---\n${front}\n---\n\n${sections}\n` });
  });

  write("notes/physics/Formula sheet.md", {
    text: "# Mechanics formula sheet\n\n## Kinematics\n\n- $v = u + at$\n- $s = ut + \\tfrac12 at^2$\n- $v^2 = u^2 + 2as$\n\n## Energy\n\n$$E_k = \\tfrac12 mv^2 \\qquad E_p = mgh$$\n\n| Quantity | Symbol | Unit |\n|---|---|---|\n| Force | $F$ | N |\n| Work | $W$ | J |\n| Power | $P$ | W |\n",
  });
  write("notes/math/Taylor series.md", {
    text: "# Taylor series\n\n$$f(x) = \\sum_{n=0}^{\\infty} \\frac{f^{(n)}(a)}{n!}(x-a)^n$$\n\nCommon expansions around $0$:\n\n- $e^x = 1 + x + \\frac{x^2}{2!} + \\dots$\n- $\\sin x = x - \\frac{x^3}{3!} + \\dots$\n",
  });
  write("notes/Study plan.md", { text: "# Study plan\n\n- [x] Mechanics\n- [ ] Electricity\n- [ ] Calculus revision\n" });
  mkdirp("papers/2025");

  // ~10 weeks of plausible history for the cards that have been studied
  // (deterministic, so screenshots are stable). Ends yesterday.
  const studied = Object.keys(SEED_DUE_HOURS);
  let seed = 7;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let day = 70; day >= 1; day--) {
    if (day > 6 && rand() < 0.22) continue; // the odd day off, but a live streak
    const n = 2 + Math.floor(rand() * (day < 30 ? 9 : 5));
    for (let i = 0; i < n; i++) {
      const at = new Date(Date.now() - day * 86_400_000);
      at.setHours(9 + Math.floor(rand() * 10), Math.floor(rand() * 60));
      const r = rand();
      log.push({
        question_id: studied[Math.floor(rand() * studied.length)],
        rating: r < 0.13 ? 1 : r < 0.3 ? 2 : r < 0.85 ? 3 : 4,
        mode: "flashcard",
        reviewed_at: at.toISOString(),
        elapsed_days: 1,
        scheduled_days: 3,
      });
    }
  }
  writeLog();
}

export function installDemoBackend(): void {
  seedVault();
  mockIPC(
    (cmd, payload) => {
      const handler = handlers[cmd];
      if (!handler) throw `demo backend: unhandled command "${cmd}"`;
      return handler((payload ?? {}) as Args);
    },
    { shouldMockEvents: true },
  );
}
