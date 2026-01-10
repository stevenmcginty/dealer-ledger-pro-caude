import React, { useState } from 'react';
import { useData } from '../../hooks/useData';
import { useUI } from '../../hooks/useUI';
import { UploadBatch } from '../../types';
import { ExclamationTriangleIcon } from '../icons';
import Spinner from './Spinner';

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
        <div className="p-6 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
                <ExclamationTriangleIcon className="h-6 w-6 text-red-600" aria-hidden="true" />
            </div>
            <h3 className="mt-4 text-lg font-semibold text-white">Undo Upload</h3>
            <p className="mt-2 text-sm text-gray-400">
                Are you sure you want to delete all {batch.transactionCount} transactions from the file <span className="font-bold text-gray-200">{batch.filename}</span>? 
                This will also undo any reconciliations made with these transactions. This action cannot be undone.
            </p>
            <div className="mt-6 flex justify-center gap-4">
                <button type="button" onClick={closeModal} disabled={isDeleting} className="px-4 py-2 text-sm font-medium text-gray-300 bg-gray-600 rounded-md disabled:opacity-50">Cancel</button>
                <button type="button" onClick={handleConfirm} disabled={isDeleting} className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md disabled:opacity-50">
                    {isDeleting ? <Spinner className="h-5 w-5" /> : `Yes, Delete All`}
                </button>
            </div>
        </div>
    );
};

export default DeleteUploadConfirmModal;