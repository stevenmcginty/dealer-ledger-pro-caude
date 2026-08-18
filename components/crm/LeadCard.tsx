import React from 'react';
import { Card, Avatar } from '../ui';
import { Lead, LeadStage } from '../../types';
import { PhoneIcon, EnvelopeIcon } from '../icons';

interface LeadCardProps {
    lead: Lead;
    onClick?: (lead: Lead) => void;
    isDragging?: boolean;
}

const STAGE_COLORS: Record<LeadStage, 'default' | 'primary' | 'success' | 'warning' | 'danger'> = {
    [LeadStage.NEW]: 'primary',
    [LeadStage.QUALIFIED]: 'primary',
    [LeadStage.TEST_DRIVE]: 'warning',
    [LeadStage.NEGOTIATION]: 'warning',
    [LeadStage.WON]: 'success',
    [LeadStage.LOST]: 'danger',
};

const getDaysInStage = (lead: Lead): number => {
    const lastStageChange = lead.history.find(h => h.type === 'SYSTEM' && h.content.includes('stage'));
    const referenceDate = lastStageChange ? new Date(lastStageChange.timestamp) : new Date(lead.createdAt);
    const now = new Date();
    return Math.floor((now.getTime() - referenceDate.getTime()) / (1000 * 60 * 60 * 24));
};

const LeadCard: React.FC<LeadCardProps> = ({ lead, onClick, isDragging }) => {
    const daysInStage = getDaysInStage(lead);
    const fullName = `${lead.firstName} ${lead.lastName}`;

    return (
        <div
            onClick={() => onClick?.(lead)}
            draggable
            className={`
                cursor-pointer select-none
                transition-all duration-200
                ${isDragging ? 'opacity-50 scale-105 rotate-2' : 'opacity-100'}
            `}
        >
            <Card className="hover:border-brand-500/50 hover:shadow-lg hover:shadow-brand-500/10 transition-all">
                <Card.Body className="p-3 space-y-2">
                    {/* Header with avatar and name */}
                    <div className="flex items-center gap-2">
                        <Avatar name={fullName} size="sm" />
                        <div className="flex-1 min-w-0">
                            <p className="font-medium text-white text-sm truncate">
                                {fullName}
                            </p>
                            <p className="text-xs text-gray-500">{lead.source}</p>
                        </div>
                    </div>

                    {/* Vehicle of interest */}
                    {lead.vehicleOfInterest && (
                        <p className="text-xs text-gray-400 truncate bg-gray-800/50 px-2 py-1 rounded">
                            {lead.vehicleOfInterest}
                        </p>
                    )}

                    {/* Footer with value and days */}
                    <div className="flex items-center justify-between pt-1">
                        {lead.value ? (
                            <span className="text-sm font-semibold text-green-400">
                                £{lead.value.toLocaleString()}
                            </span>
                        ) : (
                            <span className="text-xs text-gray-600">No value set</span>
                        )}
                        <span className={`text-xs ${daysInStage > 7 ? 'text-amber-400' : 'text-gray-500'}`}>
                            {daysInStage}d
                        </span>
                    </div>

                    {/* Quick contact icons */}
                    <div className="flex items-center gap-2 pt-1 border-t border-gray-800">
                        {lead.email && (
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    window.location.href = `mailto:${encodeURIComponent(lead.email)}`;
                                }}
                                className="p-1.5 rounded-md hover:bg-gray-700 text-gray-400 hover:text-white transition-colors"
                                title={lead.email}
                            >
                                <EnvelopeIcon className="w-4 h-4" />
                            </button>
                        )}
                        {lead.phone && (
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    window.location.href = `tel:${encodeURIComponent(lead.phone)}`;
                                }}
                                className="p-1.5 rounded-md hover:bg-gray-700 text-gray-400 hover:text-white transition-colors"
                                title={lead.phone}
                            >
                                <PhoneIcon className="w-4 h-4" />
                            </button>
                        )}
                    </div>
                </Card.Body>
            </Card>
        </div>
    );
};

export default LeadCard;
