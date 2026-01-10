
import React, { useState, useEffect } from 'react';
import { useData } from '../../hooks/useData';
import Spinner from '../common/Spinner';
import { CalendarIcon, ExclamationTriangleIcon, CheckCircleIcon } from '../icons';

const IntegrationsPage = () => {
    const { 
        googleUser, 
        handleGoogleSignIn, 
        handleGoogleSignOut,
        refreshGoogleCalendarEvents,
        googleSyncError,
        googleConnectionMessage,
    } = useData();

    const [isConnecting, setIsConnecting] = useState(false);
    const [isRefreshing, setIsRefreshing] = useState(false);

    const onConnectClick = () => {
        setIsConnecting(true);
        handleGoogleSignIn();
        // The connection state will be updated by the DataContext callback
        setTimeout(() => setIsConnecting(false), 10000); // Failsafe timeout
    };

    const onRefreshClick = async () => {
        setIsRefreshing(true);
        await refreshGoogleCalendarEvents();
        setIsRefreshing(false);
    };

    return (
        <div className="space-y-8 max-w-3xl mx-auto">
            <div className="bg-gray-800 p-6 rounded-lg shadow-lg">
                <h2 className="text-lg font-semibold text-white">Google Calendar Integration</h2>
                <p className="text-sm text-gray-400 mt-1">Connect your Google account to use Google Calendar as the source for your general tasks and reminders.</p>
                
                <div className="mt-6 pt-6 border-t border-gray-700">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between">
                        <div className="flex items-center gap-4">
                             <div className="flex-shrink-0 h-12 w-12 flex items-center justify-center rounded-lg bg-gray-700">
                                <CalendarIcon className="h-7 w-7 text-green-400"/>
                             </div>
                             <div>
                                <h3 className="text-base font-semibold text-white">Google Calendar</h3>
                                <p className="text-sm text-gray-400">Your single source for general tasks.</p>
                             </div>
                        </div>
                        <div className="mt-4 sm:mt-0 flex-shrink-0 w-full sm:w-auto">
                           {googleUser ? (
                                <div className="text-right">
                                    <div className="flex items-center justify-end gap-3 bg-gray-700/50 p-3 rounded-lg">
                                        <img src={googleUser.picture} alt="profile" className="h-10 w-10 rounded-full" />
                                        <div className="text-sm text-left">
                                            <p className="text-white font-medium">{googleUser.name}</p>
                                            <p className="text-gray-400">{googleUser.email}</p>
                                        </div>
                                        <div className="flex items-center gap-2 pl-2 border-l border-gray-600">
                                            <span className="relative flex h-3 w-3">
                                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                                                <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
                                            </span>
                                            <span className="font-semibold text-green-400 text-sm">Connected</span>
                                        </div>
                                    </div>
                                    <div className="mt-3 flex justify-end items-center gap-3">
                                        <button onClick={handleGoogleSignOut} className="px-3 py-2 text-sm font-medium text-gray-300 bg-red-800/80 hover:bg-red-700 rounded-md">Disconnect</button>
                                    </div>
                                </div>
                            ) : (
                                <button 
                                    onClick={onConnectClick} 
                                    disabled={isConnecting}
                                    className="w-full sm:w-auto inline-flex justify-center items-center px-4 py-2 text-sm font-medium text-white bg-brand-600 hover:bg-brand-500 rounded-md disabled:opacity-60"
                                >
                                    {isConnecting ? <Spinner className="mr-2"/> : null}
                                    {isConnecting ? 'Connecting...' : 'Connect to Google'}
                                </button>
                            )}
                        </div>
                    </div>
                    {googleConnectionMessage && !googleSyncError && !googleUser &&(
                        <div className="mt-4 p-3 rounded-lg flex items-center gap-3 bg-green-900/50 border border-green-700">
                            <CheckCircleIcon className="h-5 w-5 text-green-400 flex-shrink-0" />
                            <p className="text-sm text-green-200">{googleConnectionMessage}</p>
                        </div>
                    )}
                    {googleSyncError && (
                        <div className="mt-4 p-3 rounded-lg flex items-center gap-3 bg-red-900/50 border border-red-700">
                            <ExclamationTriangleIcon className="h-5 w-5 text-red-400 flex-shrink-0" />
                            <p className="text-sm text-red-300">{googleSyncError}</p>
                        </div>
                    )}

                    {googleUser && (
                        <div className="mt-6 pt-6 border-t border-gray-700 text-center">
                            <button
                                onClick={onRefreshClick}
                                disabled={isRefreshing}
                                className="w-full max-w-xs inline-flex items-center justify-center gap-x-2 rounded-md bg-brand-600 px-4 py-3 text-base font-semibold text-white shadow-sm hover:bg-brand-500 disabled:opacity-50"
                            >
                                {isRefreshing ? <Spinner /> : 'Refresh Calendar'}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default IntegrationsPage;
