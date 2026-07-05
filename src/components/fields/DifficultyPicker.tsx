// 1–5 difficulty, click again to clear.

interface Props {
  value: number | null;
  onChange(v: number | null): void;
}

export function DifficultyPicker({ value, onChange }: Props) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(value === n ? null : n)}
          className={`h-8 w-8 rounded-md border text-sm font-medium transition ${
            value !== null && n <= value
              ? "border-amber-400 bg-amber-100 text-amber-900 dark:border-amber-600 dark:bg-amber-950 dark:text-amber-200"
              : "border-neutral-300 text-neutral-400 hover:border-neutral-400 dark:border-neutral-700 dark:text-neutral-500"
          }`}
          title={`difficulty ${n}`}
        >
          {n}
        </button>
      ))}
    </div>
  );
}
