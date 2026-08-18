import React, { useCallback } from 'react';
import { Card, Badge, Avatar, Button } from '../components/ui';
import { EmptyState } from '../components/ui';
import { UserGroupIcon, PhoneIcon, EnvelopeIcon, DocumentTextIcon, ArrowLeftIcon, EditIcon } from '../components/icons';
import { useData } from '../hooks/useData';
import { useUI } from '../hooks/useUI';
import { LeadStage } from '../types';
import ActivityTimeline from '../components/crm/ActivityTimeline';

const STAGE_COLORS: Record<LeadStage, 'default' | 'primary' | 'success' | 'warning' | 'danger'> = {
    [LeadStage.NEW]: 'primary',
    [LeadStage.QUALIFIED]: 'primary',
    [LeadStage.TEST_DRIVE]: 'warning',
    [LeadStage.NEGOTIATION]: 'warning',
    [LeadStage.WON]: 'success',
    [LeadStage.LOST]: 'danger',
};

const STAGE_OPTIONS = Object.values(LeadStage);

const LeadDetailPage: React.FC = () => {
    const { leads, selectedLeadId, vehicles, updateLeadStage } = useData();
    const { setView, openModal } = useUI();

    const lead = leads.find(l => l.id === selectedLeadId);

    const handleBack = useCallback(() => {
        setView('pipeline');
    }, [setView]);

    const handleEditLead = useCallback(() => {
        if (lead) {
            openModal('lead', { editingLead: lead });
        }
    }, [lead, openModal]);

    const handleAddNote = useCallback(() => {
        if (lead) {
            openModal('addNote', { lead });
        }
    }, [lead, openModal]);

    const handleLogCall = useCallback(() => {
        if (lead) {
            openModal('logCall', { lead });
        }
    }, [lead, openModal]);

    const handleStageChange = useCallback(async (newStage: LeadStage) => {
        if (lead && lead.stage !== newStage) {
            await updateLeadStage(lead.id, newStage);
        }
    }, [lead, updateLeadStage]);

    const handleConvertToSale = useCallback(() => {
        if (lead) {
            openModal('convertToSale', { lead });
        }
    }, [lead, openModal]);

    if (!lead) {
        return (
            <EmptyState
                icon={UserGroupIcon}
                title="No lead selected"
                description="Select a lead from the pipeline to view their details."
                actionLabel="Go to Pipeline"
                onAction={handleBack}
            />
        );
    }

    const linkedVehicle = lead.vehicleId
        ? vehicles.find(v => v.id === lead.vehicleId)
        : null;

    const fullName = `${lead.firstName} ${lead.lastName}`;

    return (
        <div className="space-y-6">
            {/* Header with back button */}
            <div className="flex items-center gap-4">
                <button
                    onClick={handleBack}
                    className="p-2 rounded-lg bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
                >
                    <ArrowLeftIcon className="w-5 h-5" />
                </button>
                <div className="flex-1">
                    <h1 className="text-xl font-bold text-white">{fullName}</h1>
                    <p className="text-sm text-gray-400">Lead Details</p>
                </div>
                <Button variant="ghost" onClick={handleEditLead}>
                    <EditIcon className="w-4 h-4 mr-2" />
                    Edit
                </Button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Main Content */}
                <div className="lg:col-span-2 space-y-6">
                    {/* Lead Info Card */}
                    <Card>
                        <Card.Header>
                            <div className="flex items-center gap-4">
                                <Avatar name={fullName} size="lg" />
                                <div className="flex-1">
                                    <h2 className="text-xl font-semibold text-white">{fullName}</h2>
                                    <p className="text-sm text-gray-400">{lead.source}</p>
                                </div>
                                <Badge variant={STAGE_COLORS[lead.stage]} size="lg">
                                    {lead.stage}
                                </Badge>
                            </div>
                        </Card.Header>
                        <Card.Body>
                            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                                <div>
                                    <dt className="text-gray-500 mb-1">Email</dt>
                                    <dd className="text-white">
                                        <a
                                            href={`mailto:${encodeURIComponent(lead.email)}`}
                                            className="hover:text-brand-400 transition-colors"
                                        >
                                            {lead.email}
                                        </a>
                                    </dd>
                                </div>
                                {lead.phone && (
                                    <div>
                                        <dt className="text-gray-500 mb-1">Phone</dt>
                                        <dd className="text-white">
                                            <a
                                                href={`tel:${encodeURIComponent(lead.phone)}`}
                                                className="hover:text-brand-400 transition-colors"
                                            >
                                                {lead.phone}
                                            </a>
                                        </dd>
                                    </div>
                                )}
                                <div>
                                    <dt className="text-gray-500 mb-1">Source</dt>
                                    <dd className="text-white">{lead.source}</dd>
                                </div>
                                {lead.value && (
                                    <div>
                                        <dt className="text-gray-500 mb-1">Estimated Value</dt>
                                        <dd className="text-green-400 font-semibold">
                                            £{lead.value.toLocaleString()}
                                        </dd>
                                    </div>
                                )}
                                <div>
                                    <dt className="text-gray-500 mb-1">Created</dt>
                                    <dd className="text-white">
                                        {new Date(lead.createdAt).toLocaleDateString('en-GB', {
                                            day: 'numeric',
                                            month: 'short',
                                            year: 'numeric',
                                        })}
                                    </dd>
                                </div>
                                <div>
                                    <dt className="text-gray-500 mb-1">Last Updated</dt>
                                    <dd className="text-white">
                                        {new Date(lead.updatedAt).toLocaleDateString('en-GB', {
                                            day: 'numeric',
                                            month: 'short',
                                            year: 'numeric',
                                        })}
                                    </dd>
                                </div>
                            </dl>
                        </Card.Body>
                    </Card>

                    {/* Activity Timeline */}
                    <Card>
                        <Card.Header title="Activity Timeline" />
                        <Card.Body>
                            <ActivityTimeline activities={lead.history} />
                        </Card.Body>
                    </Card>
                </div>

                {/* Sidebar */}
                <div className="space-y-6">
                    {/* Quick Actions */}
                    <Card>
                        <Card.Header title="Quick Actions" />
                        <Card.Body className="space-y-2">
                            <button
                                onClick={handleLogCall}
                                className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-left text-gray-300 hover:bg-gray-700 rounded-lg transition-colors"
                            >
                                <div className="p-1.5 rounded-lg bg-amber-500/20">
                                    <PhoneIcon className="w-4 h-4 text-amber-400" />
                                </div>
                                Log Call
                            </button>
                            <button
                                onClick={() => window.location.href = `mailto:${encodeURIComponent(lead.email)}`}
                                className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-left text-gray-300 hover:bg-gray-700 rounded-lg transition-colors"
                            >
                                <div className="p-1.5 rounded-lg bg-blue-500/20">
                                    <EnvelopeIcon className="w-4 h-4 text-blue-400" />
                                </div>
                                Send Email
                            </button>
                            <button
                                onClick={handleAddNote}
                                className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-left text-gray-300 hover:bg-gray-700 rounded-lg transition-colors"
                            >
                                <div className="p-1.5 rounded-lg bg-purple-500/20">
                                    <DocumentTextIcon className="w-4 h-4 text-purple-400" />
                                </div>
                                Add Note
                            </button>

                            {lead.stage !== LeadStage.WON && lead.stage !== LeadStage.LOST && (
                                <div className="pt-2 border-t border-gray-700 mt-2">
                                    <button
                                        onClick={handleConvertToSale}
                                        className="w-full flex items-center justify-center gap-2 px-3 py-2.5 text-sm font-medium text-white bg-green-600 hover:bg-green-500 rounded-lg transition-colors"
                                    >
                                        Convert to Sale
                                    </button>
                                </div>
                            )}
                        </Card.Body>
                    </Card>

                    {/* Stage Management */}
                    <Card>
                        <Card.Header title="Pipeline Stage" />
                        <Card.Body>
                            <div className="space-y-2">
                                {STAGE_OPTIONS.map(stage => (
                                    <button
                                        key={stage}
                                        onClick={() => handleStageChange(stage)}
                                        className={`w-full px-3 py-2 text-sm text-left rounded-lg border transition-colors ${
                                            lead.stage === stage
                                                ? 'border-brand-500 bg-brand-500/20 text-white'
                                                : 'border-gray-700 bg-gray-800 text-gray-400 hover:text-white hover:border-gray-600'
                                        }`}
                                    >
                                        {stage}
                                    </button>
                                ))}
                            </div>
                        </Card.Body>
                    </Card>

                    {/* Vehicle Interest */}
                    <Card>
                        <Card.Header title="Vehicle Interest" />
                        <Card.Body>
                            {linkedVehicle ? (
                                <div className="space-y-2">
                                    <p className="font-medium text-white">{linkedVehicle.reg}</p>
                                    <p className="text-sm text-gray-400">
                                        {linkedVehicle.make} {linkedVehicle.model} ({linkedVehicle.year})
                                    </p>
                                    <p className="text-sm text-gray-500">
                                        {linkedVehicle.mileage.toLocaleString()} miles
                                    </p>
                                    <Badge
                                        variant={linkedVehicle.status === 'Available' ? 'success' : 'warning'}
                                        size="sm"
                                    >
                                        {linkedVehicle.status}
                                    </Badge>
                                </div>
                            ) : lead.vehicleOfInterest ? (
                                <p className="text-gray-300">{lead.vehicleOfInterest}</p>
                            ) : (
                                <p className="text-gray-500 text-sm">No vehicle linked</p>
                            )}
                        </Card.Body>
                    </Card>
                </div>
            </div>
        </div>
    );
};

export default LeadDetailPage;
