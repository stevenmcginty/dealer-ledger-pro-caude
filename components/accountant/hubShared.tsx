import React from 'react';
import Papa from 'papaparse';
import UkDateInput from '../common/UkDateInput';
import { ArrowDownTrayIcon } from '../icons';
import { getPresetRange, DatePreset } from '../../utils/datePresets';
import { thisFinancialYear, lastFinancialYear, DateRange } from '../../utils/accounting/yearEnd';
import { formatCurrency } from '../../utils/helpers';

// Shared pieces of the Accountant hub: the one period bar every tab follows, a card
// shell, money cells and the CSV download. Kept small and Tailwind-only.

export type HubPeriod = DateRange;

const PRESETS: { key: DatePreset; label: string }[] = [
    { key: 'this_month', label: 'This month' },
    { key: 'last_month', label: 'Last month' },
    { key: 'this_quarter', label: 'This quarter' },
    { key: 'last_quarter', label: 'Last quarter' },
    { key: 'this_year', label: 'This year' },
];

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
        <div className="rounded-xl border border-gray-700/70 bg-gray-800 p-3 sm:p-4 shadow-md">
            <div className="flex flex-col gap-3 2xl:flex-row 2xl:items-center 2xl:gap-4">
                <div className="flex w-full min-w-0 items-center gap-2 sm:w-auto">
                    <UkDateInput id="hub-start" value={period.start} onChange={e => e.target.value && onChange({ start: e.target.value, end: period.end })} className="flex-1 min-w-0 sm:w-40 sm:flex-initial" required />
                    <span className="flex-shrink-0 text-sm text-gray-400">to</span>
                    <UkDateInput id="hub-end" value={period.end} onChange={e => e.target.value && onChange({ start: period.start, end: e.target.value })} className="flex-1 min-w-0 sm:w-40 sm:flex-initial" required />
                </div>
                <div className="-mx-3 overflow-x-auto px-3 sm:mx-0 sm:overflow-visible sm:px-0">
                    <div className="flex min-w-max items-center gap-1.5 sm:min-w-0 sm:flex-wrap">
                        {options.map(o => {
                            const active = o.range.start === period.start && o.range.end === period.end;
                            return (
                                <button
                                    key={o.label}
                                    type="button"
                                    onClick={() => onChange(o.range)}
                                    aria-pressed={active}
                                    className={`whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 ${active ? 'bg-brand-600 text-white shadow-sm' : 'bg-gray-700 text-gray-300 hover:bg-gray-600 hover:text-white'}`}
                                >
                                    {o.label}
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
};

/** A titled card. `actions` sit on the right of the header. */
export const HubCard = ({ title, subtitle, actions, children, className = '', bodyClassName = 'p-4 sm:p-5' }: {
    title?: React.ReactNode; subtitle?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode; className?: string; bodyClassName?: string;
}) => (
    <section className={`min-w-0 rounded-xl border border-gray-700/70 bg-gray-800 shadow-md ${className}`}>
        {(title || actions) && (
            <header className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-700/70 px-4 py-3 sm:px-5">
                <div className="min-w-0">
                    {title && <h3 className="text-base font-semibold text-white">{title}</h3>}
                    {subtitle && <p className="mt-0.5 text-xs text-gray-400">{subtitle}</p>}
                </div>
                {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
            </header>
        )}
        <div className={bodyClassName}>{children}</div>
    </section>
);

export const CsvButton = ({ onClick, label = 'CSV' }: { onClick: () => void; label?: string }) => (
    <button type="button" onClick={onClick} className="inline-flex items-center gap-1.5 rounded-md bg-gray-700 px-3 py-1.5 text-sm font-medium text-gray-200 transition-colors hover:bg-gray-600 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400">
        <ArrowDownTrayIcon className="h-4 w-4" /> {label}
    </button>
);

/** Money as the app formats it; negatives in brackets when `brackets`. */
export const money = (n: number, brackets = false) =>
    brackets && n < 0 ? `(${formatCurrency(Math.abs(n))})` : formatCurrency(n);

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
