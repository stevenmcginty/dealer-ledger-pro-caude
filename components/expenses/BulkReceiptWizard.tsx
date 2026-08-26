
import React, { useState, useEffect } from 'react';
import { NewReceipt, ExpenseCategory, Receipt } from '../../types';
import * as ai from '../../utils/ai';
import * as dataService from '../../services/dataService';
import { compressImage, robustDateParser } from '../../utils/helpers';
import { XMarkIcon, CheckCircleIcon, ExclamationTriangleIcon, TrashIcon, DocumentTextIcon, CameraIcon } from '../icons';
import Spinner from '../common/Spinner';
import CurrencyInput from '../common/CurrencyInput';
import UkDateInput from '../common/UkDateInput';
import Select from '../common/Select';

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

    return (
        <div className="w-full flex flex-col h-full max-h-[90vh]">
            <header className="p-4 border-b border-gray-700 flex items-center justify-between bg-gray-800 flex-shrink-0">
                <div>
                    <h2 className="text-lg font-bold text-white">Bulk Receipt Upload</h2>
                    <p className="text-sm text-gray-400">
                        {overallStatus === 'analyzing' ? `Processing ${pendingCount} files...` : 
                         overallStatus === 'review' ? `Review ${readyCount} receipts` :
                         overallStatus === 'saving' ? 'Saving receipts...' : 'Upload Complete'}
                    </p>
                </div>
                <button onClick={onClose} className="p-1 rounded-full text-gray-400 hover:bg-gray-700 hover:text-white"><XMarkIcon className="h-6 w-6" /></button>
            </header>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {items.length === 0 && (
                    <div className="text-center py-10 text-gray-400">No files selected.</div>
                )}

                {items.map((item) => (
                    <div key={item.tempId} className={`bg-gray-700/30 border border-gray-600 rounded-lg p-4 transition-colors ${item.status === 'saved' ? 'border-green-600/50 bg-green-900/10' : ''}`}>
                        <div className="flex flex-col md:flex-row gap-4">
                            {/* Preview Section */}
                            <div className="w-full md:w-24 h-24 flex-shrink-0 bg-gray-800 rounded-md flex items-center justify-center overflow-hidden border border-gray-600">
                                {item.previewUrl ? (
                                    <img src={item.previewUrl} alt="Preview" className="w-full h-full object-cover" />
                                ) : (
                                    <div className="text-center p-2">
                                        <DocumentTextIcon className="h-8 w-8 text-gray-500 mx-auto" />
                                        <span className="text-[10px] text-gray-400 block mt-1 truncate max-w-[80px]">{item.file.name}</span>
                                    </div>
                                )}
                            </div>

                            {/* Status Overlay for Processing */}
                            {['pending', 'uploading', 'analyzing'].includes(item.status) ? (
                                <div className="flex-1 flex items-center justify-center text-gray-400 gap-2">
                                    <Spinner />
                                    <span>{item.status === 'pending' ? 'Waiting...' : item.status === 'uploading' ? 'Uploading...' : 'AI Analyzing...'}</span>
                                </div>
                            ) : item.status === 'error' ? (
                                <div className="flex-1 text-red-400 flex flex-col justify-center">
                                    <div className="flex items-center gap-2 font-semibold"><ExclamationTriangleIcon className="h-5 w-5"/> Analysis Failed</div>
                                    <p className="text-xs mt-1">{item.error || 'Unknown error'}</p>
                                    <button onClick={() => handleRemoveItem(item.tempId)} className="mt-2 text-xs text-red-300 hover:text-white underline text-left">Remove</button>
                                </div>
                            ) : (
                                /* Editable Fields for Ready/Saved Items */
                                <div className={`flex-1 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 ${item.status === 'saved' ? 'opacity-60 pointer-events-none' : ''}`}>
                                    <div>
                                        <label className="block text-xs font-medium text-gray-400 mb-1">Vendor</label>
                                        <input 
                                            type="text" 
                                            value={item.vendor || ''} 
                                            onChange={(e) => handleUpdateItem(item.tempId, { vendor: e.target.value })}
                                            className="w-full bg-gray-900 border-gray-600 rounded text-sm px-2 py-1.5 text-white"
                                            placeholder="Vendor Name"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-gray-400 mb-1">Date</label>
                                        <UkDateInput 
                                            id={`date-${item.tempId}`} 
                                            value={item.date || ''} 
                                            onChange={(e) => handleUpdateItem(item.tempId, { date: e.target.value })} 
                                            className="text-sm"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-gray-400 mb-1">Category</label>
                                        <Select 
                                            value={item.category || ''} 
                                            onChange={(e) => handleUpdateItem(item.tempId, { category: e.target.value })}
                                            className="w-full bg-gray-900 border-gray-600 rounded text-sm px-2 py-1.5 text-white"
                                        >
                                            {expenseCategories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                                        </Select>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-gray-400 mb-1">Total Amount</label>
                                        <CurrencyInput 
                                            id={`amt-${item.tempId}`} 
                                            value={item.amountStr} 
                                            onChange={(e) => handleUpdateItem(item.tempId, { amountStr: e.target.value })}
                                            className="bg-gray-900"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-gray-400 mb-1">VAT</label>
                                        <CurrencyInput 
                                            id={`vat-${item.tempId}`} 
                                            value={item.vatStr} 
                                            onChange={(e) => handleUpdateItem(item.tempId, { vatStr: e.target.value })}
                                            className="bg-gray-900"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-gray-400 mb-1">Type</label>
                                        <div className="flex bg-gray-900 rounded p-0.5">
                                            <button 
                                                onClick={() => handleUpdateItem(item.tempId, { paymentType: 'Direct' })}
                                                className={`flex-1 text-xs py-1 rounded ${item.paymentType === 'Direct' ? 'bg-gray-600 text-white' : 'text-gray-400 hover:text-gray-300'}`}
                                            >Direct</button>
                                            <button 
                                                onClick={() => handleUpdateItem(item.tempId, { paymentType: 'On Account' })}
                                                className={`flex-1 text-xs py-1 rounded ${item.paymentType === 'On Account' ? 'bg-gray-600 text-white' : 'text-gray-400 hover:text-gray-300'}`}
                                            >On Acct</button>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Actions Column */}
                            <div className="w-full md:w-10 flex md:flex-col justify-center gap-2 border-t md:border-t-0 md:border-l border-gray-600 pt-2 md:pt-0 md:pl-2">
                                {item.status === 'saved' ? (
                                    <div className="text-green-400 text-center"><CheckCircleIcon className="h-6 w-6 mx-auto"/></div>
                                ) : (
                                    <button 
                                        onClick={() => handleRemoveItem(item.tempId)}
                                        className="p-2 text-gray-400 hover:text-red-400 rounded hover:bg-gray-700/50"
                                        title="Remove"
                                        disabled={['uploading', 'analyzing'].includes(item.status)}
                                    >
                                        <TrashIcon className="h-5 w-5 mx-auto" />
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            <footer className="p-4 border-t border-gray-700 bg-gray-800 flex justify-end gap-3 flex-shrink-0">
                {overallStatus === 'complete' ? (
                    <button onClick={onClose} className="px-6 py-2 text-sm font-bold text-white bg-green-600 hover:bg-green-700 rounded-md shadow-sm">
                        Done
                    </button>
                ) : (
                    <>
                        <button onClick={onClose} disabled={isProcessing} className="px-4 py-2 text-sm font-medium text-gray-300 bg-gray-600 hover:bg-gray-500 rounded-md disabled:opacity-50">
                            Cancel
                        </button>
                        <button 
                            onClick={handleConfirmAll} 
                            disabled={isProcessing || readyCount === 0 || overallStatus === 'saving'} 
                            className="inline-flex items-center gap-2 px-6 py-2 text-sm font-bold text-white bg-brand-600 hover:bg-brand-700 rounded-md shadow-sm disabled:opacity-50"
                        >
                            {overallStatus === 'saving' ? <Spinner className="h-4 w-4 text-white"/> : <CheckCircleIcon className="h-5 w-5" />}
                            {overallStatus === 'saving' ? 'Saving...' : `Confirm & Save ${readyCount} Receipts`}
                        </button>
                    </>
                )}
            </footer>
        </div>
    );
};

export default BulkReceiptWizard;
