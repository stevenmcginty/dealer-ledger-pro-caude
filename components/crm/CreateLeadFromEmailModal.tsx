import React, { useState, useEffect } from 'react';
import { Button, Input, Badge } from '../ui';
import { XMarkIcon, SparklesIcon, UserGroupIcon } from '../icons';
import { useData } from '../../hooks/useData';
import { InboxEmail, LeadStage, LeadSource, NewLead } from '../../types';
import { analyzeIncomingEmail } from '../../utils/ai';

interface CreateLeadFromEmailModalProps {
    email: InboxEmail;
    onClose: () => void;
}

const LEAD_SOURCES: LeadSource[] = [
    'Website',
    'Walk-in',
    'Referral',
    'Motors.co.uk',
    'CarGurus',
    'AutoTrader',
    'eBay',
];

// Try to detect source from email domain
const detectSource = (email: string): LeadSource => {
    const domain = email.split('@')[1]?.toLowerCase() || '';
    if (domain.includes('autotrader')) return 'AutoTrader';
    if (domain.includes('motors.co.uk')) return 'Motors.co.uk';
    if (domain.includes('cargurus')) return 'CarGurus';
    if (domain.includes('ebay')) return 'eBay';
    return 'Website';
};

// Parse name from email sender
const parseName = (senderName: string): { firstName: string; lastName: string } => {
    const parts = senderName.trim().split(/\s+/);
    if (parts.length === 1) {
        return { firstName: parts[0], lastName: '' };
    }
    return {
        firstName: parts[0],
        lastName: parts.slice(1).join(' '),
    };
};

const CreateLeadFromEmailModal: React.FC<CreateLeadFromEmailModalProps> = ({ email, onClose }) => {
    const { addLead, updateInboxEmail, vehicles } = useData();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [errors, setErrors] = useState<Record<string, string>>({});

    // Pre-populate from email
    const { firstName: initialFirst, lastName: initialLast } = parseName(email.senderName);
    const initialSource = detectSource(email.senderEmail);

    const [formData, setFormData] = useState({
        firstName: initialFirst,
        lastName: initialLast,
        email: email.senderEmail,
        phone: '',
        source: initialSource,
        vehicleOfInterest: email.analysis?.vehicleExtracted || '',
        vehicleId: '',
        value: '',
    });

    // Run AI analysis if not already done
    useEffect(() => {
        if (!email.analysis && !isAnalyzing) {
            runAnalysis();
        }
    }, []);

    const runAnalysis = async () => {
        setIsAnalyzing(true);
        try {
            const analysis = await analyzeIncomingEmail(
                { subject: email.subject, body: email.body, senderEmail: email.senderEmail },
                vehicles
            );

            if (analysis.vehicleExtracted) {
                setFormData(prev => ({
                    ...prev,
                    vehicleOfInterest: analysis.vehicleExtracted || prev.vehicleOfInterest,
                    vehicleId: analysis.suggestedVehicleId || prev.vehicleId,
                }));
            }
        } catch (error) {
            console.error('Error analyzing email:', error);
        } finally {
            setIsAnalyzing(false);
        }
    };

    const validate = (): boolean => {
        const newErrors: Record<string, string> = {};

        if (!formData.firstName.trim()) {
            newErrors.firstName = 'First name is required';
        }
        if (!formData.email.trim()) {
            newErrors.email = 'Email is required';
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
            const now = new Date().toISOString();
            const newLead: NewLead = {
                firstName: formData.firstName.trim(),
                lastName: formData.lastName.trim(),
                email: formData.email.trim(),
                phone: formData.phone.trim() || undefined,
                source: formData.source,
                vehicleOfInterest: formData.vehicleOfInterest.trim() || undefined,
                vehicleId: formData.vehicleId || undefined,
                value: formData.value ? parseFloat(formData.value) : undefined,
                stage: LeadStage.NEW,
                ownerId: '',
                createdAt: now,
                updatedAt: now,
                history: [{
                    id: `activity-${Date.now()}`,
                    type: 'EMAIL_IN',
                    content: `Email received: "${email.subject}"`,
                    timestamp: email.receivedAt,
                }],
            };

            const leadId = await addLead(newLead);

            // Link email to lead and mark as processed
            await updateInboxEmail(email.id, { status: 'SENT', leadId });

            onClose();
        } catch (error) {
            console.error('Error creating lead:', error);
            setErrors({ submit: 'Failed to create lead. Please try again.' });
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

    const availableVehicles = vehicles.filter(v => v.status !== 'Sold');

    return (
        <div className="flex flex-col w-full max-h-[80vh]">
            {/* Header */}
            <div className="p-4 border-b border-gray-700 flex items-center justify-between flex-shrink-0">
                <div className="flex items-center gap-2">
                    <div className="p-2 rounded-lg bg-brand-500/20">
                        <UserGroupIcon className="w-5 h-5 text-brand-400" />
                    </div>
                    <div>
                        <h2 className="text-lg font-semibold text-white">Create Lead from Email</h2>
                        <p className="text-xs text-gray-400 truncate max-w-[250px]">
                            {email.subject}
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
            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
                <div className="p-4 space-y-4">
                    {/* AI Analysis Status */}
                    {isAnalyzing && (
                        <div className="flex items-center gap-2 p-3 bg-brand-500/10 border border-brand-500/30 rounded-lg">
                            <SparklesIcon className="w-5 h-5 text-brand-400 animate-pulse" />
                            <span className="text-sm text-brand-300">Analyzing email content...</span>
                        </div>
                    )}

                    {email.analysis && (
                        <div className="p-3 bg-gray-800/50 rounded-lg space-y-2">
                            <div className="flex items-center gap-2">
                                <SparklesIcon className="w-4 h-4 text-brand-400" />
                                <span className="text-xs font-medium text-gray-400">AI Analysis</span>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {email.analysis.intent && (
                                    <Badge variant="default" size="sm">
                                        Intent: {email.analysis.intent}
                                    </Badge>
                                )}
                                {email.analysis.vehicleExtracted && (
                                    <Badge variant="primary" size="sm">
                                        Vehicle: {email.analysis.vehicleExtracted}
                                    </Badge>
                                )}
                            </div>
                        </div>
                    )}

                    {errors.submit && (
                        <div className="p-3 bg-red-500/20 border border-red-500/50 rounded-lg text-red-400 text-sm">
                            {errors.submit}
                        </div>
                    )}

                    {/* Name Row */}
                    <div className="grid grid-cols-2 gap-4">
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
                        />
                    </div>

                    {/* Contact Row */}
                    <div className="grid grid-cols-2 gap-4">
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
                            hint="Extract from email if mentioned"
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
                                Link to Vehicle
                            </label>
                            <select
                                value={formData.vehicleId}
                                onChange={(e) => {
                                    const vehicle = vehicles.find(v => v.id === e.target.value);
                                    handleChange('vehicleId', e.target.value);
                                    if (vehicle) {
                                        handleChange('vehicleOfInterest', `${vehicle.make} ${vehicle.model} - ${vehicle.reg}`);
                                    }
                                }}
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

                    {/* Vehicle of Interest */}
                    <Input
                        label="Vehicle of Interest"
                        value={formData.vehicleOfInterest}
                        onChange={(e) => handleChange('vehicleOfInterest', e.target.value)}
                        hint="From email content or manual entry"
                    />

                    {/* Value */}
                    <Input
                        label="Estimated Value"
                        type="number"
                        value={formData.value}
                        onChange={(e) => handleChange('value', e.target.value)}
                        error={errors.value}
                    />
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-gray-700 flex justify-end gap-3 flex-shrink-0">
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
                        disabled={isSubmitting || isAnalyzing}
                    >
                        {isSubmitting ? 'Creating...' : 'Create Lead'}
                    </Button>
                </div>
            </form>
        </div>
    );
};

export default CreateLeadFromEmailModal;
