import React from 'react';
import { useData } from '../../hooks/useData';
import { useUI } from '../../hooks/useUI';
import { PDI } from '../../types';
import { ExclamationTriangleIcon } from '../icons';

const DeletePdiConfirmModal = ({ pdi }: { pdi: PDI }) => {
    const { deletePdi, vehicles } = useData();
    const { closeModal } = useUI();

    const carDetails = pdi.carDetails || vehicles.find(v => v.id === pdi.vehicleId);

    const handleConfirm = () => {
        if (deletePdi) {
            deletePdi(pdi.id);
        }
        closeModal();
    }

    return (
        <div className="p-6 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
                <ExclamationTriangleIcon className="h-6 w-6 text-red-600" aria-hidden="true" />
            </div>
            <h3 className="mt-4 text-lg font-semibold text-white">Delete PDI</h3>
            <p className="mt-2 text-sm text-gray-400">Are you sure you want to delete PDI #{pdi.pdiNumber}{carDetails?.reg ? ` for ${carDetails.reg}` : ''}? This action cannot be undone.</p>
            <div className="mt-6 flex justify-center gap-4">
                <button type="button" onClick={closeModal} className="px-4 py-2 text-sm font-medium text-gray-300 bg-gray-600 rounded-md">Cancel</button>
                <button type="button" onClick={handleConfirm} className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md">Delete PDI</button>
            </div>
        </div>
    );
};

export default DeletePdiConfirmModal;
