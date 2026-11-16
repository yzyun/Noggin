// Minimal stroke icons, drawn on a 24px grid (no icon-library dependency).

import type { ReactNode } from "react";
import logoUrl from "../assets/logo.png";

type IconProps = { className?: string };

function icon(paths: ReactNode, defaultClass = "h-4 w-4 shrink-0") {
  return function Icon({ className }: IconProps) {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className={className ?? defaultClass}
      >
        {paths}
      </svg>
    );
  };
}

export const FolderIcon = icon(
  <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />,
  "h-3.5 w-3.5 shrink-0 text-neutral-400",
);

/** Stacked cards — review. */
export const ReviewIcon = icon(
  <>
    <rect x="3" y="9" width="18" height="12" rx="2" />
    <path d="M6 5.5h12M8.5 2.5h7" />
  </>,
);

/** Checklist — quiz. */
export const QuizIcon = icon(
  <>
    <path d="m3 6 1.5 1.5L7 5M3 12l1.5 1.5L7 11M3 18l1.5 1.5L7 17" />
    <path d="M11 6h10M11 12h10M11 18h10" />
  </>,
);

/** Question mark in a circle — question bank. */
export const QuestionIcon = icon(
  <>
    <circle cx="12" cy="12" r="9.5" />
    <path d="M9.2 9.2a2.9 2.9 0 0 1 5.6 1c0 1.9-2.8 2.4-2.8 4" />
    <path d="M12 17.5h.01" />
  </>,
);

/** Lined page — notes. */
export const NoteIcon = icon(
  <>
    <path d="M14.5 2.5H7a2 2 0 0 0-2 2v15a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7Z" />
    <path d="M14.5 2.5V7H19M9 12.5h6M9 16.5h4" />
  </>,
);

/** Stacked pages — papers. */
export const PaperIcon = icon(
  <>
    <rect x="8" y="2.5" width="12" height="15" rx="2" />
    <path d="M16 21.5H6a2 2 0 0 1-2-2V7" />
  </>,
);

export const ImportIcon = icon(
  <>
    <path d="M12 3v12M7.5 10.5 12 15l4.5-4.5" />
    <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
  </>,
);

/** Sliders — settings. */
export const SettingsIcon = icon(
  <>
    <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
    <circle cx="15" cy="7" r="2" />
    <circle cx="9" cy="17" r="2" />
  </>,
);

export const SearchIcon = icon(
  <>
    <circle cx="11" cy="11" r="7" />
    <path d="m20.5 20.5-4.5-4.5" />
  </>,
);

export const ImageIcon = icon(
  <>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <circle cx="8.5" cy="9.5" r="1.5" />
    <path d="m21 15.5-4.5-4.5L7 20" />
  </>,
);

export const UploadIcon = icon(
  <>
    <path d="M12 15V3M7.5 7.5 12 3l4.5 4.5" />
    <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
  </>,
);

export const PrintIcon = icon(
  <>
    <path d="M7 8V3h10v5M7 17H5a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
    <rect x="7" y="13.5" width="10" height="7.5" rx="1" />
  </>,
);

export const ShuffleIcon = icon(
  <path d="M3 7h3.5c2 0 3.5 1 4.5 2.5l2 3c1 1.5 2.5 2.5 4.5 2.5H21M3 17h3.5c1.5 0 2.700-.6 3.600-1.5M14 8.5c.9-.9 2.100-1.5 3.5-1.5H21M18 4l3 3-3 3M18 14l3 3-3 3" />,
);

export const PlusIcon = icon(<path d="M12 5v14M5 12h14" />);

export const PencilIcon = icon(
  <path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17l-1 3ZM14.5 7.5l3 3" />,
);

export const TrashIcon = icon(
  <path d="M4 6.5h16M9.5 6.5V4h5v2.5M6.5 6.5l.8 13a1.5 1.5 0 0 0 1.5 1.5h6.4a1.5 1.5 0 0 0 1.5-1.5l.8-13M10 11v6M14 11v6" />,
);

export const ChevronIcon = icon(<path d="m9 6 6 6-6 6" />);

export const CheckIcon = icon(<path d="m5 12.5 4.5 4.5L19 7.5" />);

export const SwapIcon = icon(<path d="m8 9 4-4 4 4M8 15l4 4 4-4" />);

/** The Noggin app mark (white brain on black), as a rounded tile. */
export function Logo({ className = "h-7 w-7 rounded-lg" }: IconProps) {
  return <img src={logoUrl} alt="" draggable={false} className={`shrink-0 ${className}`} />;
}
