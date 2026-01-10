

import React, { useState } from 'react';
import { useData } from '../../hooks/useData';
import { FinancialAccount, NewFinancialAccount } from '../../types';
import { BanknotesIcon, CreditCardIcon, PlusIcon, TrashIcon, CheckCircleIcon, EditIcon, XMarkIcon } from '../icons';
import Spinner from '../common/Spinner';
import Select from '../common/Select';

// FIX: Extracted props to a named interface to resolve 'key' prop error.
interface AccountRowProps {
    account: FinancialAccount;
}
const AccountRow: React.FC<AccountRowProps> = ({ account }) => {
    const { updateFinancialAccount, deleteFinancialAccount } = useData();
    const [name, setName] = useState(account.name);
    const [isEditing, setIsEditing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    const handleSave = async () => {
        if (name.trim() === '' || name.trim() === account.name) {
            setIsEditing(false);
            setName(account.name);
            return;
        }
        setIsSaving(true);
        await updateFinancialAccount(account.id, { name: name.trim() });
        setIsSaving(false);
        setIsEditing(false);
    };
    
    const handleDelete = () => {
        if (window.confirm(`Are you sure you want to delete the account "${account.name}"? This cannot be undone.`)) {
            deleteFinancialAccount(account.id);
        }
    }

    const Icon = account.type === 'Bank' ? BanknotesIcon : CreditCardIcon;

    return (
        <li className="flex items-center justify-between p-3 bg-gray-900/50 rounded-md">
            <div className="flex items-center gap-3">
                <Icon className="h-6 w-6 text-gray-400" />
                {isEditing ? (
                    <input 
                        type="text" 
                        value={name} 
                        onChange={(e) => setName(e.target.value)} 
                        className="bg-gray-700 border-gray-600 rounded-md py-1 px-2 text-white"
                        autoFocus
                        onBlur={handleSave}
                        onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                    />
                ) : (
                    <div>
                        <p className="font-semibold text-white">{account.name}</p>
                        <p className="text-xs text-gray-500">{account.type}</p>
                    </div>
                )}
            </div>
            <div className="flex items-center gap-2">
                {isEditing ? (
                    <>
                        <button onClick={handleSave} disabled={isSaving} className="p-2 text-green-400 hover:text-green-300">
                            {isSaving ? <Spinner className="h-5 w-5"/> : <CheckCircleIcon className="h-5 w-5"/>}
                        </button>
                        <button onClick={() => { setIsEditing(false); setName(account.name); }} className="p-2 text-gray-400 hover:text-white">
                            <XMarkIcon className="h-5 w-5"/>
                        </button>
                    </>
                ) : (
                    <>
                        <button onClick={() => setIsEditing(true)} className="p-2 text-gray-400 hover:text-white"><EditIcon className="h-5 w-5"/></button>
                        <button onClick={handleDelete} className="p-2 text-gray-400 hover:text-red-400"><TrashIcon className="h-5 w-5"/></button>
                    </>
                )}
            </div>
        </li>
    );
};

const AccountManagement = () => {
    const { financialAccounts, addFinancialAccount } = useData();
    const [newName, setNewName] = useState('');
    const [newType, setNewType] = useState<'Bank' | 'Credit Card'>('Bank');
    const [isAdding, setIsAdding] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (newName.trim() === '') return;
        setIsAdding(true);
        await addFinancialAccount({ name: newName.trim(), type: newType });
        setNewName('');
        setIsAdding(false);
    };

    return (
        <div className="space-y-6 max-w-3xl mx-auto">
            <div className="bg-gray-800 p-6 rounded-lg shadow-lg">
                <h2 className="text-lg font-semibold text-white">Financial Accounts</h2>
                <p className="text-sm text-gray-400 mt-1">Manage the bank and credit card accounts you upload statements for.</p>
                <div className="mt-6">
                    {financialAccounts.length > 0 ? (
                        <ul className="space-y-3">
                            {financialAccounts.map(acc => <AccountRow key={acc.id} account={acc} />)}
                        </ul>
                    ) : (
                         <p className="text-center text-gray-400 py-4">No accounts configured.</p>
                    )}
                </div>
                 <form onSubmit={handleSubmit} className="mt-6 pt-6 border-t border-gray-700 space-y-4">
                    <h3 className="text-base font-semibold text-white">Add New Account</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                         <div className="sm:col-span-2">
                            <label htmlFor="newName" className="block text-sm font-medium text-gray-300">Account Name</label>
                            <input
                                id="newName"
                                type="text"
                                value={newName}
                                onChange={e => setNewName(e.target.value)}
                                placeholder="e.g., HSBC Current, Amex Gold"
                                required
                                className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md py-2 px-3 text-white"
                            />
                        </div>
                         <div>
                            <label htmlFor="newType" className="block text-sm font-medium text-gray-300">Type</label>
                             <Select id="newType" value={newType} onChange={e => setNewType(e.target.value as any)} wrapperClassName="mt-1">
                                <option value="Bank">Bank Account</option>
                                <option value="Credit Card">Credit Card</option>
                            </Select>
                        </div>
                    </div>
                     <div className="text-right">
                        <button type="submit" disabled={isAdding} className="inline-flex items-center gap-x-2 rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-500 disabled:opacity-50">
                            {isAdding ? <Spinner/> : <><PlusIcon className="h-5 w-5" /> Add Account</>}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default AccountManagement;
