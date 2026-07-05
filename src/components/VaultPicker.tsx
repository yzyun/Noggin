// First-launch screen: choose (or create) the vault folder.

import { useVault } from "../state/vault";

export function VaultPicker() {
  const { pickAndOpen, error } = useVault();

  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 px-8">
      <div className="text-center">
        <h1 className="text-3xl font-semibold tracking-tight">Welcome to your Noggin</h1>
        <p className="mt-2 max-w-md text-sm text-neutral-500 dark:text-neutral-400">
          Your questions and notes live in a plain folder on disk — a{" "}
          <span className="font-medium">vault</span> — as portable Markdown files, just like
          Obsidian. Pick an empty folder to start a new vault, or an existing vault to reopen it.
        </p>
      </div>

      <button
        onClick={pickAndOpen}
        className="rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-on-accent shadow-sm transition hover:bg-accent-hover active:bg-accent-hover"
      >
        Choose vault folder…
      </button>

      {error && (
        <p className="max-w-md text-center text-sm text-red-600 dark:text-red-400">{error}</p>
      )}
    </div>
  );
}
