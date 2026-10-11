import React from 'react';
import type { ProfitAndLoss } from '../../utils/accounting/profitAndLoss';
import type { CorporationTaxEstimate } from '../../utils/accounting/corporationTax';
import { formatDayShort } from '../../utils/accounting/yearEnd';
import { HubCard, CsvButton, money, downloadCsv, fix2, Money, Eyebrow } from './hubShared';
import { ChevronRightIcon, CheckIcon } from '../icons';
import { Button } from '../ui';
import { cx } from '../ui/cx';

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

const Stat = ({ label, value, sub, tone = 'plain', onClick }: { label: string; value: number; sub?: string; tone?: 'plain' | 'good' | 'bad'; onClick?: () => void }) => {
    const Tag = onClick ? 'button' : 'div';
    return (
        <Tag
            {...(onClick ? { type: 'button' as const, onClick } : {})}
            className={cx(
                'group flex min-h-[96px] min-w-0 flex-col bg-surface px-4 py-3.5 text-start',
                onClick && 'transition-colors duration-quick ease-out hover:bg-surface-2 active:bg-surface-3',
            )}
        >
            <span className="flex items-center justify-between gap-2">
                <Eyebrow as="span">{label}</Eyebrow>
                {onClick && <ChevronRightIcon className="h-4 w-4 flex-none text-ink-3 transition-colors group-hover:text-ink-2 rtl:rotate-180" />}
            </span>
            <span className={cx('mt-1.5 truncate text-xl font-bold sm:text-2xl', tone === 'good' ? 'text-success' : tone === 'bad' ? 'text-danger' : 'text-ink')}>
                <Money value={value} brackets />
            </span>
            {sub && <span className="mt-0.5 line-clamp-2 text-sm leading-5 text-ink-3">{sub}</span>}
        </Tag>
    );
};

const TONE = {
    ok: { tile: 'bg-success-soft text-success-ink', word: 'Done' },
    warn: { tile: 'bg-warning-soft text-warning-ink', word: 'Check' },
    info: { tile: 'bg-info-soft text-info-ink', word: 'Note' },
} as const;

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
            {/* Hairline grid of headline figures: the gaps between cells are the rules. */}
            <div className="grid grid-cols-2 gap-px overflow-hidden rounded-card border border-line bg-line lg:grid-cols-3 2xl:grid-cols-6">
                <Stat label="Turnover" value={pnl.revenue.total} sub={pnl.isVatRegistered ? 'Net of VAT' : undefined} onClick={() => onOpen('pnl')} />
                <Stat label="Gross profit" value={pnl.grossProfit} sub={`${margin.toFixed(1)}% margin`} onClick={() => onOpen('pnl')} />
                <Stat label="Overheads" value={pnl.expenses.total} sub={`${pnl.expenses.byCategory.length} categories`} onClick={() => onOpen('expenses')} />
                <Stat label="Net profit" value={pnl.netProfit} sub={pnl.netProfit < 0 ? 'Loss for the period' : undefined} tone={pnl.netProfit >= 0 ? 'good' : 'bad'} onClick={() => onOpen('pnl')} />
                {vatDue !== null && <Stat label={vatDue >= 0 ? 'VAT to pay' : 'VAT to reclaim'} value={Math.abs(vatDue)} sub="Same figures as the VAT return" onClick={() => onOpen('vat')} />}
                <Stat label="Corp. tax (est.)" value={ct.tax} sub={`This period only, on ${money(ct.taxableProfit)}`} onClick={() => onOpen('ct')} />
            </div>

            <HubCard
                title="Data health"
                subtitle={issues ? `${issues} thing${issues === 1 ? '' : 's'} to look at before the figures are final · ${periodText}` : `Nothing outstanding for ${periodText}`}
                actions={<CsvButton onClick={handleCsv} />}
                bodyClassName=""
            >
                <ul>
                    {health.map(h => (
                        <li key={h.id} className="flex flex-col gap-2 border-b border-line px-4 py-3 last:border-b-0 sm:flex-row sm:items-center sm:gap-4 sm:px-5">
                            <div className="flex min-w-0 flex-1 items-start gap-3">
                                <span className={cx('mt-0.5 inline-flex h-8 min-w-[2rem] flex-none items-center justify-center rounded-control px-1.5 text-sm font-bold', TONE[h.tone].tile)}>
                                    {h.tone === 'ok' ? <CheckIcon className="h-5 w-5" aria-hidden="true" /> : <span className="num">{h.count}</span>}
                                    <span className="sr-only">{TONE[h.tone].word}:</span>
                                </span>
                                <div className="min-w-0">
                                    <p className="text-sm font-semibold leading-5 text-ink">{h.label}</p>
                                    <p className="text-sm leading-5 text-ink-3">{h.detail}</p>
                                </div>
                            </div>
                            {h.onAction && h.actionLabel && (
                                <Button variant="ghost" size="sm" onClick={h.onAction} iconEnd={<ChevronRightIcon className="rtl:rotate-180" />} className="self-start ps-11 sm:self-auto sm:ps-3">
                                    {h.actionLabel}
                                </Button>
                            )}
                        </li>
                    ))}
                </ul>
            </HubCard>
        </div>
    );
};

export default OverviewTab;
