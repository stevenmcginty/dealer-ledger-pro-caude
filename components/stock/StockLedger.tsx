
import React, { useState, useMemo } from 'react';
import { Vehicle, SalesDocument } from '../../types';
import { CarIcon, PlusIcon, DocumentTextIcon, EllipsisVerticalIcon, ChevronUpDownIcon } from '../icons';
import { formatCurrency, formatDate } from '../../utils/helpers';
import Spinner from '../common/Spinner';
import { useUI } from '../../hooks/useUI';
import { useWindowSize } from '../../hooks/useWindowSize';

interface StockLedgerProps {
    vehicles: Vehicle[];
    salesDocs: SalesDocument[];
}

type EnrichedVehicle = Vehicle & { daysInStock: number };

interface VehicleRowProps {
    vehicle: EnrichedVehicle;
    onActionsClick: () => void;
}
const VehicleRow: React.FC<VehicleRowProps> = ({ vehicle, onActionsClick }) => {
    const isSor = vehicle.ownershipType === 'Sale or Return';
    const statusColorClasses = {
        'Available': 'bg-green-800 text-green-200',
        'Deposit Paid': 'bg-cyan-800 text-cyan-200',
        'Sold': 'bg-red-800 text-red-200',
    };
    const status = vehicle.status || 'Available';

    const v5cLinks = vehicle.v5cUrls || (vehicle.v5cUrl ? [vehicle.v5cUrl] : []);
    
    return (
        <tr className="group even:bg-gray-800/50 hover:bg-gray-700/50">
            <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm sm:pl-6">
                <div className="flex items-center gap-2">
                    <div>
                        <div className="font-medium text-white">{vehicle.reg || 'N/A'}</div>
                        <div className="text-gray-400 text-xs mt-1">Stock #{vehicle.stockNumber}</div>
                    </div>
                    <div className="flex items-center gap-1">
                        {v5cLinks.map((url, index) => (
                             <a key={index} href={url} target="_blank" rel="noopener noreferrer" title={`View V5C page ${index + 1}`} className="p-1 rounded-full hover:bg-gray-600">
                                <DocumentTextIcon className="h-4 w-4 text-blue-300" />
                             </a>
                        ))}
                    </div>
                </div>
            </td>
             <td className="px-3 py-4 text-sm text-gray-300">
                 <div>
                    <div className="font-medium text-white">{vehicle.make} {vehicle.model}</div>
                    <div className="text-gray-400 text-xs mt-1 font-mono uppercase">{vehicle.vin || 'N/A'}</div>
                </div>
            </td>
            <td className="px-3 py-4 text-sm text-gray-300">
                <div>
                    <div className="font-medium text-white">{vehicle.year}</div>
                    <div className="text-gray-400 text-xs mt-1">{vehicle.mileage ? vehicle.mileage.toLocaleString() + ' miles' : 'N/A'}</div>
                    {vehicle.firstRegistered && <div className="text-gray-400 text-xs mt-1">1st Reg: {formatDate(vehicle.firstRegistered)}</div>}
                </div>
            </td>
            <td className="px-3 py-4 text-sm text-gray-300">
                 <div>
                    <div className="font-medium text-white">{formatCurrency(vehicle.purchasePrice)}</div>
                    <div className="text-gray-400 text-xs mt-1">{formatDate(vehicle.purchaseDate)}</div>
                </div>
            </td>
            <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-300">
                <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${statusColorClasses[status]}`}>{status}</span>
                {isSor && <span className="ml-2 inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium bg-purple-800 text-purple-200">SOR</span>}
            </td>
            <td className="whitespace-nowrap px-3 py-4 text-sm text-center text-gray-300">{vehicle.daysInStock}</td>
            <td className="relative whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-6">
                <button onClick={onActionsClick} className="p-2 rounded-full text-gray-400 hover:bg-gray-700 hover:text-white" title="Actions">
                    <EllipsisVerticalIcon className="h-5 w-5" />
                </button>
            </td>
        </tr>
    );
};

interface VehicleCardProps {
    vehicle: EnrichedVehicle;
    onActionsClick: () => void;
}
const VehicleCard: React.FC<VehicleCardProps> = ({ vehicle, onActionsClick }) => {
    const isSor = vehicle.ownershipType === 'Sale or Return';
    const statusColorClasses = {
        'Available': 'bg-green-800 text-green-200',
        'Deposit Paid': 'bg-cyan-800 text-cyan-200',
        'Sold': 'bg-red-800 text-red-200',
    };
    const status = vehicle.status || 'Available';
    const v5cLinks = vehicle.v5cUrls || (vehicle.v5cUrl ? [vehicle.v5cUrl] : []);

    return (
        <div className="bg-gray-800 rounded-lg shadow-md p-4 space-y-3">
            <div className="flex justify-between items-start">
                <div>
                    <div className="flex items-center gap-2">
                        <p className="text-lg font-bold text-white uppercase">{vehicle.reg || 'N/A'}</p>
                        <div className="flex items-center gap-1">
                            {v5cLinks.map((url, index) => (
                                 <a key={index} href={url} target="_blank" rel="noopener noreferrer" title={`View V5C page ${index + 1}`} className="p-1 rounded-full hover:bg-gray-600">
                                    <DocumentTextIcon className="h-4 w-4 text-blue-300" />
                                 </a>
                            ))}
                        </div>
                    </div>
                    <p className="text-sm text-gray-300">{vehicle.make} {vehicle.model}</p>
                </div>
                <div className="flex items-start gap-1">
                    <div className="text-right">
                        <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${statusColorClasses[status]}`}>{status}</span>
                        {isSor && <span className="mt-1 block text-right text-xs font-medium text-purple-300">SOR</span>}
                    </div>
                    <button onClick={onActionsClick} className="p-1 rounded-full text-gray-400 hover:bg-gray-700" title="Actions">
                        <EllipsisVerticalIcon className="h-5 w-5" />
                    </button>
                </div>
            </div>

            <div className="text-sm space-y-1 text-gray-400">
                <div className="flex justify-between"><span>Stock #</span><span className="font-mono text-white">{vehicle.stockNumber}</span></div>
                <div className="flex justify-between"><span>Year/Mileage</span><span className="text-white">{vehicle.year} / {vehicle.mileage ? vehicle.mileage.toLocaleString() : 'N/A'} mi</span></div>
                <div className="flex justify-between"><span>Purchase Price</span><span className="font-semibold text-white">{formatCurrency(vehicle.purchasePrice)}</span></div>
                <div className="flex justify-between"><span>Purchase Date</span><span className="text-white">{formatDate(vehicle.purchaseDate)}</span></div>
                <div className="flex justify-between"><span>Days in Stock</span><span className="font-semibold text-white">{vehicle.daysInStock}</span></div>
            </div>
        </div>
    );
};

export const StockLedger = ({ vehicles, salesDocs }: StockLedgerProps) => {
    const { openModal } = useUI();
    const [statusFilter, setStatusFilter] = useState('Current Stock');
    const [searchTerm, setSearchTerm] = useState('');
    
    type SortKey = 'reg' | 'make' | 'daysInStock';
    type SortDirection = 'ascending' | 'descending';

    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection }>({ key: 'daysInStock', direction: 'descending' });
    const { width } = useWindowSize();
    const isMobile = width !== undefined && width < 768;

    const requestSort = (key: SortKey) => {
        let direction: SortDirection = 'ascending';
        if (sortConfig.key === key && sortConfig.direction === 'ascending') {
            direction = 'descending';
        }
        setSortConfig({ key, direction });
    };

    const processedVehicles = useMemo(() => {
        const calculateDaysInStock = (vehicle: Vehicle, salesDocs: SalesDocument[]): number => {
            const purchaseDate = new Date(vehicle.purchaseDate);
            if (isNaN(purchaseDate.getTime())) return 0;
    
            let endDate = new Date(); // Today
    
            if (vehicle.status === 'Sold') {
                const saleDoc = salesDocs.find(doc => doc.vehicleId === vehicle.id && doc.documentType === 'Sales Invoice');
                if (saleDoc?.invoiceDate) {
                    endDate = new Date(saleDoc.invoiceDate);
                }
            }
    
            const diffTime = Math.max(0, endDate.getTime() - purchaseDate.getTime());
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            return diffDays;
        };
        
        let enriched = vehicles.map(v => ({
            ...v,
            daysInStock: calculateDaysInStock(v, salesDocs),
        }));

        // Status filter
        let filtered: EnrichedVehicle[] = enriched;
        if (statusFilter === 'Current Stock') {
            filtered = enriched.filter(v => v.status !== 'Sold');
        } else if (statusFilter === 'Sold Stock') {
            filtered = enriched.filter(v => v.status === 'Sold');
        } else if (statusFilter === 'Deposit Paid') {
            filtered = enriched.filter(v => v.status === 'Deposit Paid');
        }

        // Search filter
        if (searchTerm.trim() !== '') {
            const lowercasedTerm = searchTerm.toLowerCase();
            filtered = filtered.filter(v => 
                String(v.reg || '').toLowerCase().includes(lowercasedTerm) ||
                String(v.make || '').toLowerCase().includes(lowercasedTerm) ||
                String(v.model || '').toLowerCase().includes(lowercasedTerm) ||
                String(v.stockNumber || '').toLowerCase().includes(lowercasedTerm) ||
                String(v.vin || '').toLowerCase().includes(lowercasedTerm)
            );
        }

        // Sorting
        filtered.sort((a, b) => {
            if (sortConfig.key === 'make') {
                const valA = a.make || '';
                const valB = b.make || '';
                if (valA < valB) return sortConfig.direction === 'ascending' ? -1 : 1;
                if (valA > valB) return sortConfig.direction === 'ascending' ? 1 : -1;
                return 0;
            }
            if (sortConfig.key === 'reg') {
                const valA = a.reg || '';
                const valB = b.reg || '';
                if (valA < valB) return sortConfig.direction === 'ascending' ? -1 : 1;
                if (valA > valB) return sortConfig.direction === 'ascending' ? 1 : -1;
                return 0;
            }
            if (sortConfig.key === 'daysInStock') {
                return sortConfig.direction === 'ascending' ? a.daysInStock - b.daysInStock : b.daysInStock - a.daysInStock;
            }
            return 0;
        });

        return filtered;
    }, [vehicles, salesDocs, statusFilter, searchTerm, sortConfig]);

    if (!vehicles) return <div className="flex justify-center items-center h-full"><Spinner /></div>;
    
    const handleActionsClick = (vehicle: Vehicle) => {
        const depositDoc = salesDocs.find(doc => doc.vehicleId === vehicle.id && doc.documentType === 'Deposit Slip');
        const salesDoc = salesDocs.find(doc => doc.vehicleId === vehicle.id && doc.documentType === 'Sales Invoice');
        openModal('vehicleActions', { vehicle, depositDoc, salesDoc });
    };

    const EmptyState = () => (
        <div className="text-center py-16 px-6 bg-gray-800 rounded-lg shadow-inner">
            <CarIcon className="h-12 w-12 text-gray-500 mx-auto" />
            <h3 className="mt-4 text-lg font-medium text-white">No Vehicles Found</h3>
            <p className="mt-1 text-sm text-gray-400">{searchTerm ? 'Try adjusting your search or filter.' : 'Add your first vehicle to get started.'}</p>
            {!searchTerm && (
                <div className="mt-6">
                    <button onClick={() => openModal('vehicle')} className="inline-flex items-center gap-x-2 rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-500">
                        <PlusIcon className="-ml-0.5 h-5 w-5" /> Add Vehicle
                    </button>
                </div>
            )}
        </div>
    );
    
    const tabs = ['Current Stock', 'Deposit Paid', 'Sold Stock'];

    const getSortIndicator = (key: SortKey) => {
        const isSorted = sortConfig.key === key;
        return (
            <span className={`transition-opacity ${isSorted ? 'opacity-100' : 'opacity-20 group-hover:opacity-70'}`}>
                {isSorted && sortConfig.direction === 'descending' ? <ChevronUpDownIcon className="h-4 w-4 transform rotate-180" /> : <ChevronUpDownIcon className="h-4 w-4" />}
            </span>
        );
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                 <div className="flex-1">
                    <div className="border-b border-gray-700">
                        <nav className="-mb-px flex space-x-6 overflow-x-auto" aria-label="Tabs">
                            {tabs.map((tab) => (
                                <button
                                    key={tab}
                                    onClick={() => setStatusFilter(tab)}
                                    className={`${tab === statusFilter ? 'border-brand-500 text-brand-400' : 'border-transparent text-gray-400 hover:border-gray-500 hover:text-gray-300'} group inline-flex items-center whitespace-nowrap border-b-2 py-4 px-1 text-sm font-medium`}
                                >
                                    <span>{tab}</span>
                                </button>
                            ))}
                        </nav>
                    </div>
                </div>
                <div className="relative sm:max-w-xs w-full">
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                         <svg className="h-5 w-5 text-gray-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clipRule="evenodd" /></svg>
                    </div>
                    <input
                        type="search"
                        name="search"
                        id="search"
                        className="block w-full rounded-md border-0 bg-gray-700 py-2 pl-10 pr-3 text-white ring-1 ring-inset ring-gray-600 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-brand-500 sm:text-sm"
                        placeholder="Search stock..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>

            {processedVehicles.length === 0 ? <EmptyState /> : (
                isMobile ? (
                    <div className="space-y-4">
                        {processedVehicles.map(vehicle => (
                            <VehicleCard key={vehicle.id} vehicle={vehicle} onActionsClick={() => handleActionsClick(vehicle)} />
                        ))}
                    </div>
                ) : (
                    <div className="overflow-x-auto bg-gray-800 rounded-lg shadow">
                        <table className="min-w-full divide-y divide-gray-700">
                            <thead className="bg-gray-900/50">
                                <tr>
                                    <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-white sm:pl-6">
                                        <button onClick={() => requestSort('reg')} className="group inline-flex items-center gap-1">Registration {getSortIndicator('reg')}</button>
                                    </th>
                                    <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-white">
                                        <button onClick={() => requestSort('make')} className="group inline-flex items-center gap-1">Vehicle {getSortIndicator('make')}</button>
                                    </th>
                                    <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-white">Details</th>
                                    <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-white">Purchase</th>
                                    <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-white">Status</th>
                                    <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-white">
                                        <button onClick={() => requestSort('daysInStock')} className="group inline-flex items-center gap-1">Days in Stock {getSortIndicator('daysInStock')}</button>
                                    </th>
                                    <th scope="col" className="relative py-3.5 pl-3 pr-4 sm:pr-6"><span className="sr-only">Actions</span></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-700/50">
                                {processedVehicles.map(vehicle => (
                                    <VehicleRow key={vehicle.id} vehicle={vehicle} onActionsClick={() => handleActionsClick(vehicle)} />
                                ))}
                            </tbody>
                        </table>
                    </div>
                )
            )}
        </div>
    );
};