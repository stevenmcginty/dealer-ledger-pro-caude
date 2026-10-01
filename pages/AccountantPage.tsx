import React, { useEffect, useMemo, useRef, useState } from 'react';
import VehicleMarginReport from '../components/accountant/VehicleMarginReport';
import JobsReport from '../components/accountant/JobsReport';
import VatSummary, { computeVatSummary } from '../components/reporting/VatSummary';
import GeneralLedger from '../components/reporting/GeneralLedger';
import OverviewTab, { HealthItem } from '../components/accountant/OverviewTab';
import ProfitLossTab from '../components/accountant/ProfitLossTab';
import ExpensesVatTab from '../components/accountant/ExpensesVatTab';
import CorporationTaxTab from '../components/accountant/CorporationTaxTab';
import { PeriodBar, HubPeriod, money } from '../components/accountant/hubShared';
import { useData } from '../hooks/useData';
import { useUI } from '../hooks/useUI';
import { computeProfitAndLoss } from '../utils/accounting/profitAndLoss';
import { estimateCorporationTax } from '../utils/accounting/corporationTax';
import { periodKeyOf } from '../utils/accounting/yearEnd';
import { getPresetRange } from '../utils/datePresets';

// The accountant's one-stop hub: one period drives every tab.

type HubTab = 'overview' | 'pnl' | 'margin' | 'jobs_report' | 'vat' | 'expenses' | 'ledger' | 'ct';
type ExpenseStatus = 'all' | 'reconciled' | 'unreconciled' | 'no_file';

const STORE_KEY = 'accountantHub.v1';
const readStore = (): { tab?: HubTab; period?: HubPeriod } => {
    try { return JSON.parse(sessionStorage.getItem(STORE_KEY) || '{}') || {}; } catch { return {}; }
};
const isDay = (s: unknown) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);

const AccountantPage = () => {
    const data = useData();
    const { isVatRegistered, isServiceBusiness, businessDetails, yearEndAdjustments } = data;
    const { setView } = useUI();

    const saved = useMemo(readStore, []);
    const [tab, setTab] = useState<HubTab>(saved.tab ?? 'overview');
    const [period, setPeriodState] = useState<HubPeriod>(() =>
        saved.period && isDay(saved.period.start) && isDay(saved.period.end) ? saved.period : getPresetRange('this_quarter'));
    const [expenseStatus, setExpenseStatus] = useState<ExpenseStatus>('all');

    const setPeriod = (p: HubPeriod) => setPeriodState(p.start <= p.end ? p : { start: p.end, end: p.start });

    useEffect(() => {
        try { sessionStorage.setItem(STORE_KEY, JSON.stringify({ tab, period })); } catch { /* storage blocked: not needed */ }
    }, [tab, period]);

    const tabs = useMemo(() => [
        { id: 'overview' as const, label: 'Overview' },
        { id: 'pnl' as const, label: 'Profit & Loss' },
        isServiceBusiness ? { id: 'jobs_report' as const, label: 'Jobs Report' } : { id: 'margin' as const, label: 'Vehicle Margin' },
        ...(isVatRegistered ? [{ id: 'vat' as const, label: 'VAT Summary' }] : []),
        { id: 'expenses' as const, label: 'Expenses & VAT' },
        { id: 'ledger' as const, label: 'Ledger' },
        { id: 'ct' as const, label: 'Corporation Tax' },
    ], [isServiceBusiness, isVatRegistered]);
    const activeTab: HubTab = tabs.some(t => t.id === tab) ? tab : 'overview';

    const pnl = useMemo(() => computeProfitAndLoss({
        range: period,
        salesDocs: data.salesDocs, vehicles: data.vehicles, receipts: data.receipts, transactions: data.transactions,
        miscInvoices: data.miscInvoices, jobInvoices: data.jobInvoices, financialAccounts: data.financialAccounts, isVatRegistered,
    }), [period, data.salesDocs, data.vehicles, data.receipts, data.transactions, data.miscInvoices, data.jobInvoices, data.financialAccounts, isVatRegistered]);

    const vatDue = useMemo(() => isVatRegistered ? computeVatSummary({
        startDate: period.start, endDate: period.end, salesDocs: data.salesDocs, vehicles: data.vehicles, miscInvoices: data.miscInvoices,
        transactions: data.transactions, isServiceBusiness, jobInvoices: data.jobInvoices,
    }).vatDue : null, [isVatRegistered, period, data.salesDocs, data.vehicles, data.miscInvoices, data.transactions, isServiceBusiness, data.jobInvoices]);

    const ct = useMemo(() => estimateCorporationTax({
        period,
        accountingProfit: pnl.netProfit,
        adjustments: yearEndAdjustments.filter(a => a.periodKey === periodKeyOf(period)),
        associatedCompanies: Number(businessDetails?.associatedCompanies) || 0,
    }), [period, pnl.netProfit, yearEndAdjustments, businessDetails?.associatedCompanies]);

    const openTab = (t: HubTab, status: ExpenseStatus = 'all') => { setExpenseStatus(status); setTab(t); };

    const health = useMemo<HealthItem[]>(() => {
        const refs = (code: string) => pnl.warnings.filter(w => w.code === code).flatMap(w => w.refIds).length;
        const unreconciled = refs('unreconciled_bank_lines');
        const noFile = pnl.rows.filter(r => r.source === 'receipt' && !r.receiptUrl).length;
        const noCost = refs('zero_cost') + refs('sale_without_vehicle');
        const items: HealthItem[] = [
            {
                id: 'unreconciled', count: unreconciled, tone: unreconciled ? 'warn' : 'ok',
                label: unreconciled ? `${unreconciled} bank/card line${unreconciled === 1 ? '' : 's'} still to reconcile` : 'Bank and card lines all reconciled',
                detail: unreconciled ? 'Not in the P&L or VAT until they are matched in Expenses.' : 'Every bank and card line in the period is booked.',
                ...(unreconciled ? { actionLabel: 'Open Expenses', onAction: () => setView('expenses') } : {}),
            },
            {
                id: 'nofile', count: noFile, tone: noFile ? 'warn' : 'ok',
                label: noFile ? `${noFile} expense${noFile === 1 ? '' : 's'} with no receipt file` : 'Every receipt has its file',
                detail: noFile ? 'Booked, but nothing to show HMRC. Upload the file in Expenses.' : 'All receipts in the period have a file attached.',
                ...(noFile ? { actionLabel: 'Show them', onAction: () => openTab('expenses', 'no_file') } : {}),
            },
        ];
        if (!isServiceBusiness) items.push({
            id: 'nocost', count: noCost, tone: noCost ? 'warn' : 'ok',
            label: noCost ? `${noCost} car${noCost === 1 ? '' : 's'} sold with no cost` : 'Every car sold has a cost',
            detail: noCost ? 'Cost of sale is counted as £0, so gross profit is overstated.' : 'Purchase prices are in for every sale in the period.',
            ...(noCost ? { actionLabel: 'Vehicle Margin', onAction: () => openTab('margin') } : {}),
        });
        for (const w of pnl.warnings) {
            if (['unreconciled_bank_lines', 'zero_cost', 'sale_without_vehicle'].includes(w.code)) continue;
            items.push({ id: w.code, count: w.refIds.length, tone: 'warn', label: w.message, detail: 'Check the vehicle records in Stock.', actionLabel: 'Open Stock', onAction: () => setView('stock') });
        }
        const out = pnl.notInPnl;
        items.push({
            id: 'notinpnl', count: out.byGroup.length, tone: 'info',
            label: `Left out of the P&L: ${money(out.totalOut)} out, ${money(out.totalIn)} in`,
            detail: out.byGroup.length ? `${out.byGroup.length} group${out.byGroup.length === 1 ? '' : 's'}: ${out.byGroup.slice(0, 3).map(g => g.label).join(', ')}${out.byGroup.length > 3 ? '…' : ''}` : 'Transfers, VAT, stock purchases and loans are kept out of the P&L.',
            actionLabel: 'See the P&L', onAction: () => openTab('pnl'),
        });
        return items;
    }, [pnl, isServiceBusiness, setView]);

    // Keep the active tab in view on phones (moves the strip only).
    const stripRef = useRef<HTMLDivElement>(null);
    const activeRef = useRef<HTMLButtonElement>(null);
    useEffect(() => {
        const s = stripRef.current, b = activeRef.current;
        if (!s || !b) return;
        s.scrollTo({ left: Math.max(0, b.offsetLeft - (s.clientWidth - b.offsetWidth) / 2), behavior: 'smooth' });
    }, [activeTab]);

    const controlled = { startDate: period.start, endDate: period.end, hidePeriodBar: true };

    return (
        <div className="min-w-0 space-y-5">
            <PeriodBar period={period} yearEnd={businessDetails?.yearEnd} onChange={setPeriod} />

            <div ref={stripRef} className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
                <div className="min-w-max border-b border-gray-700 sm:min-w-0">
                    <nav className="-mb-px flex space-x-5 sm:space-x-7" aria-label="Accountant tabs">
                        {tabs.map(t => (
                            <button
                                key={t.id}
                                ref={t.id === activeTab ? activeRef : undefined}
                                type="button"
                                onClick={() => openTab(t.id)}
                                aria-current={t.id === activeTab ? 'page' : undefined}
                                className={`${t.id === activeTab ? 'border-brand-500 text-brand-400' : 'border-transparent text-gray-400 hover:border-gray-500 hover:text-gray-300'} inline-flex items-center whitespace-nowrap border-b-2 px-1 py-3.5 text-sm font-medium`}
                            >
                                {t.label}
                            </button>
                        ))}
                    </nav>
                </div>
            </div>

            <div className="min-w-0">
                {activeTab === 'overview' && <OverviewTab pnl={pnl} vatDue={vatDue} ct={ct} health={health} onOpen={t => openTab(t)} />}
                {activeTab === 'pnl' && <ProfitLossTab pnl={pnl} isServiceBusiness={isServiceBusiness} />}
                {activeTab === 'margin' && <VehicleMarginReport {...controlled} />}
                {activeTab === 'jobs_report' && <JobsReport {...controlled} />}
                {activeTab === 'vat' && <VatSummary {...controlled} />}
                {activeTab === 'expenses' && (
                    <ExpensesVatTab key={expenseStatus} initialStatus={expenseStatus} range={period} rows={pnl.rows} transactions={data.transactions} financialAccounts={data.financialAccounts} isVatRegistered={isVatRegistered} />
                )}
                {activeTab === 'ledger' && <GeneralLedger {...controlled} />}
                {activeTab === 'ct' && <CorporationTaxTab period={period} />}
            </div>
        </div>
    );
};

export default AccountantPage;
