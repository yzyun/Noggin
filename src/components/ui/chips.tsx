// Small shared chips: the toggleable tag pill and the muted folder badge.

export function TagToggle({
  label,
  on,
  onClick,
}: {
  label: string;
  on: boolean;
  onClick(): void;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-2 py-0.5 text-xs transition ${
        on
          ? "bg-accent text-on-accent"
          : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700"
      }`}
    >
      {label}
    </button>
  );
}

export function FolderBadge({ folder, className = "" }: { folder: string; className?: string }) {
  return (
    <span
      className={`rounded bg-neutral-100 px-1.5 py-0.5 text-xs text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400 ${className}`}
    >
      {folder}
    </span>
  );
}
