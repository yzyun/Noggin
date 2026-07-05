// App-level UI state: which section is active, palette visibility, and
// cross-component signals (e.g. "open a new question editor").

import { create } from "zustand";

export type View = "questions" | "notes" | "review" | "import" | "quiz";

interface UiStore {
  view: View;
  paletteOpen: boolean;
  /** Incremented to ask QuestionsView to open a blank editor. */
  newQuestionSignal: number;

  setView(view: View): void;
  openPalette(): void;
  closePalette(): void;
  requestNewQuestion(): void;
}

export const useUi = create<UiStore>((set, get) => ({
  view: "questions",
  paletteOpen: false,
  newQuestionSignal: 0,

  setView: (view) => set({ view }),
  openPalette: () => set({ paletteOpen: true }),
  closePalette: () => set({ paletteOpen: false }),
  requestNewQuestion: () =>
    set({ view: "questions", newQuestionSignal: get().newQuestionSignal + 1 }),
}));
