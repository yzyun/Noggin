// Extension points. Each registry starts nearly empty in the MVP; future
// features (cloze cards, TikZ rendering, Anki import, AI actions…) register
// here instead of modifying core code.

import type { ComponentType } from "react";
import type { QuestionDoc } from "./types";

function createRegistry<T extends { id: string }>(kind: string) {
  const items = new Map<string, T>();
  return {
    register(item: T): void {
      if (items.has(item.id)) throw new Error(`${kind} '${item.id}' already registered`);
      items.set(item.id, item);
    },
    get(id: string): T | undefined {
      return items.get(id);
    },
    all(): T[] {
      return [...items.values()];
    },
  };
}

// --- Content renderers ------------------------------------------------------
// Render a fenced code block or content kind (e.g. ```tikz, ```mermaid).
// The base markdown/KaTeX pipeline is built in; these extend it.

export interface ContentRenderer {
  id: string;
  /** Code-fence languages this renderer claims (e.g. ["tikz"]). */
  languages: string[];
  Component: ComponentType<{ code: string }>;
}
export const contentRenderers = createRegistry<ContentRenderer>("content renderer");

// --- Card types --------------------------------------------------------------
// How a question yields reviewable cards and how a review is presented.
// MVP registers the basic Q/A card; cloze & image-occlusion come later.

export interface CardType {
  id: string;
  label: string;
  /** Does this card type apply to the given question? */
  appliesTo(doc: QuestionDoc): boolean;
}
export const cardTypes = createRegistry<CardType>("card type");

// --- Importers ---------------------------------------------------------------
// Turn an external file into QuestionDocs. MVP: CSV/Excel/JSON (Phase 4).

export interface Importer {
  id: string;
  label: string;
  /** File extensions this importer accepts, lowercase, no dot. */
  extensions: string[];
  parse(file: File): Promise<QuestionDoc[]>;
}
export const importers = createRegistry<Importer>("importer");

// --- Commands ------------------------------------------------------------
// Every user-facing action registers here; the command palette (Phase 5)
// and keyboard shortcuts both read from this.

export interface Command {
  id: string;
  title: string;
  shortcut?: string;
  run(): void | Promise<void>;
}
export const commands = createRegistry<Command>("command");
