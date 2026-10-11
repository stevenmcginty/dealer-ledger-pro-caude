import React from 'react';
import Papa from 'papaparse';
import UkDateInput from '../common/UkDateInput';
import { ArrowDownTrayIcon } from '../icons';
import { getPresetRange, DatePreset } from '../../utils/datePresets';
import { thisFinancialYear, lastFinancialYear, DateRange } from '../../utils/accounting/yearEnd';
import { formatCurrency } from '../../utils/helpers';
import { Button } from '../ui';
import { cx, eyebrow } from '../ui/cx';

// Shared pieces of the money reports (Accountant hub, VAT, ledger, income): the one
// period bar every tab follows, a hairline section, ledger lines with ruled totals,
// money cells and the CSV download. Display only: no figure is worked out here.

export type HubPeriod = DateRange;

const PRESETS: { key: DatePreset; label: string }[] = [
    { key: 'this_month', label: 'This month' },
    { key: 'last_month', label: 'Last month' },
    { key: 'this_quarter', label: 'This quarter' },
    { key: 'last_quarter', label: 'Last quarter' },
    { key: 'this_year', label: 'This year' },
];

/** A quick-pick chip (period presets, basis switches). 48px on touch, 36px with a mouse. */
export const chipClass = (active: boolean) => cx(
    'inline-flex min-h-[36px] flex-none items-center whitespace-nowrap rounded-control border px-3 text-sm font-semibold',
    '[@media(pointer:coarse)]:min-h-[48px] transition-colors duration-quick ease-out',
    active ? 'border-accent bg-accent-soft text-accent-soft-ink' : 'border-line-strong bg-surface text-ink-2 hover:bg-surface-2 hover:text-ink',
);

interface PeriodBarProps {
    period: HubPeriod;
    yearEnd?: string;
    onChange: (p: HubPeriod) => void;
}

export const PeriodBar = ({ period, yearEnd, onChange }: PeriodBarProps) => {
    const thisFy = thisFinancialYear(yearEnd);
    const lastFy = lastFinancialYear(yearEnd);
    const options = [
        ...PRESETS.map(p => ({ label: p.label, range: getPresetRange(p.key) })),
        { label: 'This financial year', range: { start: thisFy.start, end: thisFy.end } },
        { label: 'Last financial year', range: { start: lastFy.start, end: lastFy.end } },
    ];
    return (
        <section aria-label="Report period" className="flex min-w-0 flex-col gap-3 2xl:flex-row 2xl:items-end 2xl:gap-6">
            <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-end gap-2 sm:flex sm:items-end">
                <div className="min-w-0">
                    <label htmlFor="hub-start" className={cx(eyebrow, 'mb-1.5 block')}>From</label>
                    <UkDateInput id="hub-start" value={period.start} onChange={e => e.target.value && onChange({ start: e.target.value, end: period.end })} className="sm:w-44" required />
                </div>
                <span aria-hidden="true" className="pb-3.5 text-ink-3">–</span>
                <div className="min-w-0">
                    <label htmlFor="hub-end" className={cx(eyebrow, 'mb-1.5 block')}>To</label>
                    <UkDateInput id="hub-end" value={period.end} onChange={e => e.target.value && onChange({ start: period.start, end: e.target.value })} className="sm:w-44" required />
                </div>
            </div>
            <div className="-mx-4 min-w-0 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden">
                <div role="group" aria-label="Quick periods" className="flex min-w-max gap-1.5 sm:min-w-0 sm:flex-wrap">
                    {options.map(o => {
                        const active = o.range.start === period.start && o.range.end === period.end;
                        return (
                            <button key={o.label} type="button" onClick={() => onChange(o.range)} aria-pressed={active} className={chipClass(active)}>
                                {o.label}
                            </button>
                        );
                    })}
                </div>
            </div>
        </section>
    );
};

/** A titled section on a hairline. `actions` sit at the end of the header. */
export const HubCard = ({ title, subtitle, actions, children, className = '', bodyClassName = 'p-4 sm:p-5' }: {
    title?: React.ReactNode; subtitle?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode; className?: string; bodyClassName?: string;
}) => (
    <section className={cx('min-w-0 rounded-card border border-line bg-surface print:break-inside-avoid print:border-ink-3', className)}>
        {(title || actions) && (
            <header className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2 border-b border-line px-4 py-3 sm:px-5">
                <div className="min-w-0">
                    {title && <h3 className="text-base font-bold leading-6 text-ink">{title}</h3>}
                    {subtitle && <p className="mt-0.5 text-sm leading-5 text-ink-3">{subtitle}</p>}
                </div>
                {actions && <div className="flex flex-wrap items-center gap-2 print:hidden">{actions}</div>}
            </header>
        )}
        <div className={bodyClassName}>{children}</div>
    </section>
);

export const CsvButton = ({ onClick, label = 'CSV' }: { onClick: () => void; label?: string }) => (
    <Button variant="secondary" size="sm" onClick={onClick} icon={<ArrowDownTrayIcon />} aria-label={label === 'CSV' ? 'Download CSV' : undefined}>
        {label}
    </Button>
);

/** Money as the app formats it; negatives in brackets when `brackets`. */
export const money = (n: number, brackets = false) =>
    brackets && n < 0 ? `(${formatCurrency(Math.abs(n))})` : formatCurrency(n);

/** Same figure as `money`, with a true minus sign for the screen. */
export const moneyText = (n: number, brackets = false) => money(n, brackets).replace(/^-/, '−');

/** A money figure set in the ledger mono. */
export const Money = ({ value, brackets = false, className }: { value: number; brackets?: boolean; className?: string }) => (
    <span className={cx('num whitespace-nowrap', className)}>{moneyText(value, brackets)}</span>
);

/** Small mono caps label (column heads, section labels). */
export const Eyebrow = ({ children, className, as: Tag = 'p' }: { children: React.ReactNode; className?: string; as?: 'p' | 'h3' | 'h4' | 'span' }) => (
    <Tag className={cx(eyebrow, className)}>{children}</Tag>
);

/** A label/figure line. `total` draws the strong rule above; `grand` adds the double rule under. */
export const Line = ({ label, children, indent = false, muted = false, total = false, grand = false, className }: {
    label: React.ReactNode; children?: React.ReactNode; indent?: boolean; muted?: boolean; total?: boolean; grand?: boolean; className?: string;
}) => (
    <div
        className={cx(
            'flex items-baseline justify-between gap-4 py-2 text-sm leading-5',
            indent && 'ps-4',
            total && 'mt-0.5 border-t border-t-line-strong pt-2.5 font-bold text-ink',
            grand ? 'border-b-[3px] [border-bottom-style:double] border-b-ink-2 pb-2 text-base' : !total && 'border-b [border-bottom-style:dashed] border-b-line last:border-b-0',
            className,
        )}
    >
        <span className={cx('min-w-0', total ? 'text-ink' : muted ? 'text-ink-3' : 'text-ink-2')}>{label}</span>
        <span className={cx('flex-none text-end', total ? 'text-ink' : muted ? 'text-ink-3' : 'text-ink', !total && 'font-semibold')}>{children}</span>
    </div>
);

/** A table foot cell that matches ui/DataTable's cells. */
export const FootCell = ({ children, numeric = false, className, colSpan }: { children?: React.ReactNode; numeric?: boolean; className?: string; colSpan?: number }) => (
    <td
        colSpan={colSpan}
        className={cx(
            'h-11 whitespace-nowrap border-t border-line-strong bg-surface-2 px-2.5 text-sm font-bold text-ink',
            numeric && 'num text-end',
            className,
        )}
    >
        {children}
    </td>
);

export const downloadCsv = (rows: Record<string, unknown>[], fileName: string) => {
    const csv = Papa.unparse(rows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};

export const fix2 = (n: number) => (Math.round(n * 100) / 100).toFixed(2);
