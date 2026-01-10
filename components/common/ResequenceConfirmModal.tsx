import React from 'react';
import { ExclamationTriangleIcon } from '../icons';

interface ResequenceConfirmModalProps {
    onConfirm: () => void;
    onClose: () => void;
}

const ResequenceConfirmModal = ({ onConfirm, onClose }: ResequenceConfirmModalProps) => {
    return (
        <div className="p-6 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-yellow-100"><ExclamationTriangleIcon className="h-6 w-6 text-yellow-600" /></div>
            <h3 className="mt-4 text-lg font-semibold text-white">Confirm Stock Resequencing</h3>
            <p className="mt-2 text-sm text-gray-400">This will re-assign stock numbers to all vehicles that do not have a standard numerical stock number. The new numbers will be assigned based on purchase date. Legacy numerical stock numbers will be preserved. This action cannot be undone. Are you sure?</p>
            <div className="mt-6 flex justify-center gap-4">
                <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-300 bg-gray-600 rounded-md">Cancel</button>
                <button onClick={onConfirm} className="px-4 py-2 text-sm font-medium text-white bg-yellow-600 rounded-md">Confirm & Resequence</button>
            </div>
        </div>
    );
};

export default ResequenceConfirmModal;
