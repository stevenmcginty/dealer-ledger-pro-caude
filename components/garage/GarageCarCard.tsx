
import React from 'react';
import { formatCurrency, formatDate } from '../../utils/helpers';
import { PlusIcon, TrashIcon } from '../icons';

type DisplayCar = {
    isInformal: boolean;
    id: string;
    reg: string;
    make: string;
    model: string;
    purchasePrice?: number;
    costs: { id: string; description: string; amount: number; createdAt: number }[];
    totalCost: number;
    totalOwed: number;
};

interface GarageCarCardProps {
    car: DisplayCar;
    onAddCostClick: (reg: string) => void;
    onDeleteCost: (costId: string) => Promise<void>;
    onDeleteInformal: (vehicleId: string) => Promise<void>;
}

const GarageCarCard: React.FC<GarageCarCardProps> = ({ car, onAddCostClick, onDeleteCost, onDeleteInformal }) => {

    const handleDeleteInformal = () => {
        if (window.confirm(`Are you sure you want to delete the informal car ${car.reg}? All its costs will also be deleted.`)) {
            onDeleteInformal(car.id);
        }
    }

    return (
        <div className="bg-gray-800 rounded-lg shadow-md flex flex-col">
            <header className="p-4 border-b border-gray-700">
                <div className="flex justify-between items-start">
                    <div>
                         <p className="text-xl font-bold text-white uppercase">{car.reg}</p>
                         <p className="text-sm text-gray-300">{car.make} {car.model}</p>
                    </div>
                    {car.isInformal && <span className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium bg-purple-800 text-purple-200">Informal</span>}
                </div>
            </header>
            <div className="p-4 space-y-3 flex-1">
                <div className="space-y-1 text-sm">
                    {car.purchasePrice !== undefined && (
                        <div className="flex justify-between"><span className="text-gray-400">Purchase Price</span><span className="font-semibold text-white">{formatCurrency(car.purchasePrice)}</span></div>
                    )}
                    <div className="flex justify-between"><span className="text-gray-400">Total Costs</span><span className="font-semibold text-white">{formatCurrency(car.totalCost)}</span></div>
                    <div className="flex justify-between font-bold text-base pt-1 border-t border-gray-700/50"><span className="text-gray-300">Total Owed</span><span className="text-brand-400">{formatCurrency(car.totalOwed)}</span></div>
                </div>

                <div className="space-y-2">
                    <h4 className="text-xs font-semibold text-gray-400 uppercase">Costs</h4>
                    {car.costs.length > 0 ? (
                        <ul className="space-y-1">
                            {car.costs.map(cost => (
                                <li key={cost.id} className="flex items-center justify-between text-sm group">
                                    <span className="text-gray-300">{cost.description}</span>
                                    <div className="flex items-center gap-2">
                                        <span className="text-gray-200">{formatCurrency(cost.amount)}</span>
                                        <button onClick={() => onDeleteCost(cost.id)} className="p-1 text-gray-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <TrashIcon className="h-4 w-4" />
                                        </button>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p className="text-sm text-gray-500 text-center py-2">No costs added.</p>
                    )}
                </div>
            </div>
            <footer className="p-2 border-t border-gray-700 flex items-center justify-between">
                {car.isInformal && (
                     <button onClick={handleDeleteInformal} className="p-2 text-gray-500 hover:text-red-400 text-xs font-semibold">
                         Delete Car
                     </button>
                )}
                <div className="flex-1" />
                 <button onClick={() => onAddCostClick(car.reg)} className="flex items-center gap-1.5 py-1.5 px-3 text-sm font-semibold rounded-md bg-gray-700 hover:bg-gray-600 text-white">
                    <PlusIcon className="h-4 w-4" /> Add Cost
                </button>
            </footer>
        </div>
    );
};

export default GarageCarCard;