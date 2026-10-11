import React from 'react';
import ConfirmDialog from './ConfirmDialog';

interface BulkDeleteConfirmModalProps {
    count: number;
    itemType?: string;
    onConfirm: () => void;
    onClose: () => void;
}

const BulkDeleteConfirmModal = ({ count, itemType = 'items', onConfirm, onClose }: BulkDeleteConfirmModalProps) => {
    return (
        <ConfirmDialog
            title={`Delete ${count} ${itemType}?`}
            keepLabel={`Keep ${itemType}`}
            confirmLabel={`Delete ${count} ${itemType}`}
            onKeep={onClose}
            onConfirm={onConfirm}
        >
            <p>They go for good. You can’t undo this.</p>
        </ConfirmDialog>
    );
};

export default BulkDeleteConfirmModal;
