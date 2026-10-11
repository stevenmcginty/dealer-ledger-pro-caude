
import React, { useState, useMemo } from 'react';
import Papa from 'papaparse';
import { useData } from '../../hooks/useData';
import { formatCurrency, formatDate, toYYYYMMDD } from '../../utils/helpers';
import { accountIdOfTx } from '../../utils/accountTransfers';
import { ArrowDownTrayIcon, BanknotesIcon, CreditCardIcon, CalculatorIcon, ExclamationTriangleIcon } from '../icons';
import UkDateInput from '../common/UkDateInput';
import DatePresetButtons from './DatePresetButtons';
import { StatementTransaction } from '../../types';
import Select from '../common/Select';
import { useToast } from '../ui';

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
    const toast = useToast();
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
                 return accountIdOfTx(tx, financialAccounts) === selectedAccount.id;
            }
            return true;
        });
        
        const rows = filteredTransactions.map(tx => {
            const account = financialAccounts.find(acc => acc.id === accountIdOfTx(tx, financialAccounts));
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
            toast.info("No transactions to download for the selected period.");
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
            <div className="p-4 bg-surface rounded-card flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-4 flex-wrap">
                    <div>
                        <label htmlFor="vat-start-date" className="block text-sm font-medium text-ink-3">Start Date</label>
                        <UkDateInput id="vat-start-date" value={startDate} onChange={e => setStartDate(e.target.value)} className="mt-1"/>
                    </div>
                    <div>
                        <label htmlFor="vat-end-date" className="block text-sm font-medium text-ink-3">End Date</label>
                        <UkDateInput id="vat-end-date" value={endDate} onChange={e => setEndDate(e.target.value)} className="mt-1"/>
                    </div>
                    <div>
                        <label htmlFor="account-filter" className="block text-sm font-medium text-ink-3">Account</label>
                         <Select id="account-filter" value={accountIdFilter} onChange={e => setAccountIdFilter(e.target.value)} wrapperClassName="mt-1">
                            <option value="all">All Accounts</option>
                            {financialAccounts.map(acc => (
                                <option key={acc.id} value={acc.id}>{acc.name}</option>
                            ))}
                        </Select>
                    </div>
                    <div className="self-end">
                        <DatePresetButtons onSelect={r => { setStartDate(r.start); setEndDate(r.end); }} />
                    </div>
                </div>
                <button onClick={handleDownload} className="inline-flex items-center gap-x-2 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-on-accent hover:bg-accent-hover">
                    <ArrowDownTrayIcon className="-ms-1 h-5 w-5" />
                    Download CSV
                </button>
            </div>
            
            {selectedAccount && (
                <div className="p-4 bg-warning-soft border border-warning rounded-card flex items-center gap-3">
                    <ExclamationTriangleIcon className="h-6 w-6 text-warning-ink flex-shrink-0" />
                    <div>
                        <h3 className="font-semibold text-warning-ink">Filtered View</h3>
                        <p className="text-sm text-warning-ink">
                            You are currently viewing transactions for the '{selectedAccount.name}' account only. The totals may not match the VAT Summary page, which includes all accounts.
                        </p>
                    </div>
                </div>
            )}

            {reportRows.length === 0 ? (
                <div className="text-center py-16 px-6 bg-surface rounded-card border border-line">
                    <CalculatorIcon className="h-12 w-12 text-ink-3 mx-auto" />
                    <h3 className="mt-4 text-lg font-medium text-ink">No Reconciled Transactions Found</h3>
                    <p className="mt-1 text-sm text-ink-3">No reconciled transactions match the selected criteria.</p>
                </div>
            ) : (
                <div className="overflow-x-auto bg-surface rounded-card border border-line">
                    <table className="min-w-full divide-y divide-line">
                        <thead className="bg-surface-2">
                            <tr>
                                <th scope="col" className="py-3.5 ps-4 pe-3 text-left text-sm font-semibold text-ink sm:ps-6">Date</th>
                                <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-ink">Description</th>
                                <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-ink">Account</th>
                                <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-ink">Category</th>
                                <th scope="col" className="px-3 py-3.5 text-right text-sm font-semibold text-ink">Net</th>
                                <th scope="col" className="px-3 py-3.5 text-right text-sm font-semibold text-ink">Input VAT (Reclaimed)</th>
                                <th scope="col" className="px-3 py-3.5 text-right text-sm font-semibold text-ink">Output VAT (Payable)</th>
                                <th scope="col" className="px-3 py-3.5 text-right text-sm font-semibold text-ink sm:pe-6">Gross Total</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-line">
                            {reportRows.map((row) => {
                                const { key, date, description, accountName, AccountIcon, category, net, inputVat, outputVat, total } = row;
                                return (
                                    <tr key={key} className="even:bg-surface-2">
                                        <td className="whitespace-nowrap py-4 ps-4 pe-3 text-sm text-ink-2 sm:ps-6">{formatDate(date)}</td>
                                        <td className="px-3 py-4 text-sm text-ink-2 max-w-sm truncate" title={description}>{description}</td>
                                        <td className="whitespace-nowrap px-3 py-4 text-sm text-ink-3">
                                            <div className="flex items-center gap-2">
                                                {AccountIcon && <AccountIcon className="h-5 w-5" />}
                                                <span>{accountName}</span>
                                            </div>
                                        </td>
                                        <td className="whitespace-nowrap px-3 py-4 text-sm text-ink-3">{category}</td>
                                        <td className="whitespace-nowrap px-3 py-4 text-sm text-right text-ink-2">{formatCurrency(net)}</td>
                                        <td className="whitespace-nowrap px-3 py-4 text-sm text-right text-danger">{inputVat > 0 ? formatCurrency(inputVat) : '-'}</td>
                                        <td className="whitespace-nowrap px-3 py-4 text-sm text-right text-success">{outputVat > 0 ? formatCurrency(outputVat) : '-'}</td>
                                        <td className={`whitespace-nowrap px-3 py-4 text-sm text-right font-semibold sm:pe-6 ${total < 0 ? 'text-ink' : 'text-ink'}`}>{formatCurrency(total)}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                        <tfoot className="bg-surface-2 border-t-2 border-line-strong">
                            <tr>
                                <td colSpan={4} className="py-3 ps-4 pe-3 text-right text-sm font-bold text-ink sm:ps-6">Totals</td>
                                <td className="px-3 py-3 text-right text-sm font-bold text-ink">{formatCurrency(totals.net)}</td>
                                <td className="px-3 py-3 text-right text-sm font-bold text-danger">{formatCurrency(totals.inputVat)}</td>
                                <td className="px-3 py-3 text-right text-sm font-bold text-success">{formatCurrency(totals.outputVat)}</td>
                                <td className="px-3 py-3 text-right text-sm font-bold text-ink sm:pe-6">{formatCurrency(totals.total)}</td>
                            </tr>
                             <tr>
                                <td colSpan={6} className="py-3 ps-4 pe-3 text-right text-base font-bold text-ink sm:ps-6">Net VAT Due / (Reclaimable)</td>
                                <td colSpan={2} className={`px-3 py-3 text-right text-base font-bold sm:pe-6 ${netVatDue >= 0 ? 'text-success' : 'text-danger'}`}>
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
