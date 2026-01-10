
import React, { useState } from 'react';
import JSZip from 'jszip';
import { useData } from '../../hooks/useData';
import { ArchiveBoxIcon, ExclamationTriangleIcon, CheckCircleIcon, TrashIcon } from '../icons';
import Spinner from '../common/Spinner';

interface ArchiveDrawerProps {
    items: any[]; // The list of items to archive
    onClose: () => void;
    companyId: string;
}

const ArchiveDrawer = ({ items, onClose, companyId }: ArchiveDrawerProps) => {
    const { batchArchiveDelete } = useData();
    const [status, setStatus] = useState<'idle' | 'preparing' | 'downloading' | 'deleting' | 'success' | 'error'>('idle');
    const [message, setMessage] = useState('');
    const [progress, setProgress] = useState(0);

    const handleArchive = async () => {
        setStatus('preparing');
        setMessage('Generating secure archive package...');
        const zip = new JSZip();
        const filesFolder = zip.folder("files");
        const manifest: any = { version: '1.0', timestamp: new Date().toISOString(), items: [] };

        let fileCount = 0;
        const totalFiles = items.filter(i => i.fileUrl).length;

        for (const item of items) {
            // Add metadata to manifest
            manifest.items.push(item);

            // Fetch and zip file if exists
            if (item.fileUrl) {
                try {
                    const response = await fetch(item.fileUrl);
                    if (response.ok) {
                        const blob = await response.blob();
                        const ext = item.fileUrl.split('?')[0].split('.').pop() || 'jpg';
                        // Clean filename
                        const safeName = (item.fileName || 'file').replace(/[^a-z0-9]/gi, '_').toLowerCase();
                        const zipPath = `${safeName}_${item.id}.${ext}`;
                        
                        filesFolder?.file(zipPath, blob);
                        
                        // Update item in manifest to point to local zip path for restore
                        const manifestItem = manifest.items[manifest.items.length - 1];
                        manifestItem.zipPath = `files/${zipPath}`;
                        
                        fileCount++;
                        setProgress(Math.round((fileCount / totalFiles) * 100));
                    }
                } catch (e) {
                    console.error("Error archiving file", e);
                }
            }
        }

        zip.file("manifest.json", JSON.stringify(manifest, null, 2));

        setMessage('Finalizing ZIP file...');
        const content = await zip.generateAsync({ type: "blob" });
        
        // Trigger Download
        setStatus('downloading');
        const link = document.createElement("a");
        link.href = URL.createObjectURL(content);
        link.download = `Archive_${new Date().toISOString().split('T')[0]}.zip`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        // Confirm Delete
        if (window.confirm("Archive downloaded successfully. Do you want to proceed with deleting these items from the cloud? This cannot be undone without restoring from the backup.")) {
            await performDeletion();
        } else {
            setStatus('idle');
            onClose(); // Close if they cancel deletion
        }
    };

    const handleDeleteOnly = async () => {
        if (window.confirm("WARNING: You are about to permanently delete these items without creating a backup archive first. This assumes you have already backed them up elsewhere. Are you sure you want to proceed?")) {
            await performDeletion();
        }
    };

    const performDeletion = async () => {
        setStatus('deleting');
        setMessage('Deleting records and files from cloud...');
        try {
            await batchArchiveDelete(items);
            setStatus('success');
        } catch (error: any) {
            setStatus('error');
            setMessage(error.message);
        }
    };

    return (
        <div className="p-6 h-full flex flex-col">
            <div className="flex-1 flex flex-col justify-center items-center text-center space-y-6">
                {status === 'idle' && (
                    <>
                        <div className="bg-red-100 p-4 rounded-full">
                            <ArchiveBoxIcon className="h-12 w-12 text-red-600" />
                        </div>
                        <h3 className="text-2xl font-bold text-white">Archive & Wipe Period</h3>
                        <p className="text-gray-300">
                            You are about to archive <strong>{items.length} items</strong>.
                        </p>
                        <div className="bg-gray-700/50 p-4 rounded-lg text-sm text-left space-y-2 border border-gray-600 w-full max-w-md">
                            <p className="flex items-start gap-2"><CheckCircleIcon className="h-5 w-5 text-green-400 shrink-0"/> All files (Receipts, Purchase Invoices) will be zipped.</p>
                            <p className="flex items-start gap-2"><CheckCircleIcon className="h-5 w-5 text-green-400 shrink-0"/> Data records (including Sales Invoices) will be saved to a manifest.</p>
                            <p className="flex items-start gap-2"><ExclamationTriangleIcon className="h-5 w-5 text-red-400 shrink-0"/> <strong>After download, these items will be deleted from the cloud.</strong></p>
                        </div>
                        
                        <div className="w-full max-w-md space-y-3 pt-4">
                            <button onClick={handleArchive} className="w-full py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg shadow-lg flex items-center justify-center gap-2">
                                <ArchiveBoxIcon className="h-5 w-5" /> Download Archive & Delete
                            </button>
                            <div className="relative flex items-center py-2">
                                <div className="flex-grow border-t border-gray-600"></div>
                                <span className="flex-shrink-0 mx-4 text-gray-500 text-sm">OR</span>
                                <div className="flex-grow border-t border-gray-600"></div>
                            </div>
                            <button onClick={handleDeleteOnly} className="w-full py-3 bg-gray-700 hover:bg-gray-600 text-gray-300 font-semibold rounded-lg shadow-sm border border-gray-600 flex items-center justify-center gap-2">
                                <TrashIcon className="h-5 w-5" /> Delete Only (Already Archived)
                            </button>
                        </div>
                        <p className="text-xs text-gray-500 mt-2">Only choose 'Delete Only' if you have already downloaded the archive.</p>
                    </>
                )}

                {(status === 'preparing' || status === 'deleting') && (
                    <>
                        <Spinner className="h-12 w-12 text-white" />
                        <h3 className="text-xl font-semibold text-white">{message}</h3>
                        {status === 'preparing' && <p className="text-gray-400">{progress}% processed</p>}
                    </>
                )}

                {status === 'success' && (
                    <>
                        <CheckCircleIcon className="h-16 w-16 text-green-500" />
                        <h3 className="text-xl font-bold text-white">Action Complete</h3>
                        <p className="text-gray-400">Items have been removed from the filing cabinet.</p>
                        <button onClick={onClose} className="mt-4 px-6 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg">Close</button>
                    </>
                )}

                {status === 'error' && (
                    <>
                        <ExclamationTriangleIcon className="h-16 w-16 text-red-500" />
                        <h3 className="text-xl font-bold text-white">Error</h3>
                        <p className="text-red-300">{message}</p>
                        <button onClick={onClose} className="mt-4 px-6 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg">Close</button>
                    </>
                )}
            </div>
        </div>
    );
};

export default ArchiveDrawer;
