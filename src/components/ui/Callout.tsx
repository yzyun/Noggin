// Framed content section with an optional small heading — the green Answer
// box, amber Hint box, and neutral Solution/preview frames.

const TONES = {
  answer: {
    box: "border-green-200 bg-green-50/50 dark:border-green-900 dark:bg-green-950/30",
    label: "text-green-700 dark:text-green-400",
  },
  hint: {
    box: "border-amber-200 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/30",
    label: "text-amber-700 dark:text-amber-400",
  },
  neutral: { box: "border-edge bg-surface", label: "text-neutral-500" },
} as const;

export function Callout({
  tone,
  label,
  className = "p-3",
  children,
}: {
  tone: keyof typeof TONES;
  /** Small heading, e.g. "Answer" / "Hint" / "Solution". */
  label?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`rounded-lg border ${TONES[tone].box} ${className}`}>
      {label && <div className={`mb-1 text-xs font-medium ${TONES[tone].label}`}>{label}</div>}
      {children}
    </div>
  );
}
