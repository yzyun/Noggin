// App-level UI state: which section is active, palette/search visibility,
// cross-component signals, and the in-app text prompt (window.prompt is a
// silent no-op in Tauri's WKWebView, so we ship our own).

import { create } from "zustand";

export type View = "questions" | "notes" | "review" | "import" | "quiz";

export interface PromptRequest {
  title: string;
  initial?: string;
  placeholder?: string;
  /** Called exactly once with the entered text, or null on cancel. */
  resolve(value: string | null): void;
}

export interface ConfirmRequest {
  title: string;
  message?: string;
  /** Label for the confirming button (default "Delete"). */
  confirmLabel?: string;
  /** Called exactly once: true = confirmed, false = cancelled. */
  resolve(ok: boolean): void;
}

interface UiStore {
  view: View;
  paletteOpen: boolean;
  quickSearchOpen: boolean;
  /** Incremented to ask QuestionsView to open a blank editor. */
  newQuestionSignal: number;
  /** Question id QuestionsView should scroll to and expand. */
  focusQuestionId: string | null;
  promptRequest: PromptRequest | null;
  confirmRequest: ConfirmRequest | null;

  setView(view: View): void;
  openPalette(): void;
  closePalette(): void;
  openQuickSearch(): void;
  closeQuickSearch(): void;
  requestNewQuestion(): void;
  focusQuestion(id: string): void;
  clearFocusQuestion(): void;
}

export const useUi = create<UiStore>((set, get) => ({
  view: "questions",
  paletteOpen: false,
  quickSearchOpen: false,
  newQuestionSignal: 0,
  focusQuestionId: null,
  promptRequest: null,
  confirmRequest: null,

  setView: (view) => set({ view }),
  openPalette: () => set({ paletteOpen: true, quickSearchOpen: false }),
  closePalette: () => set({ paletteOpen: false }),
  openQuickSearch: () => set({ quickSearchOpen: true, paletteOpen: false }),
  closeQuickSearch: () => set({ quickSearchOpen: false }),
  requestNewQuestion: () =>
    set({ view: "questions", newQuestionSignal: get().newQuestionSignal + 1 }),
  focusQuestion: (id) => set({ view: "questions", focusQuestionId: id }),
  clearFocusQuestion: () => set({ focusQuestionId: null }),
}));

/** In-app replacement for window.prompt (unsupported in WKWebView).
 *  Resolves with the entered string, or null if cancelled. */
/** In-app replacement for window.confirm (unreliable in WKWebView).
 *  Resolves true if the user confirms, false otherwise. */
export function confirmDialog(opts: {
  title: string;
  message?: string;
  confirmLabel?: string;
}): Promise<boolean> {
  return new Promise((resolve) => {
    useUi.setState({
      confirmRequest: {
        ...opts,
        resolve: (ok) => {
          useUi.setState({ confirmRequest: null });
          resolve(ok);
        },
      },
    });
  });
}

export function textPrompt(opts: {
  title: string;
  initial?: string;
  placeholder?: string;
}): Promise<string | null> {
  return new Promise((resolve) => {
    useUi.setState({
      promptRequest: {
        ...opts,
        resolve: (value) => {
          useUi.setState({ promptRequest: null });
          resolve(value);
        },
      },
    });
  });
}
