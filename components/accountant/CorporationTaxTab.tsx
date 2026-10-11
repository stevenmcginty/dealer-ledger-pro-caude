import React, { useMemo, useState } from 'react';
import { useData } from '../../hooks/useData';
import { useUI } from '../../hooks/useUI';
import type { YearEndAdjustment, YearEndAdjustmentKind } from '../../types';
import { computeProfitAndLoss } from '../../utils/accounting/profitAndLoss';
import { estimateCorporationTax } from '../../utils/accounting/corporationTax';
import { DateRange, financialYearContaining, formatDayShort, parseYearEnd, periodKeyOf } from '../../utils/accounting/yearEnd';
import { readDirectorSalaries, unpaidSalaryByYear, unpaidSalaryDeadline } from '../../utils/accounting/directorSalary';
import { HubCard, CsvButton, downloadCsv, fix2, chipClass, Money, moneyText, Eyebrow, Line } from './hubShared';
import { Alert, Button, Field, IconButton, Input } from '../ui';
import { eyebrow } from '../ui/cx';
import Select from '../common/Select';
import { PencilIcon, TrashIcon, PlusIcon, ExclamationTriangleIcon } from '../icons';

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
            className="grid grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-[minmax(0,15rem)_minmax(0,1fr)_9rem]"
            onSubmit={async e => { e.preventDefault(); if (!valid || busy) return; setBusy(true); try { await onSave(d); if (!onCancel) setD(initial); } finally { setBusy(false); } }}
        >
            <Field label="Type">
                <Select value={d.kind} onChange={e => setD({ ...d, kind: e.target.value as YearEndAdjustmentKind })}>
                    {KINDS.map(k => <option key={k.kind} value={k.kind}>{k.label}</option>)}
                </Select>
            </Field>
            <Input label="What it is for" value={d.description} onChange={e => setD({ ...d, description: e.target.value })} placeholder="Client entertaining" />
            <Input label="Amount" affix="£" value={d.amount} onChange={e => setD({ ...d, amount: e.target.value })} inputMode="decimal" placeholder="0.00" className="num text-end" />
            <div className="flex gap-2 sm:col-span-2 2xl:col-span-3">
                <Button type="submit" variant="secondary" size="sm" disabled={!valid} loading={busy} icon={saveLabel === 'Add' ? <PlusIcon /> : undefined}>
                    {saveLabel === 'Add' ? 'Add adjustment' : 'Save adjustment'}
                </Button>
                {onCancel && <Button type="button" variant="ghost" size="sm" onClick={onCancel}>Keep as it was</Button>}
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

    return (
        <div className="space-y-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <Alert tone="info" title="Estimate only" className="min-w-0 flex-1">
                    Built from the books in this app and the adjustments below. It is not a tax return; the accountant signs off the final figure.
                </Alert>
                <div role="group" aria-label="Work it out for" className="flex shrink-0 flex-wrap gap-1.5 print:hidden">
                    <button type="button" className={chipClass(basis === 'fy')} aria-pressed={basis === 'fy'} onClick={() => setBasis('fy')}>{fy.label}</button>
                    <button type="button" className={chipClass(basis === 'period')} aria-pressed={basis === 'period'} onClick={() => setBasis('period')}>Selected period</button>
                </div>
            </div>

            {unpaidSalary.length > 0 && (
                <div role="status" className="rounded-control border border-warning bg-warning-soft px-4 py-3 text-sm leading-5 text-warning-ink">
                    {unpaidSalary.map(l => (
                        <div key={l.name}>
                            <p><span className="font-bold">Unpaid director's salary:</span> the business owes {l.name} <span className="num font-bold">{moneyText(l.total)}</span> at {formatDayShort(salaryAsOf)}.</p>
                            <ul className="mt-1 list-disc ps-5">
                                <li>Unpaid salary for this financial year ({fy.label.toLowerCase()}): <span className="num font-bold">{moneyText(l.thisYear)}</span>{l.thisYear > 0 && <> — must be paid by <span className="font-bold">{formatDayShort(salaryDeadline)}</span> to be deductible in this year</>}.</li>
                                {l.earlierYears > 0 && <li>Earlier years' unpaid salary: <span className="num">{moneyText(l.earlierYears)}</span> (owed on the director's loan account; their 9-month deadlines belong to those years).</li>}
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
                            {adjustments.length === 0 && <p className="text-sm text-ink-3">No adjustments yet. Add write-downs, add-backs, capital allowances or losses brought forward.</p>}
                            {adjustments.length > 0 && (
                                <ul className="overflow-hidden rounded-control border border-line">
                                    {adjustments.map((a: YearEndAdjustment) => (
                                        <li key={a.id} className="border-b border-line px-3 py-2 last:border-b-0">
                                            {editing === a.id ? (
                                                <AdjustmentForm initial={{ kind: a.kind, description: a.description, amount: String(a.amount) }} saveLabel="Save" onSave={d => save(d, a.id)} onCancel={() => setEditing(null)} />
                                            ) : (
                                                <div className="flex items-center gap-3">
                                                    <span className={`num inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-control text-base font-bold ${kindInfo(a.kind).sign === '+' ? 'bg-warning-soft text-warning-ink' : 'bg-success-soft text-success-ink'}`} aria-hidden>{kindInfo(a.kind).sign}</span>
                                                    <div className="min-w-0 flex-1">
                                                        <p className="truncate text-sm font-semibold text-ink">{a.description}</p>
                                                        <p className="text-sm text-ink-3">{kindInfo(a.kind).label}</p>
                                                    </div>
                                                    <Money value={a.amount} className="text-sm font-semibold text-ink" />
                                                    <IconButton size="sm" label={`Edit ${a.description}`} icon={<PencilIcon />} onClick={() => setEditing(a.id)} className="print:hidden" />
                                                    <IconButton size="sm" label={`Delete ${a.description}`} icon={<TrashIcon />} onClick={() => { if (window.confirm(`Delete "${a.description}"?`)) deleteYearEndAdjustment(a.id); }} className="hover:text-danger print:hidden" />
                                                </div>
                                            )}
                                        </li>
                                    ))}
                                </ul>
                            )}
                            <div className="rounded-control border border-line bg-surface-2 p-3 print:hidden sm:p-4">
                                <Eyebrow as="h4" className="mb-3">New adjustment</Eyebrow>
                                <AdjustmentForm key={key} initial={emptyDraft} saveLabel="Add" onSave={d => save(d)} />
                            </div>
                        </div>
                    </HubCard>

                    <HubCard title="Settings in use">
                        <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
                            <div><dt className={eyebrow}>Year end</dt><dd className="mt-1 font-semibold text-ink">{ye.day} {MONTHS[ye.month - 1]}{!yearEnd && <span className="text-ink-3"> (default)</span>}</dd></div>
                            <div><dt className={eyebrow}>Associated companies</dt><dd className="num mt-1 font-semibold text-ink">{associated}</dd></div>
                            <div><dt className={eyebrow}>Period length</dt><dd className="mt-1 font-semibold text-ink"><span className="num">{est.periodDays}</span> days</dd></div>
                        </dl>
                        <p className="mt-3 text-sm text-ink-3">Change these in <button type="button" onClick={() => setView('settings')} className="inline-flex min-h-[44px] items-center font-semibold text-accent-text underline underline-offset-[3px]">Settings › Business details</button>.</p>
                    </HubCard>
                </div>

                <HubCard className="xl:col-span-2" title="Working" subtitle={periodText} actions={<CsvButton onClick={handleCsv} />}>
                    <div>
                        {est.steps.map((s, i) => {
                            const total = s.label === 'Taxable profit' || s.label === 'Adjusted trading profit';
                            const final = s.label === 'Estimated corporation tax';
                            const infoOnly = s.amount === 0 && /^Limits/.test(s.label);
                            if (final) return null;
                            return (
                                <React.Fragment key={i}>
                                    <Line total={total} label={<>{s.label}{s.note && <span className="block font-normal text-ink-3">{s.note}</span>}</>}>
                                        {!infoOnly && <Money value={s.amount} brackets />}
                                    </Line>
                                </React.Fragment>
                            );
                        })}
                    </div>
                    <div className="mt-3 border-y-[3px] border-line-strong px-1 py-3 [border-style:double]">
                        <div className="flex items-baseline justify-between gap-4">
                            <span className="text-base font-bold text-ink">Estimated corporation tax</span>
                            <Money value={est.tax} className="text-xl font-bold text-ink" />
                        </div>
                        <p className="mt-1 text-sm text-ink-3">Effective rate <span className="num">{(est.effectiveRate * 100).toFixed(2)}%</span> on taxable profit of <Money value={est.taxableProfit} /></p>
                    </div>
                    {est.warnings.length > 0 && (
                        <ul className="mt-3 space-y-1.5 text-sm leading-5 text-ink-2">
                            {est.warnings.map(w => <li key={w} className="flex gap-2"><ExclamationTriangleIcon aria-hidden="true" className="mt-0.5 h-4 w-4 flex-none text-warning" />{w}</li>)}
                        </ul>
                    )}
                </HubCard>
            </div>
        </div>
    );
};

export default CorporationTaxTab;
