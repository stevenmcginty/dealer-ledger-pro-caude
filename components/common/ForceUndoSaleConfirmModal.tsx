import React from 'react';
import { useData } from '../../hooks/useData';
import { useUI } from '../../hooks/useUI';
import { Vehicle } from '../../types';
import { Plate } from '../ui';
import ConfirmDialog from './ConfirmDialog';

const ForceUndoSaleConfirmModal = ({ vehicle }: { vehicle: Vehicle }) => {
    const { updateVehicle } = useData();
    const { closeModal } = useUI();

    const handleConfirm = () => {
        updateVehicle(vehicle.id, { status: 'Available' });
        closeModal();
    }

    return (
        <ConfirmDialog
            title={<>Mark <Plate reg={vehicle.reg} className="align-middle" /> as available?</>}
            keepLabel="Keep as sold"
            confirmLabel="Mark as available"
            variant="primary"
            onKeep={closeModal}
            onConfirm={handleConfirm}
        >
            <p>There’s no sales invoice for this car. This puts it back in stock as Available. Use it when a sale was recorded by mistake.</p>
        </ConfirmDialog>
    );
};

export default ForceUndoSaleConfirmModal;
