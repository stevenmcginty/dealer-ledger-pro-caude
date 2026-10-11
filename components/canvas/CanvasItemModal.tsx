import React, { useState, useEffect } from 'react';
import { CanvasItem, CanvasItemUpdate } from '../../types';
import { XMarkIcon, TrashIcon, ArrowTopRightOnSquareIcon, CheckIcon } from '../icons';
import { IconButton } from '../ui';
import { buttonClasses } from '../ui/Button';
import { cx, eyebrow } from '../ui/cx';
import { NOTE_PAPER } from './CanvasCard';
import { useData } from '../../hooks/useData';
import { useUI } from '../../hooks/useUI';

const noteColors: Array<NonNullable<CanvasItem['color']>> = ['yellow', 'pink', 'blue', 'green'];

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
    // Only treat fileUrl as a clickable link when it is a proper web URL, so a
    // crafted value like "javascript:..." can't turn the link into a script URL.
    const isSafeFileUrl = !!item.fileUrl && /^https?:\/\//i.test(item.fileUrl);

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
        if (window.confirm(itemType === 'note' ? "Delete this note? You can't undo this." : "Delete this card and its file? You can't undo this.")) {
            setIsDeleting(true);
            await deleteCanvasItem(item);
            closeModal();
        }
    };
    
    const isNote = itemType === 'note';
    const paper = NOTE_PAPER[color] || NOTE_PAPER.yellow;
    const saveLabel = saveStatus === 'saving' ? 'Saving…' : saveStatus === 'saved' ? 'Saved' : 'Saves as you type';

    return (
        <div className="flex min-h-0 w-full flex-1 flex-col">
            <header className="flex flex-none items-center gap-1 px-5 pb-2 pt-1 sm:pt-4">
                <p className="flex min-w-0 flex-1 items-baseline gap-2">
                    <span className={eyebrow}>{isNote ? 'Note' : 'File'}</span>
                    {!isNote && item.fileName && <span className="min-w-0 truncate font-mono text-xs text-ink-3">{item.fileName}</span>}
                </p>
                {!isNote && isSafeFileUrl && (
                    <a href={item.fileUrl} target="_blank" rel="noopener noreferrer" className={cx(buttonClasses('ghost', 'sm'), 'px-2.5')}>
                        <ArrowTopRightOnSquareIcon className="h-4 w-4" /> Open file
                    </a>
                )}
                <IconButton label={isNote ? 'Delete note' : 'Delete card'} icon={<TrashIcon />} onClick={handleDelete} disabled={isDeleting} />
                <IconButton label="Close" icon={<XMarkIcon />} onClick={closeModal} className="-me-2" />
            </header>

            <div className={`grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-y-auto px-5 pb-4 ${!isNote ? 'md:grid-cols-2' : ''}`}>
                {!isNote && (
                    <div className="flex min-h-[240px] items-center justify-center rounded-control border border-line bg-bg p-2">
                        {isImage && item.fileUrl ? (
                            <img src={item.fileUrl} alt={item.fileName} className="max-h-[60dvh] max-w-full rounded-[6px] object-contain" />
                        ) : (
                            <div className="space-y-2 p-4 text-center text-sm text-ink-3">
                                <p>No preview for this kind of file.</p>
                                {isSafeFileUrl ? (
                                    <a href={item.fileUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-accent-text underline underline-offset-[3px]">Open the file</a>
                                ) : item.fileUrl ? (
                                    <span className="break-all font-mono text-xs">{item.fileUrl}</span>
                                ) : null}
                            </div>
                        )}
                    </div>
                )}

                {/* The writing surface: the note's own paper, or a plain sheet for a file's notes. */}
                <div
                    className={cx(
                        'flex min-h-[260px] flex-col rounded-control p-4 transition-colors duration-quick ease-out focus-within:outline focus-within:outline-[3px] focus-within:outline-offset-2 focus-within:outline-focus',
                        isNote ? `${paper.paper} text-plate-ink` : 'border border-line bg-bg text-ink',
                    )}
                >
                    <label htmlFor="canvas-headline" className="sr-only">Headline</label>
                    <input
                        id="canvas-headline"
                        type="text"
                        value={headline}
                        onChange={e => setHeadline(e.target.value)}
                        className={cx(
                            'w-full border-0 bg-transparent p-0 text-xl font-bold leading-7 focus-visible:outline-none',
                            isNote ? 'placeholder:text-plate-ink/60' : 'placeholder:text-ink-3',
                        )}
                        placeholder="Untitled note"
                    />
                    <label htmlFor="notes" className="sr-only">Notes</label>
                    <textarea
                        id="notes"
                        value={notes}
                        onChange={e => setNotes(e.target.value)}
                        placeholder="Write here…"
                        className={cx(
                            'mt-2 block min-h-[180px] w-full flex-1 resize-none border-0 bg-transparent p-0 text-base leading-relaxed focus-visible:outline-none',
                            isNote ? 'placeholder:text-plate-ink/60' : 'placeholder:text-ink-3',
                        )}
                    />
                </div>
            </div>

            <footer className="flex flex-none flex-wrap items-center gap-3 border-t border-line px-4 py-3 sm:px-5">
                {isNote && (
                    <div role="radiogroup" aria-label="Note colour" className="flex items-center gap-1">
                        {noteColors.map(c => {
                            const checked = color === c;
                            return (
                                <button
                                    key={c}
                                    type="button"
                                    role="radio"
                                    aria-checked={checked}
                                    aria-label={NOTE_PAPER[c].name}
                                    onClick={() => setColor(c)}
                                    className="grid h-11 w-11 place-items-center rounded-full"
                                >
                                    <span className={cx(
                                        'grid h-7 w-7 place-items-center rounded-full text-plate-ink transition-shadow duration-quick ease-out',
                                        NOTE_PAPER[c].paper,
                                        checked ? 'shadow-[0_0_0_2px_rgb(var(--c-surface)),0_0_0_4px_rgb(var(--c-ink))]' : 'shadow-[inset_0_0_0_1px_rgb(var(--c-line-strong))]',
                                    )}>
                                        {checked && <CheckIcon className="h-4 w-4" />}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                )}
                <p className="ms-auto text-sm text-ink-3" role="status" aria-live="polite">{saveLabel}</p>
            </footer>
        </div>
    );
};

export default CanvasItemModal;
