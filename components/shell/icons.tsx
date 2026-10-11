import React from 'react';

/*
 * Shell icons, drawn to the Forecourt Ledger icon rules (spec 4.3): 24 grid,
 * 1.5 stroke, round caps and joins, currentColor, outline only.
 *
 * Only the shell's own glyphs live here: the ones components/icons.tsx has no
 * equivalent for. Everything else in the shell uses components/icons.tsx.
 * Paths are copied from the spec's own sprite (dealer-ledger-redesign.html).
 */
export type ShellIconProps = { className?: string; title?: string };
type Draw = React.ReactNode;

const make = (draw: Draw) => {
    const C = ({ className = 'h-6 w-6', title }: ShellIconProps) => (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            className={className}
            focusable="false"
            aria-hidden={title ? undefined : true}
            role={title ? 'img' : undefined}
        >
            {title && <title>{title}</title>}
            {draw}
        </svg>
    );
    return C;
};

export const ReceiptIcon = make(
    <>
        <path d="M6 3.5h12V21l-3-1.75L12 21l-3-1.75L6 21z" />
        <path d="M9 8h6M9 11.5h6M9 15h3.5" />
    </>,
);
export const SheetIcon = make(
    <>
        <rect x="5.5" y="3.5" width="13" height="17" rx="1.5" />
        <path d="M9 8h6M9 11.5h6M9 15h4" />
    </>,
);
export const WrenchIcon = make(<path d="M14.7 3.8a4.6 4.6 0 0 0-4.2 6.1l-6 6a1.9 1.9 0 0 0 2.7 2.7l6-6a4.6 4.6 0 0 0 6.1-4.2l-2.8 1.2-2.4-1.1-1.1-2.4z" />);
export const SlidersIcon = make(
    <>
        <path d="M4 7h8.5M17.5 7H20M4 17h2.5M11.5 17H20" />
        <circle cx="15" cy="7" r="2.5" />
        <circle cx="9" cy="17" r="2.5" />
    </>,
);
export const FolderIcon = make(<path d="M3.5 7A1.5 1.5 0 0 1 5 5.5h4l2 2h8A1.5 1.5 0 0 1 20.5 9v9a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 18z" />);
export const ChartIcon = make(<path d="M4 20h16M7 16.5V12M11 16.5v-8M15 16.5V10M19 16.5V5.5" />);
export const ClipIcon = make(
    <>
        <path d="M8.5 5.5H7A1.5 1.5 0 0 0 5.5 7v12.5A1.5 1.5 0 0 0 7 21h10a1.5 1.5 0 0 0 1.5-1.5V7A1.5 1.5 0 0 0 17 5.5h-1.5" />
        <rect x="8.5" y="3.5" width="7" height="3.5" rx="1" />
        <path d="m9 13.5 2 2 4-4" />
    </>,
);
export const BookIcon = make(
    <>
        <path d="M5 5.5A1.5 1.5 0 0 1 6.5 4H19v13H6.5A1.5 1.5 0 0 0 5 18.5z" />
        <path d="M5 18.5A1.5 1.5 0 0 0 6.5 20H19v-3M9 8h6" />
    </>,
);
// Money coming in: an arrow into a tray.
export const IncomeIcon = make(<path d="M12 4.5V15M7.75 10.75 12 15l4.25-4.25M5 14.5v4A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5v-4" />);
