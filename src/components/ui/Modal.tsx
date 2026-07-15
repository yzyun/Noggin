// Modal shell: dimmed backdrop (click to close) + centered panel.

export function Modal({
  onClose,
  children,
  width = "max-w-sm",
  top = "pt-32",
  padded = true,
}: {
  onClose(): void;
  children: React.ReactNode;
  /** Tailwind max-width class for the panel. */
  width?: string;
  /** Tailwind padding-top class positioning the panel. */
  top?: string;
  /** false = flush panel with overflow-hidden (palette/search layouts). */
  padded?: boolean;
}) {
  return (
    <div
      className={`fixed inset-0 z-50 flex items-start justify-center bg-black/30 ${top}`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`w-full ${width} rounded-xl border border-edge bg-surface shadow-2xl ${
          padded ? "p-4" : "overflow-hidden"
        }`}
      >
        {children}
      </div>
    </div>
  );
}
