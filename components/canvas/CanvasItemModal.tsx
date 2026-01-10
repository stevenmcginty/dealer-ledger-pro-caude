import React, { useState, useEffect } from 'react';
import { CanvasItem, CanvasItemUpdate } from '../../types';
import { XMarkIcon, TrashIcon, ArrowTopRightOnSquareIcon } from '../icons';
import Spinner from '../common/Spinner';
import { useData } from '../../hooks/useData';
import { useUI } from '../../hooks/useUI';

const noteColors: Array<NonNullable<CanvasItem['color']>> = ['yellow', 'pink', 'blue', 'green'];

const modalColorClasses: Record<NonNullable<CanvasItem['color']>, { bg: string, text: string, placeholder: string, border: string }> = {
    yellow: { bg: 'bg-yellow-200', text: 'text-yellow-900', placeholder: 'placeholder-yellow-700/80', border: 'border-yellow-300/50' },
    pink: { bg: 'bg-pink-200', text: 'text-pink-900', placeholder: 'placeholder-pink-700/80', border: 'border-pink-300/50' },
    blue: { bg: 'bg-sky-200', text: 'text-sky-900', placeholder: 'placeholder-sky-700/80', border: 'border-sky-300/50' },
    green: { bg: 'bg-green-200', text: 'text-green-900', placeholder: 'placeholder-green-700/80', border: 'border-green-300/50' },
};

const paletteColorClasses: Record<NonNullable<CanvasItem['color']>, string> = {
    yellow: 'bg-yellow-300 hover:ring-yellow-400',
    pink: 'bg-pink-300 hover:ring-pink-400',
    blue: 'bg-sky-300 hover:ring-sky-400',
    green: 'bg-green-300 hover:ring-green-400',
};

const CanvasItemModal = ({ item }: { item: CanvasItem }) => {
    const { closeModal } = useUI();
    const { updateCanvasItem, deleteCanvasItem } = useData();
    const [headline, setHeadline] = useState(item.headline || '');
    const [notes, setNotes] = useState(item.notes || '');
    const [color, setColor] = useState(item.color || 'yellow');
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
    const [isDeleting, setIsDeleting] = useState(false);

    const itemType = item.itemType || 'file';
    const isImage = itemType === 'file' && item.fileType?.startsWith('image/');

    const handleSave = async (updates: CanvasItemUpdate) => {
        setSaveStatus('saving');
        await updateCanvasItem(item.id, updates);
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 2000);
    };
    
    // Auto-save with debounce
    useEffect(() => {
        const originalHeadline = item.headline || '';
        const originalNotes = item.notes || '';
        const originalColor = item.color || 'yellow';

        const updates: CanvasItemUpdate = {};
        if(headline !== originalHeadline) updates.headline = headline;
        if(notes !== originalNotes) updates.notes = notes;
        if(color !== originalColor) updates.color = color;

        if (Object.keys(updates).length > 0) {
            setSaveStatus('saving');
            const timer = setTimeout(() => {
                handleSave(updates);
            }, 1500);
            return () => clearTimeout(timer);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [headline, notes, color, item.id]);


    const handleDelete = async () => {
        if (window.confirm("Are you sure you want to delete this canvas item and its file permanently?")) {
            setIsDeleting(true);
            await deleteCanvasItem(item);
            closeModal();
        }
    };
    
    const currentNoteColors = itemType === 'note' ? modalColorClasses[color] : { bg: 'bg-gray-800', text: 'text-white', placeholder: 'placeholder-gray-400', border: 'border-gray-700' };

    return (
        <div className={`w-full flex flex-col h-full max-h-[90vh] ${currentNoteColors.bg}`}>
            <header className={`p-4 border-b flex items-center justify-between flex-shrink-0 ${currentNoteColors.border}`}>
                <input 
                    type="text"
                    value={headline}
                    onChange={e => setHeadline(e.target.value)}
                    className={`text-lg font-bold bg-transparent w-full focus:outline-none focus:ring-0 border-none p-0 ${currentNoteColors.text} ${currentNoteColors.placeholder}`}
                    placeholder="Untitled Note"
                />
                <div className="flex items-center gap-2 pl-4">
                    {itemType === 'file' && item.fileUrl && (
                        <a href={item.fileUrl} target="_blank" rel="noopener noreferrer" className="p-2 rounded-full text-gray-400 hover:bg-gray-700 hover:text-white" title="Open in new tab"><ArrowTopRightOnSquareIcon className="h-5 w-5"/></a>
                    )}
                    <button onClick={handleDelete} className={`p-2 rounded-full ${itemType === 'note' ? 'text-gray-600 hover:bg-black/10' : 'text-gray-400 hover:bg-gray-700'}`} title="Delete Item">{isDeleting ? <Spinner className="h-5 w-5"/> : <TrashIcon className="h-5 w-5"/>}</button>
                    <button onClick={closeModal} className={`p-2 rounded-full ${itemType === 'note' ? 'text-gray-600 hover:bg-black/10' : 'text-gray-400 hover:bg-gray-700'}`}><XMarkIcon className="h-6 w-6" /></button>
                </div>
            </header>
            <div className={`flex-1 overflow-y-auto p-4 md:p-6 grid grid-cols-1 ${itemType === 'file' ? 'md:grid-cols-2' : ''} gap-6 min-h-0`}>
                {itemType === 'file' && (
                    <div className="bg-gray-900/50 rounded-lg flex items-center justify-center p-2 min-h-[300px]">
                        {isImage && item.fileUrl ? (
                            <img src={item.fileUrl} alt={item.fileName} className="max-h-full max-w-full object-contain rounded" />
                        ) : (
                            <div className="text-center text-gray-400">
                                <p>Cannot preview this file type.</p>
                                {item.fileUrl && <a href={item.fileUrl} target="_blank" rel="noopener noreferrer" className="text-brand-400 hover:underline">Open file</a>}
                            </div>
                        )}
                    </div>
                )}
                 <div className="flex flex-col">
                    <label htmlFor="notes" className="block text-sm font-medium text-gray-300 sr-only">Notes & Comments</label>
                    <textarea
                        id="notes"
                        value={notes}
                        onChange={e => setNotes(e.target.value)}
                        placeholder="Add your notes here..."
                        className={`mt-1 block w-full flex-1 bg-transparent resize-none focus:outline-none text-base leading-relaxed ${currentNoteColors.text} ${currentNoteColors.placeholder}`}
                    />
                </div>
            </div>
            <footer className={`flex-shrink-0 p-4 border-t flex justify-between items-center text-xs ${currentNoteColors.border} ${currentNoteColors.text}`}>
                {itemType === 'note' && (
                    <div className="flex items-center gap-2">
                        {noteColors.map(c => (
                            <button
                                key={c}
                                type="button"
                                onClick={() => setColor(c)}
                                className={`w-6 h-6 rounded-full ${paletteColorClasses[c]} transition-all ring-2 ring-offset-2 ring-offset-current ${color === c ? 'ring-gray-900/50' : 'ring-transparent'}`}
                                aria-label={`Set color to ${c}`}
                            />
                        ))}
                    </div>
                )}
                 <div className="flex-1 text-right opacity-70">
                    {saveStatus === 'saving' ? 'Saving...' : saveStatus === 'saved' ? 'Saved' : ''}
                </div>
            </footer>
        </div>
    );
};

export default CanvasItemModal;