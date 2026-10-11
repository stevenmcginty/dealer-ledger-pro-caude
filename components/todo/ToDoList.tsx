import React from 'react';
import { ToDoItem } from '../../types';
import { TrashIcon, PlusIcon } from '../icons';
import { formatDate, toYYYYMMDD } from '../../utils/helpers';
import { useData } from '../../hooks/useData';
import { useUI } from '../../hooks/useUI';
import { Button, Checkbox, IconButton } from '../ui';
import { cx } from '../ui/cx';

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

/** One task: tick it off, tap the words to edit, delete on the end. Nothing hides behind hover. */
export const ToDoItemRow: React.FC<ToDoItemRowProps> = ({ item }) => {
    const { updateToDo } = useData();
    const { openModal } = useUI();

    const onToggleComplete = () => {
        updateToDo(item.id, { isComplete: !item.isComplete });
    };

    const dueToday = isToday(item.dueDate);

    return (
        <div className="flex items-center border-b border-line last:border-b-0">
            <label className="grid h-14 w-12 flex-none cursor-pointer place-items-center">
                <Checkbox
                    checked={item.isComplete}
                    onChange={onToggleComplete}
                    aria-label={`Mark task "${item.description}" as ${item.isComplete ? 'not done' : 'done'}`}
                />
            </label>
            <button
                type="button"
                onClick={() => openModal('todo', { type: 'general', editingTodo: item })}
                title="Edit task"
                className="flex min-h-[56px] min-w-0 flex-1 flex-col justify-center gap-0.5 rounded-control py-2 pe-2 text-start transition-colors duration-quick ease-out hover:bg-surface-2 active:bg-surface-3"
            >
                <span className={cx('text-base leading-snug', item.isComplete ? 'text-ink-3 line-through' : 'text-ink')}>{item.description}</span>
                {item.dueDate && (
                    <span className={cx('text-sm', dueToday && !item.isComplete ? 'font-semibold text-warning-ink' : 'text-ink-3')}>
                        {item.dueTime && <span className="num">{item.dueTime} · </span>}
                        {dueToday ? 'Today' : formatDate(item.dueDate, { weekday: 'short', day: 'numeric', month: 'short' })}
                    </span>
                )}
            </button>
            <IconButton label="Delete task" icon={<TrashIcon />} onClick={() => openModal('deleteTodoConfirm', item)} className="me-1 text-ink-3" />
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
    const isTodaySelected = selectedDate === toYYYYMMDD(new Date());

    return (
         <div>
            <div className="flex items-center justify-between gap-2 ps-3.5 pe-2 pt-2">
                <h3 className="text-sm font-semibold text-ink-2">
                    {isTodaySelected ? 'Today' : formatDate(selectedDate, { weekday: 'long', day: 'numeric', month: 'long' })}
                </h3>
                <Button
                    variant="ghost"
                    size="sm"
                    icon={<PlusIcon />}
                    onClick={() => openModal('todo', { type: 'general', prefillData: { dueDate: selectedDate } })}
                >
                    Add task
                </Button>
            </div>
            <div className="max-h-60 overflow-y-auto">
                {sortedTasks.length > 0 ? (
                    sortedTasks.map(item => <ToDoItemRow key={item.id} item={item} />)
                ) : (
                    <p className="px-3.5 pb-4 pt-1 text-sm text-ink-3">No tasks on this day.</p>
                )}
            </div>
        </div>
    );
}

export default DayTasksList;
