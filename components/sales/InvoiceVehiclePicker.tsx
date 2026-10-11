import React, { useMemo, useState } from 'react';
import { useUI } from '../../hooks/useUI';
import { useData } from '../../hooks/useData';
import { Vehicle, SalesDocument } from '../../types';
import { CarIcon, EditIcon, ArrowLeftIcon, ChevronRightIcon } from '../icons';
import { DocChip, EmptyState, IconButton, Plate, StatusChip } from '../ui';
import { SheetBody, SheetFrame, SheetHeader } from '../crm/SheetParts';
import { VEHICLE_CHIP } from './docMeta';

interface PickedVehicle {
    vehicle: Vehicle;
    depositDoc?: SalesDocument;
    salesDoc?: SalesDocument;
}

const InvoiceVehiclePicker = () => {
    const { openModal, closeModal } = useUI();
    const { vehicles, salesDocs } = useData();
    const [picked, setPicked] = useState<PickedVehicle | null>(null);

    const eligibleVehicles = useMemo(
        () => vehicles
            .filter(v => v.status !== 'Sold')
            .sort((a, b) => new Date(b.purchaseDate).getTime() - new Date(a.purchaseDate).getTime()),
        [vehicles]
    );

    const handlePick = (vehicle: Vehicle) => {
        const depositDoc = salesDocs.find(d => d.vehicleId === vehicle.id && d.documentType === 'Deposit Slip');
        const salesDoc = salesDocs.find(d => d.vehicleId === vehicle.id && d.documentType === 'Sales Invoice');
        setPicked({ vehicle, depositDoc, salesDoc });
    };

    const handleAddVehicle = () => {
        closeModal();
        openModal('vehicle');
    };

    const handleCreate = (docType: 'Sales Invoice' | 'Deposit Slip') => {
        if (!picked) return;
        closeModal();
        openModal('invoice', { vehicle: picked.vehicle, docType });
    };

    const handleEdit = (doc: SalesDocument) => {
        closeModal();
        openModal('editInvoice', doc);
    };

    if (picked) {
        const { vehicle, depositDoc, salesDoc } = picked;
        const choice = 'flex min-h-[64px] w-full items-center gap-3 border-b border-line px-4 py-3 text-start transition-colors duration-quick ease-out last:border-b-0 hover:bg-surface-2 active:bg-surface-3';
        return (
            <SheetFrame>
                <SheetHeader
                    title="Which document?"
                    description={
                        <span className="flex min-w-0 items-center gap-2">
                            <Plate reg={vehicle.reg} size="sm" />
                            <span className="truncate">{vehicle.make} {vehicle.model}</span>
                        </span>
                    }
                    leading={<IconButton label="Back to cars" icon={<ArrowLeftIcon />} onClick={() => setPicked(null)} />}
                    onClose={closeModal}
                />
                <SheetBody>
                    <div className="overflow-hidden rounded-card border border-line bg-surface">
                        <button type="button" onClick={() => salesDoc ? handleEdit(salesDoc) : handleCreate('Sales Invoice')} className={choice}>
                            <DocChip kind="SI" label={null} />
                            <span className="min-w-0 flex-1">
                                <span className="block text-base font-semibold text-ink">{salesDoc ? 'Edit sales invoice' : 'Sales invoice'}</span>
                                <span className="block text-sm text-ink-3">
                                    {salesDoc ? <>Already made · <span className="num">#{salesDoc.invoiceNumber}</span></> : 'Paid in full, car is sold'}
                                </span>
                            </span>
                            {salesDoc ? <EditIcon className="h-5 w-5 flex-none text-ink-3" aria-hidden="true" /> : <ChevronRightIcon className="h-5 w-5 flex-none text-ink-3" aria-hidden="true" />}
                        </button>
                        <button type="button" onClick={() => depositDoc ? handleEdit(depositDoc) : handleCreate('Deposit Slip')} className={choice}>
                            <DocChip kind="DS" label={null} />
                            <span className="min-w-0 flex-1">
                                <span className="block text-base font-semibold text-ink">{depositDoc ? 'Edit deposit slip' : 'Deposit slip'}</span>
                                <span className="block text-sm text-ink-3">
                                    {depositDoc ? <>Already made · <span className="num">#{depositDoc.invoiceNumber}</span></> : 'Deposit taken, car reserved'}
                                </span>
                            </span>
                            {depositDoc ? <EditIcon className="h-5 w-5 flex-none text-ink-3" aria-hidden="true" /> : <ChevronRightIcon className="h-5 w-5 flex-none text-ink-3" aria-hidden="true" />}
                        </button>
                    </div>
                </SheetBody>
            </SheetFrame>
        );
    }

    return (
        <SheetFrame>
            <SheetHeader title="Invoice which car?" description="Cars in stock and reserved, newest first." onClose={closeModal} />
            <SheetBody>
                {eligibleVehicles.length === 0 ? (
                    <EmptyState
                        icon={<CarIcon />}
                        title="No cars to invoice"
                        description="Every car is sold, or none are in stock yet. Add the car first, then make its invoice."
                        actionLabel="Add a car"
                        onAction={handleAddVehicle}
                        className="px-0"
                    />
                ) : (
                    <ul role="list" className="m-0 list-none overflow-hidden rounded-card border border-line bg-surface p-0">
                        {eligibleVehicles.map(vehicle => {
                            const chip = VEHICLE_CHIP[vehicle.status];
                            return (
                                <li key={vehicle.id} className="border-b border-line last:border-b-0">
                                    <button
                                        type="button"
                                        onClick={() => handlePick(vehicle)}
                                        className="flex min-h-[56px] w-full items-center gap-3 px-4 py-3 text-start transition-colors duration-quick ease-out hover:bg-surface-2 active:bg-surface-3"
                                    >
                                        <Plate reg={vehicle.reg} size="sm" />
                                        <span className="min-w-0 flex-1 truncate text-base font-semibold text-ink">{vehicle.make} {vehicle.model}</span>
                                        {chip && <StatusChip status={chip.status}>{chip.label}</StatusChip>}
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </SheetBody>
        </SheetFrame>
    );
};

export default InvoiceVehiclePicker;
