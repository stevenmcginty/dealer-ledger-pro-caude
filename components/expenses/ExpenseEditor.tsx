
import React, { useState, useEffect, useRef } from 'react';
import { Receipt, NewReceipt, ReceiptUpdate, ExpenseCategory } from '../../types';
import { uploadFile } from '../../services/dataService';
import * as ai from '../../utils/ai';
import { robustDateParser, compressImage, formatBytes } from '../../utils/helpers';
import { XMarkIcon, CameraIcon, ArrowUpTrayIcon, TrashIcon, ArrowDownTrayIcon, CheckCircleIcon, DocumentTextIcon } from '../icons';
import Spinner from '../common/Spinner';
import CurrencyInput from '../common/CurrencyInput';
import { useData } from '../../hooks/useData';
import UkDateInput from '../common/UkDateInput';
import Select from '../common/Select';
import { useToast } from '../ui';

interface ExpenseEditorProps {
  companyId: string;
  userId: string;
  onSubmit: (data: NewReceipt | ReceiptUpdate, id?: string) => Promise<void>;
  editingReceipt: Receipt | null;
  prefillData?: Partial<NewReceipt>;
  imageFile?: File | null;
  onClear: () => void;
  categories: ExpenseCategory[];
  allReceipts: Receipt[];
}

type ScanStep = 'idle' | 'compressing' | 'uploading' | 'analyzing' | 'error' | 'success';
interface ScanProgress {
    step: ScanStep;
    message: string;
    originalSize?: number;
    compressedSize?: number;
}


const ScanProgressIndicator = ({ progress }: { progress: ScanProgress }) => {
    const progressMessage = () => {
        switch (progress.step) {
            case 'compressing':
                return `Compressing... ${progress.originalSize ? `(${formatBytes(progress.originalSize)})` : ''}`;
            case 'uploading':
                return `Uploading... ${progress.compressedSize ? `(${formatBytes(progress.compressedSize)})` : ''}`;
            case 'analyzing':
                return 'AI is analyzing the receipt...';
            default:
                return progress.message;
        }
    };

    return (
        <div className="absolute inset-0 bg-gray-900/90 backdrop-blur-md flex flex-col justify-center items-center z-20 p-4 text-center">
             <div className="w-full max-w-sm bg-gray-800 p-8 rounded-2xl shadow-2xl">
                <h3 className="text-xl font-bold text-white mb-6">
                    {progress.step === 'success' ? 'Scan Complete!' : 'Scanning Receipt'}
                </h3>
                {progress.step !== 'error' && progress.step !== 'success' && <Spinner className="h-8 w-8 text-brand-500 mx-auto mb-4" />}
                <p className="text-gray-300 mb-6 h-5">{progressMessage()}</p>
                 {progress.step === 'error' && (
                     <div className="mt-2">
                        <div className="bg-red-900/50 border border-red-700 text-red-300 px-4 py-3 rounded-lg"><p className="font-bold">Scan Failed</p><p className="text-sm mt-1">{progress.message}</p></div>
                    </div>
                )}
            </div>
        </div>
    );
};

const ExpenseEditor = ({ companyId, userId, onSubmit, editingReceipt, prefillData, imageFile, onClear, categories, allReceipts }: ExpenseEditorProps) => {
    const { deleteReceipt } = useData();
    const toast = useToast();
    const [formData, setFormData] = useState<Partial<NewReceipt>>({});
    const [amountStr, setAmountStr] = useState('');
    const [vatStr, setVatStr] = useState('');
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [fileType, setFileType] = useState<string>('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [scanProgress, setScanProgress] = useState<ScanProgress>({ step: 'idle', message: '' });
    const cameraInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        let initialState: Partial<NewReceipt> = { date: new Date().toISOString().split('T')[0], category: categories[0]?.name || 'Other', paymentType: 'Direct' };
        let initialAmount = '';
        let initialVat = '';

        if (editingReceipt) {
            initialState = { ...initialState, ...editingReceipt };
            initialAmount = String(editingReceipt.amount || '');
            initialVat = String(editingReceipt.vat || '');
            if(editingReceipt.receiptUrl) {
                setPreviewUrl(editingReceipt.receiptUrl);
                if (editingReceipt.receiptUrl.toLowerCase().includes('.pdf')) {
                    setFileType('application/pdf');
                } else {
                    setFileType('image/jpeg');
                }
            }
        } else if (prefillData) {
            initialState = { ...initialState, ...prefillData };
            initialAmount = String(prefillData.amount || '');
            initialVat = String(prefillData.vat || '');
        }
        
        setFormData(initialState);
        setAmountStr(initialAmount);
        setVatStr(initialVat);
        
    }, [editingReceipt, prefillData, categories]);

    useEffect(() => {
        // Cleanup blob URL on component unmount or when previewUrl changes
        return () => {
            if (previewUrl && previewUrl.startsWith('blob:')) {
                URL.revokeObjectURL(previewUrl);
            }
        };
    }, [previewUrl]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleCalculateVat = () => {
        const total = parseFloat(amountStr);
        if (!isNaN(total) && total > 0) {
            const vat = total / 6;
            setVatStr(vat.toFixed(2));
        }
    };

    const runScan = async (file: File) => {
        if(!file) return;
        if (previewUrl && previewUrl.startsWith('blob:')) URL.revokeObjectURL(previewUrl);
        setPreviewUrl(URL.createObjectURL(file));
        setFileType(file.type);

        try {
            let fileToProcess = file;
            if (file.type.startsWith('image/')) {
                setScanProgress({ step: 'compressing', message: 'Processing file...', originalSize: file.size });
                fileToProcess = await compressImage(file, { maxWidth: 1024, quality: 0.8 });
            } else {
                setScanProgress({ step: 'compressing', message: 'Processing PDF...', originalSize: file.size });
            }
            
            setScanProgress(p => ({ ...p, step: 'uploading', message: 'Uploading...', compressedSize: fileToProcess.size }));
            
            const categoryNames = categories.map(c => c.name);

            const [scanResult, receiptUrl] = await Promise.all([
                ai.scanExpenseReceipt(fileToProcess, categoryNames),
                uploadFile(companyId, userId, fileToProcess, 'receipts')
            ]);
            
            setScanProgress(p => ({ ...p, step: 'analyzing', message: 'AI is analyzing...' }));

            const totalAmount = scanResult.amount || 0;
            let potentialVat = scanResult.vat || 0;
            
            if (totalAmount > 0 && potentialVat > 0 && potentialVat > totalAmount * 0.3) {
                 if (Math.round(potentialVat) === 20) potentialVat = totalAmount - (totalAmount / 1.2);
                 else if (Math.round(potentialVat) === 5) potentialVat = totalAmount - (totalAmount / 1.05);
            }

            setFormData(prev => {
                let suggestedCategory = scanResult.category || prev.category || categories[0]?.name || 'Other';
                let suggestedPaymentType = prev.paymentType || 'Direct';
                const vendorName = scanResult.vendor;

                if (vendorName && allReceipts.length > 0) {
                    const vendorReceipts = allReceipts.filter(r => r.vendor && r.vendor.toLowerCase() === vendorName.toLowerCase());
                    if (vendorReceipts.length > 0) {
                        // Use historical data as a fallback if AI doesn't provide a category
                        if (!scanResult.category) {
                            const categoryCounts = vendorReceipts.reduce((acc, r) => { acc[r.category] = (acc[r.category] || 0) + 1; return acc; }, {} as Record<string, number>);
                            const mostCommonCategory = Object.keys(categoryCounts).length > 0 ? Object.keys(categoryCounts).reduce((a, b) => categoryCounts[a] > categoryCounts[b] ? a : b) : null;
                            if (mostCommonCategory) suggestedCategory = mostCommonCategory;
                        }

                        const paymentTypeCounts = vendorReceipts.reduce((acc, r) => { acc[r.paymentType] = (acc[r.paymentType] || 0) + 1; return acc; }, {} as Record<'Direct' | 'On Account', number>);
                        const mostCommonPaymentType = Object.keys(paymentTypeCounts).length > 0 ? Object.keys(paymentTypeCounts).reduce((a, b) => paymentTypeCounts[a] > paymentTypeCounts[b] ? a : b) : null;
                        if (mostCommonPaymentType) suggestedPaymentType = mostCommonPaymentType as 'Direct' | 'On Account';
                    }
                }
        
                const parsedDate = scanResult.date ? robustDateParser(scanResult.date) || prev.date : prev.date;
                return { ...prev, receiptUrl, vendor: scanResult.vendor || prev.vendor, date: parsedDate, category: suggestedCategory, paymentType: suggestedPaymentType };
            });
            setAmountStr(String(totalAmount || ''));
            setVatStr(String(parseFloat(potentialVat.toFixed(2)) || ''));
            setScanProgress({ step: 'success', message: 'Success!' });
        } catch (error: any) {
            console.error("Scan failed", error);
            const msg = error instanceof Error ? error.message : 'An unknown error occurred.';
            setScanProgress({ step: 'error', message: msg });
            setPreviewUrl(null); // Clear preview on error
        } finally {
             setTimeout(() => setScanProgress({ step: 'idle', message: '' }), scanProgress.step === 'error' ? 5000 : 1500);
        }
    }
    
    useEffect(() => {
        if (imageFile && !editingReceipt) {
            runScan(imageFile);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [imageFile, editingReceipt]);


    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setIsSubmitting(true);
        const submissionData = {
            ...formData,
            amount: parseFloat(amountStr) || 0,
            vat: parseFloat(vatStr) || 0
        };
        await onSubmit(submissionData as NewReceipt, editingReceipt?.id);
        setIsSubmitting(false);
    };

    const handleDelete = async () => {
        if (editingReceipt && window.confirm("Are you sure you want to permanently delete this expense and its receipt? This action cannot be undone.")) {
            setIsSubmitting(true);
            try {
                await deleteReceipt(editingReceipt.id);
                onClear(); // This is closeModal
            } catch (error) {
                console.error("Failed to delete receipt:", error);
                toast.error("Could not delete the receipt. Please try again.");
            } finally {
                setIsSubmitting(false);
            }
        }
    };
    
    const isScanning = scanProgress.step !== 'idle' && scanProgress.step !== 'success' && scanProgress.step !== 'error';

    return (
        <>
            {scanProgress.step !== 'idle' && <ScanProgressIndicator progress={scanProgress} />}
            <header className="p-4 border-b border-gray-700 flex items-center justify-between sticky top-0 z-10 bg-gray-800">
                <h2 className="text-lg font-bold text-white">{editingReceipt ? 'Edit Expense' : 'Add New Expense'}</h2>
                <button onClick={onClear} className="p-1 rounded-full text-gray-400 hover:bg-gray-700"><XMarkIcon className="h-6 w-6" /></button>
            </header>
            <form id="expense-editor-form" onSubmit={handleSubmit} className="p-4 space-y-4">
                 <input type="file" accept="image/*,application/pdf" ref={cameraInputRef} onChange={e => e.target.files && runScan(e.target.files[0])} className="hidden" />
                {previewUrl ? (
                    <div className="text-center group relative">
                        {fileType === 'application/pdf' ? (
                            <div className="flex flex-col items-center justify-center p-8 bg-gray-700 rounded-lg h-40 w-full max-w-sm mx-auto border-2 border-dashed border-gray-600">
                                <DocumentTextIcon className="h-12 w-12 text-gray-400" />
                                <span className="text-sm text-gray-300 mt-2 font-medium">PDF Document</span>
                            </div>
                        ) : (
                            <img src={previewUrl} alt="Receipt preview" className="max-h-40 w-auto inline-block rounded-lg shadow-md" />
                        )}
                         <div className="absolute inset-0 bg-black/60 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity space-x-2">
                             <button type="button" onClick={() => cameraInputRef.current?.click()} disabled={isScanning} className="inline-flex items-center gap-2 py-2 px-4 text-sm font-semibold rounded-lg border border-gray-500 bg-gray-800/80 text-white hover:bg-gray-700">
                                {isScanning ? <Spinner /> : <><CameraIcon className="h-5 w-5" /> Change</>}
                            </button>
                             {editingReceipt?.receiptUrl && (
                                <a href={editingReceipt.receiptUrl} download={`Receipt-${editingReceipt.vendor}-${editingReceipt.date}.${fileType === 'application/pdf' ? 'pdf' : 'jpg'}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 py-2 px-4 text-sm font-semibold rounded-lg border border-gray-500 bg-gray-800/80 text-white hover:bg-gray-700">
                                    <ArrowDownTrayIcon className="h-5 w-5" /> Download
                                </a>
                            )}
                         </div>
                    </div>
                ) : (
                    <button type="button" onClick={() => cameraInputRef.current?.click()} disabled={isScanning} className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 text-sm font-semibold rounded-lg border border-gray-600 bg-gray-700 text-white hover:bg-gray-600 disabled:opacity-50">
                        {isScanning ? <Spinner /> : <><CameraIcon className="h-5 w-5" /> Upload or Scan Receipt</>}
                    </button>
                )}

                <div className="relative"><div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-700" /></div><div className="relative flex justify-center"><span className="bg-gray-800 px-2 text-sm text-gray-400">Or enter manually</span></div></div>
                <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2"><label htmlFor="vendor" className="block text-sm font-medium text-gray-300">Vendor</label><input type="text" name="vendor" value={formData.vendor || ''} onChange={handleChange} required className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md py-2 px-3 text-white" /></div>
                    <div><label htmlFor="amount" className="block text-sm font-medium text-gray-300">Total Amount</label><CurrencyInput id="amount" value={amountStr} onChange={e => setAmountStr(e.target.value)} required className="mt-1"/></div>
                    <div>
                        <div className="flex justify-between items-baseline">
                            <label htmlFor="vat" className="block text-sm font-medium text-gray-300">VAT</label>
                            <button
                                type="button"
                                onClick={handleCalculateVat}
                                className="text-xs text-brand-400 hover:text-brand-300 font-semibold"
                                aria-label="Calculate 20% VAT from total amount"
                            >
                                Calculate from total
                            </button>
                        </div>
                        <CurrencyInput id="vat" value={vatStr} onChange={e => setVatStr(e.target.value)} className="mt-1"/>
                    </div>
                    <div className="col-span-2"><label htmlFor="date" className="block text-sm font-medium text-gray-300">Date</label><UkDateInput id="date" name="date" value={formData.date || ''} onChange={handleChange} required className="mt-1" /></div>
                    <div className="col-span-2">
                        <label htmlFor="category" className="block text-sm font-medium text-gray-300">Category</label>
                        <Select name="category" value={formData.category} onChange={handleChange} wrapperClassName="mt-1">
                            {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                        </Select>
                    </div>
                </div>
                <div>
                     <label className="block text-sm font-medium text-gray-300">Payment Type</label>
                     <div className="mt-2 flex items-center space-x-2 rounded-lg bg-gray-700 p-1">
                        <button type="button" onClick={() => setFormData(p => ({...p, paymentType: 'Direct'}))} className={`flex-1 py-2 text-sm font-semibold rounded-md transition-colors ${formData.paymentType === 'Direct' ? 'bg-brand-600 text-white shadow' : 'text-gray-300 hover:bg-gray-600'}`}>Direct Payment</button>
                        <button type="button" onClick={() => setFormData(p => ({...p, paymentType: 'On Account'}))} className={`flex-1 py-2 text-sm font-semibold rounded-md transition-colors ${formData.paymentType === 'On Account' ? 'bg-brand-600 text-white shadow' : 'text-gray-300 hover:bg-gray-600'}`}>On Supplier Account</button>
                     </div>
                </div>
            </form>
            <footer className="flex-shrink-0 p-4 border-t border-gray-700 flex justify-between items-center bg-gray-800 sticky bottom-0 z-10">
                <div>
                    {editingReceipt && (
                        <button
                            type="button"
                            onClick={handleDelete}
                            disabled={isSubmitting}
                            className="inline-flex items-center px-4 py-2 border border-red-600/50 text-sm font-medium rounded-md shadow-sm text-red-400 hover:bg-red-600 hover:text-white disabled:opacity-50"
                        >
                            <TrashIcon className="h-5 w-5 mr-2 -ml-1" />
                            Delete Expense
                        </button>
                    )}
                </div>
                <div className="flex space-x-3">
                    <button type="button" onClick={onClear} className="px-4 py-2 text-sm font-medium text-gray-300 bg-gray-600 hover:bg-gray-500 rounded-md">Cancel</button>
                    <button type="submit" form="expense-editor-form" disabled={isSubmitting || isScanning} className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-50">
                        {isSubmitting ? <Spinner /> : (editingReceipt ? 'Update Expense' : 'Save Expense')}
                    </button>
                </div>
            </footer>
        </>
    );
};

export default ExpenseEditor;
