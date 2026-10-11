
import React, { useState, useRef } from 'react';
import JSZip from 'jszip';
import { useData } from '../../hooks/useData';
import * as dataService from '../../services/dataService';
import { ArrowUpTrayIcon } from '../icons';
import Spinner from '../common/Spinner';
import { Alert, Button } from '../ui';
import { ProgressBar } from '../settings/SettingsKit';

interface RestoreDrawerProps {
    onClose: () => void;
    companyId: string;
    userId: string;
}

const RestoreDrawer = ({ onClose, companyId, userId }: RestoreDrawerProps) => {
    const { batchRestore } = useData();
    const [status, setStatus] = useState<'idle' | 'uploading' | 'restoring' | 'success' | 'error'>('idle');
    const [message, setMessage] = useState('');
    const [progress, setProgress] = useState(0);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setStatus('uploading');
        setMessage('Reading the archive…');

        try {
            const zip = await JSZip.loadAsync(file);
            const manifestFile = zip.file("manifest.json");
            
            if (!manifestFile) {
                throw new Error("This isn't a filing cabinet archive: it has no manifest.json.");
            }

            const manifestContent = await manifestFile.async("string");
            const manifest = JSON.parse(manifestContent);
            
            setMessage(`Found ${manifest.items.length} items. Uploading files…`);
            
            let restoredCount = 0;
            const totalFiles = manifest.items.filter((i: any) => i.zipPath).length;

            // 1. Re-upload files
            for (const item of manifest.items) {
                if (item.zipPath) {
                    const fileData = await zip.file(item.zipPath)?.async("blob");
                    if (fileData) {
                        // Re-upload to firebase storage
                        // We use original filename if possible or fallback
                        const originalName = item.fileName || 'restored_file';
                        // Note: uploadFile generates a unique name with timestamp, which is good to avoid collisions
                        const newUrl = await dataService.uploadBlob(companyId, userId, fileData, 'restored', originalName);
                        
                        // Update item data with new URL
                        if (item.type === 'receipt') {
                            item.data.receiptUrl = newUrl;
                        } else if (item.type === 'purchaseInvoice') {
                            item.data.invoiceUrl = newUrl;
                        }
                        restoredCount++;
                        setProgress(Math.round((restoredCount / totalFiles) * 100));
                    }
                }
            }

            setMessage('Restoring records…');
            setStatus('restoring');
            await batchRestore(manifest);

            setStatus('success');
            setMessage(`Restored ${manifest.items.length} items.`);

        } catch (error: any) {
            console.error("Restore failed", error);
            setStatus('error');
            setMessage(error.message || "Couldn't read the archive file.");
        }
    };

    return (
        <div className="flex flex-col px-5 pb-5 pt-2 sm:pt-5">
            <h2 className="text-[1.375rem] font-bold leading-7 tracking-[-0.01em] text-ink">Restore an archive</h2>
            <p className="mt-1 text-sm leading-5 text-ink-2">
                Puts receipts, invoices and sales documents from an archive ZIP back into the filing cabinet.
            </p>

            {status === 'idle' && (
                <>
                    <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="mt-5 flex min-h-[160px] flex-col items-center justify-center gap-2 rounded-card border-2 border-dashed border-line-strong bg-bg p-6 text-center transition-colors duration-quick ease-out hover:border-accent hover:bg-accent-soft"
                    >
                        <ArrowUpTrayIcon className="h-8 w-8 text-ink-2" />
                        <span className="text-base font-semibold text-ink">Choose an archive ZIP</span>
                        <span className="text-sm text-ink-3">The file Archive saved, named <span className="font-mono">Archive_YYYY-MM-DD.zip</span></span>
                    </button>
                    <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileChange}
                        accept=".zip"
                        className="hidden"
                    />
                </>
            )}

            {(status === 'uploading' || status === 'restoring') && (
                <div className="mt-5 space-y-3 rounded-control border border-line bg-bg p-4" role="status">
                    <p className="flex items-center gap-3 font-semibold text-ink"><Spinner className="h-5 w-5 text-accent-text" /> {message}</p>
                    {status === 'uploading' && <ProgressBar value={progress} label={message} />}
                </div>
            )}

            {status === 'success' && (
                <div className="mt-5 space-y-4">
                    <Alert tone="success" title="Restored">{message}</Alert>
                    <Button variant="secondary" onClick={onClose} block>Done</Button>
                </div>
            )}

            {status === 'error' && (
                <div className="mt-5 space-y-4">
                    <Alert tone="danger" title="Restore didn't finish">{message}</Alert>
                    <Button variant="secondary" onClick={() => setStatus('idle')} block>Try another file</Button>
                </div>
            )}
        </div>
    );
};

export default RestoreDrawer;
