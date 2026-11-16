// On/off switch for settings-style booleans (checkboxes stay for selection).

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange(v: boolean): void;
  /** Accessible name when there is no visible <label> wrapping it. */
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
        checked ? "bg-accent" : "bg-neutral-300 dark:bg-neutral-600"
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-surface shadow-sm transition-transform ${
          checked ? "translate-x-4" : ""
        }`}
      />
    </button>
  );
}
