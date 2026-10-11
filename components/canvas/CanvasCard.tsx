import React from 'react';
import { CanvasItem } from '../../types';
import { DocumentTextIcon, PaperClipIcon } from '../icons';

interface CanvasCardProps {
    item: CanvasItem;
    onClick: () => void;
    /** Position on the board; gives each note its own slight tilt. */
    index?: number;
}

type NoteColour = NonNullable<CanvasItem['color']>;

/*
 * Sticky notes are physical objects, like the number plate: the same paper in
 * light and dark, with plate ink on top (well over 10:1 on every colour).
 * Candidates for --c-note-* tokens in styles.css.
 */
export const NOTE_PAPER: Record<NoteColour, { paper: string; name: string }> = {
    yellow: { paper: 'bg-[#F7E7A1]', name: 'Yellow' },
    pink: { paper: 'bg-[#F5CADB]', name: 'Pink' },
    blue: { paper: 'bg-[#C7DDF2]', name: 'Blue' },
    green: { paper: 'bg-[#CDE8C6]', name: 'Green' },
};

// A board, not a grid: notes sit a hair off square, and straighten when you reach for them.
const TILT = ['-rotate-[0.6deg]', 'rotate-[0.5deg]', '-rotate-[0.3deg]', 'rotate-[0.7deg]', 'rotate-0'];

const CanvasCard = ({ item, onClick, index = 0 }: CanvasCardProps) => {
    // Default to 'file' for old items that don't have itemType
    const itemType = item.itemType || 'file';
    const isImage = itemType === 'file' && item.fileType?.startsWith('image/');

    if (itemType === 'note') {
        const colour = NOTE_PAPER[item.color || 'yellow'] || NOTE_PAPER.yellow;
        return (
            <button
                type="button"
                onClick={onClick}
                className={`flex w-full flex-col rounded-[6px] p-4 pb-5 text-start text-plate-ink ${colour.paper} ${TILT[index % TILT.length]} transition-transform duration-base ease-out motion-safe:hover:rotate-0 motion-safe:hover:-translate-y-0.5 motion-safe:active:scale-[.98] motion-reduce:rotate-0`}
            >
                <span className="text-base font-bold leading-6">{item.headline || 'Untitled note'}</span>
                {item.notes && (
                    <span className="mt-1.5 line-clamp-[10] whitespace-pre-wrap text-sm leading-5 opacity-80">
                        {item.notes}
                    </span>
                )}
            </button>
        );
    }

    return (
        <button
            type="button"
            onClick={onClick}
            className="group block w-full overflow-hidden rounded-card border border-line bg-surface text-start transition-[border-color,background-color] duration-quick ease-out hover:border-line-strong hover:bg-surface-2 active:bg-surface-3"
        >
            {isImage && item.fileUrl ? (
                <img src={item.fileUrl} alt="" className="block h-auto w-full border-b border-line object-cover" />
            ) : (
                <span aria-hidden="true" className="flex h-20 items-center justify-center border-b border-line bg-bg text-ink-3">
                    <DocumentTextIcon className="h-8 w-8" />
                </span>
            )}
            <span className="block p-4">
                <span className="block text-base font-bold leading-6 text-ink">{item.headline}</span>
                {item.notes && (
                    <span className="mt-1.5 line-clamp-[8] block whitespace-pre-wrap text-sm leading-5 text-ink-2">
                        {item.notes}
                    </span>
                )}
                {item.fileName && (
                    <span className="mt-3 flex items-center gap-1.5 text-sm text-ink-3">
                        <PaperClipIcon className="h-4 w-4 flex-none" />
                        <span className="truncate font-mono text-xs">{item.fileName}</span>
                    </span>
                )}
            </span>
        </button>
    );
};

export default CanvasCard;
