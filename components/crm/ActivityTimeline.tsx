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
        color: 'text-info-ink',
        bgColor: 'bg-info-soft',
        label: 'Email received',
    },
    'EMAIL_OUT': {
        icon: EnvelopeIcon,
        color: 'text-success-ink',
        bgColor: 'bg-success-soft',
        label: 'Email sent',
    },
    'SMS_IN': {
        icon: ChatBubbleLeftIcon,
        color: 'text-info-ink',
        bgColor: 'bg-info-soft',
        label: 'SMS received',
    },
    'SMS_OUT': {
        icon: ChatBubbleLeftIcon,
        color: 'text-success-ink',
        bgColor: 'bg-success-soft',
        label: 'SMS sent',
    },
    'WHATSAPP_IN': {
        icon: ChatBubbleLeftIcon,
        color: 'text-success-ink',
        bgColor: 'bg-success-soft',
        label: 'WhatsApp received',
    },
    'WHATSAPP_OUT': {
        icon: ChatBubbleLeftIcon,
        color: 'text-success-ink',
        bgColor: 'bg-success-soft',
        label: 'WhatsApp sent',
    },
    'CALL_LOG': {
        icon: PhoneIcon,
        color: 'text-warning-ink',
        bgColor: 'bg-warning-soft',
        label: 'Call logged',
    },
    'NOTE': {
        icon: DocumentTextIcon,
        color: 'text-accent-soft-ink',
        bgColor: 'bg-accent-soft',
        label: 'Note added',
    },
    'SYSTEM': {
        icon: SparklesIcon,
        color: 'text-ink-2',
        bgColor: 'bg-surface-2',
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
            <div className="py-2">
                <p className="text-base font-semibold text-ink">Nothing logged yet</p>
                <p className="mt-1 text-sm text-ink-3">
                    Emails, WhatsApps, calls and notes with this lead show up here, newest first.
                </p>
            </div>
        );
    }

    return (
        <div className="flow-root">
            <ul className="-mb-6">
                {displayActivities.map((activity, idx) => {
                    const config = ACTIVITY_CONFIG[activity.type] || ACTIVITY_CONFIG['SYSTEM'];
                    const Icon = config.icon;
                    const isLast = idx === displayActivities.length - 1;

                    return (
                        <li key={activity.id || idx}>
                            <div className="relative pb-6">
                                {/* Hairline rail joining the entries */}
                                {!isLast && (
                                    <span
                                        className="absolute start-4 top-9 -ms-px h-[calc(100%-2.25rem)] w-px bg-line-strong"
                                        aria-hidden="true"
                                    />
                                )}

                                <div className="relative flex items-start gap-3">
                                    <div className={`relative flex h-8 w-8 flex-none items-center justify-center rounded-full ${config.bgColor}`}>
                                        <Icon className={`h-4 w-4 ${config.color}`} aria-hidden="true" />
                                    </div>

                                    <div className="min-w-0 flex-1 pt-1">
                                        <div className="flex items-baseline justify-between gap-3">
                                            <p className="min-w-0 truncate text-xs font-semibold text-ink-2">
                                                {config.label}
                                                {activity.performedBy && (
                                                    <span className="font-normal text-ink-3"> by {activity.performedBy}</span>
                                                )}
                                            </p>
                                            <time dateTime={activity.timestamp} className="num flex-none text-xs text-ink-3">
                                                {formatTimestamp(activity.timestamp)}
                                            </time>
                                        </div>
                                        <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-ink">
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
                    <p className="text-xs text-ink-3">
                        Showing {maxItems} of {sortedActivities.length} activities
                    </p>
                </div>
            )}
        </div>
    );
};

export default ActivityTimeline;
