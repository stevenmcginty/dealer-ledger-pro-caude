import React from 'react';
import { useData } from '../../hooks/useData';
import { useUI } from '../../hooks/useUI';
import { SalesDocument } from '../../types';

const UndoSaleConfirmModal = ({ document }: { document: SalesDocument }) => {
    const { undoSale } = useData();
    const { closeModal } = useUI();
    
    const handleConfirm = () => {
        undoSale(document);
        closeModal();
    }

    return (
        <div className="p-6 text-center">
            <h3 className="mt-4 text-lg font-semibold text-white">Undo Sale</h3>
            <p className="mt-2 text-sm text-gray-400">This will delete the invoice and mark the vehicle as 'Available'. Any associated part-exchange will also be removed. Are you sure?</p>
            <div className="mt-6 flex justify-center gap-4">
                <button onClick={closeModal} className="px-4 py-2 text-sm font-medium text-gray-300 bg-gray-600 rounded-md">Cancel</button>
                <button onClick={handleConfirm} className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md">Confirm & Undo</button>
            </div>
        </div>
    );
};

export default UndoSaleConfirmModal;
