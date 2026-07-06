// Theme presets: each sets the design-token CSS vars (accent, surfaces,
// font — see index.css) via html[data-theme]; dark-based themes also set
// the `dark` class so `dark:` neutral variants apply. Persisted locally.

const KEY = "studydb.theme";

export interface ThemePreset {
  id: string;
  label: string;
  /** Uses the dark neutral palette (`dark:` variants). */
  dark: boolean;
  /** Accent swatch shown in the theme menu. */
  swatch: string;
  bg: string;
}

export const THEMES: ThemePreset[] = [
  { id: "light", label: "Light", dark: false, swatch: "#2563eb", bg: "#ffffff" },
  { id: "dark", label: "Dark", dark: true, swatch: "#3b82f6", bg: "#171717" },
  { id: "sepia", label: "Sepia", dark: false, swatch: "#8b5e3c", bg: "#f7f0e3" },
  { id: "nord", label: "Nord", dark: true, swatch: "#88c0d0", bg: "#2e3440" },
  { id: "forest", label: "Forest", dark: false, swatch: "#16a34a", bg: "#f4f9f4" },
  { id: "violet", label: "Violet", dark: true, swatch: "#8b5cf6", bg: "#1c1430" },
];

export function currentTheme(): string {
  return document.documentElement.dataset.theme ?? "light";
}

export function setTheme(id: string): void {
  const preset = THEMES.find((t) => t.id === id) ?? THEMES[0];
  document.documentElement.dataset.theme = preset.id;
  document.documentElement.classList.toggle("dark", preset.dark);
  localStorage.setItem(KEY, preset.id);
}

export function initTheme(): void {
  const stored = localStorage.getItem(KEY);
  const fallback = matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  setTheme(stored && THEMES.some((t) => t.id === stored) ? stored : fallback);
}
