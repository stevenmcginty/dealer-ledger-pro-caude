import React from 'react';
import { useData } from '../../hooks/useData';
import { useUI } from '../../hooks/useUI';
import { ExclamationTriangleIcon } from '../icons';

const ConfirmClearDataModal = () => {
    const { clearAllCompanyData } = useData();
    const { closeModal } = useUI();
    
    const handleConfirm = () => {
        clearAllCompanyData();
        closeModal();
        window.location.reload();
    }

    return (
        <div className="p-6 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-100"><ExclamationTriangleIcon className="h-6 w-6 text-red-600" /></div>
            <h3 className="mt-4 text-lg font-semibold text-white">Confirm Data Deletion</h3>
            <p className="mt-2 text-sm text-gray-400">Are you sure you want to delete all data? This action is irreversible.</p>
            <div className="mt-6 flex justify-center gap-4">
                <button onClick={closeModal} className="px-4 py-2 text-sm font-medium text-gray-300 bg-gray-600 rounded-md">Cancel</button>
                <button onClick={handleConfirm} className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md">Delete All Data</button>
            </div>
        </div>
    );
};

export default ConfirmClearDataModal;
