import React from 'react';
import type { ProfitAndLoss } from '../../utils/accounting/profitAndLoss';
import { formatDayShort } from '../../utils/accounting/yearEnd';
import { HubCard, CsvButton, money, downloadCsv, fix2, Money, moneyText, Eyebrow, Line } from './hubShared';
import { eyebrow } from '../ui/cx';
import { ExclamationTriangleIcon } from '../icons';

// Accountant-style P&L. Every figure comes from computeProfitAndLoss; this file only lays it out.

const Row = ({ label, value, indent = false, strong = false, muted = false, rule = false, cost = false }: {
    label: React.ReactNode; value: number; indent?: boolean; strong?: boolean; muted?: boolean; rule?: boolean; cost?: boolean;
}) => (
    <Line label={label} indent={indent} muted={muted} total={rule || strong}>
        {cost ? <span className="num">({moneyText(Math.abs(value))})</span> : <Money value={value} brackets />}
    </Line>
);

const SectionLabel = ({ children }: { children: React.ReactNode }) => (
    <Eyebrow as="h4" className="mb-0.5 mt-6 first:mt-0">{children}</Eyebrow>
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
            ...(pnl.directorSalary?.lines ?? []).map(l => r('Note', `Director's salary ${l.name}: due ${fix2(l.due)} (accrued in Wages), paid ${fix2(l.paid)}, ${l.balance >= 0 ? `owed ${fix2(l.balance)}` : `overdrawn ${fix2(-l.balance)}`} at ${pnl.directorSalary!.asOf}`, '')),
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

                    <div className="mt-3 flex items-baseline justify-between gap-4 rounded-control bg-surface-2 px-3 py-2.5">
                        <span className="text-sm font-bold text-ink">Gross profit</span>
                        <Money value={pnl.grossProfit} brackets className="text-base font-bold text-ink" />
                    </div>

                    <SectionLabel>Overheads</SectionLabel>
                    {expenses.byCategory.length === 0 && <p className="py-2 ps-4 text-sm text-ink-3">No overheads booked in this period.</p>}
                    {expenses.byCategory.map(c => (
                        <React.Fragment key={c.category}>
                            <Row indent label={c.category} value={c.net} />
                            {c.category.toLowerCase() === 'wages' && pnl.directorSalary?.lines.map(l => (
                                <p key={l.name} className={`pb-2 ps-8 text-sm leading-5 ${l.status === 'settled' ? 'text-ink-3' : 'text-warning-ink'}`}>
                                    {l.name}: salary due {money(l.due)} (accrued), paid {money(l.paid)}, {l.balance >= 0 ? `owed ${money(l.balance)}` : `overdrawn ${money(-l.balance)}`} at {formatDayShort(pnl.directorSalary!.asOf)}
                                </p>
                            ))}
                        </React.Fragment>
                    ))}
                    <Row strong rule label="Total overheads" value={expenses.total} cost />

                    <div className="mt-4 border-y-[3px] border-line-strong px-1 py-3 [border-style:double]">
                        <div className="flex items-baseline justify-between gap-4">
                            <span className="text-base font-bold text-ink">Net profit{pnl.netProfit < 0 ? ' (loss)' : ''}</span>
                            <Money value={pnl.netProfit} brackets className={`text-xl font-bold ${pnl.netProfit >= 0 ? 'text-success' : 'text-danger'}`} />
                        </div>
                    </div>
                </div>
            </HubCard>

            <div className="space-y-5">
                <HubCard title="Not in the P&L" subtitle="Real money moved, but not income or a trading cost.">
                    {notInPnl.byGroup.length === 0 ? (
                        <p className="text-sm text-ink-3">Nothing set aside in this period.</p>
                    ) : (
                        <div className="-mx-1 overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr>
                                        <th scope="col" className={`${eyebrow} px-1 pb-2 text-start`}>Group</th>
                                        <th scope="col" className={`${eyebrow} px-1 pb-2 text-end`}>In</th>
                                        <th scope="col" className={`${eyebrow} px-1 pb-2 text-end`}>Out</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {notInPnl.byGroup.map(g => (
                                        <tr key={g.group} className="border-b border-dashed border-line last:border-b-0">
                                            <td className="px-1 py-2 text-ink-2">{g.label}<span className="block text-ink-3"><span className="num">{g.count}</span> {g.count === 1 ? 'line' : 'lines'}</span></td>
                                            <td className="num whitespace-nowrap px-1 py-2 text-end align-top text-ink">{g.moneyIn ? moneyText(g.moneyIn) : '–'}</td>
                                            <td className="num whitespace-nowrap px-1 py-2 text-end align-top text-ink">{g.moneyOut ? moneyText(g.moneyOut) : '–'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot>
                                    <tr className="border-t border-line-strong font-bold text-ink">
                                        <td className="px-1 pt-2.5">Total</td>
                                        <td className="num whitespace-nowrap px-1 pt-2.5 text-end">{moneyText(notInPnl.totalIn)}</td>
                                        <td className="num whitespace-nowrap px-1 pt-2.5 text-end">{moneyText(notInPnl.totalOut)}</td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    )}
                </HubCard>
                {pnl.warnings.length > 0 && (
                    <HubCard title="Check before you rely on it">
                        <ul className="space-y-2 text-sm leading-5 text-ink-2">
                            {pnl.warnings.map(w => <li key={w.code} className="flex gap-2"><ExclamationTriangleIcon aria-hidden="true" className="mt-0.5 h-4 w-4 flex-none text-warning" />{w.message}</li>)}
                        </ul>
                    </HubCard>
                )}
            </div>
        </div>
    );
};

export default ProfitLossTab;
