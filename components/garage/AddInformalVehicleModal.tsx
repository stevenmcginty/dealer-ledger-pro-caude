import React, { useState } from 'react';
import { NewInformalVehicle } from '../../types';
import { XMarkIcon } from '../icons';
import { useData } from '../../hooks/useData';
import { useUI } from '../../hooks/useUI';

const AddInformalVehicleModal = () => {
    const { addInformalVehicle } = useData();
    const { closeModal } = useUI();
    const [reg, setReg] = useState('');
    const [make, setMake] = useState('');
    const [model, setModel] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        addInformalVehicle({ reg, make, model });
        closeModal();
    };

    return (
        <form onSubmit={handleSubmit} className="flex flex-col">
            <header className="p-4 border-b border-gray-700 flex items-center justify-between">
                <h2 className="text-lg font-bold text-white">Add Informal Car</h2>
                <button type="button" onClick={closeModal} className="p-1 rounded-full text-gray-400 hover:bg-gray-700">
                    <XMarkIcon className="h-6 w-6" />
                </button>
            </header>
            <div className="p-4 space-y-4">
                <div>
                    <label className="block text-sm font-medium text-gray-300">Registration</label>
                    <input
                        type="text"
                        value={reg}
                        onChange={e => setReg(e.target.value.toUpperCase())}
                        required
                        className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md py-2 px-3 text-white uppercase"
                        autoFocus
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-300">Make</label>
                    <input
                        type="text"
                        value={make}
                        onChange={e => setMake(e.target.value)}
                        required
                        className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md py-2 px-3 text-white"
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-300">Model</label>
                    <input
                        type="text"
                        value={model}
                        onChange={e => setModel(e.target.value)}
                        required
                        className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md py-2 px-3 text-white"
                    />
                </div>
            </div>
            <footer className="p-4 border-t border-gray-700 flex justify-end">
                <button type="submit" className="px-4 py-2 text-sm font-medium text-white bg-brand-600 rounded-md">
                    Add Car
                </button>
            </footer>
        </form>
    );
};

export default AddInformalVehicleModal;