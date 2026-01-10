import React, { useState, useMemo } from 'react';
import { ToDoItem, Vehicle } from '../../types';
import { useData } from '../../hooks/useData';
import { formatDate } from '../../utils/helpers';
import { WrenchScrewdriverIcon, UndoIcon } from '../icons';
import Spinner from '../common/Spinner';
import { useUI } from '../../hooks/useUI';

const WorkPrepLedger = () => {
    const { todos, vehicles, isLoading } = useData();
    const { openModal } = useUI();
    const [searchTerm, setSearchTerm] = useState('');

    const archivedPrepTasks = useMemo(() => {
        const prepTasks = todos.filter(t => t.type === 'prep' && t.completionDate);

        const groupedByVehicle = prepTasks.reduce((acc, task) => {
            const vehicleId = task.vehicleId;
            if (vehicleId) {
                if (!acc[vehicleId]) {
                    acc[vehicleId] = [];
                }
                acc[vehicleId].push(task);
            }
            return acc;
        }, {} as Record<string, ToDoItem[]>);

        const vehicleMap = new Map(vehicles.map(v => [v.id, v]));
        
        let result = Object.entries(groupedByVehicle).map(([vehicleId, tasks]) => {
            const vehicle = vehicleMap.get(vehicleId);
            if (!vehicle) return null;
            
            const mostRecentCompletion = Math.max(...tasks.map(t => new Date(t.completionDate!).getTime()));
            
            return {
                vehicle,
                tasks: tasks.sort((a, b) => new Date(b.completionDate!).getTime() - new Date(a.completionDate!).getTime()),
                mostRecentCompletion,
            };
        }).filter((item): item is NonNullable<typeof item> => item !== null);

        if (searchTerm.trim() !== '') {
            const lowercasedTerm = searchTerm.toLowerCase();
            result = result.filter(({ vehicle }) =>
                (vehicle.reg || '').toLowerCase().includes(lowercasedTerm) ||
                (vehicle.make || '').toLowerCase().includes(lowercasedTerm) ||
                (vehicle.model || '').toLowerCase().includes(lowercasedTerm) ||
                (vehicle.stockNumber || '').toLowerCase().includes(lowercasedTerm)
            );
        }

        return result.sort((a, b) => b.mostRecentCompletion - a.mostRecentCompletion);
    }, [todos, vehicles, searchTerm]);
    
    if (isLoading) {
        return <div className="flex justify-center items-center h-full"><Spinner /></div>;
    }

    const EmptyState = () => (
        <div className="text-center py-16 px-6 bg-gray-800 rounded-lg shadow-inner">
            <WrenchScrewdriverIcon className="h-12 w-12 text-gray-500 mx-auto" />
            <h3 className="mt-4 text-lg font-medium text-white">{searchTerm ? 'No Results Found' : 'No Completed Prep Work'}</h3>
            <p className="mt-1 text-sm text-gray-400">{searchTerm ? 'Try a different search term.' : 'Completed vehicle prep tasks will appear here once archived from the dashboard.'}</p>
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
                        placeholder="Search by Reg, Make, Model..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="block w-full rounded-md border-0 bg-gray-700 py-2 pl-10 pr-3 text-white ring-1 ring-inset ring-gray-600 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-brand-500 sm:text-sm"
                    />
                </div>
            </div>

            {archivedPrepTasks.length === 0 ? <EmptyState /> : (
                <div className="space-y-4">
                    {archivedPrepTasks.map(({ vehicle, tasks }) => (
                        <div key={vehicle.id} className="bg-gray-800 rounded-lg shadow-md">
                            <header className="p-4 border-b border-gray-700 flex justify-between items-center">
                                <div>
                                    <h3 className="font-bold text-white text-lg">{vehicle.reg}</h3>
                                    <p className="text-sm text-gray-400">{vehicle.make} {vehicle.model}</p>
                                </div>
                                <button
                                    onClick={() => openModal('unarchivePrepConfirm', { vehicle, tasks })}
                                    className="inline-flex items-center gap-x-2 rounded-md bg-gray-700 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-gray-600"
                                    title="Move tasks back to the dashboard prep list"
                                >
                                    <UndoIcon className="h-4 w-4" />
                                    Move to Prep
                                </button>
                            </header>
                            <ul className="divide-y divide-gray-700/50">
                                {tasks.map(task => (
                                    <li key={task.id} className="px-4 py-3 flex justify-between items-center text-sm">
                                        <p className="text-gray-200">{task.description}</p>
                                        <p className="text-gray-400 text-xs">{formatDate(task.completionDate!)}</p>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default WorkPrepLedger;