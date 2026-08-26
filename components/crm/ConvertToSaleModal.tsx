import React, { useState, useMemo } from 'react';
import { Button, Badge, useToast } from '../ui';
import { XMarkIcon, CurrencyPoundIcon, TruckIcon } from '../icons';
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
            toast.error("Could not start the sale. Please try again.");
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
            toast.error("Could not mark the lead as lost. Please try again.");
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <div className="flex flex-col w-full">
            {/* Header */}
            <div className="p-4 border-b border-gray-700 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <div className="p-2 rounded-lg bg-emerald-500/20">
                        <CurrencyPoundIcon className="w-5 h-5 text-emerald-400" />
                    </div>
                    <div>
                        <h2 className="text-lg font-semibold text-white">Convert to Sale</h2>
                        <p className="text-xs text-gray-400">
                            {lead.firstName} {lead.lastName}
                        </p>
                    </div>
                </div>
                <button
                    onClick={onClose}
                    className="p-1 text-gray-400 hover:text-white rounded-lg hover:bg-gray-700 transition-colors"
                >
                    <XMarkIcon className="w-5 h-5" />
                </button>
            </div>

            {/* Body */}
            <div className="p-4 space-y-4">
                {/* Lead Summary */}
                <div className="p-4 bg-gray-800/50 rounded-lg space-y-2">
                    <h3 className="text-sm font-medium text-gray-300">Lead Details</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-sm">
                        <div>
                            <span className="text-gray-500">Customer:</span>
                            <span className="ml-2 text-white">{customerName}</span>
                        </div>
                        <div>
                            <span className="text-gray-500">Email:</span>
                            <span className="ml-2 text-white">{lead.email}</span>
                        </div>
                        {lead.phone && (
                            <div>
                                <span className="text-gray-500">Phone:</span>
                                <span className="ml-2 text-white">{lead.phone}</span>
                            </div>
                        )}
                        <div>
                            <span className="text-gray-500">Source:</span>
                            <span className="ml-2 text-white">{lead.source}</span>
                        </div>
                        {lead.value && (
                            <div>
                                <span className="text-gray-500">Est. Value:</span>
                                <span className="ml-2 text-emerald-400 font-medium">{formatCurrency(lead.value)}</span>
                            </div>
                        )}
                        {lead.vehicleOfInterest && (
                            <div className="col-span-2">
                                <span className="text-gray-500">Interest:</span>
                                <span className="ml-2 text-white">{lead.vehicleOfInterest}</span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Vehicle Selection */}
                <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                        Select Vehicle to Sell
                    </label>
                    {availableVehicles.length > 0 ? (
                        <select
                            value={selectedVehicleId}
                            onChange={(e) => setSelectedVehicleId(e.target.value)}
                            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                        >
                            <option value="">Choose a vehicle...</option>
                            {availableVehicles.map(vehicle => (
                                <option key={vehicle.id} value={vehicle.id}>
                                    {vehicle.make} {vehicle.model} - {vehicle.reg} ({vehicle.year})
                                </option>
                            ))}
                        </select>
                    ) : (
                        <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-300 text-sm">
                            No vehicles available for sale. Add vehicles to stock first.
                        </div>
                    )}
                </div>

                {/* Selected Vehicle Preview */}
                {selectedVehicle && (
                    <div className="p-4 bg-gray-800/50 rounded-lg border border-gray-700">
                        <div className="flex items-start gap-3">
                            <div className="p-2 rounded-lg bg-blue-500/20">
                                <TruckIcon className="w-5 h-5 text-blue-400" />
                            </div>
                            <div className="flex-1">
                                <h4 className="font-medium text-white">
                                    {selectedVehicle.make} {selectedVehicle.model}
                                </h4>
                                <div className="mt-1 text-sm text-gray-400 space-y-0.5">
                                    <p>Reg: {selectedVehicle.reg} | Year: {selectedVehicle.year}</p>
                                    {selectedVehicle.mileage && <p>Mileage: {selectedVehicle.mileage.toLocaleString()} miles</p>}
                                    {selectedVehicle.color && <p>Colour: {selectedVehicle.color}</p>}
                                </div>
                                <div className="mt-2 flex items-center gap-3">
                                    {selectedVehicle.purchasePrice && (
                                        <Badge variant="default" size="sm">
                                            Cost: {formatCurrency(selectedVehicle.purchasePrice)}
                                        </Badge>
                                    )}
                                    <Badge variant={selectedVehicle.status === 'Available' ? 'success' : 'warning'} size="sm">
                                        {selectedVehicle.status}
                                    </Badge>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Info Note */}
                <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg text-blue-300 text-sm">
                    Clicking "Create Sale" will open the invoice creator with customer details pre-filled.
                    Complete the sale to mark this lead as Won.
                </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-gray-700 flex justify-between">
                <Button
                    variant="ghost"
                    onClick={handleMarkAsLost}
                    disabled={isProcessing}
                    className="text-red-400 hover:text-red-300"
                >
                    Mark as Lost
                </Button>
                <div className="flex gap-3">
                    <Button variant="ghost" onClick={onClose} disabled={isProcessing}>
                        Cancel
                    </Button>
                    <Button
                        variant="primary"
                        onClick={handleProceedToSale}
                        disabled={isProcessing || !selectedVehicleId}
                    >
                        {isProcessing ? 'Processing...' : 'Create Sale'}
                    </Button>
                </div>
            </div>
        </div>
    );
};

export default ConvertToSaleModal;
