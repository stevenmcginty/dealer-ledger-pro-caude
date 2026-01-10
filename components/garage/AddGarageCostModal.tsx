import React, { useState } from 'react';
import { NewGarageCost } from '../../types';
import { XMarkIcon } from '../icons';
import CurrencyInput from '../common/CurrencyInput';
import { useData } from '../../hooks/useData';
import { useUI } from '../../hooks/useUI';

interface AddGarageCostModalProps {
    vehicleReg: string;
}

const AddGarageCostModal = ({ vehicleReg }: AddGarageCostModalProps) => {
    const { addGarageCost } = useData();
    const { closeModal } = useUI();
    const [description, setDescription] = useState('');
    const [amountStr, setAmountStr] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        addGarageCost({
            vehicleReg,
            description,
            amount: parseFloat(amountStr) || 0,
        });
        closeModal();
    };

    return (
        <form onSubmit={handleSubmit} className="flex flex-col">
            <header className="p-4 border-b border-gray-700 flex items-center justify-between">
                <h2 className="text-lg font-bold text-white">Add Cost to {vehicleReg}</h2>
                <button type="button" onClick={closeModal} className="p-1 rounded-full text-gray-400 hover:bg-gray-700">
                    <XMarkIcon className="h-6 w-6" />
                </button>
            </header>
            <div className="p-4 space-y-4">
                <div>
                    <label className="block text-sm font-medium text-gray-300">Description</label>
                    <input
                        type="text"
                        value={description}
                        onChange={e => setDescription(e.target.value)}
                        required
                        className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md py-2 px-3 text-white"
                        autoFocus
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-300">Amount</label>
                    <CurrencyInput
                        id="cost-amount"
                        value={amountStr}
                        onChange={e => setAmountStr(e.target.value)}
                        required
                        className="mt-1"
                    />
                </div>
            </div>
            <footer className="p-4 border-t border-gray-700 flex justify-end">
                <button type="submit" className="px-4 py-2 text-sm font-medium text-white bg-brand-600 rounded-md">
                    Add Cost
                </button>
            </footer>
        </form>
    );
};

export default AddGarageCostModal;