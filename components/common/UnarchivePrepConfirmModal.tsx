import React from 'react';
import { useData } from '../../hooks/useData';
import { useUI } from '../../hooks/useUI';
import { ToDoItem, Vehicle } from '../../types';
import { UndoIcon } from '../icons';

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
        <div className="p-6 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-blue-100">
                <UndoIcon className="h-6 w-6 text-blue-600" />
            </div>
            <h3 className="mt-4 text-lg font-semibold text-white">Move to Prep List?</h3>
            <p className="mt-2 text-sm text-gray-400">
                Are you sure you want to move all {tasks.length} prep tasks for vehicle <span className="font-bold text-gray-200">{vehicle.reg}</span> back to the dashboard?
                Their status will be reset to incomplete.
            </p>
            <div className="mt-6 flex justify-center gap-4">
                <button type="button" onClick={closeModal} className="px-4 py-2 text-sm font-medium text-gray-300 bg-gray-600 rounded-md">Cancel</button>
                <button type="button" onClick={handleConfirm} className="px-4 py-2 text-sm font-medium text-white bg-brand-600 rounded-md">Confirm & Move</button>
            </div>
        </div>
    );
};

export default UnarchivePrepConfirmModal;