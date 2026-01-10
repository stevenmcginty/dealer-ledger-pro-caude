import React, { useMemo, useState } from 'react';
import { Receipt, Supplier } from '../../types';
import { BanknotesIcon, ChevronDownIcon, CheckCircleIcon } from '../icons';
import { formatCurrency, formatDate } from '../../utils/helpers';
import { useUI } from '../../hooks/useUI';

interface PayableMonth {
    monthKey: string; // "YYYY-MM"
    monthName: string; // "August 2024"
    totalOwed: number;
    invoiceCount: number;
    receipts: Receipt[];
}

interface PayableSupplier {
    supplierName: string;
    totalOwed: number;
    months: PayableMonth[];
}

interface PayablesManagerProps {
    receipts: Receipt[]; // Expects unpaid, on-account receipts
    suppliers: Supplier[];
    hasActiveFilters: boolean;
}

const PayablesManager = ({ receipts, suppliers, hasActiveFilters }: PayablesManagerProps) => {
    const { openModal } = useUI();
    const [expandedItems, setExpandedItems] = useState<{ [key: string]: boolean }>({});

    const payablesBySupplier = useMemo(() => {
        const groupedBySupplier: { [key: string]: { totalOwed: number, months: { [key: string]: PayableMonth } } } = {};

        receipts.forEach(r => {
            const supplierName = r.vendor;
            if (!groupedBySupplier[supplierName]) {
                groupedBySupplier[supplierName] = { totalOwed: 0, months: {} };
            }
            
            const date = new Date(r.date);
            const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            if (!groupedBySupplier[supplierName].months[monthKey]) {
                groupedBySupplier[supplierName].months[monthKey] = {
                    monthKey,
                    monthName: date.toLocaleString('default', { month: 'long', year: 'numeric' }),
                    totalOwed: 0,
                    invoiceCount: 0,
                    receipts: []
                };
            }

            groupedBySupplier[supplierName].months[monthKey].receipts.push(r);
            groupedBySupplier[supplierName].months[monthKey].totalOwed += r.amount;
            groupedBySupplier[supplierName].months[monthKey].invoiceCount++;
            groupedBySupplier[supplierName].totalOwed += r.amount;
        });

        const result: PayableSupplier[] = Object.entries(groupedBySupplier).map(([supplierName, data]) => ({
            supplierName,
            totalOwed: data.totalOwed,
            months: Object.values(data.months).sort((a, b) => b.monthKey.localeCompare(a.monthKey))
        }));

        return result.sort((a, b) => a.supplierName.localeCompare(b.supplierName));

    }, [receipts]);
    
    const toggleItem = (key: string) => {
        setExpandedItems(prev => ({ ...prev, [key]: !prev[key] }));
    };
    
    const handleMarkMonthPaid = (e: React.MouseEvent, supplierName: string, month: PayableMonth) => {
        e.stopPropagation();
        openModal('markMonthPaidConfirm', { 
            month: `${supplierName} - ${month.monthName}`, 
            receiptsToPay: month.receipts 
        });
    };

    const EmptyState = () => (
        <div className="text-center py-16 px-6 bg-gray-800 rounded-lg shadow-inner">
            <BanknotesIcon className="h-12 w-12 text-gray-500 mx-auto" />
            <h3 className="mt-4 text-lg font-medium text-white">{hasActiveFilters ? 'No Payables Match Filter' : 'No Payables Found'}</h3>
            <p className="mt-1 text-sm text-gray-400">
                {hasActiveFilters
                    ? 'Try adjusting your search or date range.'
                    : 'When you add an expense and mark it as "On Supplier Account", it will appear here until it\'s paid.'
                }
            </p>
        </div>
    );

    if (payablesBySupplier.length === 0) {
        return <EmptyState />;
    }

    return (
        <div className="space-y-4">
            <p className="text-sm text-gray-400">This is a summary of all unpaid invoices from suppliers you have an account with, grouped by supplier. Reconcile a payment from your bank statement to a supplier to mark these as paid, or manually mark a month's worth of invoices as paid.</p>
            <div className="bg-gray-800 rounded-lg shadow-md">
                <ul role="list" className="divide-y divide-gray-700">
                    {payablesBySupplier.map((supplier) => {
                        const supplierKey = `supplier-${supplier.supplierName}`;
                        const isSupplierExpanded = !!expandedItems[supplierKey];
                        return (
                            <li key={supplierKey}>
                                <div className="px-4 py-4 sm:px-6 hover:bg-gray-700/50 transition duration-150 ease-in-out flex items-center justify-between cursor-pointer" onClick={() => toggleItem(supplierKey)}>
                                    <div className="flex-1">
                                        <p className="text-xl font-bold text-white">{supplier.supplierName}</p>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <p className="text-2xl font-semibold text-orange-400">{formatCurrency(supplier.totalOwed)}</p>
                                        <ChevronDownIcon className={`h-6 w-6 text-gray-400 transition-transform ${isSupplierExpanded ? 'rotate-180' : ''}`} />
                                    </div>
                                </div>
                                {isSupplierExpanded && (
                                    <div className="px-4 pb-4 sm:px-6 border-t border-gray-700/50 animate-in fade-in-0 duration-300">
                                        <ul className="mt-2 space-y-2">
                                            {supplier.months.map(month => {
                                                const monthKey = `month-${supplier.supplierName}-${month.monthKey}`;
                                                const isMonthExpanded = !!expandedItems[monthKey];
                                                return (
                                                    <li key={monthKey} className="bg-gray-900/50 rounded-lg">
                                                        <div className="p-3 flex items-center justify-between cursor-pointer hover:bg-gray-900" onClick={() => toggleItem(monthKey)}>
                                                            <div className="flex-1">
                                                                <p className="text-base font-semibold text-white">{month.monthName}</p>
                                                                <p className="text-xs text-gray-400">{month.invoiceCount} unpaid invoices</p>
                                                            </div>
                                                            <div className="flex items-center gap-4">
                                                                <p className="text-lg font-semibold text-orange-300">{formatCurrency(month.totalOwed)}</p>
                                                                <button
                                                                    onClick={(e) => handleMarkMonthPaid(e, supplier.supplierName, month)}
                                                                    className="p-2 text-gray-400 hover:text-green-400"
                                                                    title={`Mark all invoices for ${month.monthName} as paid`}
                                                                >
                                                                    <CheckCircleIcon className="h-5 w-5" />
                                                                </button>
                                                                 <ChevronDownIcon className={`h-5 w-5 text-gray-400 transition-transform ${isMonthExpanded ? 'rotate-180' : ''}`} />
                                                            </div>
                                                        </div>
                                                        {isMonthExpanded && (
                                                            <div className="p-3 border-t border-gray-700/50 animate-in fade-in-0 duration-200">
                                                                <ul className="space-y-1">
                                                                    {month.receipts.sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime()).map(r => (
                                                                        <li key={r.id} className="flex justify-between items-center p-1.5 rounded-md">
                                                                            <div className="flex-1">
                                                                                <p className="text-sm text-gray-200 truncate">{r.category}</p>
                                                                                <p className="text-xs text-gray-500">{formatDate(r.date)}</p>
                                                                            </div>
                                                                            <p className="text-sm text-gray-200 ml-4">{formatCurrency(r.amount)}</p>
                                                                        </li>
                                                                    ))}
                                                                </ul>
                                                            </div>
                                                        )}
                                                    </li>
                                                );
                                            })}
                                        </ul>
                                    </div>
                                )}
                            </li>
                        );
                    })}
                </ul>
            </div>
        </div>
    );
};

export default PayablesManager;