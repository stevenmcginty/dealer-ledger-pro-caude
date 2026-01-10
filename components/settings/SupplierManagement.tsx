

import React from 'react';
import { useData } from '../../hooks/useData';
import { useUI } from '../../hooks/useUI';
import { PlusIcon, EditIcon } from '../icons';
import { Supplier } from '../../types';

// FIX: Extracted props to a named interface to resolve 'key' prop error.
interface SupplierRowProps {
    supplier: Supplier;
}
const SupplierRow: React.FC<SupplierRowProps> = ({ supplier }) => {
    const { openModal } = useUI();
    return (
        <li className="flex items-center justify-between p-3 bg-gray-900/50 rounded-md">
            <div>
                <p className="font-semibold text-white">{supplier.name}</p>
                <p className="text-xs text-gray-400">
                    Keys: {supplier.reconciliationKeys.join(', ')}
                </p>
            </div>
            <button
                onClick={() => openModal('supplier', supplier)}
                className="p-2 rounded-full text-gray-400 hover:bg-gray-700 hover:text-white"
                title={`Edit ${supplier.name}`}
            >
                <EditIcon className="h-5 w-5" />
            </button>
        </li>
    );
};

const SupplierManagement = () => {
    const { suppliers } = useData();
    const { openModal } = useUI();

    return (
        <div className="space-y-6 max-w-3xl mx-auto">
            <div className="bg-gray-800 p-6 rounded-lg shadow-lg">
                <div className="flex justify-between items-center">
                    <div>
                        <h2 className="text-lg font-semibold text-white">On-Account Suppliers</h2>
                        <p className="text-sm text-gray-400 mt-1">Manage suppliers for whom you pay multiple invoices with a single bank payment.</p>
                    </div>
                    <button
                        onClick={() => openModal('supplier')}
                        className="inline-flex items-center gap-x-2 rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-500"
                    >
                        <PlusIcon className="h-5 w-5" /> Add Supplier
                    </button>
                </div>

                <div className="mt-6">
                    {suppliers.length > 0 ? (
                        <ul className="space-y-3">
                            {suppliers.map(supplier => (
                                <SupplierRow key={supplier.id} supplier={supplier} />
                            ))}
                        </ul>
                    ) : (
                        <div className="text-center py-8 px-4 border-2 border-dashed border-gray-700 rounded-lg">
                            <p className="text-gray-400">No suppliers configured.</p>
                            <p className="text-sm text-gray-500 mt-1">Add a supplier to get started.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default SupplierManagement;