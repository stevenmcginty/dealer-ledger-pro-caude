

import React, { useState } from 'react';
import { ExpenseCategory } from '../../types';
import { XMarkIcon, EditIcon, TrashIcon, CheckCircleIcon } from '../icons';
import Spinner from '../common/Spinner';

interface CategoryManagerProps {
    categories: ExpenseCategory[];
    onClose: () => void;
    onRename: (id: string, newName: string) => Promise<boolean>;
    onDelete: (id: string) => Promise<boolean>;
}

// FIX: Extracted props to a named interface to resolve 'key' prop error.
interface CategoryRowProps {
    category: ExpenseCategory;
    onRename: (id: string, newName: string) => Promise<boolean>;
    onDelete: (id: string) => Promise<boolean>;
}
const CategoryRow: React.FC<CategoryRowProps> = ({ category, onRename, onDelete }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [name, setName] = useState(category.name);
    const [isLoading, setIsLoading] = useState(false);
    const isProtected = category.name === 'Other';

    const handleSave = async () => {
        if (name === category.name) {
            setIsEditing(false);
            return;
        }
        setIsLoading(true);
        const success = await onRename(category.id, name);
        setIsLoading(false);
        if (success) {
            setIsEditing(false);
        }
    };
    
    const handleDelete = async () => {
        if (window.confirm(`Are you sure you want to delete the category "${category.name}"? This cannot be undone.`)) {
            setIsLoading(true);
            await onDelete(category.id);
            setIsLoading(false);
        }
    };

    return (
        <li className="flex items-center justify-between p-3 bg-gray-700/50 rounded-md">
            {isEditing ? (
                 <form onSubmit={(e) => { e.preventDefault(); handleSave(); }} className="flex-1 flex items-center gap-x-2">
                    <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="flex-1 bg-gray-600 border-gray-500 rounded-md py-1 px-2 text-white"
                        autoFocus
                    />
                </form>
            ) : (
                <p className="text-sm font-semibold text-white">{category.name}</p>
            )}

            <div className="flex items-center gap-x-2 ml-4">
                {isLoading ? (
                    <Spinner className="h-5 w-5" />
                ) : isEditing ? (
                    <>
                        <button onClick={handleSave} className="p-2 text-green-400 hover:text-green-300"><CheckCircleIcon className="h-5 w-5" /></button>
                        <button onClick={() => { setIsEditing(false); setName(category.name); }} className="p-2 text-gray-400 hover:text-white"><XMarkIcon className="h-5 w-5" /></button>
                    </>
                ) : (
                    <>
                        <button onClick={() => setIsEditing(true)} disabled={isProtected} className="p-2 text-gray-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed" title="Rename"><EditIcon className="h-5 w-5" /></button>
                        <button onClick={handleDelete} disabled={isProtected} className="p-2 text-gray-400 hover:text-red-400 disabled:opacity-50 disabled:cursor-not-allowed" title="Delete"><TrashIcon className="h-5 w-5" /></button>
                    </>
                )}
            </div>
        </li>
    );
};


const CategoryManager = ({ categories, onClose, onRename, onDelete }: CategoryManagerProps) => {
    const sortedCategories = [...categories].sort((a,b) => a.order - b.order);

    return (
        <div className="w-full flex flex-col h-full max-h-[90vh]">
            <header className="p-4 border-b border-gray-700 flex items-center justify-between flex-shrink-0">
                <h2 className="text-lg font-bold text-white">Manage Expense Categories</h2>
                <button onClick={onClose} className="p-1 rounded-full text-gray-400 hover:bg-gray-700"><XMarkIcon className="h-6 w-6" /></button>
            </header>
            <div className="p-6 space-y-4 flex-1 overflow-y-auto">
                <p className="text-sm text-gray-400">Here you can rename and delete your expense categories. Note: The "Other" category cannot be changed or deleted.</p>
                <ul className="space-y-2">
                    {sortedCategories.map(cat => (
                        <CategoryRow key={cat.id} category={cat} onRename={onRename} onDelete={onDelete} />
                    ))}
                </ul>
            </div>
             <footer className="flex-shrink-0 p-4 border-t border-gray-700 flex justify-end bg-gray-800">
                <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-white bg-brand-blue-600 hover:bg-brand-blue-700 rounded-md">Done</button>
            </footer>
        </div>
    );
};

export default CategoryManager;