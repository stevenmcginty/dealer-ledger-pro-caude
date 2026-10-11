import React from 'react';
import { useData } from '../../hooks/useData';
import { useUI } from '../../hooks/useUI';
import { WorkSheet } from '../../types';
import ConfirmDialog from './ConfirmDialog';

const DeleteWorkSheetConfirmModal = ({ sheet }: { sheet: WorkSheet }) => {
    const { deleteWorkSheet } = useData();
    const { closeModal } = useUI();

    const handleConfirm = () => {
        if (deleteWorkSheet) {
            deleteWorkSheet(sheet.id);
        }
        closeModal();
    }

    return (
        <ConfirmDialog
            title={<>Delete work sheet <span className="font-mono tabular-nums">#{sheet.workSheetNumber}</span>?</>}
            keepLabel="Keep work sheet"
            confirmLabel="Delete work sheet"
            onKeep={closeModal}
            onConfirm={handleConfirm}
        >
            <p>The work sheet goes for good. You can’t undo this.</p>
        </ConfirmDialog>
    );
};

export default DeleteWorkSheetConfirmModal;
