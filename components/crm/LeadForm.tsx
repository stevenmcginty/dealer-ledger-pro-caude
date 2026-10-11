import React, { useState, useEffect } from 'react';
import { Button, Input } from '../ui';
import Select from '../common/Select';
import { SheetBody, SheetFooter, SheetFrame, SheetHeader } from './SheetParts';
import { STAGE_LABEL, STAGE_ORDER } from './leadStage';
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
            newErrors.firstName = 'Enter their first name';
        }
        if (!formData.lastName.trim()) {
            newErrors.lastName = 'Enter their last name';
        }
        if (!formData.email.trim()) {
            newErrors.email = 'Enter their email';
        } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
            newErrors.email = "That email doesn’t look right. Check the @ and the dot.";
        }
        if (formData.value && isNaN(parseFloat(formData.value))) {
            newErrors.value = 'Enter the value as a number, like 8495';
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
            setErrors({ submit: "Couldn’t save the lead. Check your signal and try again." });
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
        <SheetFrame as="form" onSubmit={handleSubmit}>
            <SheetHeader
                title={isEditing ? 'Edit lead' : 'Add a lead'}
                description={isEditing ? `${lead!.firstName} ${lead!.lastName}` : "A walk-in, a phone call, anyone Dave hasn’t met yet."}
                onClose={onClose}
            />
            <SheetBody className="space-y-4">
                {errors.submit && (
                    <p role="alert" className="rounded-control bg-danger-soft px-3.5 py-3 text-sm text-danger-ink">
                        {errors.submit}
                    </p>
                )}

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Input
                        id="lead-first-name"
                        label="First name"
                        autoComplete="off"
                        value={formData.firstName}
                        onChange={(e) => handleChange('firstName', e.target.value)}
                        error={errors.firstName}
                        required
                    />
                    <Input
                        id="lead-last-name"
                        label="Last name"
                        autoComplete="off"
                        value={formData.lastName}
                        onChange={(e) => handleChange('lastName', e.target.value)}
                        error={errors.lastName}
                        required
                    />
                    <Input
                        id="lead-email"
                        label="Email"
                        type="email"
                        inputMode="email"
                        value={formData.email}
                        onChange={(e) => handleChange('email', e.target.value)}
                        error={errors.email}
                        required
                    />
                    <Input
                        id="lead-phone"
                        label="Mobile"
                        type="tel"
                        inputMode="tel"
                        value={formData.phone}
                        onChange={(e) => handleChange('phone', e.target.value)}
                        className="num"
                    />
                </div>

                <div>
                    <label htmlFor="lead-source" className="mb-1.5 block text-sm font-semibold leading-5 text-ink">Where they found you</label>
                    <Select
                        id="lead-source"
                        value={formData.source}
                        onChange={(e) => handleChange('source', e.target.value)}
                    >
                        {LEAD_SOURCES.map(source => (
                            <option key={source} value={source}>{source}</option>
                        ))}
                    </Select>
                </div>

                {availableVehicles.length > 0 && (
                    <div>
                        <label htmlFor="lead-vehicle" className="mb-1.5 block text-sm font-semibold leading-5 text-ink">
                            Car from your stock <span className="font-normal text-ink-3">(optional)</span>
                        </label>
                        <Select
                            id="lead-vehicle"
                            value={formData.vehicleId}
                            onChange={(e) => handleVehicleSelect(e.target.value)}
                        >
                            <option value="">No car picked</option>
                            {availableVehicles.map(vehicle => (
                                <option key={vehicle.id} value={vehicle.id}>
                                    {vehicle.reg} · {vehicle.make} {vehicle.model}
                                </option>
                            ))}
                        </Select>
                    </div>
                )}

                <Input
                    id="lead-interest"
                    label="Car they asked about"
                    value={formData.vehicleOfInterest}
                    onChange={(e) => handleChange('vehicleOfInterest', e.target.value)}
                    hint="In their words, e.g. “auto, under £8k, 5 doors”"
                />

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Input
                        id="lead-value"
                        label="Estimated value"
                        type="number"
                        inputMode="decimal"
                        affix="£"
                        value={formData.value}
                        onChange={(e) => handleChange('value', e.target.value)}
                        error={errors.value}
                        className="num"
                    />
                    {isEditing && (
                        <div>
                            <label htmlFor="lead-stage" className="mb-1.5 block text-sm font-semibold leading-5 text-ink">Stage</label>
                            <Select
                                id="lead-stage"
                                value={formData.stage}
                                onChange={(e) => handleChange('stage', e.target.value)}
                            >
                                {STAGE_ORDER.map(stage => (
                                    <option key={stage} value={stage}>{STAGE_LABEL[stage]}</option>
                                ))}
                            </Select>
                        </div>
                    )}
                </div>
            </SheetBody>

            <SheetFooter>
                <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>
                    Cancel
                </Button>
                <Button type="submit" variant="primary" loading={isSubmitting}>
                    {isEditing ? 'Save lead' : 'Add lead'}
                </Button>
            </SheetFooter>
        </SheetFrame>
    );
};

export default LeadForm;
