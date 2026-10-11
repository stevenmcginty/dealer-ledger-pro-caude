import React from 'react';
import { useData } from '../../hooks/useData';
import { useUI } from '../../hooks/useUI';
import { ToDoItem, Vehicle } from '../../types';
import { Plate } from '../ui';
import ConfirmDialog from './ConfirmDialog';

const ArchivePrepConfirmModal = ({ vehicle, tasks }: { vehicle: Vehicle; tasks: ToDoItem[] }) => {
    const { archivePrepTasks } = useData();
    const { closeModal } = useUI();

    const handleConfirm = () => {
        const taskIds = tasks.map(t => t.id);
        archivePrepTasks(taskIds);
        closeModal();
    }

    return (
        <ConfirmDialog
            title={<>Archive prep for <Plate reg={vehicle.reg} className="align-middle" />?</>}
            keepLabel="Keep on Today"
            confirmLabel="Archive prep"
            variant="primary"
            onKeep={closeModal}
            onConfirm={handleConfirm}
        >
            <p>All <span className="font-mono tabular-nums">{tasks.length}</span> prep jobs move off Today and into Work prep.</p>
        </ConfirmDialog>
    );
};

export default ArchivePrepConfirmModal;
