import React from 'react';
import { Activity, ActivityType } from '../../types';
import {
    EnvelopeIcon,
    PhoneIcon,
    DocumentTextIcon,
    SparklesIcon,
    ChatBubbleLeftIcon
} from '../icons';

interface ActivityTimelineProps {
    activities: Activity[];
    maxItems?: number;
}

const ACTIVITY_CONFIG: Record<ActivityType, {
    icon: React.ComponentType<{ className?: string }>;
    color: string;
    bgColor: string;
    label: string;
}> = {
    'EMAIL_IN': {
        icon: EnvelopeIcon,
        color: 'text-blue-400',
        bgColor: 'bg-blue-500/20',
        label: 'Email received',
    },
    'EMAIL_OUT': {
        icon: EnvelopeIcon,
        color: 'text-green-400',
        bgColor: 'bg-green-500/20',
        label: 'Email sent',
    },
    'SMS_IN': {
        icon: ChatBubbleLeftIcon,
        color: 'text-blue-400',
        bgColor: 'bg-blue-500/20',
        label: 'SMS received',
    },
    'SMS_OUT': {
        icon: ChatBubbleLeftIcon,
        color: 'text-green-400',
        bgColor: 'bg-green-500/20',
        label: 'SMS sent',
    },
    'WHATSAPP_IN': {
        icon: ChatBubbleLeftIcon,
        color: 'text-emerald-400',
        bgColor: 'bg-emerald-500/20',
        label: 'WhatsApp received',
    },
    'WHATSAPP_OUT': {
        icon: ChatBubbleLeftIcon,
        color: 'text-emerald-400',
        bgColor: 'bg-emerald-500/20',
        label: 'WhatsApp sent',
    },
    'CALL_LOG': {
        icon: PhoneIcon,
        color: 'text-amber-400',
        bgColor: 'bg-amber-500/20',
        label: 'Call logged',
    },
    'NOTE': {
        icon: DocumentTextIcon,
        color: 'text-purple-400',
        bgColor: 'bg-purple-500/20',
        label: 'Note added',
    },
    'SYSTEM': {
        icon: SparklesIcon,
        color: 'text-gray-400',
        bgColor: 'bg-gray-500/20',
        label: 'System',
    },
};

const formatTimestamp = (timestamp: string): string => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
    });
};

const ActivityTimeline: React.FC<ActivityTimelineProps> = ({ activities, maxItems }) => {
    // Sort activities by timestamp (newest first)
    const sortedActivities = [...activities].sort((a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    const displayActivities = maxItems
        ? sortedActivities.slice(0, maxItems)
        : sortedActivities;

    if (activities.length === 0) {
        return (
            <div className="text-center py-8">
                <p className="text-gray-500 text-sm">No activity yet</p>
                <p className="text-gray-600 text-xs mt-1">
                    Activities will appear here as you interact with this lead
                </p>
            </div>
        );
    }

    return (
        <div className="flow-root">
            <ul className="-mb-8">
                {displayActivities.map((activity, idx) => {
                    const config = ACTIVITY_CONFIG[activity.type] || ACTIVITY_CONFIG['SYSTEM'];
                    const Icon = config.icon;
                    const isLast = idx === displayActivities.length - 1;

                    return (
                        <li key={activity.id || idx}>
                            <div className="relative pb-8">
                                {/* Connecting line */}
                                {!isLast && (
                                    <span
                                        className="absolute left-4 top-4 -ml-px h-full w-0.5 bg-gray-700"
                                        aria-hidden="true"
                                    />
                                )}

                                <div className="relative flex items-start space-x-3">
                                    {/* Icon */}
                                    <div className={`relative flex h-8 w-8 items-center justify-center rounded-full ${config.bgColor}`}>
                                        <Icon className={`h-4 w-4 ${config.color}`} />
                                    </div>

                                    {/* Content */}
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center justify-between">
                                            <p className="text-xs text-gray-500">
                                                {config.label}
                                                {activity.performedBy && (
                                                    <span className="ml-1">by {activity.performedBy}</span>
                                                )}
                                            </p>
                                            <time className="text-xs text-gray-600">
                                                {formatTimestamp(activity.timestamp)}
                                            </time>
                                        </div>
                                        <p className="mt-1 text-sm text-gray-300 whitespace-pre-wrap">
                                            {activity.content}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </li>
                    );
                })}
            </ul>

            {maxItems && sortedActivities.length > maxItems && (
                <div className="mt-4 text-center">
                    <p className="text-xs text-gray-500">
                        Showing {maxItems} of {sortedActivities.length} activities
                    </p>
                </div>
            )}
        </div>
    );
};

export default ActivityTimeline;
