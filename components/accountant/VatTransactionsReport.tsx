
import React, { useState, useMemo } from 'react';
import Papa from 'papaparse';
import { useData } from '../../hooks/useData';
import { formatCurrency, formatDate, toYYYYMMDD } from '../../utils/helpers';
import { ArrowDownTrayIcon, BanknotesIcon, CreditCardIcon, CalculatorIcon, ExclamationTriangleIcon } from '../icons';
import UkDateInput from '../common/UkDateInput';
import { StatementTransaction } from '../../types';
import Select from '../common/Select';

interface ReportRow {
    key: string;
    date: string;
    description: string;
    accountName: string;
    AccountIcon: React.ComponentType<{ className?: string }>;
    category: string;
    net: number;
    inputVat: number;
    outputVat: number;
    total: number;
}

const VatTransactionsReport = () => {
    const { transactions, financialAccounts } = useData();
    const today = new Date();
    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    
    const [startDate, setStartDate] = useState(toYYYYMMDD(firstDayOfMonth));
    const [endDate, setEndDate] = useState(toYYYYMMDD(today));
    const [accountIdFilter, setAccountIdFilter] = useState('all');

    const reportRows = useMemo<ReportRow[]>(() => {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);

        const selectedAccount = accountIdFilter !== 'all' ? financialAccounts.find(acc => acc.id === accountIdFilter) : null;

        // The source of truth is only reconciled transactions.
        const filteredTransactions = transactions.filter(tx => {
            const txDate = new Date(tx.date);
            // Exclude internal transfers (e.g. to savings) — not a VAT-relevant supply.
            if (tx.status !== 'Reconciled' || tx.reconciliationType === 'transfer' || txDate < start || txDate > end) {
                return false;
            }
            if (selectedAccount) {
                 return tx.accountId === selectedAccount.id || (!tx.accountId && tx.type === selectedAccount.type);
            }
            return true;
        });
        
        const rows = filteredTransactions.map(tx => {
            const account = financialAccounts.find(acc => acc.id === tx.accountId) || financialAccounts.find(acc => acc.type === tx.type);
            const total = tx.amount;
            const vat = tx.vatAmount || 0;
            const net = total < 0 ? total + vat : total - vat;

            return {
                key: `tx-${tx.id}`,
                date: tx.date,
                description: tx.description,
                accountName: account?.name || tx.type,
                AccountIcon: account?.type === 'Bank' ? BanknotesIcon : CreditCardIcon,
                category: tx.category,
                net,
                inputVat: total < 0 ? vat : 0,
                outputVat: total > 0 ? vat : 0,
                total,
            };
        });
        
        return rows.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    }, [transactions, startDate, endDate, accountIdFilter, financialAccounts]);
    
    const totals = useMemo(() => {
        return reportRows.reduce((acc, row) => {
            acc.net += row.net;
            acc.inputVat += row.inputVat;
            acc.outputVat += row.outputVat;
            acc.total += row.total;
            return acc;
        }, { net: 0, inputVat: 0, outputVat: 0, total: 0 });
    }, [reportRows]);

    const netVatDue = totals.outputVat - totals.inputVat;

    const handleDownload = () => {
        const csvData = reportRows.map(row => ({
            'Date': formatDate(row.date),
            'Description': row.description,
            'Account': row.accountName,
            'Category': row.category,
            'Net': row.net.toFixed(2),
            'Input VAT (Reclaimed)': row.inputVat.toFixed(2),
            'Output VAT (Payable)': row.outputVat.toFixed(2),
            'Gross Total': row.total.toFixed(2),
        }));
        
        csvData.push({} as any); // Blank line
        csvData.push({ 'Date': 'TOTALS', 'Net': totals.net.toFixed(2), 'Input VAT (Reclaimed)': totals.inputVat.toFixed(2), 'Output VAT (Payable)': totals.outputVat.toFixed(2), 'Gross Total': totals.total.toFixed(2) } as any);
        csvData.push({ 'Date': 'NET VAT DUE / (RECLAIMABLE)', 'Gross Total': netVatDue.toFixed(2) } as any);

        if (reportRows.length === 0) {
            alert("No transactions to download for the selected period.");
            return;
        }

        const csv = Papa.unparse(csvData);
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.setAttribute("download", `VAT_Transactions_${startDate}_to_${endDate}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const selectedAccount = accountIdFilter !== 'all' ? financialAccounts.find(acc => acc.id === accountIdFilter) : null;

    return (
        <div className="space-y-6">
            <div className="p-4 bg-gray-800 rounded-lg shadow-md flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-4 flex-wrap">
                    <div>
                        <label htmlFor="vat-start-date" className="block text-sm font-medium text-gray-400">Start Date</label>
                        <UkDateInput id="vat-start-date" value={startDate} onChange={e => setStartDate(e.target.value)} className="mt-1"/>
                    </div>
                    <div>
                        <label htmlFor="vat-end-date" className="block text-sm font-medium text-gray-400">End Date</label>
                        <UkDateInput id="vat-end-date" value={endDate} onChange={e => setEndDate(e.target.value)} className="mt-1"/>
                    </div>
                    <div>
                        <label htmlFor="account-filter" className="block text-sm font-medium text-gray-400">Account</label>
                         <Select id="account-filter" value={accountIdFilter} onChange={e => setAccountIdFilter(e.target.value)} wrapperClassName="mt-1">
                            <option value="all">All Accounts</option>
                            {financialAccounts.map(acc => (
                                <option key={acc.id} value={acc.id}>{acc.name}</option>
                            ))}
                        </Select>
                    </div>
                </div>
                <button onClick={handleDownload} className="inline-flex items-center gap-x-2 rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-500">
                    <ArrowDownTrayIcon className="-ml-1 h-5 w-5" />
                    Download CSV
                </button>
            </div>
            
            {selectedAccount && (
                <div className="p-4 bg-yellow-900/50 border border-yellow-700 rounded-lg flex items-center gap-3">
                    <ExclamationTriangleIcon className="h-6 w-6 text-yellow-400 flex-shrink-0" />
                    <div>
                        <h3 className="font-semibold text-yellow-300">Filtered View</h3>
                        <p className="text-sm text-yellow-400">
                            You are currently viewing transactions for the '{selectedAccount.name}' account only. The totals may not match the VAT Summary page, which includes all accounts.
                        </p>
                    </div>
                </div>
            )}

            {reportRows.length === 0 ? (
                <div className="text-center py-16 px-6 bg-gray-800 rounded-lg shadow-inner">
                    <CalculatorIcon className="h-12 w-12 text-gray-500 mx-auto" />
                    <h3 className="mt-4 text-lg font-medium text-white">No Reconciled Transactions Found</h3>
                    <p className="mt-1 text-sm text-gray-400">No reconciled transactions match the selected criteria.</p>
                </div>
            ) : (
                <div className="overflow-x-auto bg-gray-800 rounded-lg shadow">
                    <table className="min-w-full divide-y divide-gray-700">
                        <thead className="bg-gray-900/50">
                            <tr>
                                <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-white sm:pl-6">Date</th>
                                <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-white">Description</th>
                                <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-white">Account</th>
                                <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-white">Category</th>
                                <th scope="col" className="px-3 py-3.5 text-right text-sm font-semibold text-white">Net</th>
                                <th scope="col" className="px-3 py-3.5 text-right text-sm font-semibold text-white">Input VAT (Reclaimed)</th>
                                <th scope="col" className="px-3 py-3.5 text-right text-sm font-semibold text-white">Output VAT (Payable)</th>
                                <th scope="col" className="px-3 py-3.5 text-right text-sm font-semibold text-white sm:pr-6">Gross Total</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-700/50">
                            {reportRows.map((row) => {
                                const { key, date, description, accountName, AccountIcon, category, net, inputVat, outputVat, total } = row;
                                return (
                                    <tr key={key} className="even:bg-gray-800/50">
                                        <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm text-gray-300 sm:pl-6">{formatDate(date)}</td>
                                        <td className="px-3 py-4 text-sm text-gray-300 max-w-sm truncate" title={description}>{description}</td>
                                        <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-400">
                                            <div className="flex items-center gap-2">
                                                {AccountIcon && <AccountIcon className="h-5 w-5" />}
                                                <span>{accountName}</span>
                                            </div>
                                        </td>
                                        <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-400">{category}</td>
                                        <td className="whitespace-nowrap px-3 py-4 text-sm text-right text-gray-300">{formatCurrency(net)}</td>
                                        <td className="whitespace-nowrap px-3 py-4 text-sm text-right text-red-400">{inputVat > 0 ? formatCurrency(inputVat) : '-'}</td>
                                        <td className="whitespace-nowrap px-3 py-4 text-sm text-right text-green-400">{outputVat > 0 ? formatCurrency(outputVat) : '-'}</td>
                                        <td className={`whitespace-nowrap px-3 py-4 text-sm text-right font-semibold sm:pr-6 ${total < 0 ? 'text-white' : 'text-white'}`}>{formatCurrency(total)}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                        <tfoot className="bg-gray-900/50 border-t-2 border-gray-600">
                            <tr>
                                <td colSpan={4} className="py-3 pl-4 pr-3 text-right text-sm font-bold text-white sm:pl-6">Totals</td>
                                <td className="px-3 py-3 text-right text-sm font-bold text-white">{formatCurrency(totals.net)}</td>
                                <td className="px-3 py-3 text-right text-sm font-bold text-red-400">{formatCurrency(totals.inputVat)}</td>
                                <td className="px-3 py-3 text-right text-sm font-bold text-green-400">{formatCurrency(totals.outputVat)}</td>
                                <td className="px-3 py-3 text-right text-sm font-bold text-white sm:pr-6">{formatCurrency(totals.total)}</td>
                            </tr>
                             <tr>
                                <td colSpan={6} className="py-3 pl-4 pr-3 text-right text-base font-bold text-white sm:pl-6">Net VAT Due / (Reclaimable)</td>
                                <td colSpan={2} className={`px-3 py-3 text-right text-base font-bold sm:pr-6 ${netVatDue >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                    {formatCurrency(netVatDue)}
                                </td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            )}
        </div>
    );
};

export default VatTransactionsReport;
