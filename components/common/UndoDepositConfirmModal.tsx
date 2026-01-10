import React from 'react';
import { useData } from '../../hooks/useData';
import { useUI } from '../../hooks/useUI';
import { SalesDocument } from '../../types';

const UndoDepositConfirmModal = ({ document }: { document: SalesDocument }) => {
    const { undoDeposit } = useData();
    const { closeModal } = useUI();
    
    const handleConfirm = () => {
        undoDeposit(document);
        closeModal();
    }

    return (
        <div className="p-6 text-center">
            <h3 className="mt-4 text-lg font-semibold text-white">Undo Deposit</h3>
            <p className="mt-2 text-sm text-gray-400">This will delete the deposit slip and mark the vehicle as 'Available'. Any prep tasks from this deposit will also be removed. Are you sure?</p>
            <div className="mt-6 flex justify-center gap-4">
                <button onClick={closeModal} className="px-4 py-2 text-sm font-medium text-gray-300 bg-gray-600 rounded-md">Cancel</button>
                <button onClick={handleConfirm} className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md">Confirm & Undo</button>
            </div>
        </div>
    );
};

export default UndoDepositConfirmModal;
