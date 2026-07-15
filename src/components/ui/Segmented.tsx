// Segmented control (pill button group) — the single implementation behind
// every mode/answers/kind/tab picker in the app.

const PAD = { xs: "px-1 py-1", sm: "px-3 py-1.5", md: "px-4 py-1.5" } as const;

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
    <div className={`flex overflow-hidden rounded-md border border-edge ${className}`}>
      {options.map(([v, label]) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          className={`${grow ? "flex-1 " : ""}${PAD[size]} text-xs whitespace-nowrap ${
            value === v
              ? "bg-accent font-medium text-on-accent"
              : "bg-surface text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
