import React, { useMemo, useState } from 'react';
import { Receipt, Supplier } from '../../types';
import { BanknotesIcon, ChevronDownIcon, CheckCircleIcon } from '../icons';
import { formatDate } from '../../utils/helpers';
import { useUI } from '../../hooks/useUI';
import ReceiptThumb from '../common/ReceiptThumb';
import { Button, EmptyState } from '../ui';
import { LedgerSummary, Money } from './ledgerUi';

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

    if (payablesBySupplier.length === 0) {
        return (
            <EmptyState
                className="rounded-card border border-line bg-surface"
                icon={<BanknotesIcon />}
                title={hasActiveFilters ? 'No bills match' : 'Nothing to pay'}
                description={hasActiveFilters
                    ? 'Try other words, or pick a wider period.'
                    : 'Expenses you put “On account” wait here until you pay the supplier.'}
            />
        );
    }

    const totalOwed = payablesBySupplier.reduce((s, sup) => s + sup.totalOwed, 0);

    return (
        <div className="space-y-3">
            <LedgerSummary
                left={<><span className="num font-semibold text-ink">{payablesBySupplier.length}</span> supplier{payablesBySupplier.length !== 1 ? 's' : ''} on account</>}
                right={<span>Owed <Money amount={totalOwed} className="font-semibold text-ink" /></span>}
            />
            <p className="max-w-[60ch] text-sm text-ink-3">
                Bills clear when you match the payment on the Bank screen. You can also mark a whole month paid.
            </p>
            <ul role="list" className="m-0 list-none overflow-hidden rounded-card border border-line bg-surface p-0">
                {payablesBySupplier.map((supplier) => {
                    const supplierKey = `supplier-${supplier.supplierName}`;
                    const isSupplierExpanded = !!expandedItems[supplierKey];
                    const billCount = supplier.months.reduce((n, m) => n + m.invoiceCount, 0);
                    return (
                        <li key={supplierKey} className="border-b border-line last:border-b-0">
                            <button
                                type="button"
                                aria-expanded={isSupplierExpanded}
                                onClick={() => toggleItem(supplierKey)}
                                className="flex min-h-[64px] w-full items-center gap-3 px-4 py-3 text-start transition-colors duration-quick ease-out hover:bg-surface-2 active:bg-surface-3"
                            >
                                <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
                                    <span className="truncate text-base font-semibold leading-[1.3] text-ink">{supplier.supplierName}</span>
                                    <span className="text-sm leading-[1.3] text-ink-3">
                                        <span className="num">{billCount}</span> unpaid bill{billCount !== 1 ? 's' : ''} · <span className="num">{supplier.months.length}</span> month{supplier.months.length !== 1 ? 's' : ''}
                                    </span>
                                </span>
                                <Money amount={supplier.totalOwed} className="text-lg font-semibold text-ink" />
                                <ChevronDownIcon className={`h-5 w-5 flex-none text-ink-3 transition-transform duration-quick ease-out ${isSupplierExpanded ? 'rotate-180' : ''}`} />
                            </button>
                            {isSupplierExpanded && (
                                <ul className="m-0 list-none border-t border-line bg-surface-2 p-0">
                                    {supplier.months.map(month => {
                                        const monthKey = `month-${supplier.supplierName}-${month.monthKey}`;
                                        const isMonthExpanded = !!expandedItems[monthKey];
                                        return (
                                            <li key={monthKey} className="border-b border-line last:border-b-0">
                                                <div className="flex items-center gap-2 pe-3 ps-4">
                                                    <button
                                                        type="button"
                                                        aria-expanded={isMonthExpanded}
                                                        onClick={() => toggleItem(monthKey)}
                                                        className="flex min-h-[56px] min-w-0 flex-1 items-center gap-3 py-2 text-start"
                                                    >
                                                        <ChevronDownIcon className={`h-4 w-4 flex-none text-ink-3 transition-transform duration-quick ease-out ${isMonthExpanded ? '' : '-rotate-90 rtl:rotate-90'}`} />
                                                        <span className="flex min-w-0 flex-1 flex-col">
                                                            <span className="truncate text-sm font-semibold text-ink">{month.monthName}</span>
                                                            <span className="text-sm text-ink-3"><span className="num">{month.invoiceCount}</span> unpaid</span>
                                                        </span>
                                                        <Money amount={month.totalOwed} className="text-base font-semibold text-ink" />
                                                    </button>
                                                    <Button
                                                        size="sm"
                                                        variant="secondary"
                                                        icon={<CheckCircleIcon />}
                                                        onClick={(e) => handleMarkMonthPaid(e, supplier.supplierName, month)}
                                                        title={`Mark all bills for ${month.monthName} as paid`}
                                                    >
                                                        Mark paid
                                                    </Button>
                                                </div>
                                                {isMonthExpanded && (
                                                    <ul className="m-0 list-none border-t border-line bg-surface p-0">
                                                        {month.receipts.sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime()).map(r => (
                                                            <li key={r.id} className="flex min-h-[52px] items-center gap-3 border-b border-line py-2 pe-4 ps-11 last:border-b-0">
                                                                {r.receiptUrl && <ReceiptThumb url={r.receiptUrl} label={`${r.vendor} · ${formatDate(r.date)}`} size="sm" />}
                                                                <span className="flex min-w-0 flex-1 flex-col">
                                                                    <span className="truncate text-sm text-ink">{r.category}</span>
                                                                    <span className="num text-sm text-ink-3">{formatDate(r.date)}</span>
                                                                </span>
                                                                <Money amount={r.amount} className="text-sm text-ink" />
                                                            </li>
                                                        ))}
                                                    </ul>
                                                )}
                                            </li>
                                        );
                                    })}
                                </ul>
                            )}
                        </li>
                    );
                })}
            </ul>
        </div>
    );
};

export default PayablesManager;
