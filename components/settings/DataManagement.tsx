
import React, { useState, useRef } from 'react';
import JSZip from 'jszip';
import * as dataService from '../../services/dataService';
import { useData } from '../../hooks/useData';
import { useUI } from '../../hooks/useUI';
import { ArrowDownTrayIcon, ArrowUpTrayIcon, CheckCircleIcon, DocumentTextIcon, ExclamationTriangleIcon, TrashIcon } from '../icons';
import Spinner from '../common/Spinner';
import { formatDate } from '../../utils/helpers';
import { Button, EmptyState, IconButton } from '../ui';
import { Panel, PanelSection, ProgressBar, dangerQuiet } from './SettingsKit';

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
            setProgress({ step: 'complete', message: 'Backup downloaded.' });
        } catch (error: any) {
            setProgress({ step: 'error', message: error.message || "Couldn't make the backup." });
        } finally {
            setTimeout(() => setProgress({ step: 'idle', message: '' }), 4000);
        }
    };

    const handleDataRestore = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file || !companyId) return;
        
        if (!window.confirm("Restore from this backup? It replaces all the data in this ledger. You can't undo this.")) {
            if(restoreInputRef.current) restoreInputRef.current.value = "";
            return;
        }
        
        setProgress({ step: 'restoring', message: 'Restoring data from backup...' });
        try {
            const text = await file.text();
            const data = JSON.parse(text);
            await dataService.restoreDataFromBackup(companyId, data);
            setProgress({ step: 'complete', message: 'Restored. The app will reload in a moment.' });
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
    
        setProgress({ step: 'complete', message: 'Files downloaded.' });
        setTimeout(() => setProgress({ step: 'idle', message: '' }), 3000);
    };
    
    const isWorking = progress.step !== 'idle' && progress.step !== 'complete' && progress.step !== 'error';

    const handleResequence = async () => {
        setProgress({ step: 'preparing', message: 'Re-sequencing stock numbers...' });
        try {
            await resequenceStockNumbers();
            setProgress({ step: 'complete', message: 'Stock numbers updated.' });
        } catch (error: any) {
            setProgress({ step: 'error', message: error.message || "Couldn't update the stock numbers." });
        } finally {
            setTimeout(() => setProgress({ step: 'idle', message: '' }), 4000);
        }
    };
    
    const onResequenceClick = () => {
        openModal('resequenceConfirm', { onConfirm: handleResequence });
    };

    const handleDeleteCategory = async (category: 'receipts' | 'vehicles', label: string) => {
        if (window.confirm(`Delete ALL ${label}? Every record and file goes. You can't undo this.`)) {
            if (window.confirm(`Last check: delete all ${label} for good?`)) {
                setProgress({ step: 'deleting', message: `Deleting all ${label}...` });
                try {
                    await deleteDataAndFilesByCategories([category]);
                    setProgress({ step: 'complete', message: `All ${label} deleted.` });
                } catch (error: any) {
                    setProgress({ step: 'error', message: `Couldn't delete ${label}: ${error.message}` });
                } finally {
                    setTimeout(() => setProgress({ step: 'idle', message: '' }), 4000);
                }
            }
        }
    };

    const showCount = progress.total !== undefined && progress.total > 0 && progress.current !== undefined;

    return (
        <div className="space-y-6">
            {progress.step !== 'idle' && (
                <div
                    role={progress.step === 'error' ? 'alert' : 'status'}
                    className={`rounded-card border p-4 ${progress.step === 'error' ? 'border-danger bg-danger-soft text-danger-ink' : progress.step === 'complete' ? 'border-success bg-success-soft text-success-ink' : 'border-line bg-surface text-ink'}`}
                >
                    <div className="flex items-center gap-3">
                        {isWorking && <Spinner className="h-5 w-5 flex-none text-accent-text" />}
                        {progress.step === 'complete' && <CheckCircleIcon className="h-5 w-5 flex-none" />}
                        {progress.step === 'error' && <ExclamationTriangleIcon className="h-5 w-5 flex-none" />}
                        <p className="min-w-0 flex-1 font-semibold">{progress.message}</p>
                        {showCount && <p className="num flex-none text-sm opacity-80">{progress.current} of {progress.total}</p>}
                    </div>
                    {isWorking && showCount && (
                        <div className="mt-3">
                            <ProgressBar value={(progress.current! / progress.total!) * 100} label={progress.message} />
                        </div>
                    )}
                </div>
            )}

            <Panel ariaLabel="Statement uploads">
                <PanelSection
                    title="Statement uploads"
                    description="Each bank or card statement you've imported. Undo an import to remove all its lines."
                />
                {uploadBatches.length > 0 ? (
                    <ul className="m-0 list-none divide-y divide-line p-0">
                        {uploadBatches.map(batch => (
                            <li key={batch.id} className="flex items-center gap-3 py-2 pe-2 ps-4 sm:ps-5">
                                <DocumentTextIcon className="h-5 w-5 flex-none text-ink-3" />
                                <div className="min-w-0 flex-1 py-1">
                                    <p className="truncate font-semibold text-ink" title={batch.filename}>{batch.filename}</p>
                                    <p className="text-sm text-ink-3">
                                        <span className="num text-ink-2">{batch.transactionCount}</span> lines into {batch.accountName} · <span className="num">{formatDate(batch.uploadedAt)}</span>
                                    </p>
                                </div>
                                <IconButton
                                    label={`Undo the import of ${batch.filename}`}
                                    icon={<TrashIcon />}
                                    onClick={() => openModal('deleteUploadConfirm', batch)}
                                />
                            </li>
                        ))}
                    </ul>
                ) : (
                    <EmptyState
                        icon={<DocumentTextIcon />}
                        title="No statements imported yet"
                        description="Statements you upload on the Bank page are listed here, so you can undo one if it went to the wrong account."
                    />
                )}
            </Panel>

            <Panel ariaLabel="Backup and restore">
                <PanelSection
                    title="Back up"
                    description="Download a copy of every record, or every uploaded receipt and invoice file."
                >
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <Button variant="secondary" icon={<ArrowDownTrayIcon />} onClick={handleDataBackup} disabled={isWorking}>
                            Download data <span className="font-mono text-sm font-normal text-ink-3">.json</span>
                        </Button>
                        <Button variant="secondary" icon={<ArrowDownTrayIcon />} onClick={handleDownloadAllFiles} disabled={isWorking}>
                            Download files <span className="font-mono text-sm font-normal text-ink-3">.zip</span>
                        </Button>
                    </div>
                </PanelSection>
                <PanelSection
                    title="Restore"
                    description="Replaces all the data in this ledger with a backup file. You can't undo this."
                >
                    <input type="file" accept=".json" ref={restoreInputRef} onChange={handleDataRestore} className="hidden" />
                    <Button variant="secondary" icon={<ArrowUpTrayIcon />} onClick={() => restoreInputRef.current?.click()} disabled={isWorking} className="w-full sm:w-auto">
                        Restore from a backup file
                    </Button>
                </PanelSection>
            </Panel>

            <Panel ariaLabel="Stock numbers">
                <PanelSection
                    title="Stock numbers"
                    description="Re-numbers cars by purchase date, starting from 1000. Cars that already have a standard number keep it."
                    action={<Button variant="secondary" onClick={onResequenceClick} disabled={isWorking}>Re-number stock</Button>}
                />
            </Panel>

            <section aria-label="Delete everything" className="rounded-card border border-danger bg-surface">
                <PanelSection
                    tone="danger"
                    title="Delete everything in a category"
                    description="Every record and its files, all at once. You can't undo this; make a backup first."
                >
                    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                        <button type="button" onClick={() => handleDeleteCategory('receipts', 'Expenses & Receipts')} disabled={isWorking} className={dangerQuiet}>
                            <TrashIcon /> Delete all expenses
                        </button>
                        <button type="button" onClick={() => handleDeleteCategory('vehicles', 'Vehicles')} disabled={isWorking} className={dangerQuiet}>
                            <TrashIcon /> Delete all vehicles
                        </button>
                    </div>
                </PanelSection>
            </section>
        </div>
    );
};

export default DataManagement;
