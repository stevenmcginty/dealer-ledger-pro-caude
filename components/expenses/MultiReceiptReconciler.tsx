import React, { useState, useMemo } from 'react';
import { StatementTransaction, Receipt } from '../../types';
import { XMarkIcon, BanknotesIcon } from '../icons';
import { formatCurrency, formatDate } from '../../utils/helpers';
import Spinner from '../common/Spinner';

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
        <div className="w-full flex flex-col h-full">
            <header className="p-4 border-b border-gray-700 flex items-center justify-between flex-shrink-0">
                <h2 className="text-lg font-bold text-white">Reconcile Supplier Payment</h2>
                <button onClick={onClose} className="p-1 rounded-full text-gray-400 hover:bg-gray-700"><XMarkIcon className="h-6 w-6" /></button>
            </header>
            <div className="p-6 space-y-6 flex-1 overflow-y-auto">
                <div className="bg-gray-900/50 p-4 rounded-lg">
                    <p className="text-sm text-gray-400">Payment to <span className="font-bold text-white">{receipts[0]?.vendor}</span></p>
                    <div className="flex justify-between items-center mt-1">
                        <p className="text-white truncate">{transaction.description}</p>
                        <p className="text-xl font-bold text-orange-400">{formatCurrency(transactionAmount)}</p>
                    </div>
                </div>

                <div>
                    <h3 className="text-base font-semibold text-white">Select Invoices to Pay</h3>
                    <div className="mt-2 space-y-2 max-h-60 overflow-y-auto pr-2">
                        {sortedReceipts.map(receipt => (
                            <label key={receipt.id} htmlFor={`receipt-${receipt.id}`} className={`flex items-center justify-between p-3 rounded-lg cursor-pointer transition-all ${selectedIds.includes(receipt.id) ? 'bg-brand-600/70 border-brand-500' : 'bg-gray-700 border-gray-600'} border`}>
                                <div className="flex items-center">
                                    <input id={`receipt-${receipt.id}`} type="checkbox" checked={selectedIds.includes(receipt.id)} onChange={() => handleToggle(receipt.id)} className="h-5 w-5 rounded border-gray-500 bg-gray-800 text-brand-600 focus:ring-brand-500" />
                                    <div className="ml-3">
                                        <p className="font-medium text-white">{formatDate(receipt.date)}</p>
                                        <p className="text-xs text-gray-400">{receipt.category}</p>
                                    </div>
                                </div>
                                <p className="font-semibold text-white">{formatCurrency(receipt.amount)}</p>
                            </label>
                        ))}
                    </div>
                </div>

                 <div className="space-y-3 pt-4 border-t border-gray-700">
                    <div className="flex justify-between items-center text-sm"><span className="text-gray-400">Payment Amount</span><span className="font-medium text-white">{formatCurrency(transactionAmount)}</span></div>
                    <div className="flex justify-between items-center text-sm"><span className="text-gray-400">Selected Invoices Total</span><span className="font-medium text-white">{formatCurrency(selectedTotal)}</span></div>
                    <div className={`flex justify-between items-center text-lg font-bold p-3 rounded-lg ${
                        isMatched ? 'bg-green-800/50 text-green-300' 
                        : selectedIds.length > 0 ? 'bg-yellow-800/50 text-yellow-300'
                        : 'bg-red-800/50 text-red-300'}`}>
                        <span>{isMatched ? 'Matched' : (difference > 0 ? 'Overpaid by' : 'Credit/Shortfall')}</span>
                        <span>{formatCurrency(Math.abs(difference))}</span>
                    </div>
                </div>

            </div>
            <footer className="flex-shrink-0 p-4 border-t border-gray-700 grid grid-cols-2 gap-3 bg-gray-800">
                <button type="button" onClick={() => onCategorizeManually(transaction)} className="w-full px-4 py-2 text-sm font-medium text-gray-300 bg-gray-600 hover:bg-gray-500 rounded-md">
                    Categorize Manually
                </button>
                {isMatched ? (
                    <button onClick={handleReconcile} disabled={!isMatched || isSubmitting} className="w-full inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-50">
                        {isSubmitting ? <Spinner /> : `Reconcile ${formatCurrency(selectedTotal)}`}
                    </button>
                ) : (
                    <button onClick={handleForceReconcile} disabled={selectedIds.length === 0 || isSubmitting} className="w-full inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-orange-600 hover:bg-orange-700 disabled:opacity-50">
                        {isSubmitting ? <Spinner /> : `Reconcile Payment of ${formatCurrency(transactionAmount)}`}
                    </button>
                )}
            </footer>
        </div>
    );
};

export default MultiReceiptReconciler;