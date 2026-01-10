import React, { useState, useEffect, useMemo } from 'react';
import { Customer, NewCustomer } from '../../types';
import { useData } from '../../hooks/useData';
import { useUI } from '../../hooks/useUI';
import { XMarkIcon, PlusIcon, TrashIcon, EditIcon, CheckCircleIcon } from '../icons';
import Spinner from '../common/Spinner';
import { formatCurrency } from '../../utils/helpers';

interface CustomerEditorProps {
    customer: Customer | null;
    onSave: (data: NewCustomer | Partial<NewCustomer>, id?: string) => Promise<void>;
    onCancel: () => void;
}

const CustomerEditor: React.FC<CustomerEditorProps> = ({ customer, onSave, onCancel }) => {
    const [name, setName] = useState('');
    const [address, setAddress] = useState('');
    const [email, setEmail] = useState('');
    const [phone, setPhone] = useState('');
    const [isBusiness, setIsBusiness] = useState(false);
    const [vatNumber, setVatNumber] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (customer) {
            setName(customer.name);
            setAddress(customer.address);
            setEmail(customer.email || '');
            setPhone(customer.phone || '');
            setIsBusiness(customer.isBusiness || false);
            setVatNumber(customer.vatNumber || '');
        }
    }, [customer]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        const data = { name, address, email, phone, isBusiness, vatNumber };
        await onSave(data, customer?.id);
        setIsSubmitting(false);
    };

    return (
        <form onSubmit={handleSubmit} className="p-4 bg-gray-700/50 rounded-lg space-y-4">
            <h3 className="font-semibold text-white">{customer ? 'Edit Customer' : 'Add New Customer'}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div><label className="block text-sm text-gray-300">Name</label><input type="text" value={name} onChange={e => setName(e.target.value)} required className="mt-1 w-full bg-gray-700 rounded-md py-2 px-3 text-white" /></div>
                <div><label className="block text-sm text-gray-300">Email</label><input type="email" value={email} onChange={e => setEmail(e.target.value)} className="mt-1 w-full bg-gray-700 rounded-md py-2 px-3 text-white" /></div>
                <div><label className="block text-sm text-gray-300">Phone</label><input type="text" value={phone} onChange={e => setPhone(e.target.value)} className="mt-1 w-full bg-gray-700 rounded-md py-2 px-3 text-white" /></div>
            </div>
            <div><label className="block text-sm text-gray-300">Address</label><textarea value={address} onChange={e => setAddress(e.target.value)} required rows={2} className="mt-1 w-full bg-gray-700 rounded-md py-2 px-3 text-white" /></div>
            <div className="relative flex items-start"><div className="flex h-6 items-center"><input type="checkbox" checked={isBusiness} onChange={e => setIsBusiness(e.target.checked)} className="h-4 w-4 rounded bg-gray-700 text-brand-600" /></div><div className="ml-3 text-sm"><label className="font-medium text-gray-300">This is a business account</label></div></div>
            {isBusiness && (
                <div><label className="block text-sm text-gray-300">VAT Number</label><input type="text" value={vatNumber} onChange={e => setVatNumber(e.target.value)} className="mt-1 w-full bg-gray-700 rounded-md py-2 px-3 text-white" /></div>
            )}
            <div className="flex justify-end gap-2">
                <button type="button" onClick={onCancel} className="px-4 py-2 text-sm bg-gray-600 rounded-md">Cancel</button>
                <button type="submit" disabled={isSubmitting} className="px-4 py-2 text-sm bg-brand-600 rounded-md">{isSubmitting ? <Spinner/> : 'Save'}</button>
            </div>
        </form>
    );
};

const CustomerManagerModal = () => {
    const { closeModal, openModal } = useUI();
    const { customers, jobInvoices, addCustomer, updateCustomer, deleteCustomer } = useData();
    const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
    const [isAdding, setIsAdding] = useState(false);

    const customerStats = useMemo(() => {
        const stats = new Map<string, { jobCount: number, lifetimeValue: number }>();
        jobInvoices.forEach(invoice => {
            if (invoice.status === 'Invoice') {
                const current = stats.get(invoice.customerId) || { jobCount: 0, lifetimeValue: 0 };
                current.jobCount += 1;
                current.lifetimeValue += invoice.total;
                stats.set(invoice.customerId, current);
            }
        });
        return stats;
    }, [jobInvoices]);

    const handleSave = async (data: NewCustomer | Partial<NewCustomer>, id?: string) => {
        if (id) {
            await updateCustomer(id, data);
        } else {
            await addCustomer(data as NewCustomer);
        }
        setEditingCustomer(null);
        setIsAdding(false);
    };
    
    const handleDelete = (customer: Customer) => {
        if(window.confirm(`Are you sure you want to delete ${customer.name}? This cannot be undone.`)){
            deleteCustomer(customer.id);
        }
    }

    return (
        <div className="w-full flex flex-col h-full max-h-[90vh]">
            <header className="p-4 border-b border-gray-700 flex items-center justify-between">
                <h2 className="text-lg font-bold text-white">Customer Management</h2>
                <button onClick={closeModal} className="p-1 rounded-full text-gray-400 hover:bg-gray-700"><XMarkIcon className="h-6 w-6" /></button>
            </header>
            <div className="p-6 space-y-4 flex-1 overflow-y-auto">
                <button onClick={() => setIsAdding(true)} className="w-full flex items-center justify-center gap-2 p-3 rounded-lg border-2 border-dashed border-gray-600 text-gray-300 hover:border-gray-500 hover:text-white">
                    <PlusIcon className="h-5 w-5" /> Add New Customer
                </button>
                {isAdding && !editingCustomer && <CustomerEditor customer={null} onSave={handleSave} onCancel={() => setIsAdding(false)} />}
                
                <ul className="space-y-2">
                    {customers.map(c => {
                        const stats = customerStats.get(c.id);
                        return (
                            <li key={c.id}>
                                {editingCustomer?.id === c.id ? (
                                    <CustomerEditor customer={c} onSave={handleSave} onCancel={() => setEditingCustomer(null)} />
                                ) : (
                                    <div className="p-3 bg-gray-900/50 rounded-md">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <p className="font-semibold text-white">{c.name}</p>
                                                <p className="text-xs text-gray-400">{c.address.split('\n')[0]}</p>
                                            </div>
                                            <div className="flex gap-1">
                                                <button onClick={() => openModal('customerDetailView', c)} className="px-3 py-2 text-xs font-semibold bg-gray-700 rounded-md text-white hover:bg-gray-600">View History</button>
                                                <button onClick={() => setEditingCustomer(c)} className="p-2 text-gray-400 hover:text-white"><EditIcon className="h-5 w-5"/></button>
                                                <button onClick={() => handleDelete(c)} className="p-2 text-gray-400 hover:text-red-400"><TrashIcon className="h-5 w-5"/></button>
                                            </div>
                                        </div>
                                        {stats && (
                                            <div className="mt-2 pt-2 border-t border-gray-700/50 flex items-center gap-4 text-xs">
                                                <span className="text-gray-400">Jobs: <span className="font-bold text-white">{stats.jobCount}</span></span>
                                                <span className="text-gray-400">Lifetime Value: <span className="font-bold text-white">{formatCurrency(stats.lifetimeValue)}</span></span>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </li>
                        )
                    })}
                </ul>
            </div>
             <footer className="flex-shrink-0 p-4 border-t border-gray-700 flex justify-end bg-gray-800">
                <button type="button" onClick={closeModal} className="px-4 py-2 text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 rounded-md">Done</button>
            </footer>
        </div>
    );
};

export default CustomerManagerModal;
