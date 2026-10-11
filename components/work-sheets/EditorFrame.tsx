import React from 'react';
import { Vehicle } from '../../types';
import { XMarkIcon, PlusIcon } from '../icons';
import { IconButton, Plate, StatusChip } from '../ui';
import { controlFrame, controlInput, cx } from '../ui/cx';

/*
 * Shared frame for the workshop and task editors that open inside the Modal:
 * title + close at the top, a scrolling form, and a footer that stays put
 * with the main action on the end (in thumb reach on phones).
 * Local to S1; candidates for components/ui later.
 */

interface EditorFrameProps {
    title: React.ReactNode;
    onClose: () => void;
    formId: string;
    onSubmit: (e: React.FormEvent) => void;
    footer: React.ReactNode;
    children: React.ReactNode;
}

export const EditorFrame: React.FC<EditorFrameProps> = ({ title, onClose, formId, onSubmit, footer, children }) => (
    <div className="flex h-full min-h-0 w-full flex-col">
        <header className="flex flex-none items-start gap-3 border-b border-line pb-3 pe-3 ps-5 pt-1 sm:pt-4">
            <h2 className="min-w-0 flex-1 pt-2.5 text-[1.375rem] font-bold leading-7 tracking-[-0.01em] text-ink">{title}</h2>
            <IconButton label="Close" icon={<XMarkIcon />} onClick={onClose} />
        </header>
        <form id={formId} onSubmit={onSubmit} className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5">
            {children}
        </form>
        <footer className="flex flex-none items-center justify-end gap-3 border-t border-line bg-surface px-5 py-3">
            {footer}
        </footer>
    </div>
);

/** A plain text input on the shared control frame. */
export const FrameInput = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement> & { frameClassName?: string }>(
    ({ className, frameClassName, disabled, ...props }, ref) => (
        <div className={cx(controlFrame({ disabled }), frameClassName)}>
            <input ref={ref} disabled={disabled} className={cx(controlInput, className)} {...props} />
        </div>
    ),
);
FrameInput.displayName = 'FrameInput';

/** A textarea on the shared control frame. */
export const FrameTextarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
    ({ className, disabled, ...props }, ref) => (
        <div className={controlFrame({ disabled })}>
            <textarea ref={ref} disabled={disabled} className={cx(controlInput, 'min-h-[96px] resize-y', className)} {...props} />
        </div>
    ),
);
FrameTextarea.displayName = 'FrameTextarea';

const vehicleChip = (status: Vehicle['status']) =>
    status === 'Sold' ? <StatusChip status="sold">Sold</StatusChip>
        : status === 'Deposit Paid' ? <StatusChip status="reserved">Deposit paid</StatusChip>
            : <StatusChip status="stock">In stock</StatusChip>;

/** The drop-down list under a vehicle search box: plate, car, status. */
export const VehicleSuggestions: React.FC<{ vehicles: Vehicle[]; onPick: (v: Vehicle) => void; showStatus?: boolean }> = ({ vehicles, onPick, showStatus = true }) => (
    <ul className="absolute inset-x-0 top-full z-dropdown mt-1 max-h-72 overflow-auto rounded-control border border-line-strong bg-surface p-1 shadow-e2">
        {vehicles.map(v => (
            <li key={v.id}>
                <button
                    type="button"
                    onClick={() => onPick(v)}
                    className="flex min-h-[48px] w-full items-center gap-2.5 rounded-[6px] px-2.5 text-start text-ink transition-colors duration-quick ease-out hover:bg-surface-2 active:bg-surface-3"
                >
                    <Plate reg={v.reg} size="sm" />
                    <span className="min-w-0 flex-1 truncate text-sm">{v.make} {v.model}</span>
                    {showStatus && vehicleChip(v.status)}
                </button>
            </li>
        ))}
    </ul>
);

/** "Add a line" under a list of line items. */
export const AddLineButton: React.FC<{ onClick: () => void; children?: React.ReactNode }> = ({ onClick, children = 'Add a line' }) => (
    <button
        type="button"
        onClick={onClick}
        className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-control border border-dashed border-line-strong text-sm font-semibold text-accent-text transition-colors duration-quick ease-out hover:border-ink-3 hover:bg-surface-2"
    >
        <PlusIcon className="h-5 w-5" aria-hidden="true" /> {children}
    </button>
);

/** Label / value line in a totals block. */
export const TotalLine: React.FC<{ label: string; value: string; strong?: boolean }> = ({ label, value, strong }) => (
    <div className={cx('flex items-baseline justify-between gap-4', strong ? 'pt-1' : '')}>
        <span className={strong ? 'text-base font-semibold text-ink' : 'text-sm text-ink-2'}>{label}</span>
        <span className={cx('num text-ink', strong ? 'text-2xl font-semibold tracking-[-0.02em]' : 'text-base')}>{value}</span>
    </div>
);

export default EditorFrame;
