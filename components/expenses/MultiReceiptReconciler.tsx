import React, { useState, useMemo } from 'react';
import { StatementTransaction, Receipt } from '../../types';
import { XMarkIcon, CheckCircleIcon, ExclamationTriangleIcon } from '../icons';
import { formatCurrency, formatDate } from '../../utils/helpers';
import { Button, IconButton, Checkbox } from '../ui';
import { cx } from '../ui/cx';
import { Money } from './ledgerUi';

interface MultiReceiptReconcilerProps {
    transaction: StatementTransaction;
    receipts: Receipt[];
    onReconcile: (transactionId: string, receiptIds: string[]) => void;
    onReconcileWithAdjustment: (transactionId: string, receiptIds: string[], transactionAmount: number) => void;
    onClose: () => void;
    onCategorizeManually: (transaction: StatementTransaction) => void;
}

const MultiReceiptReconciler = ({ transaction, receipts, onReconcile, onReconcileWithAdjustment, onClose, onCategorizeManually }: MultiReceiptReconcilerProps) => {
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const sortedReceipts = useMemo(() => [...receipts].sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime()), [receipts]);

    const handleToggle = (id: string) => {
        setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
    };

    const selectedTotal = useMemo(() => {
        return receipts
            .filter(r => selectedIds.includes(r.id))
            .reduce((sum, r) => sum + r.amount, 0);
    }, [selectedIds, receipts]);
    
    const transactionAmount = Math.abs(transaction.amount);
    const difference = transactionAmount - selectedTotal;
    const isMatched = Math.abs(difference) < 0.01;

    const handleReconcile = () => {
        if (!isMatched) return;
        setIsSubmitting(true);
        onReconcile(transaction.id, selectedIds);
    };

    const handleForceReconcile = () => {
        if (selectedIds.length === 0) return;
        setIsSubmitting(true);
        onReconcileWithAdjustment(transaction.id, selectedIds, transaction.amount);
    };

    return (
        <div className="flex h-full w-full flex-col">
            <header className="flex flex-shrink-0 items-start gap-3 border-b border-line px-4 pb-3 pt-1 sm:px-5 sm:pt-5">
                <div className="min-w-0 flex-1 pt-1.5">
                    <h2 className="text-[1.375rem] font-bold leading-7 tracking-[-0.01em] text-ink">Match supplier payment</h2>
                    <p className="mt-1 text-sm text-ink-2">Tick the bills this payment covers.</p>
                </div>
                <IconButton label="Close" icon={<XMarkIcon />} onClick={onClose} className="-me-2" />
            </header>
            <div className="flex-1 space-y-5 overflow-y-auto p-4 sm:p-5">
                <div className="rounded-card border border-line bg-surface-2 px-4 py-3">
                    <p className="text-sm text-ink-3">Payment to <span className="font-semibold text-ink">{receipts[0]?.vendor}</span></p>
                    <div className="mt-1 flex items-baseline justify-between gap-3">
                        <p className="min-w-0 truncate text-base font-semibold text-ink">{transaction.description}</p>
                        <Money amount={transactionAmount} className="text-xl font-bold text-ink" />
                    </div>
                </div>

                <div>
                    <h3 className="text-base font-bold text-ink">Bills on account</h3>
                    <ul className="m-0 mt-2 max-h-72 list-none overflow-y-auto rounded-card border border-line bg-surface p-0">
                        {sortedReceipts.map(receipt => {
                            const on = selectedIds.includes(receipt.id);
                            return (
                                <li key={receipt.id} className={cx('border-b border-line px-3 last:border-b-0', on && 'bg-accent-soft')}>
                                    <Checkbox
                                        id={`receipt-${receipt.id}`}
                                        checked={on}
                                        onChange={() => handleToggle(receipt.id)}
                                        className="w-full py-1 [&>span:last-child]:flex-1"
                                        label={
                                            <span className="flex w-full items-center justify-between gap-3">
                                                <span className="min-w-0">
                                                    <span className="num block text-base font-semibold text-ink">{formatDate(receipt.date)}</span>
                                                    <span className="block truncate text-sm text-ink-3">{receipt.category}</span>
                                                </span>
                                                <Money amount={receipt.amount} className="text-base font-semibold text-ink" />
                                            </span>
                                        }
                                    />
                                </li>
                            );
                        })}
                    </ul>
                </div>

                <dl className="m-0 space-y-2 border-t border-line pt-4 text-sm">
                    <div className="flex items-baseline justify-between"><dt className="text-ink-3">Payment</dt><dd className="m-0"><Money amount={transactionAmount} className="font-semibold text-ink" /></dd></div>
                    <div className="flex items-baseline justify-between"><dt className="text-ink-3">Bills ticked</dt><dd className="m-0"><Money amount={selectedTotal} className="font-semibold text-ink" /></dd></div>
                    <div className={cx(
                        'flex items-center justify-between rounded-control px-3 py-2.5 text-base font-bold',
                        isMatched ? 'bg-success-soft text-success-ink'
                        : selectedIds.length > 0 ? 'bg-warning-soft text-warning-ink'
                        : 'bg-surface-2 text-ink-2')}>
                        <dt className="flex items-center gap-2">
                            {isMatched ? <CheckCircleIcon className="h-5 w-5" /> : <ExclamationTriangleIcon className="h-5 w-5" />}
                            {isMatched ? 'Matched' : (difference > 0 ? 'Overpaid by' : 'Credit/Shortfall')}
                        </dt>
                        <dd className="m-0"><Money amount={Math.abs(difference)} /></dd>
                    </div>
                </dl>
            </div>
            <footer className="flex flex-shrink-0 flex-col-reverse gap-2 border-t border-line bg-surface px-4 py-3 sm:flex-row sm:justify-end sm:px-5">
                <Button variant="secondary" onClick={() => onCategorizeManually(transaction)}>
                    Categorise instead
                </Button>
                {isMatched ? (
                    <Button onClick={handleReconcile} disabled={!isMatched} loading={isSubmitting}>
                        Match {formatCurrency(selectedTotal)}
                    </Button>
                ) : (
                    <Button onClick={handleForceReconcile} disabled={selectedIds.length === 0} loading={isSubmitting}>
                        Match payment of {formatCurrency(transactionAmount)}
                    </Button>
                )}
            </footer>
        </div>
    );
};

export default MultiReceiptReconciler;
