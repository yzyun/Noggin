// Form-field styling in one place: the small muted label and the standard
// text-input look. INPUT omits width — callers append w-full / w-20 / etc.

export const LABEL = "mb-1 block text-xs font-medium text-neutral-500 dark:text-neutral-400";
export const INPUT =
  "rounded-md border border-edge bg-surface px-2.5 py-1.5 text-sm outline-none focus:border-accent";

export function Field({
  label,
  as = "label",
  className = "block",
  children,
}: {
  label: React.ReactNode;
  /** "div" when the control isn't a single input (segmented rows, pickers). */
  as?: "label" | "div";
  className?: string;
  children: React.ReactNode;
}) {
  const Tag = as;
  return (
    <Tag className={className}>
      <span className={LABEL}>{label}</span>
      {children}
    </Tag>
  );
}
