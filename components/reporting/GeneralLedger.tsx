import React, { useState, useMemo } from 'react';
import Papa from 'papaparse';
import { StatementTransaction, SalesDocument, Vehicle } from '../../types';
import { CalculatorIcon, ArrowDownTrayIcon } from '../icons';
import { formatCurrency, formatDate } from '../../utils/helpers';
import { useData } from '../../hooks/useData';
import UkDateInput from '../common/UkDateInput';

interface LedgerEntry {
    date: string;
    details: string;
    account: string;
    ref: string;
    debit: number;
    credit: number;
    vat: number;
    balance?: number;
    sourceId: string;
    sourceType: 'vehicle' | 'sale' | 'transaction';
    accountType?: 'Bank' | 'Credit Card';
}

const GeneralLedger = () => {
    const { transactions, salesDocs, vehicles } = useData();
    const today = new Date();
    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    
    const [startDate, setStartDate] = useState(firstDayOfMonth.toISOString().split('T')[0]);
    const [endDate, setEndDate] = useState(today.toISOString().split('T')[0]);
    const [accountFilter, setAccountFilter] = useState<'all' | 'Bank' | 'Credit Card'>('all');

    const ledgerEntries = useMemo(() => {
        const entries: LedgerEntry[] = [];
        // FIX: Explicitly type the Map to prevent type inference issues that may arise from other type errors.
        const txMap = new Map<string, StatementTransaction>(transactions.map(tx => [tx.id, tx]));

        // 1. Vehicle Purchases (Asset acquisition = Debit) for OWNED STOCK only
        vehicles.forEach(v => {
            if (v.ownershipType === 'Owned Stock') {
                const purchaseTx = v.purchaseTransactionId ? txMap.get(v.purchaseTransactionId) : undefined;
                entries.push({
                    date: v.purchaseDate,
                    details: `Purchase: ${v.make} ${v.model}`,
                    account: 'Vehicle Stock',
                    ref: `S#${v.stockNumber}`,
                    debit: v.purchasePrice,
                    credit: 0,
                    vat: 0, // VAT on purchase is part of the transaction entry below
                    sourceId: v.id,
                    sourceType: 'vehicle',
                    accountType: purchaseTx?.type,
                });
            }
        });

        // 2. Vehicle Sales (Revenue = Credit & COGS = Debit)
        salesDocs.forEach(doc => {
            const vehicle = vehicles.find(v => v.id === doc.vehicleId);
            if (doc.documentType === 'Sales Invoice' && vehicle) {
                const isSorSale = vehicle.ownershipType === 'Sale or Return';
                
                if (isSorSale) {
                    const commission = doc.commission !== undefined ? doc.commission : (doc.price - vehicle.purchasePrice);
                    entries.push({
                        date: doc.invoiceDate,
                        details: `Commission: ${doc.carDetails.make} ${doc.carDetails.model}`,
                        account: 'Sales Commission',
                        ref: `INV#${doc.invoiceNumber}`,
                        debit: 0,
                        credit: commission,
                        vat: doc.vat || 0,
                        sourceId: doc.id,
                        sourceType: 'sale'
                    });
                } else {
                    entries.push({
                        date: doc.invoiceDate,
                        details: `Sale: ${doc.carDetails.make} ${doc.carDetails.model}`,
                        account: 'Sales Revenue',
                        ref: `INV#${doc.invoiceNumber}`,
                        debit: 0,
                        credit: doc.price,
                        vat: doc.vat || 0,
                        sourceId: doc.id,
                        sourceType: 'sale'
                    });
                    entries.push({
                        date: doc.invoiceDate,
                        details: `COGS: ${vehicle.make} ${vehicle.model}`,
                        account: 'Cost of Goods Sold',
                        ref: `S#${vehicle.stockNumber}`,
                        debit: vehicle.purchasePrice,
                        credit: 0,
                        vat: 0,
                        sourceId: vehicle.id,
                        sourceType: 'vehicle'
                    });
                }
            }
        });


        // 3. Other Transactions (Expenses = Debit, Other Income = Credit)
        // Internal transfers between own accounts are not income or expenses, so they
        // are omitted from the ledger's P&L entries.
        transactions.forEach(tx => {
            if (tx.status === 'Reconciled' && tx.reconciliationType !== 'transfer') {
                const vatAmount = tx.vatAmount || 0;
                const netAmount = Math.abs(tx.amount) - vatAmount;
                entries.push({
                    date: tx.date,
                    details: tx.description,
                    account: tx.category,
                    ref: `TX#${tx.id.substring(0, 6)}`,
                    debit: tx.amount < 0 ? netAmount : 0,
                    credit: tx.amount > 0 ? netAmount : 0,
                    vat: vatAmount,
                    sourceId: tx.id,
                    sourceType: 'transaction',
                    accountType: tx.type,
                });
            }
        });

        return entries.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    }, [vehicles, salesDocs, transactions]);

    const filteredEntries = useMemo(() => {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        return ledgerEntries.filter(e => {
            const entryDate = new Date(e.date);
            const dateMatch = entryDate >= start && entryDate <= end;
            if (!dateMatch) return false;

            if (accountFilter === 'all') {
                return true;
            }
            
            return e.accountType === accountFilter;
        });
    }, [ledgerEntries, startDate, endDate, accountFilter]);

    const handleDownload = () => {
        const csvData = filteredEntries.map(e => ({
            Date: e.date,
            Details: e.details,
            Account: e.account,
            Reference: e.ref,
            Debit_Net: e.debit.toFixed(2),
            Credit_Net: e.credit.toFixed(2),
            VAT: e.vat.toFixed(2),
        }));
        if (csvData.length === 0) {
            alert("No data to download for the selected period.");
            return;
        }
        const csv = Papa.unparse(csvData);
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.setAttribute("download", `General_Ledger_${startDate}_to_${endDate}.csv`);
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
                </div>

                <div className="flex items-center gap-x-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-400">Filter by Account</label>
                        <div className="mt-1 flex items-center space-x-2 rounded-lg bg-gray-700/60 p-1">
                            <button onClick={() => setAccountFilter('all')} className={`flex-1 justify-center gap-x-2 inline-flex items-center py-2 px-4 text-sm font-semibold rounded-md transition-colors ${accountFilter === 'all' ? 'bg-brand-600 text-white shadow' : 'text-gray-300 hover:bg-gray-600'}`}>All</button>
                            <button onClick={() => setAccountFilter('Bank')} className={`flex-1 justify-center gap-x-2 inline-flex items-center py-2 px-4 text-sm font-semibold rounded-md transition-colors ${accountFilter === 'Bank' ? 'bg-brand-600 text-white shadow' : 'text-gray-300 hover:bg-gray-600'}`}>Bank</button>
                            <button onClick={() => setAccountFilter('Credit Card')} className={`flex-1 justify-center gap-x-2 inline-flex items-center py-2 px-4 text-sm font-semibold rounded-md transition-colors ${accountFilter === 'Credit Card' ? 'bg-brand-600 text-white shadow' : 'text-gray-300 hover:bg-gray-600'}`}>Credit Card</button>
                        </div>
                    </div>
                    <button onClick={handleDownload} className="self-end inline-flex items-center gap-x-2 rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-500">
                        <ArrowDownTrayIcon className="-ml-1 h-5 w-5" />
                        Download CSV
                    </button>
                </div>
            </div>

            {filteredEntries.length === 0 ? (
                <div className="text-center py-16 px-6 bg-gray-800 rounded-lg shadow-inner">
                    <CalculatorIcon className="h-12 w-12 text-gray-500 mx-auto" />
                    <h3 className="mt-4 text-lg font-medium text-white">No Ledger Entries</h3>
                    <p className="mt-1 text-sm text-gray-400">There are no financial records in the selected date range or for the selected filter.</p>
                </div>
            ) : (
                <div className="overflow-x-auto bg-gray-800 rounded-lg shadow">
                    <table className="min-w-full divide-y divide-gray-700">
                        <thead className="bg-gray-900/50">
                            <tr>
                                <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-white sm:pl-6">Date</th>
                                <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-white">Details</th>
                                <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-white">Account</th>
                                <th scope="col" className="px-3 py-3.5 text-right text-sm font-semibold text-white">Debit (Net)</th>
                                <th scope="col" className="px-3 py-3.5 text-right text-sm font-semibold text-white">Credit (Net)</th>
                                <th scope="col" className="px-3 py-3.5 text-right text-sm font-semibold text-white sm:pr-6">VAT</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-700/50">
                            {filteredEntries.map((entry, index) => (
                                <tr key={`${entry.sourceId}-${entry.sourceType}-${index}`} className="even:bg-gray-800/50">
                                    <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-white sm:pl-6">{formatDate(entry.date)}</td>
                                    <td className="px-3 py-4 text-sm text-gray-300 max-w-sm truncate" title={entry.details}>{entry.details}</td>
                                    <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-400">{entry.account}</td>
                                    <td className="whitespace-nowrap px-3 py-4 text-sm text-right text-green-400">{entry.debit > 0 ? formatCurrency(entry.debit) : ''}</td>
                                    <td className="whitespace-nowrap px-3 py-4 text-sm text-right text-red-400">{entry.credit > 0 ? formatCurrency(entry.credit) : ''}</td>
                                    <td className="whitespace-nowrap px-3 py-4 text-sm text-right text-gray-400 sm:pr-6">{entry.vat > 0 ? formatCurrency(entry.vat) : ''}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};

export default GeneralLedger;