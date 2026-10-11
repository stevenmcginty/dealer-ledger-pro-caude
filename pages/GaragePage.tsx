

import React, { useMemo, useState } from 'react';
import { Vehicle, InformalVehicle, GarageCost } from '../types';
import { BuildingStorefrontIcon } from '../components/icons';
import { EmptyState, Search } from '../components/ui';
import { PageHead } from '../components/stock/parts';
import { formatCurrency } from '../utils/helpers';
import GarageCarCard from '../components/garage/GarageCarCard';
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

    const totalOwed = displayCars.reduce((sum, car) => sum + car.totalOwed, 0);

    return (
        <div className="space-y-4 pb-6">
            <PageHead
                facts={<>{displayCars.length} car{displayCars.length === 1 ? '' : 's'} · <span className="num font-semibold text-ink-2">{formatCurrency(totalOwed)}</span> owed</>}
            />
            <Search
                value={searchTerm}
                onChange={setSearchTerm}
                label="Search the garage"
                placeholder="Reg, make or model"
                className="w-full lg:max-w-sm"
            />
            {displayCars.length === 0 ? (
                <div className="rounded-card border border-line bg-surface">
                    {searchTerm ? (
                        <EmptyState
                            icon={<BuildingStorefrontIcon />}
                            title={`No cars match “${searchTerm}”`}
                            description="Search looks at the reg, make and model."
                            actionLabel="Clear search"
                            onAction={() => setSearchTerm('')}
                        />
                    ) : (
                        <EmptyState
                            icon={<BuildingStorefrontIcon />}
                            title="The garage is empty"
                            description="Track prep costs here, for stock cars and for cars that aren’t on the books."
                            actionLabel="Add informal car"
                            onAction={() => openModal('addInformalVehicle')}
                        />
                    )}
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
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