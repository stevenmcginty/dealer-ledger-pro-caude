import React from 'react';

/**
 * Shared building blocks for printed vehicle documents (work receipts, internal
 * work records, spec sheets).
 *
 * The look is a coloured masthead band, then sections introduced by a small
 * accent bar, then dense label / value / note rows. The band and accent bars use
 * the business's chosen theme colour via the `brand` palette rather than a fixed
 * colour.
 *
 * Colour note: these render inside a portal on document.body, so they only pick
 * up the theme when LedgerCore has stamped `theme-*` onto <html>. Print/PDF
 * note: `print-color-adjust` is inherited, so setting it once on SheetPage keeps
 * the band and rules from being dropped by the browser's print path.
 */

export const SheetPage = ({ id, children }: { id: string; children: React.ReactNode }) => (
    <div
        id={id}
        className="bg-white w-full max-w-4xl mx-auto font-sans text-gray-900 shadow-lg print:shadow-none print:max-w-none"
        style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' } as React.CSSProperties}
    >
        {children}
    </div>
);

export const SheetBand = ({
    title,
    subtitle,
    rightTitle,
    rightSubtitle,
}: {
    title?: string | null;
    subtitle?: string | null;
    rightTitle?: string | null;
    rightSubtitle?: string | null;
}) => (
    <header className="bg-brand-800 px-8 py-6 flex items-start justify-between gap-6">
        <div className="min-w-0">
            <h1 className="text-[26px] leading-tight font-bold uppercase tracking-tight text-white">{title || 'Vehicle Record'}</h1>
            {subtitle && <p className="mt-1 text-[12px] text-brand-100">{subtitle}</p>}
        </div>
        <div className="min-w-0 text-right">
            {rightTitle && <h2 className="text-[17px] leading-tight font-bold text-white">{rightTitle}</h2>}
            {rightSubtitle && <p className="mt-1 text-[12px] text-brand-100">{rightSubtitle}</p>}
        </div>
    </header>
);

export const SheetBody = ({ children }: { children: React.ReactNode }) => (
    <div className="px-8 pt-6 pb-8">{children}</div>
);

export const SheetSection = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <section className="mt-5 first:mt-0">
        <div className="flex items-center gap-2 border-b border-gray-300 pb-1">
            <span className="block w-[3px] h-[13px] bg-brand-600 flex-shrink-0" />
            <h3 className="text-[12px] font-bold uppercase tracking-wide text-brand-800">{title}</h3>
        </div>
        <div className="mt-2">{children}</div>
    </section>
);

/**
 * A label / value / note row. Renders nothing when there is no value, so callers
 * can list every possible field without guarding each one.
 */
export const SheetRow = ({
    label,
    value,
    note,
}: {
    label: string;
    value?: string | number | null;
    note?: string | null;
}) => {
    if (value === undefined || value === null || value === '') return null;
    return (
        <div className="flex items-baseline py-[3px]">
            <span className="w-[26%] flex-shrink-0 text-[11px] text-gray-500">{label}</span>
            <span className="flex-1 text-[12px] font-semibold text-gray-900 break-words">{value}</span>
            {note && <span className="w-[32%] flex-shrink-0 pl-3 text-right text-[10px] text-gray-500">{note}</span>}
        </div>
    );
};

export const SheetBullet: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div className="flex items-baseline py-[3px]">
        <span className="w-3 flex-shrink-0 text-[12px] text-gray-400">-</span>
        <span className="flex-1 text-[12px] text-gray-800">{children}</span>
    </div>
);

export const SheetFooter = ({ lines }: { lines: (string | null | undefined | false)[] }) => {
    const visible = lines.filter((line): line is string => typeof line === 'string' && line.trim() !== '');
    if (visible.length === 0) return null;
    return (
        <footer className="mt-8 pt-3 border-t border-gray-300">
            {visible.map((line, i) => (
                <p key={i} className="text-[10px] leading-relaxed text-gray-500">{line}</p>
            ))}
        </footer>
    );
};

/** Toolbar shown above the document on screen; hidden when printing. */
export const SheetToolbar = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <header className="bg-gray-800 p-2 flex justify-between items-center print:hidden flex-shrink-0">
        <h3 className="font-bold text-white ml-2 truncate">{title}</h3>
        <div className="flex items-center flex-shrink-0">{children}</div>
    </header>
);
