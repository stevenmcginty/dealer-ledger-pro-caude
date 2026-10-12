import React, { useState, useEffect, useRef } from 'react';
import { Receipt, NewReceipt, ReceiptUpdate, ExpenseCategory } from '../../types';
import { uploadFile } from '../../services/dataService';
import * as ai from '../../utils/ai';
import { robustDateParser, compressImage, formatBytes } from '../../utils/helpers';
import { XMarkIcon, CameraIcon, ArrowUpTrayIcon, TrashIcon, ArrowDownTrayIcon, CheckCircleIcon, DocumentTextIcon, ScanIcon } from '../icons';
import Spinner from '../common/Spinner';
import CurrencyInput from '../common/CurrencyInput';
import { useData } from '../../hooks/useData';
import UkDateInput from '../common/UkDateInput';
import Select from '../common/Select';
import { useToast, Button, IconButton, Field, Segmented, Alert, buttonClasses } from '../ui';
import { controlFrame, controlInput, cx } from '../ui/cx';
import './expenses.css';

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

/** Fields the receipt reader filled in. Each one is tagged until it is touched. */
type ReadField = 'vendor' | 'amount' | 'vat' | 'date' | 'category';

const progressMessage = (progress: ScanProgress): string => {
    switch (progress.step) {
        case 'compressing':
            return `Getting the photo ready${progress.originalSize ? ` (${formatBytes(progress.originalSize)})` : ''}…`;
        case 'uploading':
        case 'analyzing':
            return 'Reading receipt…';
        case 'success':
            return 'Receipt read. Check the details below.';
        default:
            return progress.message;
    }
};

const ReadTag = () => (
    <span className="inline-flex flex-none items-center gap-1 rounded-chip bg-accent-soft px-1.5 py-0.5 text-xs font-semibold leading-4 text-accent-soft-ink">
        <ScanIcon className="h-3.5 w-3.5" aria-hidden="true" />
        From receipt
    </span>
);

/** Registration marks in the four corners of the capture frame, like a print proof. */
const FrameCorners = () => (
    <span aria-hidden="true" className="pointer-events-none absolute inset-3">
        <span className="absolute start-0 top-0 h-5 w-5 rounded-ss-[6px] border-s-2 border-t-2 border-ink-3" />
        <span className="absolute end-0 top-0 h-5 w-5 rounded-se-[6px] border-e-2 border-t-2 border-ink-3" />
        <span className="absolute bottom-0 start-0 h-5 w-5 rounded-es-[6px] border-b-2 border-s-2 border-ink-3" />
        <span className="absolute bottom-0 end-0 h-5 w-5 rounded-ee-[6px] border-b-2 border-e-2 border-ink-3" />
    </span>
);

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
    // Display only: which fields the reader filled, the last scan error, and drag-over state.
    const [readFields, setReadFields] = useState<Set<ReadField>>(new Set());
    const [scanError, setScanError] = useState<string | null>(null);
    const [dragOver, setDragOver] = useState(false);
    const cameraInputRef = useRef<HTMLInputElement>(null);
    const shutterInputRef = useRef<HTMLInputElement>(null);

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

    const touch = (field: ReadField) => setReadFields(prev => {
        if (!prev.has(field)) return prev;
        const next = new Set(prev);
        next.delete(field);
        return next;
    });

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
        if (name === 'vendor' || name === 'date' || name === 'category') touch(name);
    };

    const handleCalculateVat = () => {
        const total = parseFloat(amountStr);
        if (!isNaN(total) && total > 0) {
            const vat = total / 6;
            setVatStr(vat.toFixed(2));
            touch('vat');
        }
    };

    const runScan = async (file: File) => {
        if(!file) return;
        if (previewUrl && previewUrl.startsWith('blob:')) URL.revokeObjectURL(previewUrl);
        setPreviewUrl(URL.createObjectURL(file));
        setFileType(file.type);
        setScanError(null);
        setReadFields(new Set());

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

                        const paymentTypeCounts = vendorReceipts.reduce((acc, r) => { acc[r.paymentType] = (acc[r.paymentType] || 0) + 1; return acc; }, {} as Record<string, number>);
                        const mostCommonPaymentType = Object.keys(paymentTypeCounts).length > 0 ? Object.keys(paymentTypeCounts).reduce((a, b) => paymentTypeCounts[a] > paymentTypeCounts[b] ? a : b) : null;
                        if (mostCommonPaymentType) suggestedPaymentType = mostCommonPaymentType as 'Direct' | 'On Account';
                    }
                }

                const parsedDate = scanResult.date ? robustDateParser(scanResult.date) || prev.date : prev.date;
                return { ...prev, receiptUrl, vendor: scanResult.vendor || prev.vendor, date: parsedDate, category: suggestedCategory, paymentType: suggestedPaymentType };
            });
            setAmountStr(String(totalAmount || ''));
            setVatStr(String(parseFloat(potentialVat.toFixed(2)) || ''));
            const read = new Set<ReadField>();
            if (scanResult.vendor) read.add('vendor');
            if (totalAmount) read.add('amount');
            if (potentialVat) read.add('vat');
            if (scanResult.date && robustDateParser(scanResult.date)) read.add('date');
            if (scanResult.category) read.add('category');
            setReadFields(read);
            setScanProgress({ step: 'success', message: 'Success!' });
        } catch (error: any) {
            console.error("Scan failed", error);
            const msg = error instanceof Error ? error.message : 'An unknown error occurred.';
            setScanProgress({ step: 'error', message: msg });
            setScanError(msg);
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

    const onPicked = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) runScan(e.target.files[0]);
        e.target.value = '';
    };

    const onDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setDragOver(false);
        const file = e.dataTransfer.files?.[0];
        if (file && !isScanning && (file.type.startsWith('image/') || file.type === 'application/pdf')) runScan(file);
    };

    const label = (text: string, field?: ReadField) => (
        <span className="flex items-center justify-between gap-2">
            {text}
            {field && readFields.has(field) && <ReadTag />}
        </span>
    );

    const wasRead = readFields.size > 0;

    return (
        <>
            <header className="sticky top-0 z-sticky flex items-start gap-3 border-b border-line bg-surface px-4 pb-3 pt-1 sm:pt-4">
                <div className="min-w-0 flex-1 pt-1.5">
                    <h2 className="text-[1.375rem] font-bold leading-7 tracking-[-0.01em] text-ink">{editingReceipt ? 'Edit expense' : 'New expense'}</h2>
                    {!editingReceipt && <p className="mt-0.5 text-sm text-ink-2">Snap the receipt. We fill in the rest.</p>}
                </div>
                <IconButton label="Close" icon={<XMarkIcon />} onClick={onClear} className="-me-2" />
            </header>

            <form id="expense-editor-form" onSubmit={handleSubmit} className="space-y-5 p-4">
                <input type="file" accept="image/*,application/pdf" ref={cameraInputRef} onChange={onPicked} className="hidden" />
                {/* Opens the camera straight away on phones; a normal picker elsewhere. */}
                <input type="file" accept="image/*" capture="environment" ref={shutterInputRef} onChange={onPicked} className="hidden" />

                {previewUrl ? (
                    <div className="overflow-hidden rounded-card border border-line bg-surface-2">
                        <div className="relative flex h-56 items-center justify-center overflow-hidden p-3">
                            {fileType === 'application/pdf' ? (
                                <span className="flex flex-col items-center gap-2 text-ink-2">
                                    <DocumentTextIcon className="h-12 w-12" />
                                    <span className="text-sm font-semibold">PDF receipt</span>
                                </span>
                            ) : (
                                <img src={previewUrl} alt="Receipt" className="max-h-full max-w-full rounded-control object-contain" />
                            )}
                            {isScanning && <span className="exp-scan" aria-hidden="true" />}
                        </div>
                        <div className="border-t border-line bg-surface px-1.5 pb-1.5 pt-2">
                            <p role="status" className="flex min-w-0 items-center gap-2 px-2 pb-1 text-sm font-semibold text-ink-2">
                                {isScanning ? (
                                    <><Spinner className="h-4 w-4 flex-none text-accent-text" /> {progressMessage(scanProgress)}</>
                                ) : scanProgress.step === 'success' ? (
                                    <><CheckCircleIcon className="h-5 w-5 flex-none text-success" /> {progressMessage(scanProgress)}</>
                                ) : (
                                    <><DocumentTextIcon className="h-5 w-5 flex-none text-ink-3" /> Receipt on file</>
                                )}
                            </p>
                            <span className="flex flex-wrap items-center">
                                <Button size="sm" variant="ghost" icon={<CameraIcon />} onClick={() => shutterInputRef.current?.click()} disabled={isScanning}>Retake</Button>
                                <Button size="sm" variant="ghost" icon={<ArrowUpTrayIcon />} onClick={() => cameraInputRef.current?.click()} disabled={isScanning}>File</Button>
                                {editingReceipt?.receiptUrl && (
                                    <a
                                        href={editingReceipt.receiptUrl}
                                        download={`Receipt-${editingReceipt.vendor}-${editingReceipt.date}.${fileType === 'application/pdf' ? 'pdf' : 'jpg'}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className={buttonClasses('ghost', 'sm')}
                                    >
                                        <ArrowDownTrayIcon /> Download
                                    </a>
                                )}
                            </span>
                        </div>
                    </div>
                ) : (
                    <div
                        onDragOver={e => { e.preventDefault(); if (!dragOver) setDragOver(true); }}
                        onDragLeave={() => setDragOver(false)}
                        onDrop={onDrop}
                        className={cx(
                            'relative rounded-card border bg-surface-2 px-6 py-7 transition-colors duration-quick ease-out',
                            dragOver ? 'border-accent bg-accent-soft' : 'border-line',
                        )}
                    >
                        <FrameCorners />
                        <div className="relative flex flex-col items-center gap-3 text-center">
                            <button
                                type="button"
                                onClick={() => shutterInputRef.current?.click()}
                                disabled={isScanning}
                                aria-label="Snap the receipt"
                                className="grid h-[72px] w-[72px] place-items-center rounded-full bg-accent text-on-accent shadow-[0_0_0_4px_rgb(var(--c-surface-2)),0_0_0_6px_rgb(var(--c-accent))] transition-[background-color,transform] duration-quick ease-out hover:bg-accent-hover active:scale-95 active:bg-accent-press active:duration-press disabled:opacity-60"
                            >
                                <CameraIcon className="h-8 w-8" />
                            </button>
                            <div>
                                <p className="text-base font-bold text-ink">Snap the receipt</p>
                                <p className="mt-0.5 text-sm text-ink-2">
                                    We read the supplier, date, total and VAT.
                                    <span className="hidden [@media(pointer:fine)]:inline"> Or drop a photo or PDF here.</span>
                                </p>
                            </div>
                            <Button size="sm" variant="secondary" icon={<ArrowUpTrayIcon />} onClick={() => cameraInputRef.current?.click()} disabled={isScanning}>
                                Choose a file
                            </Button>
                        </div>
                    </div>
                )}

                {scanError && (
                    <Alert tone="danger" title="Couldn’t read that receipt" onDismiss={() => setScanError(null)}>
                        {scanError} Type the details below, or try another photo.
                    </Alert>
                )}

                <div className="space-y-4">
                    <h3 className="text-base font-bold text-ink">
                        {wasRead ? 'Check what we read' : editingReceipt ? 'Details' : 'Or type it in'}
                    </h3>

                    <Field label={label('Supplier', 'vendor')} htmlFor="vendor">
                        {ids => (
                            <div className={controlFrame()}>
                                <input id={ids.id} type="text" name="vendor" value={formData.vendor || ''} onChange={handleChange} required autoComplete="off" className={controlInput} />
                            </div>
                        )}
                    </Field>

                    {/* Sits under Supplier so it shows without scrolling; picked from the supplier's past expenses. */}
                    <div role="group" aria-labelledby="expense-paid-label" className="flex flex-col gap-1.5">
                        <span id="expense-paid-label" className="text-sm font-semibold leading-5 text-ink">How it was paid</span>
                        <Segmented
                            ariaLabel="How it was paid"
                            value={(formData.paymentType || 'Direct') as 'Direct' | 'On Account'}
                            onChange={v => setFormData(p => ({ ...p, paymentType: v }))}
                            options={[
                                { value: 'Direct', label: 'Paid direct' },
                                { value: 'On Account', label: 'On supplier account' },
                            ]}
                            full
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <Field label={label('Total', 'amount')} htmlFor="amount">
                            <CurrencyInput id="amount" value={amountStr} onChange={e => { setAmountStr(e.target.value); touch('amount'); }} required />
                        </Field>
                        <Field label={label('VAT', 'vat')} htmlFor="vat">
                            <CurrencyInput id="vat" value={vatStr} onChange={e => { setVatStr(e.target.value); touch('vat'); }} />
                        </Field>
                    </div>
                    <div className="-mt-2 flex justify-end">
                        <button
                            type="button"
                            onClick={handleCalculateVat}
                            className="min-h-[40px] rounded-control px-1 text-sm font-semibold text-accent-text underline-offset-4 hover:underline [@media(pointer:coarse)]:min-h-[48px]"
                            aria-label="Calculate 20% VAT from total amount"
                        >
                            Work out 20% VAT from the total
                        </button>
                    </div>

                    <Field label={label('Date', 'date')} htmlFor="date">
                        <UkDateInput id="date" name="date" value={formData.date || ''} onChange={e => handleChange(e)} required />
                    </Field>

                    <Field label={label('Category', 'category')} htmlFor="category">
                        <Select id="category" name="category" value={formData.category} onChange={handleChange}>
                            {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                        </Select>
                    </Field>
                </div>

                {editingReceipt && (
                    <div className="border-t border-line pt-3">
                        <button
                            type="button"
                            onClick={handleDelete}
                            disabled={isSubmitting}
                            className="inline-flex min-h-[48px] items-center gap-2 rounded-control px-2 text-base font-semibold text-danger transition-colors duration-quick ease-out hover:bg-danger-soft disabled:opacity-50"
                        >
                            <TrashIcon className="h-5 w-5" />
                            Delete expense
                        </button>
                    </div>
                )}
            </form>

            <footer className="sticky bottom-0 z-sticky mt-auto grid flex-shrink-0 grid-cols-[auto_1fr] gap-2 border-t border-line bg-surface px-4 py-3 sm:flex sm:justify-end">
                <Button variant="secondary" onClick={onClear}>Cancel</Button>
                <Button type="submit" form="expense-editor-form" disabled={isScanning} loading={isSubmitting}>
                    Save expense
                </Button>
            </footer>
        </>
    );
};

export default ExpenseEditor;
