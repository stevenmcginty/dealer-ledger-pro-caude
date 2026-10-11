
import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { useData } from '../../hooks/useData';
import { useUI } from '../../hooks/useUI';
import * as ai from '../../utils/ai';
import * as dataService from '../../services/dataService';
import { ArrowUpTrayIcon, SparklesIcon, ClipboardIcon, PlusIcon } from '../icons';
import Spinner from '../common/Spinner';
import { Alert, Button, EmptyState } from '../ui';
import { cx } from '../ui/cx';
import { CanvasItem, VehicleUpdate, NewCanvasItem } from '../../types';
import { compressImage } from '../../utils/helpers';
import CanvasCard from './CanvasCard';

type UploadStatus = 'idle' | 'uploading' | 'analyzing' | 'saving' | 'success' | 'error';

const Canvas = () => {
    const { companyId, userId, updateVehicle, vehicles, canvasItems, addCanvasItem } = useData();
    const { openModal } = useUI();
    const [isAddingNote, setIsAddingNote] = useState(false);

    // The canvas screen's one "Add note": a fresh note in a random colour, opened to type in.
    const handleAddNote = async () => {
        setIsAddingNote(true);
        try {
            const noteColors: Array<NonNullable<CanvasItem['color']>> = ['yellow', 'pink', 'blue', 'green'];
            const newItemData: NewCanvasItem = {
                itemType: 'note',
                headline: 'New Note',
                notes: '',
                color: noteColors[Math.floor(Math.random() * noteColors.length)],
            };
            const newId = await addCanvasItem(newItemData);
            openModal('canvasItem', { ...newItemData, id: newId, createdAt: Date.now() } as CanvasItem);
        } finally {
            setIsAddingNote(false);
        }
    };
    const [status, setStatus] = useState<UploadStatus>('idle');
    const [message, setMessage] = useState('');
    const [fileName, setFileName] = useState('');

    const onDrop = useCallback(async (acceptedFiles: File[]) => {
        const file = acceptedFiles[0];
        if (!file || !companyId || !userId) return;
        setFileName(file.name);

        try {
            let fileToProcess = file;
            if (file.type.startsWith('image/')) {
                setStatus('uploading');
                setMessage('Shrinking the photo…');
                fileToProcess = await compressImage(file, { maxWidth: 1920, quality: 0.8 });
            }
            
            setStatus('uploading');
            setMessage('Uploading…');
            const fileUrl = await dataService.uploadFile(companyId, userId, fileToProcess, 'canvas');
            
            setStatus('analyzing');
            setMessage('Reading it with AI…');
            const analysis = await ai.analyzeCanvasUpload(fileToProcess);

            if (analysis.documentType === 'V5C' && analysis.registrationNumber) {
                setStatus('saving');
                setMessage(`Found a V5C for ${analysis.registrationNumber}. Filing it to the car…`);
                const targetReg = analysis.registrationNumber.replace(/\s/g, '').toLowerCase();
                const vehicleToUpdate = vehicles.find(v => v.reg.replace(/\s/g, '').toLowerCase() === targetReg);

                if (vehicleToUpdate) {
                    const existingUrls = vehicleToUpdate.v5cUrls || (vehicleToUpdate.v5cUrl ? [vehicleToUpdate.v5cUrl] : []);
                    const newUrls = [...existingUrls, fileUrl];
                    const updatePayload: VehicleUpdate = { v5cUrls: newUrls };
                    if (vehicleToUpdate.v5cUrl) {
                        (updatePayload as any).v5cUrl = null;
                    }
                    await updateVehicle(vehicleToUpdate.id, updatePayload);
                    setStatus('success');
                    setMessage(`V5C filed to ${vehicleToUpdate.reg}.`);
                } else {
                    setStatus('success');
                    setMessage(`V5C for ${analysis.registrationNumber} uploaded, but that car isn't in stock, so it isn't linked to one. It's in the Filing cabinet.`);
                }
            } else {
                setStatus('saving');
                setMessage('Pinning it to the board…');

                const newItem: NewCanvasItem = {
                    itemType: 'file',
                    fileUrl,
                    fileName: file.name,
                    fileType: file.type,
                    headline: analysis.headline || file.name,
                    notes: ''
                };
                await addCanvasItem(newItem);
                
                setStatus('success');
                setMessage(`Added "${analysis.headline || file.name}" to the canvas.`);
            }

        } catch (error: any) {
            console.error("Canvas processing failed:", error);
            setStatus('error');
            setMessage(error.message || "Something went wrong. Try the file again.");
        } finally {
            setTimeout(() => setStatus('idle'), 4000);
        }
    }, [companyId, userId, addCanvasItem, vehicles, updateVehicle]);

    const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
        onDrop,
        accept: { 'image/*': ['.jpeg', '.png', '.jpg', '.gif'], 'application/pdf': ['.pdf'] },
        multiple: false,
    });

    const isWorking = status !== 'idle' && status !== 'success' && status !== 'error';

    return (
        <div className="space-y-5">
            {/* The in-tray: drop or choose a file and the AI reads it. */}
            <div
                {...getRootProps()}
                className={cx(
                    'relative flex cursor-pointer flex-col gap-4 rounded-card border-2 border-dashed p-4 transition-colors duration-quick ease-out sm:flex-row sm:items-center sm:p-5',
                    isDragActive ? 'border-accent bg-accent-soft' : 'border-line-strong bg-surface hover:border-ink-3',
                    isWorking && 'pointer-events-none',
                )}
            >
                <input {...getInputProps()} />
                <span aria-hidden="true" className="grid h-12 w-12 flex-none place-items-center rounded-card bg-accent-soft text-accent-soft-ink">
                    <SparklesIcon className="h-6 w-6" />
                </span>
                <div className="min-w-0 flex-1">
                    <p className="text-base font-bold leading-6 text-ink">{isDragActive ? 'Drop it here' : <><span className="sm:hidden">Scan a photo or PDF</span><span className="hidden sm:inline">Drop a file to scan it</span></>}</p>
                    <p className="mt-0.5 text-sm leading-5 text-ink-3">
                        A photo or PDF. A V5C is filed to its car on its own; anything else is pinned here as a card with a headline.
                    </p>
                </div>
                <div className="flex flex-none gap-2" onClick={e => e.stopPropagation()}>
                    <Button variant="secondary" icon={<ArrowUpTrayIcon />} onClick={open} disabled={isWorking} className="flex-1 sm:flex-none">
                        Choose a file
                    </Button>
                    <Button variant="secondary" icon={<PlusIcon />} onClick={handleAddNote} loading={isAddingNote} className="flex-1 sm:flex-none">
                        Add note
                    </Button>
                </div>
            </div>

            {status !== 'idle' && (
                isWorking ? (
                    <div role="status" className="flex items-center gap-3 rounded-control border border-line bg-surface px-3.5 py-3">
                        <Spinner className="h-5 w-5 flex-none text-accent-text" />
                        <div className="min-w-0">
                            <p className="font-semibold text-ink">{message}</p>
                            {fileName && <p className="truncate font-mono text-xs text-ink-3">{fileName}</p>}
                        </div>
                    </div>
                ) : (
                    <Alert tone={status === 'error' ? 'danger' : 'success'} title={status === 'error' ? "Couldn't add that file" : undefined}>
                        {message}
                        {fileName && <span className="mt-0.5 block truncate font-mono text-xs opacity-80">{fileName}</span>}
                    </Alert>
                )
            )}

            {canvasItems.length > 0 ? (
                <div className="columns-1 gap-4 min-[480px]:columns-2 lg:columns-3 2xl:columns-4">
                    {canvasItems.map((item, i) => (
                        <div key={item.id} className="mb-4 break-inside-avoid">
                            <CanvasCard
                                item={item}
                                index={i}
                                onClick={() => openModal('canvasItem', item)}
                            />
                        </div>
                    ))}
                </div>
            ) : (
                <div className="rounded-card border border-line bg-surface">
                    <EmptyState
                        icon={<ClipboardIcon />}
                        title="Nothing on the canvas yet"
                        description="It's a corkboard for loose paperwork: drop in a document and the AI gives it a headline, or jot a note."
                    />
                </div>
            )}
        </div>
    );
};

export default Canvas;
