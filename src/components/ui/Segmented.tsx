// Segmented control (pill button group) — the single implementation behind
// every mode/answers/kind/tab picker in the app.

const PAD = { xs: "px-1 py-1", sm: "px-3 py-1", md: "px-4 py-1.5" } as const;

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  size = "sm",
  grow = false,
  className = "",
}: {
  value: T;
  options: readonly (readonly [T, string])[];
  onChange(v: T): void;
  size?: keyof typeof PAD;
  /** flex-1 cells that fill the row. */
  grow?: boolean;
  className?: string;
}) {
  return (
    <div
      role="radiogroup"
      className={`flex gap-0.5 rounded-lg bg-neutral-200/70 p-0.5 dark:bg-neutral-800 ${className}`}
    >
      {options.map(([v, label]) => (
        <button
          key={v}
          role="radio"
          aria-checked={value === v}
          onClick={() => onChange(v)}
          className={`${grow ? "flex-1 " : ""}${PAD[size]} rounded-md text-xs whitespace-nowrap transition-colors ${
            value === v
              ? "bg-surface font-medium text-neutral-900 shadow-sm dark:bg-neutral-600 dark:text-white"
              : "text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
