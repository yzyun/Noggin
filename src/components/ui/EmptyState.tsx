// Standard "nothing here" placeholder.

export function EmptyState({
  title,
  hint,
  className = "",
}: {
  title: React.ReactNode;
  hint?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`px-2 py-3 text-center text-xs text-neutral-400 ${className}`}>
      <p>{title}</p>
      {hint && <p className="mt-1">{hint}</p>}
    </div>
  );
}
