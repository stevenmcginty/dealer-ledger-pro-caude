

import React, { useState, useEffect } from 'react';
import { ToDoItem } from '../../types';
import { TrashIcon, EditIcon, PlusIcon } from '../icons';
import { formatDate } from '../../utils/helpers';
import { useData } from '../../hooks/useData';
import { useUI } from '../../hooks/useUI';

const isToday = (dateStr?: string): boolean => {
    if (!dateStr) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const date = new Date(dateStr);
    date.setHours(0,0,0,0);
    return date.getTime() === today.getTime();
};

// FIX: Extracted props to a named interface to resolve 'key' prop error.
interface ToDoItemRowProps {
    item: ToDoItem;
}
export const ToDoItemRow: React.FC<ToDoItemRowProps> = ({ item }) => {
    const { updateToDo } = useData();
    const { openModal } = useUI();

    const onToggleComplete = () => {
        updateToDo(item.id, { isComplete: !item.isComplete });
    };

    return (
        <div className="flex items-start p-3 transition-colors group">
            <input
                type="checkbox"
                checked={item.isComplete}
                onChange={onToggleComplete}
                className="h-5 w-5 rounded border-gray-500 bg-gray-900 text-brand-500 focus:ring-brand-500 mt-0.5"
                aria-label={`Mark task "${item.description}" as ${item.isComplete ? 'incomplete' : 'complete'}`}
            />
            <div className="ml-3 flex-1">
                <p className={`text-sm ${item.isComplete ? 'line-through text-gray-500' : 'text-gray-200'}`}>{item.description}</p>
                {item.dueDate && (
                     <p className={`text-xs mt-1 ${isToday(item.dueDate) ? 'text-yellow-400 font-semibold' : 'text-gray-400'}`}>
                        {item.dueTime && <span className="font-semibold">{item.dueTime}, </span>}
                        {formatDate(item.dueDate)}
                    </p>
                )}
            </div>
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button 
                    onClick={() => openModal('todo', { type: 'general', editingTodo: item })}
                    className="p-2 text-gray-400 hover:text-white" title="Edit">
                    <EditIcon className="h-4 w-4" />
                </button>
                <button 
                    onClick={() => openModal('deleteTodoConfirm', item)} 
                    className="p-2 text-gray-400 hover:text-red-400" title="Delete">
                    <TrashIcon className="h-4 w-4" />
                </button>
            </div>
        </div>
    );
};


interface DayTasksListProps {
    tasks: ToDoItem[];
    selectedDate: string;
}

const DayTasksList = ({ tasks, selectedDate }: DayTasksListProps) => {
    const { openModal } = useUI();
    const sortedTasks = [...tasks].sort((a, b) => (a.isComplete ? 1 : 0) - (b.isComplete ? 1 : 0) || a.createdAt - b.createdAt);

    return (
         <div>
            <div className="flex justify-between items-center mb-2">
                <h3 className="text-base font-semibold text-green-400">
                    Tasks for {formatDate(selectedDate)}
                </h3>
                <button 
                    onClick={() => openModal('todo', { type: 'general', prefillData: { dueDate: selectedDate } })}
                    className="inline-flex items-center gap-x-2 rounded-md bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-500"
                >
                    <PlusIcon className="h-4 w-4" /> Add Task
                </button>
            </div>
            <div className="divide-y divide-gray-700/50 max-h-60 overflow-y-auto bg-gray-900/50 rounded-lg">
                {sortedTasks.length > 0 ? (
                    sortedTasks.map(item => <ToDoItemRow key={item.id} item={item} />)
                ) : (
                    <p className="p-4 text-sm text-center text-gray-400">No tasks for this day.</p>
                )}
            </div>
        </div>
    );
}

export default DayTasksList;