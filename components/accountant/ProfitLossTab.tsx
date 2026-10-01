import React from 'react';
import type { ProfitAndLoss } from '../../utils/accounting/profitAndLoss';
import { formatDayShort } from '../../utils/accounting/yearEnd';
import { HubCard, CsvButton, money, downloadCsv, fix2 } from './hubShared';

// Accountant-style P&L. Every figure comes from computeProfitAndLoss; this file only lays it out.

const Row = ({ label, value, indent = false, strong = false, muted = false, rule = false, cost = false }: {
    label: React.ReactNode; value: number; indent?: boolean; strong?: boolean; muted?: boolean; rule?: boolean; cost?: boolean;
}) => (
    <div className={`flex items-baseline justify-between gap-4 py-1.5 ${rule ? 'mt-1 border-t border-gray-600 pt-2.5' : ''} ${indent ? 'pl-4' : ''}`}>
        <span className={`min-w-0 ${strong ? 'font-semibold text-white' : muted ? 'text-gray-400' : 'text-gray-300'} text-sm`}>{label}</span>
        <span className={`shrink-0 tabular-nums text-right text-sm ${strong ? 'font-semibold text-white' : muted ? 'text-gray-400' : 'text-gray-200'}`}>
            {cost ? `(${money(Math.abs(value))})` : money(value, true)}
        </span>
    </div>
);

const SectionLabel = ({ children }: { children: React.ReactNode }) => (
    <p className="mt-5 mb-1 text-[11px] font-semibold uppercase tracking-wider text-gray-500 first:mt-0">{children}</p>
);

const ProfitLossTab = ({ pnl, isServiceBusiness }: { pnl: ProfitAndLoss; isServiceBusiness: boolean }) => {
    const { revenue, costOfSales: cos, expenses, notInPnl } = pnl;
    const periodText = `${formatDayShort(pnl.range.start)} to ${formatDayShort(pnl.range.end)}`;

    const handleCsv = () => {
        const r = (Section: string, Item: string, Amount: number | string = '') => ({ Section, Item, Amount: typeof Amount === 'number' ? fix2(Amount) : Amount });
        const rows = [
            r('PROFIT AND LOSS', periodText, ''),
            r('Turnover', isServiceBusiness ? 'Job invoices' : 'Vehicle sales', isServiceBusiness ? revenue.jobInvoices : revenue.vehicleSales),
            ...(!isServiceBusiness && revenue.jobInvoices ? [r('Turnover', 'Job invoices', revenue.jobInvoices)] : []),
            r('Turnover', 'Other invoices', revenue.miscInvoices),
            ...revenue.otherIncomeByCategory.map(c => r('Turnover', `Other income: ${c.category}`, c.net)),
            r('Turnover', 'Total turnover', revenue.total),
            r('Cost of sales', 'Opening stock', cos.openingStock),
            r('Cost of sales', 'Add: purchases', cos.purchases),
            r('Cost of sales', 'Less: closing stock', -cos.closingStock),
            r('Cost of sales', 'Owned cars sold', cos.ownedCarsSold),
            r('Cost of sales', 'Sale or return payouts', cos.sorPayouts),
            r('Cost of sales', 'Total cost of sales', cos.total),
            r('Gross profit', '', pnl.grossProfit),
            ...expenses.byCategory.map(c => r('Overheads', c.category, c.net)),
            r('Overheads', 'Total overheads', expenses.total),
            r('Net profit', '', pnl.netProfit),
            r('', '', ''),
            r('NOT IN P&L', 'Group', 'Money in / Money out'),
            ...notInPnl.byGroup.map(g => r('Not in P&L', g.label, `${fix2(g.moneyIn)} / ${fix2(g.moneyOut)}`)),
        ];
        downloadCsv(rows, `Profit_and_Loss_${pnl.range.start}_to_${pnl.range.end}.csv`);
    };

    return (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
            <HubCard
                className="xl:col-span-2"
                title="Profit and loss account"
                subtitle={`${periodText} · accruals basis${pnl.isVatRegistered ? ' · figures net of VAT' : ''}`}
                actions={<CsvButton onClick={handleCsv} />}
            >
                <div className="mx-auto max-w-2xl">
                    <SectionLabel>Turnover</SectionLabel>
                    {!isServiceBusiness && <Row indent label="Vehicle sales" value={revenue.vehicleSales} />}
                    {(isServiceBusiness || revenue.jobInvoices !== 0) && <Row indent label="Job invoices" value={revenue.jobInvoices} />}
                    {revenue.miscInvoices !== 0 && <Row indent label="Other invoices" value={revenue.miscInvoices} />}
                    {revenue.otherIncomeByCategory.map(c => <Row key={c.category} indent muted label={/income/i.test(c.category) ? c.category : `Other income · ${c.category}`} value={c.net} />)}
                    <Row strong rule label="Total turnover" value={revenue.total} />

                    <SectionLabel>Cost of sales</SectionLabel>
                    {!isServiceBusiness && <>
                        <Row indent label={`Opening stock (${cos.openingStockLines.length} cars)`} value={cos.openingStock} />
                        <Row indent label={`Add: purchases (${cos.purchaseLines.length} cars)`} value={cos.purchases} />
                        <Row indent label={`Less: closing stock (${cos.closingStockLines.length} cars)`} value={-cos.closingStock} />
                        <Row indent muted label="Owned cars sold" value={cos.ownedCarsSold} />
                    </>}
                    {cos.sorPayouts !== 0 && <Row indent label="Sale or return payouts" value={cos.sorPayouts} />}
                    <Row strong rule label="Total cost of sales" value={cos.total} cost />

                    <div className="mt-4 flex items-baseline justify-between gap-4 rounded-lg bg-gray-900/60 px-3 py-2.5 ring-1 ring-inset ring-gray-700">
                        <span className="text-sm font-semibold text-white">Gross profit</span>
                        <span className="tabular-nums text-base font-semibold text-white">{money(pnl.grossProfit, true)}</span>
                    </div>

                    <SectionLabel>Overheads</SectionLabel>
                    {expenses.byCategory.length === 0 && <p className="py-1.5 pl-4 text-sm text-gray-500">No overheads booked in this period.</p>}
                    {expenses.byCategory.map(c => <Row key={c.category} indent label={c.category} value={c.net} />)}
                    <Row strong rule label="Total overheads" value={expenses.total} cost />

                    <div className={`mt-4 flex items-baseline justify-between gap-4 rounded-lg px-3 py-3 ring-1 ring-inset ${pnl.netProfit >= 0 ? 'bg-emerald-900/30 ring-emerald-700/50' : 'bg-red-900/30 ring-red-700/50'}`}>
                        <span className="text-base font-bold text-white">Net profit {pnl.netProfit < 0 ? '(loss)' : ''}</span>
                        <span className={`tabular-nums text-lg font-bold ${pnl.netProfit >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>{money(pnl.netProfit, true)}</span>
                    </div>
                </div>
            </HubCard>

            <div className="space-y-5">
                <HubCard title="Not in the P&L" subtitle="Real money moved, but not income or a trading cost.">
                    {notInPnl.byGroup.length === 0 ? (
                        <p className="text-sm text-gray-500">Nothing set aside in this period.</p>
                    ) : (
                        <div className="-mx-1 overflow-x-auto">
                            <table className="w-full min-w-[18rem] text-sm">
                                <thead>
                                    <tr className="text-[11px] uppercase tracking-wider text-gray-500">
                                        <th className="px-1 pb-2 text-left font-semibold">Group</th>
                                        <th className="px-1 pb-2 text-right font-semibold">In</th>
                                        <th className="px-1 pb-2 text-right font-semibold">Out</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-700/60">
                                    {notInPnl.byGroup.map(g => (
                                        <tr key={g.group}>
                                            <td className="px-1 py-2 text-gray-300">{g.label}<span className="ml-1 text-xs text-gray-500">· {g.count}</span></td>
                                            <td className="px-1 py-2 text-right tabular-nums text-gray-200">{g.moneyIn ? money(g.moneyIn) : '–'}</td>
                                            <td className="px-1 py-2 text-right tabular-nums text-gray-200">{g.moneyOut ? money(g.moneyOut) : '–'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot>
                                    <tr className="border-t border-gray-600 font-semibold text-white">
                                        <td className="px-1 pt-2">Total</td>
                                        <td className="px-1 pt-2 text-right tabular-nums">{money(notInPnl.totalIn)}</td>
                                        <td className="px-1 pt-2 text-right tabular-nums">{money(notInPnl.totalOut)}</td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    )}
                </HubCard>
                {pnl.warnings.length > 0 && (
                    <HubCard title="Check before you rely on it">
                        <ul className="space-y-2 text-sm text-amber-200/90">
                            {pnl.warnings.map(w => <li key={w.code} className="flex gap-2"><span aria-hidden className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />{w.message}</li>)}
                        </ul>
                    </HubCard>
                )}
            </div>
        </div>
    );
};

export default ProfitLossTab;
