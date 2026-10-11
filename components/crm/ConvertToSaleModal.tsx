import React, { useState, useMemo } from 'react';
import { Button, Plate, StatusChip, useToast } from '../ui';
import { cx, eyebrow } from '../ui/cx';
import Select from '../common/Select';
import { SheetBody, SheetFooter, SheetFrame, SheetHeader } from './SheetParts';
import { VEHICLE_CHIP } from '../sales/docMeta';
import { useData } from '../../hooks/useData';
import { useUI } from '../../hooks/useUI';
import { Lead, LeadStage, Vehicle } from '../../types';
import { formatCurrency } from '../../utils/helpers';

interface ConvertToSaleModalProps {
    lead: Lead;
    onClose: () => void;
}

const ConvertToSaleModal: React.FC<ConvertToSaleModalProps> = ({ lead, onClose }) => {
    const { vehicles, updateLeadStage, addLeadActivity } = useData();
    const { openModal, closeModal } = useUI();
    const toast = useToast();
    const [selectedVehicleId, setSelectedVehicleId] = useState(lead.vehicleId || '');
    const [isProcessing, setIsProcessing] = useState(false);

    // Get available vehicles (not sold)
    const availableVehicles = useMemo(() =>
        vehicles.filter(v => v.status !== 'Sold'),
        [vehicles]
    );

    // Get the selected vehicle
    const selectedVehicle = useMemo(() =>
        vehicles.find(v => v.id === selectedVehicleId),
        [vehicles, selectedVehicleId]
    );

    // Pre-fill customer name from lead
    const customerName = `${lead.firstName} ${lead.lastName}`.trim();

    const handleProceedToSale = async () => {
        if (!selectedVehicle) return;

        setIsProcessing(true);
        try {
            // Add activity to lead
            await addLeadActivity(lead.id, {
                type: 'SYSTEM',
                content: `Sale process initiated for ${selectedVehicle.make} ${selectedVehicle.model}`,
                timestamp: new Date().toISOString(),
            });

            // Close this modal and open the invoice creator
            closeModal();

            // Open the document creator with pre-filled data
            openModal('invoice', {
                vehicle: selectedVehicle,
                docType: 'Sales Invoice',
                prefillData: {
                    customerName,
                    price: lead.value || selectedVehicle.purchasePrice || 0,
                },
                // Pass lead context for later conversion
                leadContext: {
                    leadId: lead.id,
                    customerEmail: lead.email,
                    customerPhone: lead.phone,
                },
            });
        } catch (error) {
            console.error('Error initiating sale:', error);
            toast.error("Couldn't start the sale. Check your signal and try again.");
        } finally {
            setIsProcessing(false);
        }
    };

    const handleMarkAsLost = async () => {
        setIsProcessing(true);
        try {
            await updateLeadStage(lead.id, LeadStage.LOST);
            await addLeadActivity(lead.id, {
                type: 'SYSTEM',
                content: 'Lead marked as lost',
                timestamp: new Date().toISOString(),
            });
            onClose();
        } catch (error) {
            console.error('Error marking lead as lost:', error);
            toast.error("Couldn't mark the lead as lost. Check your signal and try again.");
        } finally {
            setIsProcessing(false);
        }
    };

    const vehicleChip = selectedVehicle ? VEHICLE_CHIP[selectedVehicle.status] : null;

    return (
        <SheetFrame>
            <SheetHeader
                title="Start sale"
                description={<>{customerName} · {lead.source} lead</>}
                onClose={onClose}
            />
            <SheetBody className="space-y-5">
                {/* Which car */}
                <div>
                    <label htmlFor="sale-vehicle" className="mb-1.5 block text-sm font-semibold leading-5 text-ink">Which car are they buying?</label>
                    {availableVehicles.length > 0 ? (
                        <Select
                            id="sale-vehicle"
                            value={selectedVehicleId}
                            onChange={(e) => setSelectedVehicleId(e.target.value)}
                        >
                            <option value="">Choose a car</option>
                            {availableVehicles.map(vehicle => (
                                <option key={vehicle.id} value={vehicle.id}>
                                    {vehicle.reg} · {vehicle.make} {vehicle.model} ({vehicle.year})
                                </option>
                            ))}
                        </Select>
                    ) : (
                        <p className="rounded-control bg-warning-soft px-3.5 py-3 text-sm text-warning-ink">
                            No cars for sale right now. Add the car to stock first, then start the sale.
                        </p>
                    )}
                </div>

                {selectedVehicle && (
                    <div className="rounded-card border border-line bg-surface-2 p-4">
                        <div className="flex flex-wrap items-center gap-2">
                            <Plate reg={selectedVehicle.reg} />
                            {vehicleChip && <StatusChip status={vehicleChip.status} className="ms-auto">{vehicleChip.label}</StatusChip>}
                        </div>
                        <p className="mt-3 text-base font-bold text-ink">{selectedVehicle.make} {selectedVehicle.model}</p>
                        <p className="num mt-0.5 text-sm text-ink-3">
                            {selectedVehicle.year}
                            {selectedVehicle.mileage ? ` · ${selectedVehicle.mileage.toLocaleString()} mi` : ''}
                            {selectedVehicle.color ? ` · ${selectedVehicle.color}` : ''}
                        </p>
                        {selectedVehicle.purchasePrice ? (
                            <p className="mt-3 flex items-baseline justify-between border-t border-line pt-3 text-sm">
                                <span className="text-ink-2">Bought for</span>
                                <span className="num font-semibold text-ink">{formatCurrency(selectedVehicle.purchasePrice)}</span>
                            </p>
                        ) : null}
                    </div>
                )}

                {/* Who's buying */}
                <div>
                    <h3 className={cx(eyebrow, 'mb-2')}>The buyer</h3>
                    <dl className="m-0 divide-y divide-line rounded-card border border-line text-sm">
                        <div className="flex justify-between gap-4 px-4 py-2.5">
                            <dt className="text-ink-3">Name</dt>
                            <dd className="m-0 truncate text-ink">{customerName}</dd>
                        </div>
                        <div className="flex justify-between gap-4 px-4 py-2.5">
                            <dt className="text-ink-3">Email</dt>
                            <dd className="m-0 truncate text-ink">{lead.email}</dd>
                        </div>
                        {lead.phone && (
                            <div className="flex justify-between gap-4 px-4 py-2.5">
                                <dt className="text-ink-3">Phone</dt>
                                <dd className="num m-0 truncate text-ink">{lead.phone}</dd>
                            </div>
                        )}
                        {lead.value && (
                            <div className="flex justify-between gap-4 px-4 py-2.5">
                                <dt className="text-ink-3">Estimated value</dt>
                                <dd className="num m-0 font-semibold text-ink">{formatCurrency(lead.value)}</dd>
                            </div>
                        )}
                        {lead.vehicleOfInterest && (
                            <div className="flex justify-between gap-4 px-4 py-2.5">
                                <dt className="flex-none text-ink-3">Asked about</dt>
                                <dd className="m-0 min-w-0 truncate text-end text-ink">{lead.vehicleOfInterest}</dd>
                            </div>
                        )}
                    </dl>
                </div>

                <p className="text-sm text-ink-3">
                    Next you write the sales invoice with their details filled in. Finish the sale to mark this lead Sold.
                </p>

                {/* Kept away from the primary, out of the thumb zone. */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4">
                    <p className="text-sm text-ink-2">Not buying after all?</p>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleMarkAsLost}
                        disabled={isProcessing}
                        className="text-danger hover:bg-danger-soft"
                    >
                        Mark as lost
                    </Button>
                </div>
            </SheetBody>

            <SheetFooter>
                <Button variant="secondary" onClick={onClose} disabled={isProcessing}>
                    Keep lead open
                </Button>
                <Button
                    variant="primary"
                    onClick={handleProceedToSale}
                    loading={isProcessing}
                    disabled={!selectedVehicleId}
                >
                    Write invoice
                </Button>
            </SheetFooter>
        </SheetFrame>
    );
};

export default ConvertToSaleModal;
