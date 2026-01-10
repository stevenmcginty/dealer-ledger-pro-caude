
import React, { useMemo, useState } from 'react';
import { Vehicle, InformalVehicle, GarageCost } from '../../types';
import { BuildingStorefrontIcon, PlusIcon } from '../icons';
import GarageCarCard from '../garage/GarageCarCard';
import { useUI } from '../hooks/useUI';
import { useData } from '../hooks/useData';

type DisplayCar = {
    isInformal: boolean;
    id: string;
    reg: string;
    make: string;
    model: string;
    purchasePrice?: number;
    costs: GarageCost[];
    totalCost: number;
    totalOwed: number;
};

const GaragePage = () => {
    const { openModal } = useUI();
    const { vehicles, informalVehicles, garageCosts, deleteGarageCost, deleteInformalVehicle } = useData();
    const [searchTerm, setSearchTerm] = useState('');
    
    const displayCars = useMemo<DisplayCar[]>(() => {
        let combinedCars: DisplayCar[] = [];

        vehicles.filter(v => v.status !== 'Sold').forEach(v => {
            const costs = garageCosts.filter(c => c.vehicleReg === v.reg);
            const totalCost = costs.reduce((sum, c) => sum + c.amount, 0);
            combinedCars.push({
                isInformal: false,
                id: v.id,
                reg: v.reg,
                make: v.make,
                model: v.model,
                purchasePrice: v.purchasePrice,
                costs,
                totalCost,
                totalOwed: v.purchasePrice + totalCost
            });
        });

        informalVehicles.forEach(v => {
            const costs = garageCosts.filter(c => c.vehicleReg === v.reg);
            const totalCost = costs.reduce((sum, c) => sum + c.amount, 0);
             combinedCars.push({
                isInformal: true,
                id: v.id,
                reg: v.reg,
                make: v.make,
                model: v.model,
                costs,
                totalCost,
                totalOwed: totalCost
            });
        });
        
        if (searchTerm.trim() !== '') {
            const lowercasedTerm = searchTerm.toLowerCase();
            combinedCars = combinedCars.filter(car => 
                String(car.reg || '').toLowerCase().includes(lowercasedTerm) ||
                String(car.make || '').toLowerCase().includes(lowercasedTerm) ||
                String(car.model || '').toLowerCase().includes(lowercasedTerm)
            );
        }

        const getLatestTimestamp = (car: DisplayCar) => {
            if (car.costs.length > 0) return Math.max(...car.costs.map(c => c.createdAt));
            const originalCar = (car.isInformal ? informalVehicles : vehicles).find(v => v.id === car.id);
            return originalCar?.createdAt || 0;
        };

        return combinedCars.sort((a, b) => {
            const aHasCosts = a.costs.length > 0;
            const bHasCosts = b.costs.length > 0;
            if (aHasCosts !== bHasCosts) return aHasCosts ? -1 : 1;
            return getLatestTimestamp(b) - getLatestTimestamp(a);
        });

    }, [vehicles, informalVehicles, garageCosts, searchTerm]);

    const EmptyState = () => (
        <div className="text-center py-16 px-6 bg-gray-800 rounded-lg shadow-inner">
          <BuildingStorefrontIcon className="h-12 w-12 text-gray-500 mx-auto" />
          <h3 className="mt-4 text-lg font-medium text-white">{searchTerm ? 'No Cars Found' : 'Your Garage is Empty'}</h3>
          <p className="mt-1 text-sm text-gray-400">{searchTerm ? 'Try adjusting your search.' : 'Track informal prep costs here. Add an informal car to get started.'}</p>
          {!searchTerm && (
              <div className="mt-6">
                  <button onClick={() => openModal('addInformalVehicle')} className="inline-flex items-center gap-x-2 rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-500">
                      <PlusIcon className="-ml-0.5 h-5 w-5" /> Add Informal Car
                  </button>
              </div>
          )}
        </div>
      );

    return (
        <div className="space-y-6">
             <div className="flex justify-end">
                <div className="relative sm:max-w-xs w-full">
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                         <svg className="h-5 w-5 text-gray-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clipRule="evenodd" /></svg>
                    </div>
                    <input
                        type="search"
                        name="search"
                        id="search"
                        className="block w-full rounded-md border-0 bg-gray-700 py-2 pl-10 pr-3 text-white ring-1 ring-inset ring-gray-600 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-brand-500 sm:text-sm"
                        placeholder="Search by Reg, Make, Model..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>
            {displayCars.length === 0 ? <EmptyState /> : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {displayCars.map(car => (
                        <GarageCarCard 
                            key={`${car.isInformal}-${car.id}`} 
                            car={car}
                            onAddCostClick={(reg) => openModal('addGarageCost', { reg })}
                            onDeleteCost={deleteGarageCost}
                            onDeleteInformal={deleteInformalVehicle}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};

export default GaragePage;
