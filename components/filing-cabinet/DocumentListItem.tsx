import React from 'react';
import { ArrowDownTrayIcon, TrashIcon } from '../icons';
import { formatBytes, formatDate } from '../../utils/helpers';
import { IconButton } from '../ui';

interface DocumentListItemProps {
  name: string;
  updated: string;
  size: number;
  downloadUrl: string;
  onDelete: () => void;
  /** Leading type chip (DocChip, ReceiptChip). */
  code?: React.ReactNode;
  /** First line; defaults to the name. */
  title?: React.ReactNode;
  /** Second line, before the date. */
  meta?: React.ReactNode;
}

/**
 * The receipt counterpart of ui/DocChip: same shape, a two-letter mono code
 * on a neutral block. Local until DocChip learns an "RC" kind.
 */
export const ReceiptChip: React.FC = () => (
  <span className="inline-flex h-[26px] flex-none items-stretch overflow-hidden whitespace-nowrap rounded-chip border border-line-strong text-xs font-semibold" title="Receipt">
    <b className="grid place-items-center bg-surface-2 px-1.5 font-mono font-semibold text-ink-2">RC</b>
    <span className="sr-only">Receipt</span>
  </span>
);

/** A filed file: what it is, then its facts; download and delete on the end. */
const DocumentListItem: React.FC<DocumentListItemProps> = ({ name, updated, size, downloadUrl, onDelete, code, title, meta }) => {

    const handleDownload = () => {
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.target = "_blank"; // Open in new tab is better than forcing download for images/pdfs
        link.download = name;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <li className="flex min-h-[64px] items-center gap-3 py-2 pe-1.5 ps-3.5 sm:ps-4">
            {code}
            <div className="min-w-0 flex-1">
                <p className="flex min-w-0 items-center gap-2 text-base font-semibold leading-6 text-ink" title={name}>
                    {title ?? <span className="truncate">{name}</span>}
                </p>
                <p className="truncate text-sm leading-5 text-ink-3">
                    {meta}{meta ? ' · ' : ''}<span className="num">{formatDate(updated)}</span>
                    {size > 0 && <span className="num"> · {formatBytes(size)}</span>}
                </p>
            </div>
            <div className="flex flex-none items-center">
                <IconButton label={`Download ${name}`} icon={<ArrowDownTrayIcon />} onClick={handleDownload} />
                <IconButton label={`Delete the file for ${name}`} icon={<TrashIcon />} onClick={onDelete} />
            </div>
        </li>
    );
};

export default DocumentListItem;
