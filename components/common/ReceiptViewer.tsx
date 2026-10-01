import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowDownTrayIcon, ArrowTopRightOnSquareIcon, DocumentTextIcon, XMarkIcon } from '../icons';

// receiptUrl is a tokenised Firebase Storage download URL (dataService.uploadFile -> getDownloadURL).
// The object path sits URL-encoded after /o/, e.g. .../o/company%2Fuser%2Freceipts%2F1712_scan.pdf?alt=media&token=…
const storagePath = (url: string): string => {
    try {
        return decodeURIComponent(new URL(url).pathname);
    } catch {
        return url.split('?')[0];
    }
};

/** True when the attached file is a PDF (judged by its file name). */
export const isPdfUrl = (url: string): boolean => /\.pdf$/i.test(storagePath(url));

/** The original file name, without the upload timestamp prefix. */
export const fileNameFromUrl = (url: string): string => {
    if (/^(data|blob):/i.test(url)) return 'receipt';
    const last = storagePath(url).split('/').pop() || 'receipt';
    return last.replace(/^\d{10,}_/, '') || 'receipt';
};

interface ReceiptViewerProps {
    url: string;
    /** Shown in the header, e.g. "Euro Car Parts · 15 Feb 2025". */
    label?: string;
    onClose: () => void;
}

const actionBtn = 'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-gray-300 ring-1 ring-inset ring-gray-700 transition-colors hover:bg-gray-800 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400';

// A dark, full-attention viewer for one receipt file. Portalled to <body> above Modal (z-50),
// closes on Esc, a click on the backdrop, or the ✕. Images show inline; PDFs show in an iframe
// (no PDF library in the app) with an Open-in-new-tab fallback.
const ReceiptViewer = ({ url, label, onClose }: ReceiptViewerProps) => {
    const pdf = isPdfUrl(url);
    const fileName = fileNameFromUrl(url);
    const [shown, setShown] = useState(false);
    const [imgFailed, setImgFailed] = useState(false);
    const [downloading, setDownloading] = useState(false);
    const closeRef = useRef<HTMLButtonElement>(null);
    const onCloseRef = useRef(onClose);
    onCloseRef.current = onClose;

    useEffect(() => {
        const previouslyFocused = document.activeElement as HTMLElement | null;
        const raf = requestAnimationFrame(() => setShown(true));
        closeRef.current?.focus({ preventScroll: true });
        // Stop keys at document, so the reconciler's window-level shortcuts (j/k/Enter…) stay quiet while open.
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') { e.preventDefault(); onCloseRef.current(); }
            e.stopPropagation();
        };
        document.addEventListener('keydown', onKey);
        const prevOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            cancelAnimationFrame(raf);
            document.removeEventListener('keydown', onKey);
            document.body.style.overflow = prevOverflow;
            previouslyFocused?.focus?.({ preventScroll: true });
        };
    }, []);

    const handleDownload = async () => {
        setDownloading(true);
        try {
            const res = await fetch(url);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const blob = await res.blob();
            const objectUrl = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = objectUrl;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
        } catch {
            // Cross-origin fetch blocked or offline: let the browser handle it in a new tab.
            window.open(url, '_blank', 'noopener,noreferrer');
        } finally {
            setDownloading(false);
        }
    };

    const content = (
        <div
            className={`fixed inset-0 z-[60] flex items-stretch sm:items-center justify-center bg-black/80 backdrop-blur-sm p-0 sm:p-6 transition-opacity duration-150 ${shown ? 'opacity-100' : 'opacity-0'}`}
            role="dialog"
            aria-modal="true"
            aria-label={label ? `Receipt: ${label}` : 'Receipt'}
            onClick={e => { e.stopPropagation(); onCloseRef.current(); }}
        >
            <div
                className={`flex w-full max-w-5xl flex-col overflow-hidden bg-gray-900 shadow-2xl ring-1 ring-gray-700 sm:h-[88vh] sm:rounded-xl transition-transform duration-150 ${shown ? 'scale-100' : 'scale-[0.98]'}`}
                onClick={e => e.stopPropagation()}
            >
                <div className="flex items-center gap-3 border-b border-gray-800 px-4 py-3">
                    <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-white">{label || 'Receipt'}</p>
                        <p className="truncate text-xs text-gray-500">{fileName}</p>
                    </div>
                    <button type="button" onClick={handleDownload} disabled={downloading} className={`${actionBtn} disabled:opacity-50`} title="Download">
                        <ArrowDownTrayIcon className="h-4 w-4" /><span className="hidden sm:inline">Download</span>
                    </button>
                    <a href={url} target="_blank" rel="noopener noreferrer" className={actionBtn} title="Open in new tab">
                        <ArrowTopRightOnSquareIcon className="h-4 w-4" /><span className="hidden sm:inline">Open in new tab</span>
                    </a>
                    <button ref={closeRef} type="button" onClick={onClose} className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-gray-800 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400" aria-label="Close">
                        <XMarkIcon className="h-5 w-5" />
                    </button>
                </div>

                <div className="relative flex min-h-0 flex-1 items-center justify-center bg-gray-950/60">
                    {pdf ? (
                        <div className="flex h-full w-full flex-col">
                            <iframe src={url} title={label || fileName} className="min-h-0 w-full flex-1 bg-white" />
                            <p className="border-t border-gray-800 px-4 py-2 text-center text-xs text-gray-500">
                                PDF not showing? <a href={url} target="_blank" rel="noopener noreferrer" className="font-medium text-brand-400 hover:text-brand-300">Open it in a new tab</a>.
                            </p>
                        </div>
                    ) : imgFailed ? (
                        <div className="flex flex-col items-center gap-3 p-8 text-center">
                            <DocumentTextIcon className="h-12 w-12 text-gray-600" />
                            <p className="text-sm text-gray-400">This file can't be previewed here.</p>
                            <a href={url} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-brand-400 hover:text-brand-300">Open in a new tab</a>
                        </div>
                    ) : (
                        <img
                            src={url}
                            alt={label ? `Receipt: ${label}` : 'Receipt'}
                            onError={() => setImgFailed(true)}
                            className="max-h-full max-w-full object-contain p-2 sm:p-4"
                        />
                    )}
                </div>
            </div>
        </div>
    );

    return createPortal(content, document.body);
};

export default ReceiptViewer;
