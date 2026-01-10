
import React, { useState, useRef } from 'react';
import JSZip from 'jszip';
import * as dataService from '../../services/dataService';
import { useData } from '../../hooks/useData';
import { useUI } from '../../hooks/useUI';
import { ArrowDownTrayIcon, ArrowUpTrayIcon, CheckCircleIcon, ExclamationTriangleIcon, TrashIcon } from '../icons';
import Spinner from '../common/Spinner';
import { formatDate } from '../../utils/helpers';
import { UploadBatch } from '../../types';

interface ProgressState {
    step: 'idle' | 'preparing' | 'fetching_files' | 'zipping' | 'deleting' | 'restoring' | 'complete' | 'error';
    message: string;
    current?: number;
    total?: number;
}


const DataManagement = () => {
    const { companyId, allReceipts, vehicles, uploadBatches, deleteUploadBatch, resequenceStockNumbers, deleteDataAndFilesByCategories } = useData();
    const { openModal } = useUI();
    const [progress, setProgress] = useState<ProgressState>({ step: 'idle', message: '' });
    const restoreInputRef = useRef<HTMLInputElement>(null);

    const handleDataBackup = async () => {
        if (!companyId) return;
        setProgress({ step: 'preparing', message: 'Gathering all your data...' });
        try {
            const allData = await dataService.getAllDataForBackup(companyId);
            const jsonString = JSON.stringify(allData, null, 2);
            const blob = new Blob([jsonString], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `dealer_ledger_backup_${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
            setProgress({ step: 'complete', message: 'Data backup downloaded successfully.' });
        } catch (error: any) {
            setProgress({ step: 'error', message: error.message || 'Failed to generate backup.' });
        } finally {
            setTimeout(() => setProgress({ step: 'idle', message: '' }), 4000);
        }
    };

    const handleDataRestore = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file || !companyId) return;
        
        if (!window.confirm("Are you sure you want to restore from this backup? This will completely overwrite all your current data and cannot be undone.")) {
            if(restoreInputRef.current) restoreInputRef.current.value = "";
            return;
        }
        
        setProgress({ step: 'restoring', message: 'Restoring data from backup...' });
        try {
            const text = await file.text();
            const data = JSON.parse(text);
            await dataService.restoreDataFromBackup(companyId, data);
            setProgress({ step: 'complete', message: 'Restore complete! The page will now reload.' });
            setTimeout(() => window.location.reload(), 2000);
        } catch (error: any) {
             setProgress({ step: 'error', message: error.message || 'Invalid backup file or restore failed.' });
             setTimeout(() => setProgress({ step: 'idle', message: '' }), 4000);
        }
        if(restoreInputRef.current) restoreInputRef.current.value = "";
    };

    const handleDownloadAllFiles = async () => {
        setProgress({ step: 'preparing', message: 'Finding all uploaded files...' });
        const filesToDownload: { url: string; folder: string; filename: string }[] = [];

        vehicles.forEach(v => { if (v.invoiceUrl) filesToDownload.push({ url: v.invoiceUrl, folder: 'Purchase Invoices', filename: `Purchase-${v.stockNumber}-${v.reg}` }); });
        allReceipts.forEach(r => { if (r.receiptUrl) filesToDownload.push({ url: r.receiptUrl, folder: 'Expense Receipts', filename: `Receipt-${r.vendor.replace(/[^\w]/g, '_')}-${r.date}` }); });
    
        if (filesToDownload.length === 0) {
            setProgress({ step: 'complete', message: 'No uploaded files found to download.' });
            setTimeout(() => setProgress({ step: 'idle', message: '' }), 3000);
            return;
        }
    
        const zip = new JSZip();
        for (const [index, file] of filesToDownload.entries()) {
            setProgress({ step: 'fetching_files', message: `Downloading ${index + 1}/${filesToDownload.length}`, current: index + 1, total: filesToDownload.length });
            try {
                const response = await fetch(file.url);
                if (response.ok) zip.file(`${file.folder}/${file.filename}`, await response.blob());
            } catch (e) { console.error(`Failed to fetch ${file.url}:`, e); }
        }
    
        setProgress({ step: 'zipping', message: 'Creating archive...', current: filesToDownload.length, total: filesToDownload.length });
        const content = await zip.generateAsync({ type: 'blob' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(content);
        link.download = `dealer_ledger_files_backup_${new Date().toISOString().split('T')[0]}.zip`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    
        setProgress({ step: 'complete', message: 'File archive downloaded!' });
        setTimeout(() => setProgress({ step: 'idle', message: '' }), 3000);
    };
    
    const isWorking = progress.step !== 'idle' && progress.step !== 'complete' && progress.step !== 'error';

    const handleResequence = async () => {
        setProgress({ step: 'preparing', message: 'Re-sequencing stock numbers...' });
        try {
            await resequenceStockNumbers();
            setProgress({ step: 'complete', message: 'Stock numbers have been successfully re-sequenced.' });
        } catch (error: any) {
            setProgress({ step: 'error', message: error.message || 'Failed to re-sequence stock numbers.' });
        } finally {
            setTimeout(() => setProgress({ step: 'idle', message: '' }), 4000);
        }
    };
    
    const onResequenceClick = () => {
        openModal('resequenceConfirm', { onConfirm: handleResequence });
    };

    const handleDeleteCategory = async (category: 'receipts' | 'vehicles', label: string) => {
        if (window.confirm(`DANGER: Are you sure you want to delete ALL ${label}? This includes all data records and associated files. This cannot be undone.`)) {
            if (window.confirm(`Double check: Really delete all ${label}?`)) {
                setProgress({ step: 'deleting', message: `Deleting all ${label}...` });
                try {
                    await deleteDataAndFilesByCategories([category]);
                    setProgress({ step: 'complete', message: `All ${label} have been deleted.` });
                } catch (error: any) {
                    setProgress({ step: 'error', message: `Failed to delete ${label}: ${error.message}` });
                } finally {
                    setTimeout(() => setProgress({ step: 'idle', message: '' }), 4000);
                }
            }
        }
    };

    return (
        <div className="space-y-8 max-w-3xl mx-auto">
            {progress.step !== 'idle' && (
                <div className="p-3 rounded-lg bg-gray-900/50">
                     <div className="flex items-center gap-3">
                        {isWorking && <Spinner className="h-5 w-5 text-brand-400"/>}
                        {progress.step === 'complete' && <CheckCircleIcon className="h-5 w-5 text-green-400" />}
                        {progress.step === 'error' && <ExclamationTriangleIcon className="h-5 w-5 text-red-400" />}
                        <div>
                            <p className={`font-semibold ${progress.step === 'error' ? 'text-red-400' : 'text-white'}`}>{progress.message}</p>
                            {progress.total && progress.total > 0 && progress.current !== undefined && <p className="text-xs text-gray-400">{progress.current} of {progress.total}</p>}
                        </div>
                    </div>
                    {isWorking && progress.total && progress.total > 0 && progress.current !== undefined && (
                        <div className="w-full bg-gray-700 rounded-full h-1.5 mt-2">
                            <div className="bg-brand-500 h-1.5 rounded-full" style={{ width: `${(progress.current / progress.total) * 100}%` }}></div>
                        </div>
                    )}
                </div>
            )}

            <div className="bg-gray-800 p-6 rounded-lg shadow-lg">
                 <h2 className="text-lg font-semibold text-white">Upload History</h2>
                 <p className="text-sm text-gray-400 mt-1">Manage your imported bank and credit card statements. You can undo an import to remove all its associated transactions.</p>
                 <div className="mt-4">
                    {uploadBatches.length > 0 ? (
                        <ul className="space-y-2">
                            {uploadBatches.map(batch => (
                                <li key={batch.id} className="flex items-center justify-between p-3 bg-gray-900/50 rounded-md">
                                    <div>
                                        <p className="font-semibold text-white truncate" title={batch.filename}>{batch.filename}</p>
                                        <p className="text-xs text-gray-400">{batch.transactionCount} transactions imported to '{batch.accountName}' on {formatDate(batch.uploadedAt)}</p>
                                    </div>
                                    <button onClick={() => openModal('deleteUploadConfirm', batch)} className="p-2 ml-4 rounded-full text-gray-400 hover:bg-red-800 hover:text-red-300 transition-colors" title="Delete this upload and its transactions">
                                        <TrashIcon className="h-5 w-5" />
                                    </button>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p className="text-sm text-gray-400 text-center py-4">No CSV uploads have been recorded yet.</p>
                    )}
                 </div>
            </div>

            <div className="bg-gray-800 p-6 rounded-lg shadow-lg">
                <h2 className="text-lg font-semibold text-white">Data Tools</h2>
                <div className="mt-4 border-t border-gray-700 pt-4">
                    <div className="flex justify-between items-center">
                        <div>
                            <h3 className="font-medium text-white">Re-sequence Stock Numbers</h3>
                            <p className="text-sm text-gray-400 mt-1">Re-assigns numerical stock numbers to vehicles based on purchase date, starting from 1000.</p>
                        </div>
                        <button onClick={onResequenceClick} disabled={isWorking} className="inline-flex items-center gap-x-2 rounded-md bg-yellow-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-yellow-500 disabled:opacity-50">
                            Re-sequence Stock
                        </button>
                    </div>
                </div>
            </div>

            <div className="bg-gray-800 p-6 rounded-lg shadow-lg">
                <h2 className="text-lg font-semibold text-white">Backup & Restore</h2>
                <p className="text-sm text-gray-400 mt-1">Manage your database records and uploaded files.</p>
                <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <button onClick={handleDataBackup} disabled={isWorking} className="inline-flex w-full justify-center items-center gap-x-2 rounded-md bg-brand-600 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-brand-500 disabled:opacity-50">
                        <ArrowDownTrayIcon className="h-5 w-5" /> Download Data Backup (.json)
                    </button>
                    <button onClick={handleDownloadAllFiles} disabled={isWorking} className="inline-flex w-full justify-center items-center gap-x-2 rounded-md bg-brand-600 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-brand-500 disabled:opacity-50">
                        <ArrowDownTrayIcon className="h-5 w-5" /> Download All Files (.zip)
                    </button>
                </div>
                 <div className="mt-4 border-t border-gray-700 pt-4">
                    <input type="file" accept=".json" ref={restoreInputRef} onChange={handleDataRestore} className="hidden" />
                    <button onClick={() => restoreInputRef.current?.click()} disabled={isWorking} className="inline-flex w-full justify-center items-center gap-x-2 rounded-md bg-gray-600 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-gray-500 disabled:opacity-50">
                        <ArrowUpTrayIcon className="h-5 w-5" /> Restore From Backup File
                    </button>
                     <p className="text-xs text-gray-500 mt-2 text-center">Warning: Restoring from a backup will overwrite all existing data.</p>
                </div>
            </div>

            <div className="bg-gray-800 p-6 rounded-lg shadow-lg border border-red-900/30">
                <div className="flex items-center gap-3">
                    <ExclamationTriangleIcon className="h-6 w-6 text-red-500" />
                    <h2 className="text-lg font-semibold text-red-400">Danger Zone</h2>
                </div>
                <p className="text-sm text-gray-400 mt-1 ml-9">Bulk delete entire categories of data. Use with extreme caution. This action cannot be undone.</p>
                
                <div className="mt-4 ml-9 flex flex-wrap gap-4">
                    <button 
                        onClick={() => handleDeleteCategory('receipts', 'Expenses & Receipts')} 
                        disabled={isWorking} 
                        className="inline-flex items-center gap-x-2 rounded-md bg-red-900/50 border border-red-800 px-4 py-2 text-sm font-semibold text-red-200 shadow-sm hover:bg-red-800 disabled:opacity-50"
                    >
                        <TrashIcon className="h-4 w-4" /> Delete All Expenses
                    </button>
                    <button 
                        onClick={() => handleDeleteCategory('vehicles', 'Vehicles')} 
                        disabled={isWorking} 
                        className="inline-flex items-center gap-x-2 rounded-md bg-red-900/50 border border-red-800 px-4 py-2 text-sm font-semibold text-red-200 shadow-sm hover:bg-red-800 disabled:opacity-50"
                    >
                        <TrashIcon className="h-4 w-4" /> Delete All Vehicles
                    </button>
                </div>
            </div>
        </div>
    );
};

export default DataManagement;
