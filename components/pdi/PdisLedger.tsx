import React, { useState, useMemo } from 'react';
import { ShieldCheckIcon, PlusIcon, EditIcon, TrashIcon } from '../icons';
import { formatDate } from '../../utils/helpers';
import Spinner from '../common/Spinner';
import { useUI } from '../../hooks/useUI';
import { useData } from '../../hooks/useData';
import { pdiExceptions, withPdiDefaults } from '../../utils/pdi';

const PdisLedger = () => {
  const { openModal } = useUI();
  const { pdis, vehicles } = useData();
  const [searchTerm, setSearchTerm] = useState('');

  const filteredPdis = useMemo(() => {
    if (!searchTerm.trim()) {
        return pdis;
    }
    const lowercasedTerm = searchTerm.toLowerCase();
    return pdis.filter(pdi => {
        const carDetails = pdi.carDetails || vehicles.find(v => v.id === pdi.vehicleId);
        return (
            String(pdi.pdiNumber || '').toLowerCase().includes(lowercasedTerm) ||
            (carDetails && String(carDetails.reg || '').toLowerCase().includes(lowercasedTerm)) ||
            (carDetails && String(carDetails.make || '').toLowerCase().includes(lowercasedTerm)) ||
            (carDetails && String(carDetails.model || '').toLowerCase().includes(lowercasedTerm))
        );
    });
  }, [pdis, searchTerm, vehicles]);

  const sortedPdis = useMemo(() => {
    return [...filteredPdis].sort((a, b) => {
        const aTime = a.inspectionDate ? new Date(a.inspectionDate).getTime() : a.createdAt;
        const bTime = b.inspectionDate ? new Date(b.inspectionDate).getTime() : b.createdAt;
        return bTime - aTime;
    });
  }, [filteredPdis]);

  if (!pdis || !vehicles) return <div className="flex justify-center items-center h-full"><Spinner /></div>;

  const EmptyState = () => (
    <div className="text-center py-16 px-6 bg-gray-800 rounded-lg shadow-inner">
      <ShieldCheckIcon className="h-12 w-12 text-gray-500 mx-auto" />
      <h3 className="mt-4 text-lg font-medium text-white">{searchTerm ? 'No PDIs Found' : 'No PDIs'}</h3>
      <p className="mt-1 text-sm text-gray-400">{searchTerm ? 'Try adjusting your search.' : 'Create a PDI to record a pre-delivery inspection.'}</p>
       {!searchTerm && (
          <div className="mt-6">
              <button onClick={() => openModal('pdi')} className="inline-flex items-center gap-x-2 rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-500">
                  <PlusIcon className="-ml-0.5 h-5 w-5" /> Add PDI
              </button>
          </div>
       )}
    </div>
  );

  const getStatusPill = (pdi: typeof pdis[number]) => {
      const exceptions = pdiExceptions(withPdiDefaults(pdi));
      const fails = exceptions.filter(e => e.status === 'fail');
      const advisories = exceptions.filter(e => e.status === 'advisory');
      if (!pdi.roadworthy) {
          return <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-red-900/50 text-red-300">Not roadworthy</span>;
      }
      if (fails.length > 0) {
          return <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-red-900/50 text-red-300">{fails.length} fail{fails.length === 1 ? '' : 's'}</span>;
      }
      if (advisories.length > 0) {
          return <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-yellow-900/50 text-yellow-300">{advisories.length} advisory</span>;
      }
      return <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-green-900/50 text-green-300">All pass</span>;
  };

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
                  placeholder="Search PDIs..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
              />
          </div>
      </div>

       {sortedPdis.length === 0 ? <EmptyState /> : (
            <div className="bg-gray-800 rounded-lg shadow-md overflow-hidden">
                <ul role="list" className="divide-y divide-gray-700">
                    {sortedPdis.map((pdi) => {
                        const carDetails = pdi.carDetails || vehicles.find(v => v.id === pdi.vehicleId);
                        return (
                            <li key={pdi.id} className="group relative">
                                <button onClick={() => openModal('pdi', { viewOnly: true, pdi })} className="block w-full text-left hover:bg-gray-700/50 focus:outline-none focus:bg-gray-700/50 transition duration-150 ease-in-out">
                                    <div className="px-4 py-4 sm:px-6">
                                        <div className="flex items-center justify-between">
                                            <p className="text-sm font-medium text-brand-400 truncate">PDI #{pdi.pdiNumber}</p>
                                            {getStatusPill(pdi)}
                                        </div>
                                        <div className="mt-2 sm:flex sm:justify-between">
                                            <div className="sm:flex">
                                                <p className="flex items-center text-sm text-gray-300 font-semibold">{carDetails?.make} {carDetails?.model} - <span className="uppercase ml-2 bg-gray-900 px-2 py-0.5 rounded text-xs">{carDetails?.reg}</span></p>
                                                {pdi.mileage != null && (
                                                    <p className="mt-2 flex items-center text-sm text-gray-400 sm:mt-0 sm:ml-6">{pdi.mileage.toLocaleString()} miles</p>
                                                )}
                                            </div>
                                            <div className="mt-2 flex items-center text-sm text-gray-400 sm:mt-0">
                                                <p>{formatDate(pdi.inspectionDate)}</p>
                                            </div>
                                        </div>
                                    </div>
                                </button>
                                <div className="absolute top-1/2 -translate-y-1/2 right-4 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-x-2">
                                    <button onClick={() => openModal('pdi', { editingPdi: pdi })} className="p-2 rounded-full text-gray-300 bg-gray-700 hover:bg-gray-600 hover:text-white" title="Edit">
                                        <EditIcon className="h-5 w-5" />
                                    </button>
                                    <button onClick={() => openModal('deletePdiConfirm', pdi)} className="p-2 rounded-full text-gray-300 bg-gray-700 hover:bg-red-600 hover:text-white" title="Delete">
                                        <TrashIcon className="h-5 w-5" />
                                    </button>
                                </div>
                            </li>
                        )
                    })}
                </ul>
            </div>
       )}
    </div>
  );
};

export default PdisLedger;
