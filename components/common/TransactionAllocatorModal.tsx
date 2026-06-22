
import React, { useState, useMemo, useRef } from 'react';
import { StatementTransaction, NewReceipt } from '../../types';
import { useData } from '../../hooks/useData';
import { useUI } from '../../hooks/useUI';
import * as dataService from '../../services/dataService';
import * as ai from '../../utils/ai';
import { compressImage } from '../../utils/helpers';
import { XMarkIcon, ExclamationTriangleIcon, ArrowUpTrayIcon, CheckCircleIcon } from '../icons';
import { formatCurrency, formatDate, isLikelyOwnAccountTransfer } from '../../utils/helpers';
import Spinner from '../common/Spinner';

interface ItemDisplayProps {
    item: any;
    type: 'receipt' | 'vehicle';
    isSelected: boolean;
    onToggle: (id: string) => void;
}

const TransactionAllocatorModal = ({ transaction }: { transaction: StatementTransaction }) => {
    const { closeModal, openModal } = useUI();
    const { allReceipts, vehicles, reconcileTransactionFromSuggestion, updateTransaction, companyId, userId, expenseCategories, addReceipt } = useData();
    const [selectedType, setSelectedType] = useState<'receipt' | 'vehicle'>('receipt');
    // Changed from single selectedId to array of selectedIds
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [uploadStatus, setUploadStatus] = useState<'idle' | 'running' | 'error'>('idle');
    const [uploadMessage, setUploadMessage] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);

    const transactionAmount = Math.abs(transaction.amount);
    const looksLikeTransfer = isLikelyOwnAccountTransfer(transaction.description);

    const handleMarkAsTransfer = async () => {
        setIsSubmitting(true);
        try {
            // Money moved between the business's own accounts — not income or an expense.
            await updateTransaction(transaction.id, {
                category: 'Transfer',
                vatRate: 0,
                vatAmount: 0,
                reconciliationType: 'transfer',
                status: 'Reconciled',
            });
            closeModal();
        } catch (e) {
            setIsSubmitting(false);
        }
    };

    const { timeSensitiveMatches, otherMatches } = useMemo(() => {
        const txDate = new Date(transaction.date);
        const thirtyDays = 30 * 24 * 60 * 60 * 1000;

        const allUnreconciledReceipts = allReceipts.filter(r => r.status === 'Unpaid');
        const allUnreconciledVehicles = vehicles.filter(v => v.status !== 'Sold' && !v.purchaseTransactionId);

        const items = selectedType === 'receipt' 
            ? allUnreconciledReceipts.map(r => ({ ...r, price: r.amount }))
            : allUnreconciledVehicles.map(v => ({ ...v, price: v.purchasePrice, date: v.purchaseDate }));

        const sortedItems = items.sort((a, b) => Math.abs(transactionAmount - a.price) - Math.abs(transactionAmount - b.price));

        const timeSensitive: any[] = [];
        const other: any[] = [];

        sortedItems.forEach(item => {
            const itemDate = new Date(item.date);
            if (Math.abs(txDate.getTime() - itemDate.getTime()) <= thirtyDays) {
                timeSensitive.push(item);
            } else {
                other.push(item);
            }
        });
        return { timeSensitiveMatches: timeSensitive, otherMatches: other };
    }, [transaction, allReceipts, vehicles, selectedType, transactionAmount]);

    const handleToggleSelection = (id: string) => {
        if (selectedType === 'receipt') {
            setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
        } else {
            // For vehicles, generally match one transaction to one vehicle purchase
            setSelectedIds(prev => prev.includes(id) ? [] : [id]);
        }
    };

    const selectedTotal = useMemo(() => {
        const allItems = [...timeSensitiveMatches, ...otherMatches];
        return allItems
            .filter(item => selectedIds.includes(item.id))
            .reduce((sum, item) => sum + item.price, 0);
    }, [selectedIds, timeSensitiveMatches, otherMatches]);

    const difference = transactionAmount - selectedTotal;
    const isExactMatch = Math.abs(difference) < 0.01;

    const handleReconcile = async () => {
        if (selectedIds.length === 0) return;
        setIsSubmitting(true);
        
        const suggestion = selectedType === 'receipt' 
            ? { receiptIds: selectedIds } 
            : { vehicleId: selectedIds[0] }; // Only take first vehicle if multiple selected by accident, though UI restricts logic
        
        await reconcileTransactionFromSuggestion(transaction.id, suggestion);
        closeModal();
    };
    
    const handleCategorizeManually = () => {
        closeModal();
        openModal('categoryAllocator', transaction);
    };

    const handleFileUpload = async (file: File) => {
        if (!companyId || !userId) return;
        setUploadStatus('running');
        setUploadMessage('Uploading and scanning...');
        
        try {
            const compressedFile = file.type.startsWith('image/') ? await compressImage(file, { maxWidth: 1024, quality: 0.8 }) : file;
            
            const [scanResult, receiptUrl] = await Promise.all([
                ai.scanExpenseReceipt(compressedFile, expenseCategories.map(c => c.name)),
                dataService.uploadFile(companyId, userId, compressedFile, 'receipts')
            ]);
    
            const newReceiptData: NewReceipt = {
                vendor: scanResult.vendor || transaction.description,
                amount: Math.abs(transaction.amount),
                date: transaction.date,
                category: scanResult.category || 'Other',
                receiptUrl: receiptUrl,
                vat: scanResult.vat || 0,
                paymentType: 'Direct',
            };
    
            setUploadMessage('Saving new receipt...');
            const newReceiptId = await addReceipt(newReceiptData);
            
            // Auto-select the newly uploaded receipt
            setSelectedType('receipt');
            setSelectedIds(prev => [...prev, newReceiptId]);
            setUploadStatus('idle');
            // Do not close modal, let user confirm matching
    
        } catch (error: any) {
            console.error("Upload failed:", error);
            setUploadStatus('error');
            setUploadMessage(error.message || 'An unexpected error occurred.');
        }
    }

    const ItemDisplay: React.FC<ItemDisplayProps> = ({ item, type, isSelected, onToggle }) => {
        return (
             <div onClick={() => onToggle(item.id)} className={`p-3 rounded-lg cursor-pointer transition-all border ${isSelected ? 'bg-brand-900/70 border-brand-500 shadow-inner' : 'bg-gray-700 border-gray-600 hover:border-gray-500'}`}>
                <div className="flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${isSelected ? 'bg-brand-500 border-brand-500' : 'border-gray-500 bg-gray-800'}`}>
                            {isSelected && <CheckCircleIcon className="w-4 h-4 text-white" />}
                        </div>
                        <p className="font-semibold text-white">{type === 'receipt' ? item.vendor : `${item.reg} - ${item.make}`}</p>
                    </div>
                    <p className="font-bold text-white">{formatCurrency(item.price)}</p>
                </div>
                <div className="flex justify-between items-center text-xs text-gray-400 mt-2 pl-8">
                    <span>{formatDate(item.date)}</span>
                    <span>{type === 'receipt' ? item.category : 'Vehicle Purchase'}</span>
                </div>
            </div>
        )
    };

    if (uploadStatus !== 'idle') {
        return (
            <div className="p-6 text-center flex flex-col items-center justify-center h-full">
                {uploadStatus === 'running' && <Spinner className="h-8 w-8 mb-4"/>}
                {uploadStatus === 'error' && <ExclamationTriangleIcon className="h-8 w-8 text-red-400 mb-4"/>}
                <p className="text-white font-semibold">{uploadMessage}</p>
                {uploadStatus === 'error' && <button onClick={() => setUploadStatus('idle')} className="mt-6 px-4 py-2 text-sm font-medium text-white bg-brand-600 rounded-md">Try Again</button>}
            </div>
        )
    }

    return (
        <div className="w-full flex flex-col h-full max-h-[90vh]">
            <input type="file" ref={fileInputRef} onChange={e => e.target.files && handleFileUpload(e.target.files[0])} className="hidden" accept="image/*,application/pdf" />
            <header className="p-4 border-b border-gray-700 flex items-center justify-between">
                <h2 className="text-lg font-bold text-white">Allocate Transaction</h2>
                <button type="button" onClick={closeModal} className="p-1 rounded-full text-gray-400 hover:bg-gray-700"><XMarkIcon className="h-6 w-6" /></button>
            </header>
            <div className="p-6 space-y-4 flex-1 overflow-y-auto">
                <div className="bg-gray-900/50 p-4 rounded-lg shadow-inner">
                    <div className="flex justify-between items-center">
                        <p className="text-sm text-gray-400">{formatDate(transaction.date)}</p>
                        <p className="text-xl font-bold text-red-400">{formatCurrency(transaction.amount)}</p>
                    </div>
                    <p className="text-white mt-1 truncate">{transaction.description}</p>
                </div>

                {/* Quick path: money moved between own accounts (e.g. a sweep to savings) */}
                <button
                    type="button"
                    onClick={handleMarkAsTransfer}
                    disabled={isSubmitting}
                    className={`w-full text-left p-3 rounded-lg border-2 transition-colors disabled:opacity-50 ${looksLikeTransfer ? 'bg-brand-900/50 border-brand-500 hover:bg-brand-900/70' : 'bg-gray-700/40 border-gray-600 hover:border-gray-500'}`}
                >
                    <span className="block text-sm font-semibold text-white">Transfer between own accounts</span>
                    <span className="block text-xs text-gray-400">{looksLikeTransfer ? 'This looks like a transfer to savings/another account. ' : ''}Not income or an expense — excluded from your expenses, profit &amp; VAT.</span>
                </button>

                {selectedIds.length > 0 && (
                    <div className={`p-3 rounded-lg border flex justify-between items-center ${isExactMatch ? 'bg-green-900/40 border-green-700' : 'bg-yellow-900/40 border-yellow-700'}`}>
                        <div>
                            <p className="text-xs text-gray-300">Selected Total</p>
                            <p className={`font-bold ${isExactMatch ? 'text-green-400' : 'text-yellow-400'}`}>{formatCurrency(selectedTotal)}</p>
                        </div>
                        <div className="text-right">
                            <p className="text-xs text-gray-300">Difference</p>
                            <p className={`font-bold ${isExactMatch ? 'text-green-400' : 'text-red-400'}`}>{formatCurrency(difference)}</p>
                        </div>
                    </div>
                )}
                
                <div className="flex items-center space-x-2 rounded-lg bg-gray-700/60 p-1">
                    <button onClick={() => { setSelectedType('receipt'); setSelectedIds([]); }} className={`flex-1 py-2 text-sm font-semibold rounded-md transition-colors ${selectedType === 'receipt' ? 'bg-brand-600 text-white shadow' : 'text-gray-300 hover:bg-gray-600'}`}>Receipts</button>
                    <button onClick={() => { setSelectedType('vehicle'); setSelectedIds([]); }} className={`flex-1 py-2 text-sm font-semibold rounded-md transition-colors ${selectedType === 'vehicle' ? 'bg-brand-600 text-white shadow' : 'text-gray-300 hover:bg-gray-600'}`}>Vehicle Purchases</button>
                </div>

                <div className="space-y-4 pr-2 -mr-2 max-h-80 overflow-y-auto">
                    {timeSensitiveMatches.length > 0 && (
                        <div>
                            <h3 className="text-sm font-semibold text-gray-300 mb-2">Suggested Matches</h3>
                            <div className="space-y-2">
                                {timeSensitiveMatches.map(item => (
                                    <ItemDisplay 
                                        key={item.id} 
                                        item={item} 
                                        type={selectedType} 
                                        isSelected={selectedIds.includes(item.id)}
                                        onToggle={handleToggleSelection} 
                                    />
                                ))}
                            </div>
                        </div>
                    )}
                     {otherMatches.length > 0 && (
                        <div>
                            <h3 className="text-sm font-semibold text-gray-300 mb-2 flex items-center gap-2"><ExclamationTriangleIcon className="h-4 w-4 text-yellow-400"/> Matches with Date Discrepancies</h3>
                            <div className="space-y-2">
                                {otherMatches.map(item => (
                                    <ItemDisplay 
                                        key={item.id} 
                                        item={item} 
                                        type={selectedType} 
                                        isSelected={selectedIds.includes(item.id)}
                                        onToggle={handleToggleSelection} 
                                    />
                                ))}
                            </div>
                        </div>
                    )}
                     {timeSensitiveMatches.length === 0 && otherMatches.length === 0 && (
                        <p className="text-center text-gray-400 py-6">No unreconciled {selectedType === 'receipt' ? 'receipts' : 'vehicles'} found.</p>
                     )}
                </div>
            </div>
             <footer className="flex-shrink-0 p-4 border-t border-gray-700 grid grid-cols-3 gap-3 bg-gray-800">
                <button type="button" onClick={handleCategorizeManually} className="px-4 py-2 text-sm font-medium text-gray-300 bg-gray-600 hover:bg-gray-500 rounded-md">
                    Categorize Manually
                </button>
                 <button type="button" onClick={() => fileInputRef.current?.click()} className="inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-gray-300 bg-gray-600 hover:bg-gray-500 rounded-md">
                    <ArrowUpTrayIcon className="h-5 w-5" /> Upload Receipt
                </button>
                <button onClick={handleReconcile} disabled={selectedIds.length === 0 || isSubmitting} className="inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-50">
                    {isSubmitting ? <Spinner /> : 'Confirm Match'}
                </button>
            </footer>
        </div>
    );
};

export default TransactionAllocatorModal;
