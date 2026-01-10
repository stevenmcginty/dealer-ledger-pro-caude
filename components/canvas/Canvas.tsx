
import React, { useState, useCallback, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { useData } from '../../hooks/useData';
import { useUI } from '../../hooks/useUI';
import * as ai from '../../utils/ai';
import * as dataService from '../../services/dataService';
import { ArrowUpTrayIcon, CheckCircleIcon, ExclamationTriangleIcon, SparklesIcon, ClipboardIcon } from '../icons';
import Spinner from '../common/Spinner';
import { VehicleUpdate, NewCanvasItem } from '../../types';
import { compressImage } from '../../utils/helpers';
import CanvasCard from './CanvasCard';

type UploadStatus = 'idle' | 'uploading' | 'analyzing' | 'saving' | 'success' | 'error';

const Canvas = () => {
    const { companyId, userId, updateVehicle, vehicles, canvasItems, addCanvasItem } = useData();
    const { openModal, setCanvasUploadTrigger } = useUI();
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
                setMessage('Compressing image...');
                fileToProcess = await compressImage(file, { maxWidth: 1920, quality: 0.8 });
            }
            
            setStatus('uploading');
            setMessage('Uploading file securely...');
            const fileUrl = await dataService.uploadFile(companyId, userId, fileToProcess, 'canvas');
            
            setStatus('analyzing');
            setMessage('Scanning document with AI...');
            const analysis = await ai.analyzeCanvasUpload(fileToProcess);

            if (analysis.documentType === 'V5C' && analysis.registrationNumber) {
                setStatus('saving');
                setMessage(`Found V5C for ${analysis.registrationNumber}. Linking to vehicle...`);
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
                    setMessage(`Success! V5C for ${vehicleToUpdate.reg} has been saved and linked.`);
                } else {
                    setStatus('success');
                    setMessage(`V5C for ${analysis.registrationNumber} uploaded. Vehicle not found, so it has not been linked. You can find the file in the Filing Cabinet.`);
                }
            } else {
                setStatus('saving');
                setMessage('Saving to your canvas...');

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
                setMessage(`Success! "${analysis.headline || file.name}" was added to your canvas.`);
            }

        } catch (error: any) {
            console.error("Canvas processing failed:", error);
            setStatus('error');
            setMessage(error.message || 'An unexpected error occurred.');
        } finally {
            setTimeout(() => setStatus('idle'), 4000);
        }
    }, [companyId, userId, addCanvasItem, vehicles, updateVehicle]);

    const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
        onDrop,
        accept: { 'image/*': ['.jpeg', '.png', '.jpg', '.gif'], 'application/pdf': ['.pdf'] },
        multiple: false,
    });

    useEffect(() => {
        setCanvasUploadTrigger(open);
        return () => {
            setCanvasUploadTrigger(null);
        };
    }, [open, setCanvasUploadTrigger]);

    const isWorking = status !== 'idle' && status !== 'success' && status !== 'error';

    const StatusIndicator = () => {
        if (status === 'idle') return null;

        const baseClasses = 'p-4 rounded-lg flex items-center gap-3 transition-all duration-300 animate-in fade-in-0';
        const statusConfig: Record<UploadStatus, { icon: React.ReactElement, text: string, bg: string }> = {
            idle: { icon: <></>, text: '', bg: ''},
            uploading: { icon: <Spinner />, text: message, bg: 'bg-gray-700/50' },
            analyzing: { icon: <Spinner />, text: message, bg: 'bg-gray-700/50' },
            saving: { icon: <Spinner />, text: message, bg: 'bg-gray-700/50' },
            success: { icon: <CheckCircleIcon className="h-6 w-6 text-green-400" />, text: message, bg: 'bg-green-900/50' },
            error: { icon: <ExclamationTriangleIcon className="h-6 w-6 text-red-400" />, text: message, bg: 'bg-red-900/50' },
        };
        const config = statusConfig[status];
        if (!config) return null;

        return (
            <div className={`${baseClasses} ${config.bg}`}>
                <div className="flex-shrink-0">{config.icon}</div>
                <div>
                    <p className="font-semibold text-white">{config.text}</p>
                    {fileName && <p className="text-xs text-gray-400">{fileName}</p>}
                </div>
            </div>
        )
    };
    
    return (
        <div className="space-y-6">
            <div 
                {...getRootProps()}
                className={`relative flex flex-col items-center justify-center p-8 text-center border-4 border-dashed rounded-lg cursor-pointer transition-colors duration-300 
                ${isDragActive ? 'border-brand-500 bg-brand-900/30' : 'border-gray-600 hover:border-gray-500 bg-gray-800/50'}`}
            >
                <input {...getInputProps()} />
                 <div className="flex items-center gap-4">
                    <div className="flex-shrink-0"><SparklesIcon className="h-10 w-10 text-purple-400" /></div>
                    <div className="text-left">
                        <p className="text-lg font-semibold text-white">Drop a file here or click to upload to your Canvas</p>
                        <p className="mt-1 text-sm text-gray-400">Like a digital corkboard, drop any document here to save it as a note.</p>
                    </div>
                </div>
                {isWorking && <div className="absolute inset-0 bg-gray-900/50 backdrop-blur-sm"></div>}
            </div>

            <StatusIndicator />

            {canvasItems.length > 0 ? (
                <div className="masonry-grid">
                    {canvasItems.map(item => (
                         <div key={item.id} className="mb-6 break-inside-avoid">
                            <CanvasCard 
                                item={item}
                                onClick={() => openModal('canvasItem', item)}
                            />
                        </div>
                    ))}
                </div>
            ) : (
                 <div className="text-center py-16 px-6 bg-gray-800 rounded-lg shadow-inner">
                    <ClipboardIcon className="h-12 w-12 text-gray-500 mx-auto" />
                    <h3 className="mt-4 text-lg font-medium text-white">Your Canvas is Empty</h3>
                    <p className="mt-1 text-sm text-gray-400">Upload a document or add a note to get started.</p>
                </div>
            )}
        </div>
    );
};

export default Canvas;
