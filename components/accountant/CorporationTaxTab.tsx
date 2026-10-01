import React, { useMemo, useState } from 'react';
import { useData } from '../../hooks/useData';
import { useUI } from '../../hooks/useUI';
import type { YearEndAdjustment, YearEndAdjustmentKind } from '../../types';
import { computeProfitAndLoss } from '../../utils/accounting/profitAndLoss';
import { estimateCorporationTax } from '../../utils/accounting/corporationTax';
import { DateRange, financialYearContaining, formatDayShort, parseYearEnd, periodKeyOf } from '../../utils/accounting/yearEnd';
import { readDirectorSalaries, unpaidSalaryByYear, unpaidSalaryDeadline } from '../../utils/accounting/directorSalary';
import { HubCard, CsvButton, money, downloadCsv, fix2 } from './hubShared';
import { PencilIcon, TrashIcon, PlusIcon } from '../icons';

// Corporation tax ESTIMATE for one accounting period. P&L from computeProfitAndLoss,
// adjustments saved through the data context, the tax from estimateCorporationTax.

const KINDS: { kind: YearEndAdjustmentKind; label: string; sign: '+' | '−' }[] = [
    { kind: 'add_back', label: 'Add-back (disallowable cost)', sign: '+' },
    { kind: 'capital_allowance', label: 'Capital allowance', sign: '−' },
    { kind: 'stock_write_down', label: 'Stock write-down', sign: '−' },
    { kind: 'loss_brought_forward', label: 'Loss brought forward', sign: '−' },
    { kind: 'other_deduction', label: 'Other deduction', sign: '−' },
];
const kindInfo = (k: YearEndAdjustmentKind) => KINDS.find(x => x.kind === k) ?? KINDS[0];

const inputCls = 'block w-full min-w-0 rounded-md border-0 bg-gray-700 px-3 py-2 text-sm text-white ring-1 ring-inset ring-gray-600 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-brand-500';
const iconBtn = 'inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-gray-700 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400';
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

interface Draft { kind: YearEndAdjustmentKind; description: string; amount: string }
const emptyDraft: Draft = { kind: 'add_back', description: '', amount: '' };

const AdjustmentForm = ({ initial, onSave, onCancel, saveLabel }: { initial: Draft; onSave: (d: Draft) => Promise<void>; onCancel?: () => void; saveLabel: string }) => {
    const [d, setD] = useState<Draft>(initial);
    const [busy, setBusy] = useState(false);
    const amount = Number(d.amount);
    const valid = d.description.trim() !== '' && isFinite(amount) && amount > 0;
    return (
        <form
            className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,15rem)_minmax(0,1fr)_8rem_auto]"
            onSubmit={async e => { e.preventDefault(); if (!valid || busy) return; setBusy(true); try { await onSave(d); if (!onCancel) setD(initial); } finally { setBusy(false); } }}
        >
            <select aria-label="Adjustment type" value={d.kind} onChange={e => setD({ ...d, kind: e.target.value as YearEndAdjustmentKind })} className={inputCls}>
                {KINDS.map(k => <option key={k.kind} value={k.kind}>{k.label}</option>)}
            </select>
            <input aria-label="Description" value={d.description} onChange={e => setD({ ...d, description: e.target.value })} placeholder="e.g. Client entertaining" className={inputCls} />
            <input aria-label="Amount in pounds" value={d.amount} onChange={e => setD({ ...d, amount: e.target.value })} inputMode="decimal" placeholder="0.00" className={`${inputCls} text-right tabular-nums`} />
            <div className="flex gap-2">
                <button type="submit" disabled={!valid || busy} className="inline-flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-md bg-brand-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-500 disabled:cursor-not-allowed disabled:opacity-40">
                    {saveLabel === 'Add' && <PlusIcon className="h-4 w-4" />}{saveLabel}
                </button>
                {onCancel && <button type="button" onClick={onCancel} className="rounded-md px-3 py-2 text-sm text-gray-300 hover:bg-gray-700">Cancel</button>}
            </div>
        </form>
    );
};

const CorporationTaxTab = ({ period }: { period: DateRange }) => {
    const data = useData();
    const { setView } = useUI();
    const { businessDetails, yearEndAdjustments, addYearEndAdjustment, updateYearEndAdjustment, deleteYearEndAdjustment } = data;
    const yearEnd = businessDetails?.yearEnd;
    const associated = Number(businessDetails?.associatedCompanies) || 0;
    const [basis, setBasis] = useState<'fy' | 'period'>('fy');
    const [editing, setEditing] = useState<string | null>(null);

    const fy = financialYearContaining(period.end, yearEnd);
    const ctPeriod: DateRange = basis === 'fy' ? { start: fy.start, end: fy.end } : period;
    const key = periodKeyOf(ctPeriod);
    const directorSalaries = useMemo(() => readDirectorSalaries(businessDetails?.directorSalaries), [businessDetails?.directorSalaries]);

    const pnl = useMemo(() => computeProfitAndLoss({
        range: ctPeriod,
        salesDocs: data.salesDocs, vehicles: data.vehicles, receipts: data.receipts, transactions: data.transactions,
        miscInvoices: data.miscInvoices, jobInvoices: data.jobInvoices, financialAccounts: data.financialAccounts, isVatRegistered: data.isVatRegistered, directorSalaries,
    }), [ctPeriod.start, ctPeriod.end, data.salesDocs, data.vehicles, data.receipts, data.transactions, data.miscInvoices, data.jobInvoices, data.financialAccounts, data.isVatRegistered, directorSalaries]);

    const adjustments = useMemo(() => yearEndAdjustments.filter(a => a.periodKey === key), [yearEndAdjustments, key]);
    const est = useMemo(() => estimateCorporationTax({ period: ctPeriod, accountingProfit: pnl.netProfit, adjustments, associatedCompanies: associated }),
        [ctPeriod.start, ctPeriod.end, pnl.netProfit, adjustments, associated]);

    const ye = parseYearEnd(yearEnd);
    const periodText = `${formatDayShort(ctPeriod.start)} to ${formatDayShort(ctPeriod.end)}`;
    const unpaidSalary = useMemo(() => directorSalaries.length
        ? unpaidSalaryByYear({ range: ctPeriod, salaries: directorSalaries, transactions: data.transactions, yearStart: fy.start })
        : [], [ctPeriod.start, ctPeriod.end, directorSalaries, data.transactions, fy.start]);
    const salaryAsOf = pnl.directorSalary?.asOf ?? ctPeriod.end;
    const salaryDeadline = unpaidSalaryDeadline(fy.end);

    const save = async (d: Draft, id?: string) => {
        const payload = { periodKey: key, kind: d.kind, description: d.description.trim(), amount: Math.abs(Number(d.amount)) };
        if (id) { await updateYearEndAdjustment(id, payload); setEditing(null); }
        else await addYearEndAdjustment(payload);
    };

    const handleCsv = () => downloadCsv([
        { Step: 'CORPORATION TAX ESTIMATE', Amount: periodText, Note: 'Estimate only - not a tax return' },
        ...est.steps.map(s => ({ Step: s.label, Amount: fix2(s.amount), Note: s.note ?? '' })),
        { Step: '', Amount: '', Note: '' },
        { Step: 'ADJUSTMENTS', Amount: '', Note: '' },
        ...adjustments.map(a => ({ Step: `${kindInfo(a.kind).label}: ${a.description}`, Amount: fix2(a.amount), Note: kindInfo(a.kind).sign === '+' ? 'added' : 'deducted' })),
    ], `Corporation_Tax_Estimate_${ctPeriod.start}_to_${ctPeriod.end}.csv`);

    const chip = (active: boolean) => `whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${active ? 'bg-brand-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600 hover:text-white'}`;

    return (
        <div className="space-y-5">
            <div className="flex flex-col gap-3 rounded-xl border border-amber-600/40 bg-amber-900/15 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-amber-100/90"><span className="font-semibold text-amber-200">Estimate only.</span> Built from the books in this app and the adjustments below. It is not a tax return; the accountant signs off the final figure.</p>
                <div className="flex shrink-0 gap-1.5">
                    <button type="button" className={chip(basis === 'fy')} aria-pressed={basis === 'fy'} onClick={() => setBasis('fy')}>{fy.label}</button>
                    <button type="button" className={chip(basis === 'period')} aria-pressed={basis === 'period'} onClick={() => setBasis('period')}>Selected period</button>
                </div>
            </div>

            {unpaidSalary.length > 0 && (
                <div className="rounded-xl border border-amber-600/40 bg-amber-900/15 px-4 py-3 text-sm text-amber-100/90">
                    {unpaidSalary.map(l => (
                        <div key={l.name}>
                            <p><span className="font-semibold text-amber-200">Unpaid director's salary:</span> the business owes {l.name} {money(l.total)} at {formatDayShort(salaryAsOf)}.</p>
                            <ul className="mt-1 list-disc pl-5">
                                <li>Unpaid salary for this financial year ({fy.label.toLowerCase()}): <span className="font-semibold text-amber-200">{money(l.thisYear)}</span>{l.thisYear > 0 && <> — must be paid by <span className="font-semibold text-amber-200">{formatDayShort(salaryDeadline)}</span> to be deductible in this year</>}.</li>
                                {l.earlierYears > 0 && <li>Earlier years' unpaid salary: {money(l.earlierYears)} (owed on the director's loan account; their 9-month deadlines belong to those years).</li>}
                            </ul>
                        </div>
                    ))}
                    <p className="mt-1">Salary still unpaid 9 months after the year end is not deductible for corporation tax in that year; any part still unpaid then is deducted in the year it is paid. It must match the payroll (accountant).</p>
                </div>
            )}

            <div className="grid grid-cols-1 gap-5 xl:grid-cols-5">
                <div className="space-y-5 xl:col-span-3">
                    <HubCard title="Adjustments" subtitle={`Saved against ${periodText}. Amounts are positive; the type decides add or deduct.`}>
                        <div className="space-y-3">
                            {adjustments.length === 0 && <p className="text-sm text-gray-500">No adjustments yet. Add write-downs, add-backs, capital allowances or losses brought forward.</p>}
                            {adjustments.length > 0 && (
                                <ul className="divide-y divide-gray-700/60 rounded-lg ring-1 ring-inset ring-gray-700/70">
                                    {adjustments.map((a: YearEndAdjustment) => (
                                        <li key={a.id} className="px-3 py-2">
                                            {editing === a.id ? (
                                                <AdjustmentForm initial={{ kind: a.kind, description: a.description, amount: String(a.amount) }} saveLabel="Save" onSave={d => save(d, a.id)} onCancel={() => setEditing(null)} />
                                            ) : (
                                                <div className="flex items-center gap-3">
                                                    <span className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-sm font-bold ${kindInfo(a.kind).sign === '+' ? 'bg-amber-500/15 text-amber-300' : 'bg-emerald-500/15 text-emerald-300'}`} aria-hidden>{kindInfo(a.kind).sign}</span>
                                                    <div className="min-w-0 flex-1">
                                                        <p className="truncate text-sm text-white">{a.description}</p>
                                                        <p className="text-xs text-gray-500">{kindInfo(a.kind).label}</p>
                                                    </div>
                                                    <span className="tabular-nums text-sm text-gray-200">{money(a.amount)}</span>
                                                    <button type="button" className={iconBtn} aria-label={`Edit ${a.description}`} onClick={() => setEditing(a.id)}><PencilIcon className="h-4 w-4" /></button>
                                                    <button type="button" className={`${iconBtn} hover:text-red-300`} aria-label={`Delete ${a.description}`} onClick={() => { if (window.confirm(`Delete "${a.description}"?`)) deleteYearEndAdjustment(a.id); }}><TrashIcon className="h-4 w-4" /></button>
                                                </div>
                                            )}
                                        </li>
                                    ))}
                                </ul>
                            )}
                            <div className="rounded-lg bg-gray-900/40 p-3 ring-1 ring-inset ring-gray-700/70">
                                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-500">New adjustment</p>
                                <AdjustmentForm key={key} initial={emptyDraft} saveLabel="Add" onSave={d => save(d)} />
                            </div>
                        </div>
                    </HubCard>

                    <HubCard title="Settings in use">
                        <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
                            <div><dt className="text-xs text-gray-500">Year end</dt><dd className="mt-0.5 text-white">{ye.day} {MONTHS[ye.month - 1]}{!yearEnd && <span className="text-gray-500"> (default)</span>}</dd></div>
                            <div><dt className="text-xs text-gray-500">Associated companies</dt><dd className="mt-0.5 text-white">{associated}</dd></div>
                            <div><dt className="text-xs text-gray-500">Period length</dt><dd className="mt-0.5 text-white">{est.periodDays} days</dd></div>
                        </dl>
                        <p className="mt-3 text-xs text-gray-400">Change these in <button type="button" onClick={() => setView('settings')} className="font-medium text-brand-300 underline-offset-2 hover:underline">Settings → Business details</button>.</p>
                    </HubCard>
                </div>

                <HubCard className="xl:col-span-2" title="Working" subtitle={periodText} actions={<CsvButton onClick={handleCsv} />}>
                    <ol className="space-y-0.5">
                        {est.steps.map((s, i) => {
                            const total = s.label === 'Taxable profit' || s.label === 'Adjusted trading profit';
                            const final = s.label === 'Estimated corporation tax';
                            const infoOnly = s.amount === 0 && /^Limits/.test(s.label);
                            if (final) return null;
                            return (
                                <li key={i} className={`flex items-baseline justify-between gap-4 py-1.5 ${total ? 'mt-1 border-t border-gray-600 pt-2' : ''}`}>
                                    <span className={`min-w-0 text-sm ${total ? 'font-semibold text-white' : 'text-gray-300'}`}>
                                        {s.label}
                                        {s.note && <span className="block text-xs text-gray-500">{s.note}</span>}
                                    </span>
                                    {!infoOnly && <span className={`shrink-0 tabular-nums text-sm ${total ? 'font-semibold text-white' : 'text-gray-200'}`}>{money(s.amount, true)}</span>}
                                </li>
                            );
                        })}
                    </ol>
                    <div className="mt-4 rounded-lg bg-gray-900/60 px-4 py-3 ring-1 ring-inset ring-gray-700">
                        <div className="flex items-baseline justify-between gap-4">
                            <span className="text-sm font-semibold text-white">Estimated corporation tax</span>
                            <span className="tabular-nums text-xl font-bold text-white">{money(est.tax)}</span>
                        </div>
                        <p className="mt-1 text-xs text-gray-400">Effective rate {(est.effectiveRate * 100).toFixed(2)}% on taxable profit of {money(est.taxableProfit)}</p>
                    </div>
                    {est.warnings.length > 0 && (
                        <ul className="mt-3 space-y-1.5 text-xs text-amber-200/90">
                            {est.warnings.map(w => <li key={w} className="flex gap-2"><span aria-hidden className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />{w}</li>)}
                        </ul>
                    )}
                </HubCard>
            </div>
        </div>
    );
};

export default CorporationTaxTab;
