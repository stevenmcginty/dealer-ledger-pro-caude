import React from 'react';
import { Button } from '../ui';

interface ConfirmDialogProps {
    /** The exact question, naming the thing: "Delete work sheet #12?" */
    title: React.ReactNode;
    /** What it costs: what goes, what stays, whether it can be undone. */
    children: React.ReactNode;
    /** Says what stays: "Keep car". Gets focus when the dialog opens. */
    keepLabel: string;
    /** Repeats the verb: "Delete car". */
    confirmLabel: React.ReactNode;
    onKeep: () => void;
    onConfirm: () => void;
    /** danger for things that are gone for good; primary for the safe main action. */
    variant?: 'danger' | 'primary';
    /** Confirm shows a spinner and both buttons stop taking taps. */
    busy?: boolean;
}

/**
 * The body of a confirm dialog, drawn inside <Modal>: question, consequence,
 * then Keep + the verb. Phones get full-width buttons side by side (they wrap
 * when a label is long); from 640px they sit at the end of the row.
 */
const ConfirmDialog = ({ title, children, keepLabel, confirmLabel, onKeep, onConfirm, variant = 'danger', busy = false }: ConfirmDialogProps) => (
    <div className="px-5 pb-5 pt-2 sm:pt-5">
        <h2 data-modal-title className="text-[1.375rem] font-bold leading-7 tracking-[-0.01em] text-ink [overflow-wrap:anywhere]">{title}</h2>
        <div className="mt-2 space-y-2 text-base leading-6 text-ink-2">{children}</div>
        <div className="mt-5 flex flex-wrap gap-2 [&>*]:flex-1 sm:justify-end sm:[&>*]:flex-none">
            <Button type="button" variant="secondary" onClick={onKeep} disabled={busy} data-autofocus>{keepLabel}</Button>
            <Button type="button" variant={variant} onClick={onConfirm} loading={busy}>{confirmLabel}</Button>
        </div>
    </div>
);

export default ConfirmDialog;
