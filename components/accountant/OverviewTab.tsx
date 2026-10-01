import React from 'react';
import type { ProfitAndLoss } from '../../utils/accounting/profitAndLoss';
import type { CorporationTaxEstimate } from '../../utils/accounting/corporationTax';
import { formatDayShort } from '../../utils/accounting/yearEnd';
import { HubCard, CsvButton, money, downloadCsv, fix2 } from './hubShared';
import { ChevronRightIcon } from '../icons';

// Headline figures for the period, then a "data health" list the accountant can trust:
// each line says what is missing and jumps to where it is fixed.

export interface HealthItem {
    id: string;
    label: string;
    detail: string;
    count: number;
    /** 'ok' items show a green tick; others amber. */
    tone: 'ok' | 'warn' | 'info';
    actionLabel?: string;
    onAction?: () => void;
}

interface Props {
    pnl: ProfitAndLoss;
    vatDue: number | null;
    ct: CorporationTaxEstimate;
    health: HealthItem[];
}

const Stat = ({ label, value, sub, tone = 'plain', onClick }: { label: string; value: string; sub?: string; tone?: 'plain' | 'good' | 'bad'; onClick?: () => void }) => {
    const Tag = onClick ? 'button' : 'div';
    return (
        <Tag
            {...(onClick ? { type: 'button' as const, onClick } : {})}
            className={`group min-w-0 rounded-xl border border-gray-700/70 bg-gray-800 px-4 py-3.5 text-left shadow-md ${onClick ? 'transition-colors hover:border-gray-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400' : ''}`}
        >
            <p className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                {label}
                {onClick && <ChevronRightIcon className="h-3.5 w-3.5 text-gray-600 transition-colors group-hover:text-gray-300" />}
            </p>
            <p className={`mt-1.5 truncate text-xl font-semibold tabular-nums sm:text-2xl ${tone === 'good' ? 'text-emerald-300' : tone === 'bad' ? 'text-red-300' : 'text-white'}`}>{value}</p>
            {sub && <p className="mt-0.5 truncate text-xs text-gray-400">{sub}</p>}
        </Tag>
    );
};

const OverviewTab = ({ pnl, vatDue, ct, health, onOpen }: Props & { onOpen: (tab: 'pnl' | 'vat' | 'ct' | 'expenses') => void }) => {
    const margin = pnl.revenue.total ? (pnl.grossProfit / pnl.revenue.total) * 100 : 0;
    const periodText = `${formatDayShort(pnl.range.start)} to ${formatDayShort(pnl.range.end)}`;
    const issues = health.filter(h => h.tone === 'warn').length;

    const handleCsv = () => downloadCsv([
        { Item: 'PERIOD', Value: periodText },
        { Item: 'Turnover', Value: fix2(pnl.revenue.total) },
        { Item: 'Gross profit', Value: fix2(pnl.grossProfit) },
        { Item: 'Overheads', Value: fix2(pnl.expenses.total) },
        { Item: 'Net profit', Value: fix2(pnl.netProfit) },
        ...(vatDue !== null ? [{ Item: 'VAT due (negative = reclaim)', Value: fix2(vatDue) }] : []),
        { Item: 'Corporation tax estimate (this period)', Value: fix2(ct.tax) },
        { Item: '', Value: '' },
        { Item: 'DATA HEALTH', Value: '' },
        ...health.map(h => ({ Item: `${h.label}: ${h.detail}`, Value: String(h.count) })),
    ], `Accounts_Overview_${pnl.range.start}_to_${pnl.range.end}.csv`);

    return (
        <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 2xl:grid-cols-6">
                <Stat label="Turnover" value={money(pnl.revenue.total)} sub={pnl.isVatRegistered ? 'Net of VAT' : undefined} onClick={() => onOpen('pnl')} />
                <Stat label="Gross profit" value={money(pnl.grossProfit, true)} sub={`${margin.toFixed(1)}% margin`} onClick={() => onOpen('pnl')} />
                <Stat label="Overheads" value={money(pnl.expenses.total)} sub={`${pnl.expenses.byCategory.length} categories`} onClick={() => onOpen('expenses')} />
                <Stat label="Net profit" value={money(pnl.netProfit, true)} tone={pnl.netProfit >= 0 ? 'good' : 'bad'} onClick={() => onOpen('pnl')} />
                {vatDue !== null && <Stat label={vatDue >= 0 ? 'VAT due' : 'VAT reclaim'} value={money(Math.abs(vatDue))} sub="Same maths as VAT Summary" onClick={() => onOpen('vat')} />}
                <Stat label="Corp. tax (est.)" value={money(ct.tax)} sub={`This period only, on ${money(ct.taxableProfit)}. Full year on the Corporation Tax tab`} onClick={() => onOpen('ct')} />
            </div>

            <HubCard
                title="Data health"
                subtitle={issues ? `${issues} thing${issues === 1 ? '' : 's'} to look at before the figures are final · ${periodText}` : `Nothing outstanding for ${periodText}`}
                actions={<CsvButton onClick={handleCsv} />}
                bodyClassName=""
            >
                <ul className="divide-y divide-gray-700/60">
                    {health.map(h => (
                        <li key={h.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-4 sm:px-5">
                            <div className="flex min-w-0 flex-1 items-start gap-3">
                                <span aria-hidden className={`mt-0.5 inline-flex h-7 min-w-[1.75rem] shrink-0 items-center justify-center rounded-full px-2 text-xs font-bold tabular-nums ${h.tone === 'ok' ? 'bg-emerald-500/15 text-emerald-300' : h.tone === 'warn' ? 'bg-amber-500/15 text-amber-300' : 'bg-gray-700 text-gray-300'}`}>
                                    {h.tone === 'ok' ? '✓' : h.count}
                                </span>
                                <div className="min-w-0">
                                    <p className="text-sm font-medium text-white">{h.label}</p>
                                    <p className="text-xs text-gray-400">{h.detail}</p>
                                </div>
                            </div>
                            {h.onAction && h.actionLabel && (
                                <button type="button" onClick={h.onAction} className="inline-flex shrink-0 items-center gap-1 self-start rounded-md px-2.5 py-1.5 text-sm font-medium text-brand-300 transition-colors hover:bg-brand-500/15 hover:text-brand-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 sm:self-auto">
                                    {h.actionLabel}<ChevronRightIcon className="h-4 w-4" />
                                </button>
                            )}
                        </li>
                    ))}
                </ul>
            </HubCard>
        </div>
    );
};

export default OverviewTab;
