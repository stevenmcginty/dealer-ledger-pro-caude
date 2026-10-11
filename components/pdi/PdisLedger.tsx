import React, { useState, useMemo } from 'react';
import { ShieldCheckIcon, EditIcon, TrashIcon } from '../icons';
import { formatDate } from '../../utils/helpers';
import { EmptyState, IconButton, Plate, Search, SkeletonList, StatusChip } from '../ui';
import { PageHead, pdiVerdict } from '../stock/parts';
import { useUI } from '../../hooks/useUI';
import { useData } from '../../hooks/useData';

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

  if (!pdis || !vehicles) return <SkeletonList rows={4} label="Loading PDIs" />;

  return (
    <div className="space-y-4 pb-6">
      {pdis.length > 0 && (
        <PageHead facts={<>{pdis.length} inspection{pdis.length === 1 ? '' : 's'}</>} />
      )}
      <Search
        value={searchTerm}
        onChange={setSearchTerm}
        label="Search PDIs"
        placeholder="PDI no., reg, make or model"
        className="w-full lg:max-w-sm"
      />

      {sortedPdis.length === 0 ? (
        <div className="rounded-card border border-line bg-surface">
          {searchTerm ? (
            <EmptyState
              icon={<ShieldCheckIcon />}
              title={`No PDIs match “${searchTerm}”`}
              description="Search looks at the PDI number, reg, make and model."
              actionLabel="Clear search"
              onAction={() => setSearchTerm('')}
            />
          ) : (
            <EmptyState
              icon={<ShieldCheckIcon />}
              title="No PDIs yet"
              description="A PDI records the pre-delivery checks and prints a certificate for the buyer."
              actionLabel="Start PDI"
              onAction={() => openModal('pdi')}
            />
          )}
        </div>
      ) : (
        <ul role="list" aria-label="Inspections" className="m-0 list-none overflow-hidden rounded-card border border-line bg-surface p-0">
          {sortedPdis.map((pdi) => {
            const carDetails = pdi.carDetails || vehicles.find(v => v.id === pdi.vehicleId);
            const verdict = pdiVerdict(pdi);
            const name = [carDetails?.make, carDetails?.model].filter(Boolean).join(' ') || 'Unknown car';
            return (
              <li key={pdi.id} className="flex items-stretch border-b border-line last:border-b-0">
                <button
                  type="button"
                  onClick={() => openModal('pdi', { viewOnly: true, pdi })}
                  className="min-w-0 flex-1 px-4 py-3 text-start transition-colors duration-quick ease-out hover:bg-surface-2 active:bg-surface-3"
                >
                  <span className="mb-1.5 flex min-w-0 flex-wrap items-center gap-2">
                    {carDetails?.reg && <Plate reg={carDetails.reg} size="sm" />}
                    <span className="num text-sm font-semibold text-ink-3">PDI #{pdi.pdiNumber}</span>
                    <StatusChip status={verdict.status} className="ms-auto">{verdict.label}</StatusChip>
                  </span>
                  <span className="block truncate text-base font-semibold leading-tight text-ink">{name}</span>
                  <span className="mt-0.5 block truncate text-sm text-ink-3">
                    {formatDate(pdi.inspectionDate)}
                    {pdi.mileage != null && <> · <span className="num">{pdi.mileage.toLocaleString('en-GB')}</span> mi</>}
                  </span>
                </button>
                <div className="flex flex-none flex-col items-center justify-center gap-0.5 border-s border-line px-1 sm:flex-row">
                  <IconButton size="sm" label={`Edit PDI ${pdi.pdiNumber}`} icon={<EditIcon />} onClick={() => openModal('pdi', { editingPdi: pdi })} />
                  <IconButton size="sm" label={`Delete PDI ${pdi.pdiNumber}`} icon={<TrashIcon />} onClick={() => openModal('deletePdiConfirm', pdi)} className="hover:text-danger" />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export default PdisLedger;
