import React, { useMemo, useState } from 'react';
import type { StatementTransaction, FinancialAccount } from '../../types';
import { buildExpenseRows, totalExpenseRows, ExpenseRow } from '../../utils/accounting/expenseRows';
import { DateRange, inRange, toDay, formatDayShort } from '../../utils/accounting/yearEnd';
import ReceiptThumb from '../common/ReceiptThumb';
import { HubCard, CsvButton, money, downloadCsv, fix2 } from './hubShared';

// Every expense line in the period with its VAT, the receipt file one click away.
// Booked rows come from the P&L (receipts + reconciled bank lines). Bank lines that are
// not reconciled yet are listed too, flagged, and never counted in the P&L.

interface Props {
    range: DateRange;
    rows: ExpenseRow[];
    transactions: StatementTransaction[];
    financialAccounts: FinancialAccount[];
    isVatRegistered: boolean;
    /** Opens pre-filtered, e.g. from the Overview's "no receipt file" line. */
    initialStatus?: StatusFilter;
}

type StatusFilter = 'all' | 'reconciled' | 'unreconciled' | 'no_file';
type Row = ExpenseRow & { notBooked?: boolean };

const selectCls = 'block w-full rounded-md border-0 bg-gray-700 py-2 pl-3 pr-8 text-sm text-white ring-1 ring-inset ring-gray-600 focus:ring-2 focus:ring-inset focus:ring-brand-500';

const ExpensesVatTab = ({ range, rows, transactions, financialAccounts, isVatRegistered, initialStatus = 'all' }: Props) => {
    const [category, setCategory] = useState('all');
    const [account, setAccount] = useState('all');
    const [status, setStatus] = useState<StatusFilter>(initialStatus);
    const [search, setSearch] = useState('');
    const [showIncome, setShowIncome] = useState(false);

    // Unreconciled bank lines, split by the same rules as booked lines but flagged as not booked.
    const notBooked = useMemo<Row[]>(() => {
        const open = transactions.filter(t => t.status !== 'Reconciled' && inRange(toDay(t.date), range));
        return buildExpenseRows({ range, receipts: [], transactions: open.map(t => ({ ...t, status: 'Reconciled' as const })), financialAccounts, isVatRegistered })
            .map(r => ({ ...r, reconciled: false, inPnl: false, notBooked: true, notInPnlGroup: undefined, notInPnlLabel: 'Not reconciled yet' }));
    }, [transactions, range, financialAccounts, isVatRegistered]);

    const all = useMemo<Row[]>(() => [...rows, ...notBooked].sort((a, b) => a.date.localeCompare(b.date) || a.description.localeCompare(b.description)), [rows, notBooked]);
    const scoped = useMemo(() => all.filter(r => showIncome || r.direction === 'expense'), [all, showIncome]);
    const categories = useMemo(() => [...new Set(scoped.map(r => r.category))].sort((a, b) => a.localeCompare(b)), [scoped]);
    const accounts = useMemo(() => [...new Set(scoped.map(r => r.account))].sort((a, b) => a.localeCompare(b)), [scoped]);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        return scoped.filter(r => {
            if (category !== 'all' && r.category !== category) return false;
            if (account !== 'all' && r.account !== account) return false;
            if (status === 'reconciled' && !r.reconciled) return false;
            if (status === 'unreconciled' && r.reconciled) return false;
            if (status === 'no_file' && (r.source !== 'receipt' || r.receiptUrl)) return false;
            if (q && !(`${r.description} ${r.category} ${r.account} ${r.gross}`.toLowerCase().includes(q))) return false;
            return true;
        });
    }, [scoped, category, account, status, search]);

    const expenseTotals = totalExpenseRows(filtered.filter(r => r.direction === 'expense'));
    const incomeTotals = totalExpenseRows(filtered.filter(r => r.direction === 'income'));
    const pnlTotals = totalExpenseRows(filtered.filter(r => r.direction === 'expense' && r.inPnl));

    const byCategory = useMemo(() => {
        const map = new Map<string, Row[]>();
        for (const r of filtered) {
            if (r.direction !== 'expense') continue;
            map.set(r.category, [...(map.get(r.category) ?? []), r]);
        }
        return [...map.entries()].map(([cat, list]) => ({ category: cat, ...totalExpenseRows(list), inPnl: list.some(r => r.inPnl) }))
            .sort((a, b) => b.gross - a.gross);
    }, [filtered]);

    const statusText = (r: Row) => r.notBooked ? 'Not reconciled' : r.reconciled ? 'Reconciled' : r.source === 'receipt' ? r.account : 'Reconciled';

    const handleCsv = () => downloadCsv(filtered.map(r => ({
        Date: r.date,
        Description: r.description,
        Category: r.category,
        Account: r.account,
        Source: r.source,
        Direction: r.direction,
        Status: statusText(r),
        'In P&L': r.inPnl ? 'Yes' : `No (${r.notInPnlLabel ?? ''})`,
        Net: fix2(r.net),
        VAT: fix2(r.vat),
        Gross: fix2(r.gross),
        'Receipt file': r.receiptUrl ?? '',
    })), `Expenses_and_VAT_${range.start}_to_${range.end}.csv`);

    const noFile = all.filter(r => r.source === 'receipt' && !r.receiptUrl && r.direction === 'expense').length;

    return (
        <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                {[
                    { label: 'P&L expenses (net)', value: money(pnlTotals.net) },
                    { label: 'VAT on P&L expenses', value: money(pnlTotals.vat) },
                    { label: 'All lines (gross)', value: money(expenseTotals.gross) },
                    { label: 'Lines', value: `${expenseTotals.count}${noFile ? ` · ${noFile} no file` : ''}` },
                ].map(s => (
                    <div key={s.label} className="rounded-xl border border-gray-700/70 bg-gray-800 px-4 py-3">
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">{s.label}</p>
                        <p className="mt-1 truncate text-lg font-semibold tabular-nums text-white">{s.value}</p>
                    </div>
                ))}
            </div>

            <HubCard
                title="Expense lines"
                subtitle={`${formatDayShort(range.start)} to ${formatDayShort(range.end)} · receipts and bank/card lines${isVatRegistered ? '' : ' · not VAT registered, so VAT is not split out'}`}
                actions={<CsvButton onClick={handleCsv} />}
                bodyClassName=""
            >
                <div className="grid grid-cols-1 gap-2 border-b border-gray-700/70 p-3 sm:grid-cols-2 sm:p-4 lg:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))_auto]">
                    <div className="relative min-w-0">
                        <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clipRule="evenodd" /></svg>
                        <input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search supplier, category, amount…" aria-label="Search expense lines"
                            className="block w-full rounded-md border-0 bg-gray-700 py-2 pl-9 pr-3 text-sm text-white ring-1 ring-inset ring-gray-600 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-brand-500" />
                    </div>
                    <select aria-label="Category" value={category} onChange={e => setCategory(e.target.value)} className={selectCls}>
                        <option value="all">All categories</option>
                        {categories.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <select aria-label="Account" value={account} onChange={e => setAccount(e.target.value)} className={selectCls}>
                        <option value="all">All accounts</option>
                        {accounts.map(a => <option key={a} value={a}>{a}</option>)}
                    </select>
                    <select aria-label="Status" value={status} onChange={e => setStatus(e.target.value as StatusFilter)} className={selectCls}>
                        <option value="all">Any status</option>
                        <option value="reconciled">Reconciled</option>
                        <option value="unreconciled">Not reconciled</option>
                        <option value="no_file">Receipt with no file</option>
                    </select>
                    <label className="inline-flex cursor-pointer items-center gap-2 whitespace-nowrap rounded-md px-1 py-2 text-sm text-gray-300">
                        <input type="checkbox" checked={showIncome} onChange={e => setShowIncome(e.target.checked)} className="h-4 w-4 rounded border-gray-500 bg-gray-700 text-brand-600 focus:ring-brand-500" />
                        Show income
                    </label>
                </div>

                {filtered.length === 0 ? (
                    <p className="px-4 py-12 text-center text-sm text-gray-400">No lines match this period and filter.</p>
                ) : (
                    <div className="max-h-[70vh] overflow-auto">
                        <table className="w-full min-w-[56rem] text-sm">
                            <thead className="sticky top-0 z-10 bg-gray-900/95 backdrop-blur">
                                <tr className="text-[11px] uppercase tracking-wider text-gray-400">
                                    <th className="py-2.5 pl-4 pr-2 text-left font-semibold">Date</th>
                                    <th className="px-2 py-2.5 text-left font-semibold">File</th>
                                    <th className="px-2 py-2.5 text-left font-semibold">Description</th>
                                    <th className="px-2 py-2.5 text-left font-semibold">Category</th>
                                    <th className="px-2 py-2.5 text-left font-semibold">Account</th>
                                    <th className="px-2 py-2.5 text-right font-semibold">Net</th>
                                    <th className="px-2 py-2.5 text-right font-semibold">VAT</th>
                                    <th className="py-2.5 pl-2 pr-4 text-right font-semibold">Gross</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-700/50">
                                {filtered.map(r => {
                                    const inc = r.direction === 'income';
                                    return (
                                        <tr key={r.id} className={`hover:bg-gray-700/30 ${r.notBooked ? 'bg-amber-900/10' : ''}`}>
                                            <td className="whitespace-nowrap py-2 pl-4 pr-2 tabular-nums text-gray-300">{formatDayShort(r.date)}</td>
                                            <td className="px-2 py-1.5">
                                                {r.receiptUrl ? <ReceiptThumb url={r.receiptUrl} size="sm" label={`${r.description} · ${formatDayShort(r.date)}`} />
                                                    : r.source === 'receipt' ? <span className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-dashed border-amber-500/50 text-[9px] font-semibold uppercase text-amber-300/80" title="Receipt has no file attached">None</span>
                                                    : <span className="inline-flex h-8 w-8 items-center justify-center text-gray-600" title="Bank or card line">–</span>}
                                            </td>
                                            <td className="max-w-[16rem] px-2 py-2">
                                                <p className="truncate text-white" title={r.description}>{r.description}</p>
                                                <p className="mt-0.5 flex flex-wrap gap-1.5 text-[11px] text-gray-500">
                                                    <span>{r.source === 'receipt' ? 'Receipt' : r.source === 'card' ? 'Card line' : 'Bank line'}</span>
                                                    {r.notBooked ? <span className="rounded bg-amber-500/15 px-1.5 text-amber-300">Not reconciled</span>
                                                        : r.reconciled ? <span className="rounded bg-emerald-500/10 px-1.5 text-emerald-300/90">Reconciled</span> : null}
                                                    {!r.inPnl && !r.notBooked && <span className="rounded bg-gray-700 px-1.5 text-gray-300" title={r.notInPnlLabel}>Not in P&L</span>}
                                                    {inc && <span className="rounded bg-sky-500/15 px-1.5 text-sky-300">Income</span>}
                                                </p>
                                            </td>
                                            <td className="whitespace-nowrap px-2 py-2 text-gray-300">{r.category}</td>
                                            <td className="max-w-[10rem] truncate whitespace-nowrap px-2 py-2 text-gray-400" title={r.account}>{r.account}</td>
                                            <td className={`whitespace-nowrap px-2 py-2 text-right tabular-nums ${inc ? 'text-sky-300' : 'text-gray-200'}`}>{money(r.net)}</td>
                                            <td className="whitespace-nowrap px-2 py-2 text-right tabular-nums text-gray-400">{r.vat ? money(r.vat) : '–'}</td>
                                            <td className={`whitespace-nowrap py-2 pl-2 pr-4 text-right tabular-nums font-medium ${inc ? 'text-sky-300' : 'text-white'}`}>{money(r.gross)}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                            <tfoot className="sticky bottom-0 bg-gray-900/95 backdrop-blur">
                                <tr className="border-t border-gray-600 font-semibold text-white">
                                    <td colSpan={5} className="py-2.5 pl-4 pr-2">Expenses · {expenseTotals.count} lines</td>
                                    <td className="px-2 py-2.5 text-right tabular-nums">{money(expenseTotals.net)}</td>
                                    <td className="px-2 py-2.5 text-right tabular-nums">{money(expenseTotals.vat)}</td>
                                    <td className="py-2.5 pl-2 pr-4 text-right tabular-nums">{money(expenseTotals.gross)}</td>
                                </tr>
                                {showIncome && (
                                    <tr className="font-semibold text-sky-300">
                                        <td colSpan={5} className="py-2 pl-4 pr-2">Income · {incomeTotals.count} lines</td>
                                        <td className="px-2 py-2 text-right tabular-nums">{money(incomeTotals.net)}</td>
                                        <td className="px-2 py-2 text-right tabular-nums">{money(incomeTotals.vat)}</td>
                                        <td className="py-2 pl-2 pr-4 text-right tabular-nums">{money(incomeTotals.gross)}</td>
                                    </tr>
                                )}
                            </tfoot>
                        </table>
                    </div>
                )}
            </HubCard>

            <HubCard title="Totals by category" subtitle="Expense lines that match the filters above." bodyClassName="">
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[32rem] text-sm">
                        <thead>
                            <tr className="text-[11px] uppercase tracking-wider text-gray-400">
                                <th className="py-2.5 pl-4 pr-2 text-left font-semibold">Category</th>
                                <th className="px-2 py-2.5 text-right font-semibold">Lines</th>
                                <th className="px-2 py-2.5 text-right font-semibold">Net</th>
                                <th className="px-2 py-2.5 text-right font-semibold">VAT</th>
                                <th className="py-2.5 pl-2 pr-4 text-right font-semibold">Gross</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-700/50">
                            {byCategory.map(c => (
                                <tr key={c.category}>
                                    <td className="py-2 pl-4 pr-2 text-gray-200">{c.category}{!c.inPnl && <span className="ml-2 rounded bg-gray-700 px-1.5 text-[11px] text-gray-300">Not in P&L</span>}</td>
                                    <td className="px-2 py-2 text-right tabular-nums text-gray-400">{c.count}</td>
                                    <td className="px-2 py-2 text-right tabular-nums text-gray-200">{money(c.net)}</td>
                                    <td className="px-2 py-2 text-right tabular-nums text-gray-400">{money(c.vat)}</td>
                                    <td className="py-2 pl-2 pr-4 text-right tabular-nums text-white">{money(c.gross)}</td>
                                </tr>
                            ))}
                            {byCategory.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-500">No expense lines.</td></tr>}
                        </tbody>
                    </table>
                </div>
            </HubCard>
        </div>
    );
};

export default ExpensesVatTab;
