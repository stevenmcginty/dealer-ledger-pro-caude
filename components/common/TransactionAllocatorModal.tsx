
import React, { useState, useMemo, useRef } from 'react';
import { StatementTransaction, NewReceipt } from '../../types';
import { useData } from '../../hooks/useData';
import { useUI } from '../../hooks/useUI';
import * as dataService from '../../services/dataService';
import * as ai from '../../utils/ai';
import { compressImage } from '../../utils/helpers';
import { XMarkIcon, ExclamationTriangleIcon, ArrowUpTrayIcon, CheckCircleIcon } from '../icons';
import { formatCurrency, formatDate, isLikelyOwnAccountTransfer } from '../../utils/helpers';
import { isMatchableReceipt } from '../../utils/statementAutoMatch';
import Spinner from '../common/Spinner';
import { Button, IconButton, Plate, Segmented, useToast } from '../ui';

interface ItemDisplayProps {
    item: any;
    type: 'receipt' | 'vehicle';
    isSelected: boolean;
    onToggle: (id: string) => void;
}

const TransactionAllocatorModal = ({ transaction }: { transaction: StatementTransaction }) => {
    const { closeModal, openModal } = useUI();
    const { allReceipts, vehicles, reconcileTransactionFromSuggestion, updateTransaction, companyId, userId, expenseCategories, addReceipt } = useData();
    const toast = useToast();
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
            console.error("Failed to mark transaction as a transfer:", e);
            toast.error("Could not mark this as a transfer. Please try again.");
            setIsSubmitting(false);
        }
    };

    const { timeSensitiveMatches, otherMatches } = useMemo(() => {
        const txDate = new Date(transaction.date);
        const thirtyDays = 30 * 24 * 60 * 60 * 1000;

        // Unpaid receipts, plus Paid Direct ones no bank line carries yet. This also works on a
        // line that is already reconciled (Edit opens this dialog), so no Undo is needed first.
        const allUnreconciledReceipts = allReceipts.filter(isMatchableReceipt);
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
             <button type="button" aria-pressed={isSelected} onClick={() => onToggle(item.id)} className={`block min-h-[48px] w-full cursor-pointer rounded-control border p-3 text-start transition-colors duration-quick ease-out ${isSelected ? 'border-accent bg-accent-soft' : 'border-line bg-surface hover:bg-surface-2 active:bg-surface-3'}`}>
                <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                        <div aria-hidden="true" className={`flex h-5 w-5 flex-none items-center justify-center rounded-chip border transition-colors duration-quick ${isSelected ? 'border-accent bg-accent' : 'border-line-strong bg-surface'}`}>
                            {isSelected && <CheckCircleIcon className="h-4 w-4 text-on-accent" />}
                        </div>
                        {type === 'receipt'
                            ? <p className="truncate font-semibold text-ink">{item.vendor}</p>
                            : <p className="flex min-w-0 items-center gap-2 font-semibold text-ink">{item.reg && <Plate reg={item.reg} size="sm" />}<span className="truncate">{item.make}</span></p>}
                    </div>
                    <p className="flex-none font-mono font-semibold tabular-nums text-ink">{formatCurrency(item.price)}</p>
                </div>
                <div className="mt-1.5 flex items-center justify-between gap-3 ps-8 text-sm text-ink-3">
                    <span className="font-mono tabular-nums">{formatDate(item.date)}</span>
                    <span className="truncate text-end">{type === 'receipt' ? (item.status === 'Paid' ? `${item.category} · Paid, no bank line yet` : item.category) : 'Car purchase'}</span>
                </div>
            </button>
        )
    };

    if (uploadStatus !== 'idle') {
        return (
            <div role={uploadStatus === 'error' ? 'alert' : 'status'} className="flex h-full flex-col items-center justify-center p-6 text-center">
                {uploadStatus === 'running' && <Spinner className="mb-4 h-8 w-8"/>}
                {uploadStatus === 'error' && <ExclamationTriangleIcon className="mb-4 h-8 w-8 text-danger"/>}
                <p className="font-semibold text-ink">{uploadMessage}</p>
                {uploadStatus === 'error' && <Button type="button" variant="primary" onClick={() => setUploadStatus('idle')} className="mt-6">Try again</Button>}
            </div>
        )
    }

    return (
        <div className="w-full flex flex-col h-full max-h-[90vh]">
            <input type="file" ref={fileInputRef} onChange={e => e.target.files && handleFileUpload(e.target.files[0])} className="hidden" accept="image/*,application/pdf" />
            <header className="flex items-center justify-between gap-3 border-b border-line py-2 pe-2 ps-5">
                <h2 className="text-[1.375rem] font-bold leading-7 tracking-[-0.01em] text-ink">Match bank line</h2>
                <IconButton label="Close" icon={<XMarkIcon />} onClick={closeModal} />
            </header>
            <div className="flex-1 space-y-4 overflow-y-auto p-5">
                <div className="rounded-control border border-line bg-surface-2 p-4">
                    <div className="flex items-center justify-between gap-3">
                        <p className="font-mono text-sm tabular-nums text-ink-3">{formatDate(transaction.date)}</p>
                        <p className="font-mono text-xl font-bold tabular-nums text-danger">{formatCurrency(transaction.amount)}</p>
                    </div>
                    <p className="mt-1 truncate text-ink">{transaction.description}</p>
                </div>

                {/* Quick path: money moved between own accounts (e.g. a sweep to savings) */}
                <button
                    type="button"
                    onClick={handleMarkAsTransfer}
                    disabled={isSubmitting}
                    className={`min-h-[48px] w-full rounded-control border p-3 text-start transition-colors duration-quick ease-out disabled:cursor-not-allowed disabled:text-ink-3 ${looksLikeTransfer ? 'border-accent bg-accent-soft' : 'border-line-strong bg-surface hover:bg-surface-2 active:bg-surface-3'}`}
                >
                    <span className="block text-base font-semibold text-ink">Transfer between own accounts</span>
                    <span className="block text-sm text-ink-2">{looksLikeTransfer ? 'This looks like a transfer to savings or another account. ' : ''}Not income or an expense, so it stays out of your expenses, profit and VAT.</span>
                </button>

                {selectedIds.length > 0 && (
                    <div className={`flex items-center justify-between rounded-control border p-3 ${isExactMatch ? 'border-success bg-success-soft text-success-ink' : 'border-warning bg-warning-soft text-warning-ink'}`}>
                        <div>
                            <p className="text-sm">Selected total</p>
                            <p className="font-mono font-bold tabular-nums">{formatCurrency(selectedTotal)}</p>
                        </div>
                        <div className="text-end">
                            <p className="text-sm">Difference</p>
                            <p className="font-mono font-bold tabular-nums">{formatCurrency(difference)}</p>
                        </div>
                    </div>
                )}
                
                <Segmented
                    ariaLabel="Match against"
                    full
                    options={[{ value: 'receipt', label: 'Receipts' }, { value: 'vehicle', label: 'Car purchases' }]}
                    value={selectedType}
                    onChange={v => { setSelectedType(v); setSelectedIds([]); }}
                />

                <div className="-me-2 max-h-80 space-y-4 overflow-y-auto pe-2">
                    {timeSensitiveMatches.length > 0 && (
                        <div>
                            <h3 className="mb-2 text-sm font-semibold text-ink-2">Suggested matches</h3>
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
                            <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink-2"><ExclamationTriangleIcon className="h-4 w-4 text-warning"/> Dates more than 30 days apart</h3>
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
                        <p className="py-6 text-center text-ink-3">No unmatched {selectedType === 'receipt' ? 'receipts' : 'car purchases'} to choose from.</p>
                     )}
                </div>
            </div>
             <footer className="flex flex-none flex-wrap gap-2 border-t border-line bg-surface px-4 py-3 sm:px-5 [&>*]:flex-1">
                <Button type="button" variant="secondary" onClick={handleCategorizeManually}>
                    Choose category
                </Button>
                <Button type="button" variant="secondary" icon={<ArrowUpTrayIcon />} onClick={() => fileInputRef.current?.click()}>
                    Upload receipt
                </Button>
                <Button type="button" variant="primary" onClick={handleReconcile} disabled={selectedIds.length === 0} loading={isSubmitting} className="basis-full sm:basis-auto">
                    Match bank line
                </Button>
            </footer>
        </div>
    );
};

export default TransactionAllocatorModal;
