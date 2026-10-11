import React, { useState } from 'react';
import { ExpenseCategory } from '../../types';
import { XMarkIcon, EditIcon, TrashIcon, CheckIcon } from '../icons';
import Spinner from '../common/Spinner';
import { Button, IconButton } from '../ui';
import { controlFrame, controlInput } from '../ui/cx';

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
        <li className="flex min-h-[56px] items-center gap-3 border-b border-line py-1 pe-1 ps-4 last:border-b-0">
            <span className={`h-3 w-3 flex-none rounded-full ${category.color || 'bg-ink-3'}`} aria-hidden="true" />
            {isEditing ? (
                <form onSubmit={(e) => { e.preventDefault(); handleSave(); }} className="min-w-0 flex-1">
                    <div className={controlFrame()}>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            aria-label={`New name for ${category.name}`}
                            className={controlInput}
                            autoFocus
                        />
                    </div>
                </form>
            ) : (
                <p className="min-w-0 flex-1 truncate text-base font-semibold text-ink">
                    {category.name}
                    {isProtected && <span className="ms-2 text-sm font-normal text-ink-3">always kept</span>}
                </p>
            )}

            <div className="flex flex-none items-center">
                {isLoading ? (
                    <span className="grid h-12 w-12 place-items-center"><Spinner className="h-5 w-5" /></span>
                ) : isEditing ? (
                    <>
                        <IconButton label="Save name" icon={<CheckIcon />} onClick={handleSave} className="text-success" />
                        <IconButton label="Keep old name" icon={<XMarkIcon />} onClick={() => { setIsEditing(false); setName(category.name); }} />
                    </>
                ) : (
                    <>
                        <IconButton label={`Rename ${category.name}`} icon={<EditIcon />} onClick={() => setIsEditing(true)} disabled={isProtected} className="[&_svg]:h-5 [&_svg]:w-5" />
                        <IconButton label={`Delete ${category.name}`} icon={<TrashIcon />} onClick={handleDelete} disabled={isProtected} className="hover:text-danger [&_svg]:h-5 [&_svg]:w-5" />
                    </>
                )}
            </div>
        </li>
    );
};


const CategoryManager = ({ categories, onClose, onRename, onDelete }: CategoryManagerProps) => {
    const sortedCategories = [...categories].sort((a,b) => a.order - b.order);

    return (
        <div className="flex h-full max-h-[90vh] w-full flex-col">
            <header className="flex flex-shrink-0 items-start gap-3 px-4 pb-3 pt-1 sm:px-5 sm:pt-5">
                <div className="min-w-0 flex-1 pt-1.5">
                    <h2 className="text-[1.375rem] font-bold leading-7 tracking-[-0.01em] text-ink">Expense categories</h2>
                    <p className="mt-1 text-sm text-ink-2">Rename or delete a category. “Other” always stays.</p>
                </div>
                <IconButton label="Close" icon={<XMarkIcon />} onClick={onClose} className="-me-2" />
            </header>
            <div className="flex-1 overflow-y-auto px-4 pb-4 sm:px-5">
                <ul className="m-0 list-none overflow-hidden rounded-card border border-line bg-surface p-0">
                    {sortedCategories.map(cat => (
                        <CategoryRow key={cat.id} category={cat} onRename={onRename} onDelete={onDelete} />
                    ))}
                </ul>
            </div>
            <footer className="flex flex-shrink-0 justify-end border-t border-line bg-surface px-4 py-3 sm:px-5">
                <Button onClick={onClose} className="w-full sm:w-auto">Done</Button>
            </footer>
        </div>
    );
};

export default CategoryManager;
