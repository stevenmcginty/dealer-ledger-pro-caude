
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
        <div className="fixed bottom-24 left-1/2 transform -translate-x-1/2 z-50 w-[90%] max-w-md animate-in slide-in-from-bottom-5 fade-in-0 duration-300">
            <div className={`
                glass-panel p-4 rounded-xl shadow-2xl border border-white/10 flex items-center gap-4
                ${activity.status === 'error' ? 'bg-red-900/80 border-red-500/30' : 'bg-gray-900/80'}
            `}>
                <div className="flex-shrink-0">
                    {activity.status === 'running' && (
                        <div className="relative">
                            <Spinner className="h-6 w-6 text-brand-500" />
                        </div>
                    )}
                    {activity.status === 'success' && <CheckCircleIcon className="h-6 w-6 text-green-400" />}
                    {activity.status === 'error' && <ExclamationTriangleIcon className="h-6 w-6 text-red-400" />}
                </div>

                <div className="flex-1 min-w-0">
                    <p className={`text-sm font-semibold truncate ${activity.status === 'error' ? 'text-red-200' : 'text-white'}`}>
                        {activity.message}
                    </p>
                    {activity.status === 'running' && activity.total !== undefined && activity.total > 0 && (
                        <div className="w-full bg-gray-700/50 rounded-full h-1.5 mt-2 overflow-hidden">
                            <div 
                                className="bg-brand-500 h-1.5 rounded-full transition-all duration-300 ease-out" 
                                style={{ width: `${((activity.current || 0) / activity.total) * 100}%` }}
                            ></div>
                        </div>
                    )}
                    {activity.status === 'running' && activity.total === undefined && (
                         <p className="text-xs text-gray-400 mt-0.5">Please wait...</p>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ActivityIndicator;