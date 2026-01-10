import React from 'react';
import { ExclamationTriangleIcon } from '../icons';

interface BulkDeleteConfirmModalProps {
    count: number;
    onConfirm: () => void;
    onClose: () => void;
}

const BulkDeleteConfirmModal = ({ count, onConfirm, onClose }: BulkDeleteConfirmModalProps) => {
    return (
        <div className="p-6 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-100"><ExclamationTriangleIcon className="h-6 w-6 text-red-600" /></div>
            <h3 className="mt-4 text-lg font-semibold text-white">Confirm File Deletion</h3>
            <p className="mt-2 text-sm text-gray-400">
                Are you sure you want to permanently delete the files for {count} selected item(s)? The data records will be kept, but the associated files cannot be recovered.
            </p>
            <div className="mt-6 flex justify-center gap-4">
                <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-300 bg-gray-600 rounded-md">Cancel</button>
                <button type="button" onClick={onConfirm} className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md">Delete {count} Files</button>
            </div>
        </div>
    );
};

export default BulkDeleteConfirmModal;
