
import React, { useState, useRef } from 'react';
import JSZip from 'jszip';
import { useData } from '../../hooks/useData';
import * as dataService from '../../services/dataService';
import { ArrowUpTrayIcon, CheckCircleIcon, ExclamationTriangleIcon } from '../icons';
import Spinner from '../common/Spinner';

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
        setMessage('Reading archive file...');

        try {
            const zip = await JSZip.loadAsync(file);
            const manifestFile = zip.file("manifest.json");
            
            if (!manifestFile) {
                throw new Error("Invalid archive: manifest.json not found.");
            }

            const manifestContent = await manifestFile.async("string");
            const manifest = JSON.parse(manifestContent);
            
            setMessage(`Found ${manifest.items.length} items to restore. Uploading files...`);
            
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

            setMessage('Restoring database records...');
            setStatus('restoring');
            await batchRestore(manifest);

            setStatus('success');
            setMessage(`Successfully restored ${manifest.items.length} items.`);

        } catch (error: any) {
            console.error("Restore failed", error);
            setStatus('error');
            setMessage(error.message || "Failed to process archive file.");
        }
    };

    return (
        <div className="p-6 h-full flex flex-col justify-center text-center space-y-6">
            <h2 className="text-2xl font-bold text-white">Restore from Archive</h2>
            
            {status === 'idle' && (
                <>
                    <p className="text-gray-300">
                        Upload a previously generated archive ZIP file to restore receipts, invoices, and sales documents to the Filing Cabinet.
                    </p>
                    <div 
                        onClick={() => fileInputRef.current?.click()}
                        className="border-4 border-dashed border-gray-600 rounded-xl p-10 cursor-pointer hover:border-brand-500 hover:bg-gray-800 transition-colors"
                    >
                        <ArrowUpTrayIcon className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                        <p className="text-lg font-medium text-white">Click to Select Archive ZIP</p>
                    </div>
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
                <>
                    <Spinner className="h-12 w-12 text-brand-500 mx-auto" />
                    <h3 className="text-xl font-semibold text-white">{message}</h3>
                    {status === 'uploading' && <div className="w-full bg-gray-700 rounded-full h-2.5 mt-2"><div className="bg-brand-600 h-2.5 rounded-full" style={{ width: `${progress}%` }}></div></div>}
                </>
            )}

            {status === 'success' && (
                <>
                    <CheckCircleIcon className="h-16 w-16 text-green-500 mx-auto" />
                    <h3 className="text-xl font-bold text-white">Restore Successful</h3>
                    <p className="text-gray-300">{message}</p>
                    <button onClick={onClose} className="px-6 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg mx-auto">Done</button>
                </>
            )}

            {status === 'error' && (
                <>
                    <ExclamationTriangleIcon className="h-16 w-16 text-red-500 mx-auto" />
                    <h3 className="text-xl font-bold text-white">Restore Failed</h3>
                    <p className="text-red-300">{message}</p>
                    <button onClick={() => setStatus('idle')} className="px-6 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg mx-auto">Try Again</button>
                </>
            )}
        </div>
    );
};

export default RestoreDrawer;
