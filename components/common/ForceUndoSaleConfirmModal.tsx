import React from 'react';
import { useData } from '../../hooks/useData';
import { useUI } from '../../hooks/useUI';
import { Vehicle } from '../../types';
import { ExclamationTriangleIcon } from '../icons';

const ForceUndoSaleConfirmModal = ({ vehicle }: { vehicle: Vehicle }) => {
    const { updateVehicle } = useData();
    const { closeModal } = useUI();
    
    const handleConfirm = () => {
        updateVehicle(vehicle.id, { status: 'Available' });
        closeModal();
    }

    return (
        <div className="p-6 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-yellow-100"><ExclamationTriangleIcon className="h-6 w-6 text-yellow-600" /></div>
            <h3 className="mt-4 text-lg font-semibold text-white">Fix Sale Status</h3>
            <p className="mt-2 text-sm text-gray-400">
                No sales invoice was found for {vehicle.reg}. This will reset the vehicle's status to 'Available'. This is useful if a sale was recorded incorrectly.
            </p>
            <div className="mt-6 flex justify-center gap-4">
                <button type="button" onClick={closeModal} className="px-4 py-2 text-sm font-medium text-gray-300 bg-gray-600 rounded-md">Cancel</button>
                <button type="button" onClick={handleConfirm} className="px-4 py-2 text-sm font-medium text-white bg-yellow-600 rounded-md">Reset to Available</button>
            </div>
        </div>
    );
};

export default ForceUndoSaleConfirmModal;