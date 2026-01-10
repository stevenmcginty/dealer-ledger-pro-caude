
import React from 'react';
import { ArrowDownTrayIcon, TrashIcon } from '../icons';
import { formatBytes, formatDate } from '../../utils/helpers';

interface DocumentListItemProps {
  name: string;
  updated: string;
  size: number;
  downloadUrl: string;
  onDelete: () => void;
}

const DocumentListItem: React.FC<DocumentListItemProps> = ({ name, updated, size, downloadUrl, onDelete }) => {

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
        <li className="flex items-center justify-between p-3 bg-gray-900/30 hover:bg-gray-800/50 rounded-xl transition-colors border border-white/5">
            <div>
                <p className="text-sm font-semibold text-white truncate" title={name}>{name}</p>
                <p className="text-xs text-gray-400">
                    Updated: {formatDate(updated)}
                    {size > 0 && (
                        <span className="ml-2 text-gray-500">({formatBytes(size)})</span>
                    )}
                </p>
            </div>
            <div className="flex-shrink-0 ml-4 flex items-center gap-2">
                <button
                    onClick={handleDownload}
                    className="p-2 rounded-lg text-gray-400 hover:bg-brand-500/20 hover:text-brand-300 transition-colors"
                    title="Download File"
                >
                    <ArrowDownTrayIcon className="h-5 w-5" />
                </button>
                <button
                    onClick={onDelete}
                    className="p-2 rounded-lg text-gray-400 hover:bg-red-500/20 hover:text-red-300 transition-colors"
                    title="Delete File"
                >
                    <TrashIcon className="h-5 w-5" />
                </button>
            </div>
        </li>
    );
};

export default DocumentListItem;
