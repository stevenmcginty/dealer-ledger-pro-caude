
import React, { useState, useEffect } from 'react';
import { NewReceipt, ExpenseCategory, Receipt } from '../../types';
import * as ai from '../../utils/ai';
import * as dataService from '../../services/dataService';
import { compressImage, robustDateParser } from '../../utils/helpers';
import { XMarkIcon, CheckCircleIcon, TrashIcon, DocumentTextIcon } from '../icons';
import Spinner from '../common/Spinner';
import CurrencyInput from '../common/CurrencyInput';
import UkDateInput from '../common/UkDateInput';
import Select from '../common/Select';
import { Button, IconButton, Field, Segmented, StatusChip } from '../ui';
import { controlFrame, controlInput, cx } from '../ui/cx';
import './expenses.css';

interface BulkReceiptWizardProps {
    files: File[];
    onClose: () => void;
    companyId: string;
    userId: string;
    expenseCategories: ExpenseCategory[];
    allReceipts: Receipt[];
    onAddReceipt: (data: NewReceipt) => Promise<string>;
}

interface ProcessedItem extends Partial<NewReceipt> {
    file: File;
    status: 'pending' | 'uploading' | 'analyzing' | 'ready' | 'error' | 'saved';
    error?: string;
    tempId: string;
    amountStr: string;
    vatStr: string;
    previewUrl?: string;
}

const BulkReceiptWizard = ({ files, onClose, companyId, userId, expenseCategories, allReceipts, onAddReceipt }: BulkReceiptWizardProps) => {
    const [items, setItems] = useState<ProcessedItem[]>([]);
    const [isProcessing, setIsProcessing] = useState(true);
    const [overallStatus, setOverallStatus] = useState<'analyzing' | 'review' | 'saving' | 'complete'>('analyzing');

    useEffect(() => {
        const initialItems = files.map(file => ({
            file,
            status: 'pending' as const,
            tempId: Math.random().toString(36).substr(2, 9),
            amountStr: '',
            vatStr: '',
            previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined
        }));
        setItems(initialItems);
        processQueue(initialItems);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const processQueue = async (queue: ProcessedItem[]) => {
        const categoryNames = expenseCategories.map(c => c.name);

        // Process sequentially to avoid overwhelming browser/API
        for (let i = 0; i < queue.length; i++) {
            const item = queue[i];
            
            setItems(prev => prev.map(p => p.tempId === item.tempId ? { ...p, status: 'uploading' } : p));

            try {
                let fileToProcess = item.file;
                // Only compress images, pass PDFs through
                if (item.file.type.startsWith('image/')) {
                    fileToProcess = await compressImage(item.file, { maxWidth: 1024, quality: 0.8 });
                }

                // Upload
                const receiptUrl = await dataService.uploadFile(companyId, userId, fileToProcess, 'receipts');
                
                setItems(prev => prev.map(p => p.tempId === item.tempId ? { ...p, status: 'analyzing', receiptUrl } : p));

                // AI Scan
                const scanResult = await ai.scanExpenseReceipt(fileToProcess, categoryNames);
                
                // Logic to refine category/vat based on history (similar to ExpenseEditor)
                let suggestedCategory = scanResult.category || 'Other';
                let suggestedPaymentType: 'Direct' | 'On Account' = 'Direct';
                let potentialVat = scanResult.vat || 0;
                const totalAmount = scanResult.amount || 0;

                if (totalAmount > 0 && potentialVat > 0 && potentialVat > totalAmount * 0.3) {
                     if (Math.round(potentialVat) === 20) potentialVat = totalAmount - (totalAmount / 1.2);
                     else if (Math.round(potentialVat) === 5) potentialVat = totalAmount - (totalAmount / 1.05);
                }

                if (scanResult.vendor && allReceipts.length > 0) {
                    const vendorReceipts = allReceipts.filter(r => r.vendor && r.vendor.toLowerCase() === scanResult.vendor!.toLowerCase());
                    if (vendorReceipts.length > 0) {
                        if (!scanResult.category) {
                            const categoryCounts = vendorReceipts.reduce((acc, r) => { acc[r.category] = (acc[r.category] || 0) + 1; return acc; }, {} as Record<string, number>);
                            const mostCommonCategory = Object.keys(categoryCounts).length > 0 ? Object.keys(categoryCounts).reduce((a, b) => categoryCounts[a] > categoryCounts[b] ? a : b) : null;
                            if (mostCommonCategory) suggestedCategory = mostCommonCategory;
                        }
                        const paymentTypeCounts = vendorReceipts.reduce((acc, r) => { acc[r.paymentType] = (acc[r.paymentType] || 0) + 1; return acc; }, {} as Record<string, number>);
                        const mostCommonPaymentType = Object.keys(paymentTypeCounts).length > 0 ? Object.keys(paymentTypeCounts).reduce((a, b) => paymentTypeCounts[a] > paymentTypeCounts[b] ? a : b) : null;
                        if (mostCommonPaymentType) suggestedPaymentType = mostCommonPaymentType as 'Direct' | 'On Account';
                    }
                }

                setItems(prev => prev.map(p => {
                    if (p.tempId !== item.tempId) return p;
                    return {
                        ...p,
                        status: 'ready',
                        vendor: scanResult.vendor || '',
                        date: scanResult.date ? (robustDateParser(scanResult.date) || new Date().toISOString().split('T')[0]) : new Date().toISOString().split('T')[0],
                        amount: totalAmount,
                        amountStr: totalAmount ? String(totalAmount) : '',
                        vat: potentialVat,
                        vatStr: potentialVat ? String(parseFloat(potentialVat.toFixed(2))) : '',
                        category: suggestedCategory,
                        paymentType: suggestedPaymentType,
                        receiptUrl
                    };
                }));

            } catch (error: any) {
                console.error("Bulk process error for file", item.file.name, error);
                setItems(prev => prev.map(p => p.tempId === item.tempId ? { ...p, status: 'error', error: error.message } : p));
            }
        }
        setIsProcessing(false);
        setOverallStatus('review');
    };

    const handleUpdateItem = (tempId: string, updates: Partial<ProcessedItem>) => {
        setItems(prev => prev.map(item => {
            if (item.tempId !== tempId) return item;
            
            const updatedItem = { ...item, ...updates };
            // Recalculate numerics if string inputs change
            if (updates.amountStr !== undefined) updatedItem.amount = parseFloat(updates.amountStr) || 0;
            if (updates.vatStr !== undefined) updatedItem.vat = parseFloat(updates.vatStr) || 0;
            
            return updatedItem;
        }));
    };

    const handleRemoveItem = (tempId: string) => {
        setItems(prev => prev.filter(p => p.tempId !== tempId));
    };

    const handleConfirmAll = async () => {
        setOverallStatus('saving');
        
        const itemsToSave = items.filter(i => i.status === 'ready');
        
        // We'll process saves sequentially to update UI status one by one
        for (const item of itemsToSave) {
            try {
                const receiptData: NewReceipt = {
                    vendor: item.vendor || 'Unknown Vendor',
                    amount: item.amount || 0,
                    date: item.date || new Date().toISOString().split('T')[0],
                    category: item.category || 'Other',
                    vat: item.vat || 0,
                    paymentType: item.paymentType || 'Direct',
                    receiptUrl: item.receiptUrl
                };
                
                await onAddReceipt(receiptData); // This adds to DB and tries auto-reconcile
                
                setItems(prev => prev.map(p => p.tempId === item.tempId ? { ...p, status: 'saved' } : p));
            } catch (error: any) {
                console.error("Failed to save receipt", error);
                setItems(prev => prev.map(p => p.tempId === item.tempId ? { ...p, status: 'error', error: 'Failed to save to database.' } : p));
            }
        }
        setOverallStatus('complete');
    };

    const pendingCount = items.filter(i => ['pending', 'uploading', 'analyzing'].includes(i.status)).length;
    const readyCount = items.filter(i => i.status === 'ready').length;
    const errorCount = items.filter(i => i.status === 'error').length;

    const statusChip = (item: ProcessedItem) => {
        switch (item.status) {
            case 'pending': return <StatusChip status="neutral">Waiting</StatusChip>;
            case 'uploading': return <StatusChip status="prep">Uploading</StatusChip>;
            case 'analyzing': return <StatusChip status="prep">Reading</StatusChip>;
            case 'ready': return <StatusChip status="reserved">Check</StatusChip>;
            case 'saved': return <StatusChip status="sold">Saved</StatusChip>;
            case 'error': return <StatusChip status="due">Failed</StatusChip>;
        }
    };

    return (
        <div className="flex h-full max-h-[90vh] w-full flex-col">
            <header className="flex flex-shrink-0 items-start gap-3 border-b border-line bg-surface px-4 pb-3 pt-1 sm:px-5 sm:pt-5">
                <div className="min-w-0 flex-1 pt-1.5">
                    <h2 className="text-[1.375rem] font-bold leading-7 tracking-[-0.01em] text-ink">Add many receipts</h2>
                    <p role="status" className="mt-1 text-sm text-ink-2">
                        {overallStatus === 'analyzing' ? `Reading ${pendingCount} receipt${pendingCount !== 1 ? 's' : ''}…` :
                         overallStatus === 'review' ? `Check ${readyCount} receipt${readyCount !== 1 ? 's' : ''}, then save${errorCount ? ` · ${errorCount} failed` : ''}` :
                         overallStatus === 'saving' ? 'Saving receipts…' : 'All saved'}
                    </p>
                </div>
                <IconButton label="Close" icon={<XMarkIcon />} onClick={onClose} className="-me-2" />
            </header>

            <div className="flex-1 space-y-3 overflow-y-auto p-4 sm:p-5">
                {items.length === 0 && (
                    <p className="py-10 text-center text-sm text-ink-3">No files chosen.</p>
                )}

                {items.map((item) => {
                    const busy = ['pending', 'uploading', 'analyzing'].includes(item.status);
                    return (
                        <div key={item.tempId} className={cx('rounded-card border p-3 transition-colors duration-quick ease-out', item.status === 'saved' ? 'border-success bg-success-soft' : 'border-line bg-surface')}>
                            <div className="flex items-start gap-3">
                                {/* Preview */}
                                <div className="relative grid h-16 w-16 flex-none place-items-center overflow-hidden rounded-control border border-line bg-surface-2">
                                    {item.previewUrl ? (
                                        <img src={item.previewUrl} alt="" className="h-full w-full object-cover" />
                                    ) : (
                                        <DocumentTextIcon className="h-7 w-7 text-ink-3" />
                                    )}
                                    {busy && item.status !== 'pending' && <span className="exp-scan" aria-hidden="true" />}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2">
                                        <p className="min-w-0 flex-1 truncate text-sm font-semibold text-ink" title={item.file.name}>{item.vendor || item.file.name}</p>
                                        {statusChip(item)}
                                    </div>
                                    {busy ? (
                                        <p className="mt-1 flex items-center gap-2 text-sm text-ink-3">
                                            <Spinner className="h-4 w-4" />
                                            {item.status === 'pending' ? 'Waiting for its turn…' : item.status === 'uploading' ? 'Uploading…' : 'Reading receipt…'}
                                        </p>
                                    ) : item.status === 'error' ? (
                                        <p className="mt-1 text-sm text-danger">{item.error || 'Unknown error'}</p>
                                    ) : (
                                        <p className="num mt-1 truncate text-sm text-ink-3">{item.file.name}</p>
                                    )}
                                </div>
                                {item.status === 'saved' ? (
                                    <CheckCircleIcon className="m-3 h-6 w-6 flex-none text-success" />
                                ) : (
                                    <IconButton
                                        label={`Remove ${item.file.name}`}
                                        icon={<TrashIcon />}
                                        onClick={() => handleRemoveItem(item.tempId)}
                                        disabled={['uploading', 'analyzing'].includes(item.status)}
                                        className="-me-1 -mt-1 hover:text-danger [&_svg]:h-5 [&_svg]:w-5"
                                    />
                                )}
                            </div>

                            {/* Editable Fields for Ready/Saved Items */}
                            {(item.status === 'ready' || item.status === 'saved') && (
                                <fieldset disabled={item.status === 'saved'} className={cx('m-0 mt-3 grid min-w-0 grid-cols-2 gap-3 border-0 p-0 sm:grid-cols-3', item.status === 'saved' && 'opacity-70')}>
                                    <Field label="Supplier" htmlFor={`vendor-${item.tempId}`} className="col-span-2 sm:col-span-1">
                                        {ids => (
                                            <div className={controlFrame()}>
                                                <input
                                                    id={ids.id}
                                                    type="text"
                                                    value={item.vendor || ''}
                                                    onChange={(e) => handleUpdateItem(item.tempId, { vendor: e.target.value })}
                                                    className={controlInput}
                                                    placeholder="Supplier name"
                                                />
                                            </div>
                                        )}
                                    </Field>
                                    <Field label="Date" htmlFor={`date-${item.tempId}`} className="col-span-2 sm:col-span-1">
                                        <UkDateInput
                                            id={`date-${item.tempId}`}
                                            value={item.date || ''}
                                            onChange={(e) => handleUpdateItem(item.tempId, { date: e.target.value })}
                                        />
                                    </Field>
                                    <Field label="Category" htmlFor={`cat-${item.tempId}`} className="col-span-2 sm:col-span-1">
                                        <Select
                                            id={`cat-${item.tempId}`}
                                            value={item.category || ''}
                                            onChange={(e) => handleUpdateItem(item.tempId, { category: e.target.value })}
                                        >
                                            {expenseCategories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                                        </Select>
                                    </Field>
                                    <Field label="Total" htmlFor={`amt-${item.tempId}`}>
                                        <CurrencyInput
                                            id={`amt-${item.tempId}`}
                                            value={item.amountStr}
                                            onChange={(e) => handleUpdateItem(item.tempId, { amountStr: e.target.value })}
                                        />
                                    </Field>
                                    <Field label="VAT" htmlFor={`vat-${item.tempId}`}>
                                        <CurrencyInput
                                            id={`vat-${item.tempId}`}
                                            value={item.vatStr}
                                            onChange={(e) => handleUpdateItem(item.tempId, { vatStr: e.target.value })}
                                        />
                                    </Field>
                                    <div className="col-span-2 flex flex-col gap-1.5 sm:col-span-1">
                                        <span className="text-sm font-semibold leading-5 text-ink">Paid</span>
                                        <Segmented
                                            ariaLabel="How it was paid"
                                            full
                                            value={(item.paymentType || 'Direct') as 'Direct' | 'On Account'}
                                            onChange={v => handleUpdateItem(item.tempId, { paymentType: v })}
                                            options={[{ value: 'Direct', label: 'Direct' }, { value: 'On Account', label: 'On account' }]}
                                        />
                                    </div>
                                </fieldset>
                            )}
                        </div>
                    );
                })}
            </div>

            <footer className="flex flex-shrink-0 flex-col-reverse gap-2 border-t border-line bg-surface px-4 py-3 sm:flex-row sm:justify-end sm:px-5">
                {overallStatus === 'complete' ? (
                    <Button onClick={onClose}>Done</Button>
                ) : (
                    <>
                        <Button variant="secondary" onClick={onClose} disabled={isProcessing}>
                            Cancel
                        </Button>
                        <Button
                            onClick={handleConfirmAll}
                            disabled={isProcessing || readyCount === 0}
                            loading={overallStatus === 'saving'}
                            icon={<CheckCircleIcon />}
                        >
                            {overallStatus === 'saving' ? 'Saving…' : `Save ${readyCount} receipt${readyCount !== 1 ? 's' : ''}`}
                        </Button>
                    </>
                )}
            </footer>
        </div>
    );
};

export default BulkReceiptWizard;
