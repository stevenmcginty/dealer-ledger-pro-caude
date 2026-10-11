import React, { useState } from 'react';
import { useData } from '../../hooks/useData';
import { useUI } from '../../hooks/useUI';
import { UploadBatch } from '../../types';
import ConfirmDialog from './ConfirmDialog';

const DeleteUploadConfirmModal = ({ batch }: { batch: UploadBatch }) => {
    const { deleteUploadBatch } = useData();
    const { closeModal } = useUI();
    const [isDeleting, setIsDeleting] = useState(false);

    const handleConfirm = async () => {
        setIsDeleting(true);
        await deleteUploadBatch(batch.id);
        setIsDeleting(false);
        closeModal();
    }

    return (
        <ConfirmDialog
            title="Undo this upload?"
            keepLabel="Keep upload"
            confirmLabel={<>Delete <span className="font-mono tabular-nums">{batch.transactionCount}</span> bank lines</>}
            busy={isDeleting}
            onKeep={closeModal}
            onConfirm={handleConfirm}
        >
            <p>
                All <span className="font-mono tabular-nums">{batch.transactionCount}</span> bank lines from <span className="font-semibold text-ink [overflow-wrap:anywhere]">{batch.filename}</span> are deleted.
                Any matches made with them are undone too. You can’t undo this.
            </p>
        </ConfirmDialog>
    );
};

export default DeleteUploadConfirmModal;
