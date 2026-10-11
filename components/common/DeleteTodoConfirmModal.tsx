import React from 'react';
import { useData } from '../../hooks/useData';
import { useUI } from '../../hooks/useUI';
import { ToDoItem } from '../../types';
import ConfirmDialog from './ConfirmDialog';

const DeleteTodoConfirmModal = ({ todo }: { todo: ToDoItem }) => {
    const { deleteToDo } = useData();
    const { closeModal } = useUI();

    const handleConfirm = () => {
        deleteToDo(todo.id);
        closeModal();
    }

    return (
        <ConfirmDialog
            title="Delete this task?"
            keepLabel="Keep task"
            confirmLabel="Delete task"
            onKeep={closeModal}
            onConfirm={handleConfirm}
        >
            <p className="font-semibold text-ink [overflow-wrap:anywhere]">“{todo.description}”</p>
            <p>It goes for good. You can’t undo this.</p>
        </ConfirmDialog>
    );
};

export default DeleteTodoConfirmModal;
