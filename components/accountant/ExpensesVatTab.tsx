import React, { useMemo, useState } from 'react';
import type { StatementTransaction, FinancialAccount } from '../../types';
import { buildExpenseRows, totalExpenseRows, ExpenseRow } from '../../utils/accounting/expenseRows';
import { DateRange, inRange, toDay, formatDayShort } from '../../utils/accounting/yearEnd';
import ReceiptThumb from '../common/ReceiptThumb';
import { HubCard, CsvButton, downloadCsv, fix2, Money, moneyText, FootCell } from './hubShared';
import { Search, Checkbox, Badge, EmptyState, DataTable, THead, TBody, Th, Tr, Td } from '../ui';
import { eyebrow } from '../ui/cx';
import Select from '../common/Select';

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

    const sourceText = (r: Row) => r.source === 'receipt' ? 'Receipt' : r.source === 'card' ? 'Card line' : 'Bank line';

    return (
        <div className="space-y-5">
            <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-card border border-line bg-line lg:grid-cols-4">
                {[
                    { label: 'P&L costs (net)', value: <Money value={pnlTotals.net} /> },
                    { label: 'VAT on P&L costs', value: <Money value={pnlTotals.vat} /> },
                    { label: 'All lines (gross)', value: <Money value={expenseTotals.gross} /> },
                    { label: 'Lines', value: <><span className="num">{expenseTotals.count}</span>{noFile ? <span className="text-base font-semibold text-warning-ink"> · <span className="num">{noFile}</span> no file</span> : null}</> },
                ].map(s => (
                    <div key={s.label} className="min-w-0 bg-surface px-4 py-3">
                        <dt className={eyebrow}>{s.label}</dt>
                        <dd className="mt-1 truncate text-lg font-bold text-ink sm:text-xl">{s.value}</dd>
                    </div>
                ))}
            </dl>

            <HubCard
                title="Expense lines"
                subtitle={`${formatDayShort(range.start)} to ${formatDayShort(range.end)} · receipts and bank/card lines${isVatRegistered ? '' : ' · not VAT registered, so VAT is not split out'}`}
                actions={<CsvButton onClick={handleCsv} />}
                bodyClassName=""
            >
                <div className="grid grid-cols-1 gap-2 border-b border-line p-3 print:hidden sm:grid-cols-2 sm:p-4 xl:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))_auto]">
                    <Search value={search} onChange={setSearch} label="Search expense lines" placeholder="Supplier, category, amount" className="sm:col-span-2 xl:col-span-1" />
                    <Select aria-label="Category" value={category} onChange={e => setCategory(e.target.value)}>
                        <option value="all">All categories</option>
                        {categories.map(c => <option key={c} value={c}>{c}</option>)}
                    </Select>
                    <Select aria-label="Account" value={account} onChange={e => setAccount(e.target.value)}>
                        <option value="all">All accounts</option>
                        {accounts.map(a => <option key={a} value={a}>{a}</option>)}
                    </Select>
                    <Select aria-label="Status" value={status} onChange={e => setStatus(e.target.value as StatusFilter)}>
                        <option value="all">Any status</option>
                        <option value="reconciled">Reconciled</option>
                        <option value="unreconciled">Not reconciled</option>
                        <option value="no_file">Receipt with no file</option>
                    </Select>
                    <Checkbox label="Show income" checked={showIncome} onChange={e => setShowIncome(e.target.checked)} className="whitespace-nowrap px-1" />
                </div>

                {filtered.length === 0 ? (
                    <EmptyState title="No lines match" description="Nothing in this period fits these filters. Clear the search or pick another status." />
                ) : (
                    <DataTable ariaLabel="Expense lines" minWidth={896} maxHeight="70vh" className="rounded-none border-0 print:max-h-none print:overflow-visible">
                        <THead>
                            <tr>
                                <Th className="ps-4">Date</Th>
                                <Th>File</Th>
                                <Th>Description</Th>
                                <Th>Category</Th>
                                <Th>Account</Th>
                                <Th numeric>Net</Th>
                                <Th numeric>VAT</Th>
                                <Th numeric className="pe-4">Gross</Th>
                            </tr>
                        </THead>
                        <TBody>
                            {filtered.map(r => {
                                const inc = r.direction === 'income';
                                return (
                                    <Tr key={r.id} className={r.notBooked ? '[&>td]:bg-warning-soft' : ''}>
                                        <Td className="num ps-4 text-ink-2">{formatDayShort(r.date)}</Td>
                                        <Td className="py-1.5">
                                            {r.receiptUrl ? <ReceiptThumb url={r.receiptUrl} size="sm" label={`${r.description} · ${formatDayShort(r.date)}`} />
                                                : r.source === 'receipt' ? <span className="inline-flex h-8 items-center rounded-chip border border-dashed border-warning px-1.5 text-xs font-semibold text-warning-ink" title="Receipt has no file attached">No file</span>
                                                : <span className="inline-flex h-8 w-8 items-center justify-center text-ink-3" title="Bank or card line" aria-label="Bank or card line">–</span>}
                                        </Td>
                                        <Td className="max-w-[16rem] whitespace-normal py-2">
                                            <p className="truncate font-semibold text-ink" title={r.description}>{r.description}</p>
                                            <p className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-ink-3">
                                                <span>{sourceText(r)}</span>
                                                {r.notBooked ? <Badge variant="warning" size="sm" dot>Not reconciled</Badge>
                                                    : r.reconciled ? <Badge variant="success" size="sm" dot>Reconciled</Badge> : null}
                                                {!r.inPnl && !r.notBooked && <span title={r.notInPnlLabel}><Badge size="sm">Not in P&L</Badge></span>}
                                                {inc && <Badge variant="info" size="sm">Income</Badge>}
                                            </p>
                                        </Td>
                                        <Td className="text-ink-2">{r.category}</Td>
                                        <Td className="max-w-[10rem] truncate text-ink-3" title={r.account}>{r.account}</Td>
                                        <Td numeric className={inc ? 'text-info' : 'text-ink'}>{inc ? '+' : ''}{moneyText(r.net)}</Td>
                                        <Td numeric className="text-ink-2">{r.vat ? moneyText(r.vat) : '–'}</Td>
                                        <Td numeric className={`pe-4 font-semibold ${inc ? 'text-info' : 'text-ink'}`}>{inc ? '+' : ''}{moneyText(r.gross)}</Td>
                                    </Tr>
                                );
                            })}
                        </TBody>
                        <tfoot className="sticky bottom-0 z-sticky">
                            <tr>
                                <FootCell colSpan={5} className="ps-4">Costs · <span className="num">{expenseTotals.count}</span> lines</FootCell>
                                <FootCell numeric>{moneyText(expenseTotals.net)}</FootCell>
                                <FootCell numeric>{moneyText(expenseTotals.vat)}</FootCell>
                                <FootCell numeric className="pe-4">{moneyText(expenseTotals.gross)}</FootCell>
                            </tr>
                            {showIncome && (
                                <tr>
                                    <FootCell colSpan={5} className="border-t-line ps-4 text-info">Income · <span className="num">{incomeTotals.count}</span> lines</FootCell>
                                    <FootCell numeric className="border-t-line text-info">+{moneyText(incomeTotals.net)}</FootCell>
                                    <FootCell numeric className="border-t-line text-info">+{moneyText(incomeTotals.vat)}</FootCell>
                                    <FootCell numeric className="border-t-line pe-4 text-info">+{moneyText(incomeTotals.gross)}</FootCell>
                                </tr>
                            )}
                        </tfoot>
                    </DataTable>
                )}
            </HubCard>

            <HubCard title="Totals by category" subtitle="Expense lines that match the filters above." bodyClassName="">
                <DataTable ariaLabel="Totals by category" minWidth={512} className="rounded-none border-0">
                    <THead>
                        <tr>
                            <Th className="ps-4">Category</Th>
                            <Th numeric>Lines</Th>
                            <Th numeric>Net</Th>
                            <Th numeric>VAT</Th>
                            <Th numeric className="pe-4">Gross</Th>
                        </tr>
                    </THead>
                    <TBody>
                        {byCategory.map(c => (
                            <Tr key={c.category}>
                                <Td className="ps-4">{c.category}{!c.inPnl && <Badge size="sm" className="ms-2">Not in P&L</Badge>}</Td>
                                <Td numeric className="text-ink-3">{c.count}</Td>
                                <Td numeric>{moneyText(c.net)}</Td>
                                <Td numeric className="text-ink-2">{moneyText(c.vat)}</Td>
                                <Td numeric className="pe-4 font-semibold">{moneyText(c.gross)}</Td>
                            </Tr>
                        ))}
                        {byCategory.length === 0 && <tr><Td colSpan={5} className="text-center text-ink-3">No expense lines.</Td></tr>}
                    </TBody>
                </DataTable>
            </HubCard>
        </div>
    );
};

export default ExpensesVatTab;
