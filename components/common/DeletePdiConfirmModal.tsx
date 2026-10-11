import React from 'react';
import { useData } from '../../hooks/useData';
import { useUI } from '../../hooks/useUI';
import { PDI } from '../../types';
import { Plate } from '../ui';
import ConfirmDialog from './ConfirmDialog';

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
        <ConfirmDialog
            title={<>Delete PDI <span className="font-mono tabular-nums">#{pdi.pdiNumber}</span>?</>}
            keepLabel="Keep PDI"
            confirmLabel="Delete PDI"
            onKeep={closeModal}
            onConfirm={handleConfirm}
        >
            <p>
                {carDetails?.reg
                    ? <>The PDI for <Plate reg={carDetails.reg} size="sm" className="align-middle" /> goes for good.</>
                    : 'This PDI goes for good.'}
                {' '}You can’t undo this.
            </p>
        </ConfirmDialog>
    );
};

export default DeletePdiConfirmModal;
