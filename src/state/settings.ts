// Settings store: loads .studydb/config.json when a vault opens, exposes
// the normalized settings, and persists edits back (debounced). The file is
// created by Rust with defaults on first vault open; the frontend owns it
// afterwards. Missing/corrupt content falls back to DEFAULT_SETTINGS.

import { create } from "zustand";
import { ipc } from "../lib/ipc";
import { setTheme } from "../lib/theme";
import { DEFAULT_SETTINGS, normalizeSettings, type AppSettings } from "../domain/settings";

const CONFIG_PATH = ".studydb/config.json";
const SAVE_DEBOUNCE_MS = 500;

/** Deep partial where arrays are replaced whole, not merged per-index. */
export type SettingsPatch = {
  [K in keyof AppSettings]?: AppSettings[K] extends object
    ? AppSettings[K] extends unknown[]
      ? AppSettings[K]
      : Partial<{
          [P in keyof AppSettings[K]]: AppSettings[K][P] extends object
            ? AppSettings[K][P] extends unknown[]
              ? AppSettings[K][P]
              : Partial<AppSettings[K][P]>
            : AppSettings[K][P];
        }>
    : AppSettings[K];
};

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

function deepMerge<T>(base: T, patch: unknown): T {
  if (!isPlainObject(base) || !isPlainObject(patch)) {
    return (patch === undefined ? base : patch) as T;
  }
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    out[k] = isPlainObject(v) && isPlainObject(out[k]) ? deepMerge(out[k], v) : v;
  }
  return out as T;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleSave(settings: AppSettings) {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    ipc
      .writeFile(CONFIG_PATH, JSON.stringify(settings, null, 2) + "\n")
      .catch((e) => console.error("failed to save settings:", e));
  }, SAVE_DEBOUNCE_MS);
}

interface SettingsStore {
  settings: AppSettings;
  loaded: boolean;
  /** Read + normalize the vault's config.json (call on vault open). */
  load(): Promise<void>;
  /** Merge a patch, apply side effects (theme), persist (debounced). */
  update(patch: SettingsPatch): void;
}

export const useSettings = create<SettingsStore>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  loaded: false,

  load: async () => {
    let settings = DEFAULT_SETTINGS;
    try {
      settings = normalizeSettings(JSON.parse(await ipc.readFile(CONFIG_PATH)));
    } catch (e) {
      console.warn("settings: using defaults (config.json missing or invalid)", e);
    }
    set({ settings, loaded: true });
    setTheme(settings.theme);
  },

  update: (patch) => {
    const settings = normalizeSettings(deepMerge(get().settings, patch));
    const themeChanged = settings.theme !== get().settings.theme;
    set({ settings });
    if (themeChanged) setTheme(settings.theme);
    scheduleSave(settings);
  },
}));
