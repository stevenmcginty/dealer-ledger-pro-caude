import React from 'react';
import { useAppUpdate } from '../../contexts/AppUpdateContext';
import { ArrowPathIcon } from '../icons';
import Spinner from './Spinner';

/** Slim strip when a newer build is sitting on the server — same idea as Forge. */
const UpdateBanner = () => {
    const { status, needRefresh, applyUpdate } = useAppUpdate();
    const ready = status === 'ready' || needRefresh;
    if (!ready && status !== 'updating') return null;

    const updating = status === 'updating';

    return (
        <div
            role="status"
            className="flex items-center justify-between gap-3 px-4 py-2 bg-emerald-700 text-white text-sm flex-shrink-0"
        >
            <span className="flex items-center gap-2 min-w-0">
                <ArrowPathIcon className="h-4 w-4 flex-shrink-0" />
                <span className="truncate">
                    {updating ? 'Updating…' : 'Update available — tap to install the latest version'}
                </span>
            </span>
            <button
                type="button"
                onClick={() => applyUpdate()}
                disabled={updating}
                className="flex-shrink-0 inline-flex items-center gap-1.5 rounded-md bg-white/15 hover:bg-white/25 px-3 py-1 text-xs font-semibold disabled:opacity-60"
            >
                {updating ? <Spinner className="h-4 w-4" /> : null}
                {updating ? 'Updating…' : 'Update'}
            </button>
        </div>
    );
};

export default UpdateBanner;
