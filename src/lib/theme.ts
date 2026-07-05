// Light/dark theme, persisted to localStorage, applied as a class on <html>.

const KEY = "studydb.theme";

export type Theme = "light" | "dark";

export function initTheme(): Theme {
  const stored = localStorage.getItem(KEY) as Theme | null;
  const theme =
    stored ?? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  apply(theme);
  return theme;
}

export function toggleTheme(): Theme {
  const next: Theme = document.documentElement.classList.contains("dark") ? "light" : "dark";
  localStorage.setItem(KEY, next);
  apply(next);
  return next;
}

function apply(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
}
