import React, { useMemo } from 'react';
import { useUI } from '../../hooks/useUI';
import { useData } from '../../hooks/useData';
import { Vehicle } from '../../types';
import { XMarkIcon, CarIcon, PlusIcon } from '../icons';

const statusColorClasses: Record<Vehicle['status'], string> = {
    'Available': 'bg-green-800 text-green-200',
    'Deposit Paid': 'bg-cyan-800 text-cyan-200',
    'Sold': 'bg-red-800 text-red-200',
};

const InvoiceVehiclePicker = () => {
    const { openModal, closeModal } = useUI();
    const { vehicles, salesDocs } = useData();

    const eligibleVehicles = useMemo(
        () => vehicles
            .filter(v => v.status !== 'Sold')
            .sort((a, b) => new Date(b.purchaseDate).getTime() - new Date(a.purchaseDate).getTime()),
        [vehicles]
    );

    const handlePick = (vehicle: Vehicle) => {
        const depositDoc = salesDocs.find(d => d.vehicleId === vehicle.id && d.documentType === 'Deposit Slip');
        const salesDoc = salesDocs.find(d => d.vehicleId === vehicle.id && d.documentType === 'Sales Invoice');
        closeModal();
        openModal('vehicleActions', { vehicle, depositDoc, salesDoc });
    };

    const handleAddVehicle = () => {
        closeModal();
        openModal('vehicle');
    };

    return (
        <div className="w-full">
            <header className="p-4 border-b border-gray-700 flex items-center justify-between">
                <h2 className="text-lg font-bold text-white">Invoice for which vehicle?</h2>
                <button onClick={closeModal} className="p-1 rounded-full text-gray-400 hover:bg-gray-700 hover:text-white">
                    <XMarkIcon className="h-6 w-6" />
                </button>
            </header>

            {eligibleVehicles.length === 0 ? (
                <div className="p-6 text-center">
                    <CarIcon className="h-12 w-12 text-gray-500 mx-auto" />
                    <p className="mt-4 text-sm text-gray-400">You have no vehicles in stock to invoice yet.</p>
                    <div className="mt-6">
                        <button onClick={handleAddVehicle} className="inline-flex items-center gap-x-2 rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-500">
                            <PlusIcon className="-ml-0.5 h-5 w-5" /> Add a vehicle first
                        </button>
                    </div>
                </div>
            ) : (
                <div className="p-4 space-y-2 max-h-[60vh] overflow-y-auto">
                    {eligibleVehicles.map(vehicle => (
                        <button
                            key={vehicle.id}
                            onClick={() => handlePick(vehicle)}
                            className="w-full text-left p-4 rounded-lg transition-colors flex items-center justify-between gap-3 bg-gray-700/50 hover:bg-gray-700"
                        >
                            <div className="min-w-0">
                                <p className="text-sm font-bold text-white truncate">{vehicle.reg}</p>
                                <p className="text-sm text-gray-400 truncate">{vehicle.make} {vehicle.model}</p>
                            </div>
                            <span className={`flex-shrink-0 inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${statusColorClasses[vehicle.status]}`}>
                                {vehicle.status}
                            </span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};

export default InvoiceVehiclePicker;
