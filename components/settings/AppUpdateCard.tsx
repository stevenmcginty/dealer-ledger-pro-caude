import React from 'react';
import { useAppUpdate } from '../../contexts/AppUpdateContext';
import { updateButtonLabel } from '../../utils/appUpdate';
import { ArrowPathIcon, CheckCircleIcon } from '../icons';
import Spinner from '../common/Spinner';

const AppUpdateCard = () => {
    const { status, needRefresh, builtVersion, checkForUpdate, applyUpdate } = useAppUpdate();
    const busy = status === 'checking' || status === 'updating';
    const ready = status === 'ready' || needRefresh;
    const label = updateButtonLabel(ready && !busy ? 'ready' : status);

    return (
        <div className="bg-gray-800 p-6 rounded-lg shadow-lg">
            <h2 className="text-lg font-semibold text-white">App updates</h2>
            <p className="text-sm text-gray-400 mt-1">
                Check for a new version and install it without clearing cookies or signing out.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
                <button
                    type="button"
                    onClick={() => (ready ? applyUpdate() : checkForUpdate())}
                    disabled={busy}
                    className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md disabled:opacity-50 ${
                        ready
                            ? 'text-white bg-emerald-600 hover:bg-emerald-500'
                            : 'text-white bg-brand-600 hover:bg-brand-700'
                    }`}
                >
                    {busy ? <Spinner className="h-5 w-5" /> : <ArrowPathIcon className="h-5 w-5" />}
                    {label}
                </button>
                {status === 'up-to-date' && (
                    <span className="inline-flex items-center gap-1.5 text-sm text-emerald-400">
                        <CheckCircleIcon className="h-5 w-5" />
                        You&apos;re on the latest version
                    </span>
                )}
            </div>
            <p className="mt-3 text-xs text-gray-500 font-mono break-all">Build {builtVersion}</p>
        </div>
    );
};

export default AppUpdateCard;
