import React from 'react';
import { useData } from '../../hooks/useData';
import { useUI } from '../../hooks/useUI';
import { ToDoItem } from '../../types';

const DeleteTodoConfirmModal = ({ todo }: { todo: ToDoItem }) => {
    const { deleteToDo } = useData();
    const { closeModal } = useUI();

    const handleConfirm = () => {
        deleteToDo(todo.id);
        closeModal();
    }

    return (
        <div className="p-6 text-center">
            <h3 className="mt-4 text-lg font-semibold text-white">Delete Task</h3>
            <p className="mt-2 text-sm text-gray-400">Are you sure you want to delete this task? "{todo.description}"</p>
            <div className="mt-6 flex justify-center gap-4">
                <button onClick={closeModal} className="px-4 py-2 text-sm font-medium text-gray-300 bg-gray-600 rounded-md">Cancel</button>
                <button onClick={handleConfirm} className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md">Delete</button>
            </div>
        </div>
    );
};

export default DeleteTodoConfirmModal;
