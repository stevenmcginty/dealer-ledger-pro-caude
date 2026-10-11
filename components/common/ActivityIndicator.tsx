
import React from 'react';
import Spinner from './Spinner';
import { CheckCircleIcon, ExclamationTriangleIcon } from '../icons';

export type ActivityStatus = 'idle' | 'running' | 'success' | 'error';

export interface ActivityState {
    status: ActivityStatus;
    message: string;
    progress?: number; // 0 to 100
    total?: number;
    current?: number;
}

interface ActivityIndicatorProps {
    activity: ActivityState;
    onClose?: () => void;
}

const ActivityIndicator: React.FC<ActivityIndicatorProps> = ({ activity, onClose }) => {
    if (activity.status === 'idle') return null;

    return (
        <div className="anim-pop-in fixed inset-x-4 bottom-[calc(6rem+env(safe-area-inset-bottom))] z-toast mx-auto max-w-md md:bottom-6" role="status">
            <div className={`flex items-center gap-4 rounded-card border p-4 shadow-e2 ${
                activity.status === 'error' ? 'border-danger bg-danger-soft' : 'border-line bg-surface'
            }`}>
                <div className="flex-shrink-0">
                    {activity.status === 'running' && (
                        <div className="relative">
                            <Spinner className="h-6 w-6 text-accent-text" />
                        </div>
                    )}
                    {activity.status === 'success' && <CheckCircleIcon className="h-6 w-6 text-success" />}
                    {activity.status === 'error' && <ExclamationTriangleIcon className="h-6 w-6 text-danger" />}
                </div>

                <div className="flex-1 min-w-0">
                    <p className={`text-sm font-semibold truncate ${activity.status === 'error' ? 'text-danger-ink' : 'text-ink'}`}>
                        {activity.message}
                    </p>
                    {activity.status === 'running' && activity.total !== undefined && activity.total > 0 && (
                        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
                            <div 
                                className="bg-accent h-1.5 rounded-full transition-all duration-300 ease-out" 
                                style={{ width: `${((activity.current || 0) / activity.total) * 100}%` }}
                            ></div>
                        </div>
                    )}
                    {activity.status === 'running' && activity.total === undefined && (
                         <p className="mt-0.5 text-xs text-ink-3">Working on it…</p>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ActivityIndicator;