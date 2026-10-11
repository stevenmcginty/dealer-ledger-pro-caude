import React from 'react';
import { useData } from '../../hooks/useData';
import { useUI } from '../../hooks/useUI';
import { InternalJob } from '../../types';
import ConfirmDialog from './ConfirmDialog';

const DeleteInternalJobConfirmModal = ({ job }: { job: InternalJob }) => {
    const { deleteInternalJob } = useData();
    const { closeModal } = useUI();

    const handleConfirm = () => {
        if (deleteInternalJob) {
            deleteInternalJob(job.id);
        }
        closeModal();
    };

    return (
        <ConfirmDialog
            title={<>Delete job sheet <span className="font-mono tabular-nums">#{job.jobSheetNumber}</span>?</>}
            keepLabel="Keep job sheet"
            confirmLabel="Delete job sheet"
            onKeep={closeModal}
            onConfirm={handleConfirm}
        >
            <p>This internal job sheet goes for good. You can’t undo this.</p>
        </ConfirmDialog>
    );
};

export default DeleteInternalJobConfirmModal;
