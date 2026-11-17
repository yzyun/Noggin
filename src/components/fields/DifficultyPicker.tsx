// 1–5 difficulty, click again to clear.

interface Props {
  value: number | null;
  onChange(v: number | null): void;
}

export function DifficultyPicker({ value, onChange }: Props) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex gap-1" role="radiogroup" aria-label="Difficulty">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            onClick={() => onChange(value === n ? null : n)}
            className={`h-7 w-7 rounded-md border text-xs font-medium transition-colors ${
              value !== null && n <= value
                ? "border-neutral-800 bg-neutral-800 text-white dark:border-neutral-200 dark:bg-neutral-200 dark:text-neutral-900"
                : "border-edge bg-surface text-neutral-500 hover:border-neutral-400 dark:text-neutral-400"
            }`}
            title={value === n ? "Click again to clear" : `Difficulty ${n} of 5`}
          >
            {n}
          </button>
        ))}
      </div>
      <span className="text-xs text-neutral-400">
        {value === null ? "not set" : ["", "very easy", "easy", "medium", "hard", "very hard"][value]}
      </span>
    </div>
  );
}
