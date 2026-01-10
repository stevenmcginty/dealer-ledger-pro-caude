import React, { useState, useEffect } from 'react';
import { Supplier, NewSupplier, SupplierUpdate } from '../../types';
import { useData } from '../../hooks/useData';
import { useUI } from '../../hooks/useUI';
import { XMarkIcon, TrashIcon } from '../icons';
import Spinner from '../common/Spinner';

interface SupplierEditorModalProps {
    editingSupplier: Supplier | null;
}

const SupplierEditorModal = ({ editingSupplier }: SupplierEditorModalProps) => {
    const { closeModal } = useUI();
    const { addSupplier, updateSupplier, deleteSupplier } = useData();
    const [name, setName] = useState('');
    const [keys, setKeys] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const isEditing = !!editingSupplier;

    useEffect(() => {
        if (isEditing) {
            setName(editingSupplier.name);
            setKeys((editingSupplier.reconciliationKeys || []).join(', '));
        }
    }, [editingSupplier, isEditing]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        setError(null);

        const supplierData = {
            name: name.trim(),
            reconciliationKeys: keys.split(',').map(k => k.trim()).filter(Boolean),
        };

        try {
            if (isEditing) {
                await updateSupplier(editingSupplier.id, supplierData);
            } else {
                await addSupplier(supplierData);
            }
            closeModal();
        } catch (err: any) {
            console.error("Failed to save supplier:", err);
            setError(err.message || "An unexpected error occurred.");
        } finally {
            setIsSubmitting(false);
        }
    };
    
    const handleDelete = async () => {
        if (!isEditing) return;
        if (window.confirm(`Are you sure you want to delete the supplier "${editingSupplier.name}"? This action cannot be undone.`)) {
             setIsSubmitting(true);
             setError(null);
             try {
                await deleteSupplier(editingSupplier.id);
                closeModal();
             } catch(err: any) {
                 setError(err.message);
                 setIsSubmitting(false);
             }
        }
    };

    return (
        <form onSubmit={handleSubmit} className="flex flex-col">
            <header className="p-4 border-b border-gray-700 flex items-center justify-between">
                <h2 className="text-lg font-bold text-white">
                    {isEditing ? 'Edit Supplier' : 'Add Supplier'}
                </h2>
                <button type="button" onClick={closeModal} className="p-1 rounded-full text-gray-400 hover:bg-gray-700">
                    <XMarkIcon className="h-6 w-6" />
                </button>
            </header>
            <div className="p-4 space-y-4">
                 {error && (
                    <div className="bg-red-900/50 border border-red-700 text-red-300 px-4 py-3 rounded-lg text-sm">
                        {error}
                    </div>
                )}
                <div>
                    <label htmlFor="name" className="block text-sm font-medium text-gray-300">Supplier Name</label>
                    <input
                        id="name"
                        type="text"
                        value={name}
                        onChange={e => setName(e.target.value)}
                        required
                        className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md py-2 px-3 text-white"
                        autoFocus
                    />
                </div>
                <div>
                    <label htmlFor="keys" className="block text-sm font-medium text-gray-300">Reconciliation Keys</label>
                    <textarea
                        id="keys"
                        value={keys}
                        onChange={e => setKeys(e.target.value)}
                        rows={3}
                        className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md py-2 px-3 text-white"
                        placeholder="e.g., autobits, ab parts, autobits ltd"
                    />
                    <p className="mt-1 text-xs text-gray-400">
                        Enter comma-separated keywords found in bank statement descriptions to auto-match this supplier.
                    </p>
                </div>
            </div>
            <footer className="p-4 border-t border-gray-700 flex justify-between items-center">
                 <div>
                    {isEditing && (
                        <button
                            type="button"
                            onClick={handleDelete}
                            disabled={isSubmitting}
                            className="inline-flex items-center text-sm font-medium text-red-400 hover:text-red-300 disabled:opacity-50"
                        >
                            <TrashIcon className="h-5 w-5 mr-2 -ml-1" />
                            Delete Supplier
                        </button>
                    )}
                </div>
                <div className="flex space-x-3">
                    <button type="button" onClick={closeModal} className="px-4 py-2 text-sm font-medium text-gray-300 bg-gray-600 hover:bg-gray-500 rounded-md">Cancel</button>
                    <button type="submit" disabled={isSubmitting} className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-50">
                        {isSubmitting ? <Spinner /> : 'Save Supplier'}
                    </button>
                </div>
            </footer>
        </form>
    );
};

export default SupplierEditorModal;
