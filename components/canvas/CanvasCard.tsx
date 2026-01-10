import React from 'react';
import { CanvasItem } from '../../types';
import { PaperClipIcon } from '../icons';

interface CanvasCardProps {
    item: CanvasItem;
    onClick: () => void;
}

const noteColorClasses: Record<NonNullable<CanvasItem['color']>, { bg: string, text: string, ring: string }> = {
    yellow: { bg: 'bg-yellow-300', text: 'text-yellow-900', ring: 'focus:ring-yellow-500' },
    pink: { bg: 'bg-pink-300', text: 'text-pink-900', ring: 'focus:ring-pink-500' },
    blue: { bg: 'bg-sky-300', text: 'text-sky-900', ring: 'focus:ring-sky-500' },
    green: { bg: 'bg-green-300', text: 'text-green-900', ring: 'focus:ring-green-500' },
};

const CanvasCard = ({ item, onClick }: CanvasCardProps) => {
    // Default to 'file' for old items that don't have itemType
    const itemType = item.itemType || 'file';
    const isImage = itemType === 'file' && item.fileType?.startsWith('image/');

    if (itemType === 'note') {
        const color = item.color || 'yellow';
        const colors = noteColorClasses[color];
        return (
            <button
                onClick={onClick}
                className={`w-full h-full text-left ${colors.bg} rounded-lg shadow-lg overflow-hidden block transition-transform transform hover:scale-[1.02] hover:shadow-xl focus:outline-none focus:ring-2 ${colors.ring} focus:ring-offset-2 focus:ring-offset-gray-950 p-4 flex flex-col`}
            >
                <h3 className={`font-bold ${colors.text}`}>{item.headline}</h3>
                {item.notes && (
                    <p className={`text-sm ${colors.text} mt-2 whitespace-pre-wrap flex-1 opacity-90`} style={{ display: '-webkit-box', WebkitLineClamp: 10, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                        {item.notes}
                    </p>
                )}
            </button>
        );
    }
    
    // File type card (existing logic)
    return (
        <button 
            onClick={onClick} 
            className="w-full text-left bg-gray-800 rounded-lg shadow-lg overflow-hidden block transition-transform transform hover:scale-[1.02] hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 focus:ring-offset-gray-950"
        >
            {isImage && item.fileUrl && (
                <img src={item.fileUrl} alt={item.fileName || 'Canvas Image'} className="w-full h-auto object-cover" />
            )}
            <div className="p-4">
                <h3 className="font-bold text-white">{item.headline}</h3>
                {item.notes && (
                    <p className="text-sm text-gray-400 mt-2 whitespace-pre-wrap" style={{ display: '-webkit-box', WebkitLineClamp: 8, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                        {item.notes}
                    </p>
                )}
                {item.fileName && (
                    <div className="flex items-center gap-2 mt-3 text-xs text-gray-500">
                        <PaperClipIcon className="h-4 w-4" />
                        <span className="truncate">{item.fileName}</span>
                    </div>
                )}
            </div>
        </button>
    );
};

export default CanvasCard;