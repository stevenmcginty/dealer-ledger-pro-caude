import React, { useMemo, useRef, useState } from 'react';
import { useUI } from '../../hooks/useUI';
import { useData } from '../../hooks/useData';
import { AddAction, AddActionId, addActionsFor } from './addActions';
import { useFocusTrap } from './hooks';
import { ChevronRightIcon, XMarkIcon } from '../icons';

interface AddMenuProps {
    open: boolean;
    onClose: () => void;
    /** Phone: bottom sheet over the content, above the tab bar. Tablet/desktop: popover by the Add button. */
    variant: 'sheet' | 'popover';
    /** The Add button: the popover sits beside it and focus returns to it. */
    anchorRef: React.RefObject<HTMLElement | null>;
    /** Popover side: under the button (sidebar) or to its end (rail). */
    placement?: 'below' | 'end';
}

const tileClass =
    'group flex min-h-[92px] flex-col items-start gap-2.5 rounded-card border border-transparent bg-surface-2 p-3.5 text-start ' +
    'transition-[background-color,transform] duration-quick ease-out hover:bg-surface-3 active:scale-[.96] active:duration-press';

const rowClass =
    'flex min-h-[56px] w-full items-center gap-3 rounded-control px-2 text-start text-ink ' +
    'transition-colors duration-quick ease-out hover:bg-surface-2 active:bg-surface-3 lg:min-h-[48px]';

/**
 * The one create button's menu. Replaces the floating +, the header + and the
 * dashboard task menu. Always mounted (so the hidden file picker for "Lots of
 * receipts" survives the menu closing); renders nothing while closed.
 */
const AddMenu: React.FC<AddMenuProps> = ({ open, onClose, variant, anchorRef, placement = 'below' }) => {
    const { view, openModal } = useUI();
    const { isServiceBusiness } = useData();
    const panelRef = useRef<HTMLDivElement>(null);
    const filesRef = useRef<HTMLInputElement>(null);
    const [dragY, setDragY] = useState(0);
    const drag = useRef<{ y: number; id: number } | null>(null);

    const { tiles, rows } = useMemo(() => addActionsFor(view, isServiceBusiness), [view, isServiceBusiness]);

    useFocusTrap(panelRef, open, onClose, anchorRef);

    const run = (id: AddActionId) => {
        onClose();
        switch (id) {
            case 'car': openModal('vehicle'); break;
            case 'expense': openModal('expense'); break;
            case 'saleDoc': openModal('invoicePicker'); break;
            case 'lead': openModal('lead'); break;
            case 'task': openModal('todo', { type: 'general' }); break;
            case 'prep': openModal('todo', { type: 'prep' }); break;
            case 'warranty': openModal('todo', { type: 'warranty' }); break;
            case 'receipts': filesRef.current?.click(); break;
            case 'workSheet': openModal('workSheet'); break;
            case 'pdi': openModal('pdi'); break;
            case 'internalJob': openModal('internalJob'); break;
            case 'garageCar': openModal('addInformalVehicle'); break;
            case 'income': openModal('miscInvoice'); break;
            case 'jobInvoice': openModal('jobInvoice', { status: 'Quote' }); break;
        }
    };

    const onFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (files && files.length > 0) openModal('bulkReceiptWizard', { files: Array.from(files) });
        e.target.value = '';
    };

    // Drag the sheet down by its handle to close it (phone).
    const onPointerDown = (e: React.PointerEvent) => {
        if (variant !== 'sheet') return;
        drag.current = { y: e.clientY, id: e.pointerId };
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    };
    const onPointerMove = (e: React.PointerEvent) => {
        if (!drag.current || drag.current.id !== e.pointerId) return;
        setDragY(Math.max(0, e.clientY - drag.current.y));
    };
    const onPointerUp = () => {
        if (!drag.current) return;
        const pulled = dragY;
        drag.current = null;
        setDragY(0);
        if (pulled > 80) onClose();
    };

    const fileInput = (
        <input ref={filesRef} type="file" accept="image/*,application/pdf" multiple className="hidden" onChange={onFiles} tabIndex={-1} aria-hidden="true" />
    );

    if (!open) return fileInput;

    // Plain render functions (not components), so a re-render while dragging
    // the sheet never remounts the buttons and drops focus.
    const renderTile = (action: AddAction) => {
        const Icon = action.icon;
        return (
            <button key={action.id} type="button" className={tileClass} onClick={() => run(action.id)}>
                <span className="grid h-9 w-9 place-items-center rounded-control bg-surface text-accent-text">
                    <Icon className="h-5 w-5" />
                </span>
                <span className="min-w-0">
                    <span className="block text-sm font-semibold leading-tight text-ink">{action.label}</span>
                    <span className="mt-0.5 block text-xs leading-snug text-ink-3">{action.hint}</span>
                </span>
            </button>
        );
    };

    const renderRow = (action: AddAction) => {
        const Icon = action.icon;
        return (
            <li key={action.id}>
                <button type="button" className={rowClass} onClick={() => run(action.id)}>
                    <Icon className="h-6 w-6 flex-none text-ink-2" />
                    <span className="min-w-0 flex-1">
                        <span className="block truncate text-base font-semibold leading-tight">{action.label}</span>
                        <span className="block truncate text-sm text-ink-3">{action.hint}</span>
                    </span>
                    <ChevronRightIcon className="h-5 w-5 flex-none text-ink-3 rtl:-scale-x-100" />
                </button>
            </li>
        );
    };

    const body = (
        <>
            <div
                className={variant === 'sheet' ? 'cursor-grab touch-none select-none pt-2' : 'pt-1'}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
            >
                {variant === 'sheet' && <div className="mx-auto mb-1 h-[5px] w-10 rounded-full bg-line-strong" aria-hidden="true" />}
                <div className="flex items-center justify-between gap-3 ps-1">
                    <h2 id="add-menu-title" className="text-xl font-bold leading-tight text-ink">Add</h2>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close"
                        className="grid h-12 w-12 place-items-center rounded-control text-ink-2 transition-colors duration-quick hover:bg-surface-2 hover:text-ink"
                    >
                        <XMarkIcon className="h-6 w-6" />
                    </button>
                </div>
            </div>
            <div className={variant === 'sheet' ? 'grid grid-cols-3 gap-2' : 'grid grid-cols-2 gap-2'}>
                {tiles.map(renderTile)}
            </div>
            {rows.length > 0 && (
                <ul className="mt-3 border-t border-line pt-2">
                    {rows.map(renderRow)}
                </ul>
            )}
        </>
    );

    if (variant === 'sheet') {
        return (
            <>
                {fileInput}
                <div className="anim-fade-in absolute inset-0 z-sheet bg-scrim" onClick={onClose} aria-hidden="true" />
                <div
                    ref={panelRef}
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="add-menu-title"
                    className="anim-sheet-in absolute inset-x-0 bottom-0 z-sheet max-h-[88%] overflow-y-auto overscroll-contain rounded-t-sheet bg-surface px-4 pb-4 shadow-e3"
                    style={dragY ? { transform: `translateY(${dragY}px)`, transition: 'none' } : undefined}
                >
                    {body}
                </div>
            </>
        );
    }

    const rect = anchorRef.current?.getBoundingClientRect();
    const pos: React.CSSProperties = rect
        ? placement === 'end'
            ? { top: Math.max(8, rect.top), insetInlineStart: rect.right + 8 }
            : { top: rect.bottom + 8, insetInlineStart: rect.left }
        : { top: 72, insetInlineStart: 16 };

    return (
        <>
            {fileInput}
            {/* Transparent catcher: a click anywhere else closes the popover. */}
            <div className="fixed inset-0 z-dropdown" onClick={onClose} aria-hidden="true" />
            <div
                ref={panelRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="add-menu-title"
                className="anim-pop-in fixed z-dropdown max-h-[calc(100dvh-5rem)] w-[26rem] overflow-y-auto overscroll-contain rounded-card border border-line bg-surface px-3 pb-3 shadow-e3"
                style={pos}
            >
                {body}
            </div>
        </>
    );
};

export default AddMenu;
