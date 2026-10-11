import React from 'react';
import { ExclamationTriangleIcon } from '../icons';
import { Button } from '../ui';

interface BulkDeleteConfirmModalProps {
    count: number;
    onConfirm: () => void;
    onClose: () => void;
}

const BulkDeleteConfirmModal = ({ count, onConfirm, onClose }: BulkDeleteConfirmModalProps) => {
    return (
        <div className="px-5 pb-5 pt-2 sm:pt-5">
            <div className="flex items-start gap-3">
                <span aria-hidden="true" className="grid h-12 w-12 flex-none place-items-center rounded-card bg-danger-soft text-danger-ink"><ExclamationTriangleIcon className="h-6 w-6" /></span>
                <div className="min-w-0 pt-0.5">
                    <h2 className="text-[1.375rem] font-bold leading-7 tracking-[-0.01em] text-ink">Delete the files for <span className="num">{count}</span> {count === 1 ? 'item' : 'items'}?</h2>
                    <p className="mt-1 text-sm leading-5 text-ink-2">The records stay; only the files go. You can't undo this.</p>
                </div>
            </div>
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button type="button" variant="secondary" onClick={onClose}>Keep files</Button>
                <Button type="button" variant="danger" onClick={onConfirm}>Delete <span className="num">{count}</span> {count === 1 ? 'file' : 'files'}</Button>
            </div>
        </div>
    );
};

export default BulkDeleteConfirmModal;
