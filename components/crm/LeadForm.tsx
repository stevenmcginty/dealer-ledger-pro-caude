import React, { useState, useEffect } from 'react';
import { Button, Input, Card } from '../ui';
import { XMarkIcon } from '../icons';
import { useData } from '../../hooks/useData';
import { useUI } from '../../hooks/useUI';
import { Lead, LeadStage, LeadSource, NewLead } from '../../types';

const LEAD_SOURCES: LeadSource[] = [
    'Website',
    'Walk-in',
    'Referral',
    'Motors.co.uk',
    'CarGurus',
    'AutoTrader',
    'eBay',
];

interface LeadFormProps {
    lead?: Lead;
    onClose: () => void;
}

const LeadForm: React.FC<LeadFormProps> = ({ lead, onClose }) => {
    const { addLead, updateLead, vehicles } = useData();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [errors, setErrors] = useState<Record<string, string>>({});

    const [formData, setFormData] = useState({
        firstName: lead?.firstName || '',
        lastName: lead?.lastName || '',
        email: lead?.email || '',
        phone: lead?.phone || '',
        source: lead?.source || 'Website' as LeadSource,
        vehicleOfInterest: lead?.vehicleOfInterest || '',
        vehicleId: lead?.vehicleId || '',
        value: lead?.value?.toString() || '',
        stage: lead?.stage || LeadStage.NEW,
    });

    const isEditing = !!lead;

    const validate = (): boolean => {
        const newErrors: Record<string, string> = {};

        if (!formData.firstName.trim()) {
            newErrors.firstName = 'First name is required';
        }
        if (!formData.lastName.trim()) {
            newErrors.lastName = 'Last name is required';
        }
        if (!formData.email.trim()) {
            newErrors.email = 'Email is required';
        } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
            newErrors.email = 'Invalid email format';
        }
        if (formData.value && isNaN(parseFloat(formData.value))) {
            newErrors.value = 'Value must be a number';
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!validate()) return;

        setIsSubmitting(true);
        try {
            const leadData = {
                firstName: formData.firstName.trim(),
                lastName: formData.lastName.trim(),
                email: formData.email.trim(),
                phone: formData.phone.trim() || undefined,
                source: formData.source,
                vehicleOfInterest: formData.vehicleOfInterest.trim() || undefined,
                vehicleId: formData.vehicleId || undefined,
                value: formData.value ? parseFloat(formData.value) : undefined,
                stage: formData.stage,
            };

            if (isEditing && lead) {
                await updateLead(lead.id, leadData);
            } else {
                const now = new Date().toISOString();
                const newLead: NewLead = {
                    ...leadData,
                    ownerId: '', // Will be set by dataService
                    createdAt: now,
                    updatedAt: now,
                };
                await addLead(newLead);
            }
            onClose();
        } catch (error) {
            console.error('Error saving lead:', error);
            setErrors({ submit: 'Failed to save lead. Please try again.' });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleChange = (field: string, value: string) => {
        setFormData(prev => ({ ...prev, [field]: value }));
        if (errors[field]) {
            setErrors(prev => ({ ...prev, [field]: '' }));
        }
    };

    // When a vehicle is selected, auto-fill vehicle of interest
    const handleVehicleSelect = (vehicleId: string) => {
        const vehicle = vehicles.find(v => v.id === vehicleId);
        if (vehicle) {
            setFormData(prev => ({
                ...prev,
                vehicleId,
                vehicleOfInterest: `${vehicle.make} ${vehicle.model} - ${vehicle.reg}`,
                value: vehicle.purchasePrice?.toString() || prev.value,
            }));
        }
    };

    const availableVehicles = vehicles.filter(v => v.status !== 'Sold');

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <Card className="w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
                <Card.Header>
                    <div className="flex items-center justify-between">
                        <h2 className="text-lg font-semibold text-white">
                            {isEditing ? 'Edit Lead' : 'Add New Lead'}
                        </h2>
                        <button
                            onClick={onClose}
                            className="p-1 text-gray-400 hover:text-white rounded-lg hover:bg-gray-700 transition-colors"
                        >
                            <XMarkIcon className="w-5 h-5" />
                        </button>
                    </div>
                </Card.Header>

                <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
                    <Card.Body className="space-y-4">
                        {errors.submit && (
                            <div className="p-3 bg-red-500/20 border border-red-500/50 rounded-lg text-red-400 text-sm">
                                {errors.submit}
                            </div>
                        )}

                        {/* Name Row */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <Input
                                label="First Name"
                                value={formData.firstName}
                                onChange={(e) => handleChange('firstName', e.target.value)}
                                error={errors.firstName}
                                required
                            />
                            <Input
                                label="Last Name"
                                value={formData.lastName}
                                onChange={(e) => handleChange('lastName', e.target.value)}
                                error={errors.lastName}
                                required
                            />
                        </div>

                        {/* Contact Row */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <Input
                                label="Email"
                                type="email"
                                value={formData.email}
                                onChange={(e) => handleChange('email', e.target.value)}
                                error={errors.email}
                                required
                            />
                            <Input
                                label="Phone"
                                type="tel"
                                value={formData.phone}
                                onChange={(e) => handleChange('phone', e.target.value)}
                            />
                        </div>

                        {/* Source */}
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-1.5">
                                Lead Source
                            </label>
                            <select
                                value={formData.source}
                                onChange={(e) => handleChange('source', e.target.value)}
                                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                            >
                                {LEAD_SOURCES.map(source => (
                                    <option key={source} value={source}>{source}</option>
                                ))}
                            </select>
                        </div>

                        {/* Vehicle Selection */}
                        {availableVehicles.length > 0 && (
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-1.5">
                                    Link to Vehicle (Optional)
                                </label>
                                <select
                                    value={formData.vehicleId}
                                    onChange={(e) => handleVehicleSelect(e.target.value)}
                                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                                >
                                    <option value="">Select a vehicle...</option>
                                    {availableVehicles.map(vehicle => (
                                        <option key={vehicle.id} value={vehicle.id}>
                                            {vehicle.make} {vehicle.model} - {vehicle.reg}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}

                        {/* Vehicle of Interest (text) */}
                        <Input
                            label="Vehicle of Interest"
                            value={formData.vehicleOfInterest}
                            onChange={(e) => handleChange('vehicleOfInterest', e.target.value)}
                            hint="Description of what the lead is interested in"
                        />

                        {/* Value and Stage Row */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <Input
                                label="Estimated Value (£)"
                                type="number"
                                value={formData.value}
                                onChange={(e) => handleChange('value', e.target.value)}
                                error={errors.value}
                            />
                            {isEditing && (
                                <div>
                                    <label className="block text-sm font-medium text-gray-300 mb-1.5">
                                        Stage
                                    </label>
                                    <select
                                        value={formData.stage}
                                        onChange={(e) => handleChange('stage', e.target.value)}
                                        className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                                    >
                                        {Object.values(LeadStage).map(stage => (
                                            <option key={stage} value={stage}>{stage}</option>
                                        ))}
                                    </select>
                                </div>
                            )}
                        </div>
                    </Card.Body>

                    {/* Footer */}
                    <div className="p-4 border-t border-gray-700 flex justify-end gap-3">
                        <Button
                            type="button"
                            variant="ghost"
                            onClick={onClose}
                            disabled={isSubmitting}
                        >
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            variant="primary"
                            disabled={isSubmitting}
                        >
                            {isSubmitting ? 'Saving...' : isEditing ? 'Save Changes' : 'Add Lead'}
                        </Button>
                    </div>
                </form>
            </Card>
        </div>
    );
};

export default LeadForm;
