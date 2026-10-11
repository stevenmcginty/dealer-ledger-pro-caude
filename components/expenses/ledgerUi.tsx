import React from 'react';
import { Checkbox } from '../ui';
import { cx } from '../ui/cx';
import { formatCurrency } from '../../utils/helpers';

/*
 * Small pieces shared by the Expenses and Bank screens. Local to this folder;
 * candidates for components/ui once D1 picks them up (see the S3 report).
 */

/**
 * Money set as a ledger figure: mono, tabular, true minus sign, pence always.
 * `signed` puts a "+" on money in; `tone` colours money in green (out stays ink).
 */
export const Money: React.FC<{
    amount: number;
    signed?: boolean;
    tone?: boolean;
    className?: string;
}> = ({ amount, signed = false, tone = false, className }) => {
    const abs = formatCurrency(Math.abs(amount));
    const text = amount < 0 ? `−${abs}` : signed && amount > 0 ? `+${abs}` : abs;
    return (
        <span className={cx('num whitespace-nowrap', tone && amount > 0 && 'text-success', className)}>
            {text}
        </span>
    );
};

/** A keyboard key in the shortcut legend. */
export const Kbd: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <kbd className="inline-grid min-w-[24px] place-items-center rounded-chip border border-line-strong bg-surface px-1.5 font-mono text-xs font-semibold leading-5 text-ink">
        {children}
    </kbd>
);

/**
 * A filter / period chip: a pill that is either on or off. 40px on a mouse,
 * 48px on touch. Pressed state is announced, not shown by colour alone
 * (the active chip also gets a check-weight border).
 */
export const Chip: React.FC<{
    active: boolean;
    onClick: () => void;
    children: React.ReactNode;
    className?: string;
}> = ({ active, onClick, children, className }) => (
    <button
        type="button"
        aria-pressed={active}
        onClick={onClick}
        className={cx(
            'inline-flex min-h-[40px] flex-none items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 text-sm font-semibold',
            '[@media(pointer:coarse)]:min-h-[48px]',
            'transition-[background-color,border-color,color,transform] duration-quick ease-out active:scale-[.97] active:duration-press',
            active
                ? 'border-accent bg-accent-soft text-accent-soft-ink'
                : 'border-line-strong bg-surface text-ink-2 hover:bg-surface-2 hover:text-ink',
            className,
        )}
    >
        {children}
    </button>
);

/** A bare row checkbox inside a 48px hit area. */
export const RowCheck: React.FC<{
    checked: boolean;
    onChange: (checked: boolean) => void;
    label: string;
    className?: string;
}> = ({ checked, onChange, label, className }) => (
    <label
        className={cx('grid h-12 w-12 flex-none cursor-pointer place-items-center', className)}
        onClick={e => e.stopPropagation()}
    >
        <Checkbox checked={checked} onChange={e => onChange(e.target.checked)} aria-label={label} />
    </label>
);

/** The thin "page footer" of a ledger: a count on the left, totals on the right. */
export const LedgerSummary: React.FC<{
    left: React.ReactNode;
    right?: React.ReactNode;
    className?: string;
}> = ({ left, right, className }) => (
    <div className={cx('flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-line pb-2 text-sm text-ink-3', className)}>
        <span>{left}</span>
        {right && <span className="flex flex-wrap items-baseline gap-x-4 gap-y-1">{right}</span>}
    </div>
);

/** Mono uppercase label for groups (matches ui/cx `eyebrow`). */
export const eyebrowClass = 'font-mono text-xs font-semibold uppercase tracking-[0.08em] text-ink-3';
