import React, { useState, useMemo } from 'react';
import Papa from 'papaparse';
import { useData } from '../../hooks/useData';
import { formatCurrency, formatDate, toYYYYMMDD } from '../../utils/helpers';
import { ArrowDownTrayIcon } from '../icons';
import UkDateInput from '../common/UkDateInput';
import DatePresetButtons from './DatePresetButtons';
import { computeProfitAndLoss } from '../../utils/accounting/profitAndLoss';

const round2 = (n: number) => Math.round(n * 100) / 100;

const AccountantReport = () => {
    const { salesDocs, vehicles, transactions, receipts, miscInvoices, financialAccounts, isServiceBusiness, jobInvoices, isVatRegistered } = useData();
    const today = new Date();
    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    
    const [startDate, setStartDate] = useState(toYYYYMMDD(firstDayOfMonth));
    const [endDate, setEndDate] = useState(toYYYYMMDD(lastDayOfMonth));

    const reportData = useMemo(() => {
        // All the maths lives in utils/accounting/profitAndLoss.ts (accruals basis, tested).
        const pnl = computeProfitAndLoss({
            range: { start: startDate, end: endDate },
            salesDocs, vehicles, receipts, transactions, miscInvoices, jobInvoices, financialAccounts, isVatRegistered,
        });

        const expenses: Record<string, number> = {};
        pnl.expenses.byCategory.forEach(c => { expenses[c.category] = c.net; });

        return {
            totalRevenue: pnl.revenue.total,
            salesRevenue: round2(pnl.revenue.vehicleSales + pnl.revenue.jobInvoices),
            otherIncome: round2(pnl.revenue.miscInvoices + pnl.revenue.otherIncome),
            cogs: pnl.costOfSales.total,
            grossProfit: pnl.grossProfit,
            expenses,
            totalExpenses: pnl.expenses.total,
            netProfit: pnl.netProfit,
            openingStockValue: pnl.costOfSales.openingStock,
            purchasesDuringPeriod: pnl.costOfSales.purchases,
            // The stock card reconciles owned stock only; SOR payouts are in COGS above but never in stock.
            stockCogs: pnl.costOfSales.ownedCarsSold,
            closingStockValue: pnl.costOfSales.closingStock,
        };

    }, [startDate, endDate, salesDocs, transactions, receipts, vehicles, miscInvoices, financialAccounts, jobInvoices, isVatRegistered]);

    const handleDownload = () => {
        const dataForCsv = [
            { Section: 'PROFIT & LOSS STATEMENT', Item: `For period ${startDate} to ${endDate}`, Amount: '' },
            { Section: 'Revenue', Item: '', Amount: '' },
            { Section: '', Item: isServiceBusiness ? 'Job Revenue' : 'Sales Revenue', Amount: reportData.salesRevenue.toFixed(2) },
            { Section: '', Item: 'Other Income', Amount: reportData.otherIncome.toFixed(2) },
            { Section: 'Total Revenue', Item: '', Amount: reportData.totalRevenue.toFixed(2) },
            { Section: 'Cost of Goods Sold (COGS)', Item: '', Amount: `(${reportData.cogs.toFixed(2)})` },
            { Section: 'Gross Profit', Item: '', Amount: reportData.grossProfit.toFixed(2) },
            { Section: '', Item: '', Amount: '' },
            { Section: 'Expenses', Item: '', Amount: '' },
            ...Object.entries(reportData.expenses).map(([category, amount]: [string, number]) => ({
                Section: '',
                Item: `${category}`,
                Amount: `(${amount.toFixed(2)})`
            })),
            { Section: 'Total Expenses', Item: '', Amount: `(${reportData.totalExpenses.toFixed(2)})` },
            { Section: '', Item: '', Amount: '' },
            { Section: 'Net Profit', Item: '', Amount: reportData.netProfit.toFixed(2) },
        ];

        if (!isServiceBusiness) {
             dataForCsv.push(...[
                { Section: '', Item: '', Amount: '' },
                { Section: 'STOCK MOVEMENT SUMMARY', Item: '', Amount: '' },
                { Section: 'Stock', Item: 'Opening Stock', Amount: reportData.openingStockValue.toFixed(2) },
                { Section: '', Item: 'Add: Purchases', Amount: reportData.purchasesDuringPeriod.toFixed(2) },
                { Section: '', Item: 'Less: Cost of Goods Sold', Amount: `(${reportData.stockCogs.toFixed(2)})` },
                { Section: 'Closing Stock', Item: '', Amount: reportData.closingStockValue.toFixed(2) },
            ]);
        }

        const csv = Papa.unparse(dataForCsv);
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.setAttribute("download", `Full_Financial_Report_${startDate}_to_${endDate}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div className="space-y-6">
            <div className="p-4 bg-gray-800 rounded-lg shadow-md flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-4 flex-wrap">
                    <div>
                        <label htmlFor="start-date" className="block text-sm font-medium text-gray-400">Start Date</label>
                        <UkDateInput id="start-date" value={startDate} onChange={e => setStartDate(e.target.value)} className="mt-1"/>
                    </div>
                    <div>
                        <label htmlFor="end-date" className="block text-sm font-medium text-gray-400">End Date</label>
                        <UkDateInput id="end-date" value={endDate} onChange={e => setEndDate(e.target.value)} className="mt-1"/>
                    </div>
                    <div className="self-end">
                        <DatePresetButtons onSelect={r => { setStartDate(r.start); setEndDate(r.end); }} />
                    </div>
                </div>
                <button onClick={handleDownload} className="inline-flex items-center gap-x-2 rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-500">
                    <ArrowDownTrayIcon className="-ml-1 h-5 w-5" />
                    Download Full Report
                </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 bg-gray-800 rounded-lg shadow p-6">
                    <h3 className="text-xl font-bold text-white mb-4">Profit & Loss Statement</h3>
                    <p className="text-sm text-gray-400 mb-6">For period {formatDate(startDate)} to {formatDate(endDate)}</p>

                    <div className="space-y-4">
                        <div className="space-y-2">
                             <div className="flex justify-between items-center"><span className="font-semibold text-white">Total Revenue</span><span className="font-bold text-lg text-white">{formatCurrency(reportData.totalRevenue)}</span></div>
                             <div className="pl-4 flex justify-between items-center text-sm"><span className="text-gray-300">{isServiceBusiness ? 'Job Revenue' : 'Vehicle Sales'}</span><span>{formatCurrency(reportData.salesRevenue)}</span></div>
                             <div className="pl-4 flex justify-between items-center text-sm"><span className="text-gray-300">Other Income</span><span>{formatCurrency(reportData.otherIncome)}</span></div>
                        </div>
                         <div className="flex justify-between items-center pt-2 border-t border-gray-700"><span className="font-semibold text-white">Cost of Goods Sold</span><span className="text-white">({formatCurrency(reportData.cogs)})</span></div>
                         <div className="flex justify-between items-center py-2 border-y-2 border-gray-600"><span className="font-bold text-lg text-white">Gross Profit</span><span className="font-bold text-lg text-white">{formatCurrency(reportData.grossProfit)}</span></div>
                         <div className="space-y-2 pt-2">
                             <div className="flex justify-between items-center"><span className="font-semibold text-white">Total Expenses</span><span className="font-bold text-lg text-white">({formatCurrency(reportData.totalExpenses)})</span></div>
                              {Object.entries(reportData.expenses).sort(([, a]: [string, number], [, b]: [string, number]) => b - a).map(([category, amount]: [string, number]) => (
                                 <div key={category} className="pl-4 flex justify-between items-center text-sm"><span className="text-gray-300">{category}</span><span>{formatCurrency(amount)}</span></div>
                             ))}
                        </div>
                         <div className={`flex justify-between items-center p-4 rounded-lg mt-4 ${reportData.netProfit >= 0 ? 'bg-green-900/50' : 'bg-red-900/50'}`}>
                            <span className="font-bold text-xl text-white">Net Profit</span>
                            <span className={`font-bold text-xl ${reportData.netProfit >= 0 ? 'text-green-300' : 'text-red-400'}`}>{formatCurrency(reportData.netProfit)}</span>
                        </div>
                    </div>
                </div>

                {!isServiceBusiness && (
                    <div className="bg-gray-800 rounded-lg shadow p-6">
                        <h3 className="text-xl font-bold text-white mb-4">Stock Movement</h3>
                        <div className="space-y-4">
                            <div className="flex justify-between items-center text-sm"><span className="text-gray-300">Opening Stock</span><span>{formatCurrency(reportData.openingStockValue)}</span></div>
                            <div className="flex justify-between items-center text-sm"><span className="text-gray-300">Add: Purchases</span><span>{formatCurrency(reportData.purchasesDuringPeriod)}</span></div>
                            <div className="flex justify-between items-center text-sm"><span className="text-gray-300">Less: COGS</span><span>({formatCurrency(reportData.stockCogs)})</span></div>
                            <div className="flex justify-between items-center pt-2 mt-2 border-t-2 border-gray-600 font-bold"><span className="text-white text-lg">Closing Stock</span><span className="text-brand-400 text-lg">{formatCurrency(reportData.closingStockValue)}</span></div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default AccountantReport;