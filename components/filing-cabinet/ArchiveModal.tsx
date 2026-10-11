
import React, { useState } from 'react';
import JSZip from 'jszip';
import { useData } from '../../hooks/useData';
import { ArchiveBoxIcon, ExclamationTriangleIcon, CheckCircleIcon, TrashIcon } from '../icons';
import Spinner from '../common/Spinner';
import { Alert, Button } from '../ui';

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
        setMessage('Making the archive…');
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

        setMessage('Zipping…');
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
        if (window.confirm("Archive downloaded. Delete these items from the cloud now? Only the archive file can bring them back.")) {
            await performDeletion();
        } else {
            setStatus('idle');
            onClose(); // Close if they cancel deletion
        }
    };

    const handleDeleteOnly = async () => {
        if (window.confirm("Delete these items without making an archive first? Only do this if you already have one. You can't undo this.")) {
            await performDeletion();
        }
    };

    const performDeletion = async () => {
        setStatus('deleting');
        setMessage('Deleting records and files…');
        try {
            await batchArchiveDelete(items);
            setStatus('success');
        } catch (error: any) {
            setStatus('error');
            setMessage(error.message);
        }
    };

    return (
        <div className="flex flex-col px-5 pb-5 pt-2 sm:pt-5">
            {status === 'idle' && (
                <>
                    <div className="flex items-start gap-3">
                        <span aria-hidden="true" className="grid h-12 w-12 flex-none place-items-center rounded-card bg-danger-soft text-danger-ink"><ArchiveBoxIcon className="h-6 w-6" /></span>
                        <div className="min-w-0 pt-0.5">
                            <h2 className="text-[1.375rem] font-bold leading-7 tracking-[-0.01em] text-ink">Archive and wipe <span className="num">{items.length}</span> {items.length === 1 ? 'item' : 'items'}?</h2>
                            <p className="mt-1 text-sm leading-5 text-ink-2">Everything in these dates is saved to one ZIP file on this device, then taken out of the cloud.</p>
                        </div>
                    </div>
                    <ul className="m-0 mt-5 list-none space-y-2.5 rounded-control border border-line bg-bg p-3.5 text-sm leading-5 text-ink-2">
                        <li className="flex items-start gap-2.5"><CheckCircleIcon className="h-5 w-5 flex-none text-success" /> Receipt and purchase invoice files go into the ZIP.</li>
                        <li className="flex items-start gap-2.5"><CheckCircleIcon className="h-5 w-5 flex-none text-success" /> Every record, sales invoices too, goes into its list of contents.</li>
                        <li className="flex items-start gap-2.5 font-semibold text-ink"><ExclamationTriangleIcon className="h-5 w-5 flex-none text-danger" /> After the download, they are deleted from the cloud.</li>
                    </ul>
                    <div className="mt-5 flex flex-col gap-2">
                        <Button variant="danger" icon={<ArchiveBoxIcon />} onClick={handleArchive} block>Download archive and delete</Button>
                        <Button variant="secondary" icon={<TrashIcon />} onClick={handleDeleteOnly} block>Delete only (already archived)</Button>
                        <Button variant="ghost" onClick={onClose} block>Keep everything</Button>
                    </div>
                    <p className="mt-3 text-sm text-ink-3">Only choose Delete only if you already have the archive file.</p>
                </>
            )}

            {(status === 'preparing' || status === 'deleting' || status === 'downloading') && (
                <div className="flex flex-col items-center gap-3 py-10 text-center" role="status">
                    <Spinner className="h-10 w-10 text-accent-text" />
                    <h2 className="text-lg font-bold text-ink">{message}</h2>
                    {status === 'preparing' && <p className="num text-sm text-ink-3">{progress}%</p>}
                </div>
            )}

            {status === 'success' && (
                <div className="space-y-4 py-2">
                    <Alert tone="success" title="Archived and wiped">The items are out of the filing cabinet. Keep the ZIP file safe.</Alert>
                    <Button variant="secondary" onClick={onClose} block>Close</Button>
                </div>
            )}

            {status === 'error' && (
                <div className="space-y-4 py-2">
                    <Alert tone="danger" title="That didn't finish">{message}</Alert>
                    <Button variant="secondary" onClick={onClose} block>Close</Button>
                </div>
            )}
        </div>
    );
};

export default ArchiveDrawer;
