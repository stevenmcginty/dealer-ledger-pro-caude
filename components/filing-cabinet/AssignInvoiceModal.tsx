import React, { useState } from 'react';
import { Vehicle } from '../../types';
import { XMarkIcon, ArrowUpTrayIcon } from '../icons';
import Spinner from '../common/Spinner';
import Select from '../common/Select';

interface AssignInvoiceModalProps {
    vehicles: Vehicle[];
    onSubmit: (vehicleId: string, file: File) => Promise<void>;
    onClose: () => void;
}

const AssignInvoiceModal = ({ vehicles, onSubmit, onClose }: AssignInvoiceModalProps) => {
    const [selectedVehicleId, setSelectedVehicleId] = useState<string>(vehicles[0]?.id || '');
    const [file, setFile] = useState<File | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedVehicleId || !file) return;
        setIsSubmitting(true);
        await onSubmit(selectedVehicleId, file);
        // closeModal is called in parent
    };

    return (
        <form onSubmit={handleSubmit}>
            <header className="p-4 border-b border-gray-700 flex items-center justify-between">
                <h2 className="text-lg font-bold text-white">Upload Purchase Invoice</h2>
                <button type="button" onClick={onClose} className="p-1 rounded-full text-gray-400 hover:bg-gray-700">
                    <XMarkIcon className="h-6 w-6" />
                </button>
            </header>
            <div className="p-4 space-y-4">
                <div>
                    <label htmlFor="vehicle-select" className="block text-sm font-medium text-gray-300">Assign to Vehicle</label>
                    <Select
                        id="vehicle-select"
                        value={selectedVehicleId}
                        onChange={e => setSelectedVehicleId(e.target.value)}
                        wrapperClassName="mt-1"
                        disabled={vehicles.length === 0}
                    >
                        {vehicles.length > 0 ? (
                            vehicles.map(v => (
                                <option key={v.id} value={v.id}>{v.reg} - {v.make} {v.model}</option>
                            ))
                        ) : (
                            <option>No vehicles need an invoice</option>
                        )}
                    </Select>
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-300">Invoice File</label>
                    <div className="mt-1 flex justify-center rounded-md border-2 border-dashed border-gray-600 px-6 pt-5 pb-6">
                        <div className="space-y-1 text-center">
                            <ArrowUpTrayIcon className="mx-auto h-12 w-12 text-gray-400" />
                            <div className="flex text-sm text-gray-400">
                                <label htmlFor="file-upload" className="relative cursor-pointer rounded-md bg-gray-800 font-medium text-brand-blue-400 focus-within:outline-none hover:text-brand-blue-300">
                                    <span>Upload a file</span>
                                    <input id="file-upload" name="file-upload" type="file" className="sr-only" onChange={e => setFile(e.target.files ? e.target.files[0] : null)} accept="image/*,application/pdf" />
                                </label>
                                <p className="pl-1">or drag and drop</p>
                            </div>
                            <p className="text-xs text-gray-500">PNG, JPG, PDF up to 10MB</p>
                            {file && <p className="text-sm text-green-400 pt-2">{file.name}</p>}
                        </div>
                    </div>
                </div>
            </div>
            <footer className="p-4 border-t border-gray-700 flex justify-end">
                <button type="submit" disabled={!selectedVehicleId || !file || isSubmitting} className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-brand-blue-600 rounded-md disabled:opacity-50">
                    {isSubmitting ? <Spinner /> : 'Upload & Assign'}
                </button>
            </footer>
        </form>
    );
};

export default AssignInvoiceModal;
