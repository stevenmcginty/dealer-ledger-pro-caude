import React from 'react';
import { useData } from '../../hooks/useData';
import { useUI } from '../../hooks/useUI';
import { ToDoItem, Vehicle } from '../../types';
import { Plate } from '../ui';
import ConfirmDialog from './ConfirmDialog';

interface ModalData {
    vehicle: Vehicle;
    tasks: ToDoItem[];
}

const UnarchivePrepConfirmModal = ({ data }: { data: ModalData }) => {
    const { unarchivePrepTasks } = useData();
    const { closeModal } = useUI();
    const { vehicle, tasks } = data;

    const handleConfirm = () => {
        const taskIds = tasks.map(t => t.id);
        unarchivePrepTasks(taskIds);
        closeModal();
    }

    return (
        <ConfirmDialog
            title={<>Move prep for <Plate reg={vehicle.reg} className="align-middle" /> back to Today?</>}
            keepLabel="Keep archived"
            confirmLabel="Move to Today"
            variant="primary"
            onKeep={closeModal}
            onConfirm={handleConfirm}
        >
            <p>All <span className="font-mono tabular-nums">{tasks.length}</span> prep jobs go back on Today, marked as not done.</p>
        </ConfirmDialog>
    );
};

export default UnarchivePrepConfirmModal;
