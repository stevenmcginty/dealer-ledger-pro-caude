import React, { useState, useEffect } from 'react';
import { Supplier } from '../../types';
import { useData } from '../../hooks/useData';
import { useUI } from '../../hooks/useUI';
import { XMarkIcon, TrashIcon } from '../icons';
import { Alert, Button, Field, IconButton, Input } from '../ui';
import { TextArea, dangerQuiet } from './SettingsKit';

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
            setError(err.message || "Something went wrong. Try again.");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = async () => {
        if (!isEditing) return;
        if (window.confirm(`Delete the supplier "${editingSupplier.name}"? You can't undo this.`)) {
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
        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col" aria-labelledby="supplier-editor-title">
            <header className="flex flex-none items-start gap-3 px-5 pb-3 pt-2 sm:pt-5">
                <h2 id="supplier-editor-title" className="min-w-0 flex-1 pt-2.5 text-[1.375rem] font-bold leading-7 tracking-[-0.01em] text-ink">
                    {isEditing ? `Edit ${editingSupplier.name}` : 'Add supplier'}
                </h2>
                <IconButton label="Close" icon={<XMarkIcon />} onClick={closeModal} className="-me-2" />
            </header>
            <div className="flex-1 space-y-5 overflow-y-auto px-5 pb-5">
                {error && <Alert tone="danger" title="Couldn't save the supplier">{error}</Alert>}
                <Input
                    id="name"
                    label="Supplier name"
                    type="text"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    required
                    autoFocus
                />
                <Field
                    label="Match words"
                    htmlFor="keys"
                    hint="Words from the bank line that mean this supplier, split by commas."
                >
                    <TextArea
                        id="keys"
                        value={keys}
                        onChange={e => setKeys(e.target.value)}
                        rows={3}
                        placeholder="autobits, ab parts, autobits ltd"
                    />
                </Field>
            </div>
            <footer className="flex flex-none flex-wrap items-center gap-2 border-t border-line px-4 py-3 sm:px-5">
                {isEditing && (
                    <button type="button" onClick={handleDelete} disabled={isSubmitting} className={`${dangerQuiet} me-auto`}>
                        <TrashIcon /> Delete
                    </button>
                )}
                <div className="ms-auto flex flex-1 gap-2 sm:flex-none">
                    <Button type="button" variant="secondary" onClick={closeModal} className="flex-1 sm:flex-none">Cancel</Button>
                    <Button type="submit" loading={isSubmitting} className="flex-1 sm:flex-none">Save supplier</Button>
                </div>
            </footer>
        </form>
    );
};

export default SupplierEditorModal;
