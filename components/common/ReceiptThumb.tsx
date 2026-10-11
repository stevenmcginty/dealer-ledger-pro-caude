import React, { useState } from 'react';
import { DocumentTextIcon } from '../icons';
import ReceiptViewer, { isPdfUrl } from './ReceiptViewer';

const SIZES = { sm: 32, md: 40, lg: 56 } as const;

interface ReceiptThumbProps {
    /** The receipt's tokenised download URL (Receipt.receiptUrl). */
    url: string;
    /** Used for the tooltip and the viewer header, e.g. "Euro Car Parts · 15 Feb 2025". */
    label?: string;
    /** sm 32px, md 40px (default), lg 56px, or an exact pixel size. */
    size?: keyof typeof SIZES | number;
    className?: string;
}

// A small clickable preview of an attached receipt. Images show the file itself; PDFs show a
// "PDF" tile (no PDF renderer in the app). A click opens ReceiptViewer.
const ReceiptThumb = ({ url, label, size = 'md', className = '' }: ReceiptThumbProps) => {
    const [open, setOpen] = useState(false);
    const [failed, setFailed] = useState(false);
    const px = typeof size === 'number' ? size : SIZES[size];
    const pdf = isPdfUrl(url);

    return (
        <>
            <button
                type="button"
                onClick={e => { e.stopPropagation(); setOpen(true); }}
                className={`group relative inline-flex shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-control border border-line-strong bg-surface transition-[border-color,transform] duration-quick ease-out hover:border-accent active:scale-[.97] ${className}`}
                style={{ width: px, height: px }}
                title={label ? `View receipt: ${label}` : 'View receipt'}
                aria-label={label ? `View receipt: ${label}` : 'View receipt'}
            >
                {pdf ? (
                    <span className="flex h-full w-full flex-col items-center justify-center bg-danger-soft">
                        <DocumentTextIcon className="h-1/2 w-1/2 text-danger-ink" />
                        <span className="text-xs font-bold leading-none text-danger-ink">PDF</span>
                    </span>
                ) : failed ? (
                    <DocumentTextIcon className="h-1/2 w-1/2 text-ink-3" />
                ) : (
                    <img
                        src={url}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        onError={() => setFailed(true)}
                        className="h-full w-full object-cover transition-transform duration-quick ease-out group-hover:scale-105"
                    />
                )}
            </button>
            {open && <ReceiptViewer url={url} label={label} onClose={() => setOpen(false)} />}
        </>
    );
};

export default ReceiptThumb;
