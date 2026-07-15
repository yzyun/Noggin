// The app's button styles in one place. Extras (w-full, mt-…) go through
// className; anything that isn't one of these shapes stays hand-rolled.

import type { ButtonHTMLAttributes, Ref } from "react";

type Variant = "primary" | "ghost" | "danger";
type Size = "sm" | "lg";

const STYLES: Record<Variant, Record<Size, string>> = {
  primary: {
    sm: "rounded-md bg-accent px-3 py-1 text-xs font-medium text-on-accent hover:bg-accent-hover",
    lg: "rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-on-accent shadow-sm transition hover:bg-accent-hover",
  },
  ghost: {
    sm: "rounded-md border border-edge px-2.5 py-1 text-xs text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800",
    lg: "rounded-lg border border-edge px-5 py-2.5 text-sm text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800",
  },
  danger: {
    sm: "rounded-md bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-500",
    lg: "rounded-lg bg-red-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-red-500",
  },
};

export function Button({
  variant = "primary",
  size = "sm",
  className = "",
  type = "button",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  /** React 19 ref-as-prop. */
  ref?: Ref<HTMLButtonElement>;
}) {
  return (
    <button
      type={type}
      className={`${STYLES[variant][size]} disabled:opacity-40 ${className}`}
      {...rest}
    />
  );
}
