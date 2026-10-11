import React from 'react';
import ConfirmDialog from './ConfirmDialog';

interface ResequenceConfirmModalProps {
    onConfirm: () => void;
    onClose: () => void;
}

const ResequenceConfirmModal = ({ onConfirm, onClose }: ResequenceConfirmModalProps) => {
    return (
        <ConfirmDialog
            title="Renumber stock?"
            keepLabel="Keep numbers"
            confirmLabel="Renumber stock"
            onKeep={onClose}
            onConfirm={onConfirm}
        >
            <p>Cars without a standard stock number get a new one, in order of purchase date. Cars that already have a plain number keep it.</p>
            <p>You can’t undo this.</p>
        </ConfirmDialog>
    );
};

export default ResequenceConfirmModal;
