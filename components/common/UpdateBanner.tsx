import React from 'react';
import { useAppUpdate } from '../../contexts/AppUpdateContext';
import { ArrowPathIcon } from '../icons';
import Spinner from './Spinner';

/**
 * Slim strip at the top of the content when a newer build is on the server.
 * App updates live here now, not as a header button.
 */
const UpdateBanner = () => {
    const { status, needRefresh, applyUpdate } = useAppUpdate();
    const ready = status === 'ready' || needRefresh;
    if (!ready && status !== 'updating') return null;

    const updating = status === 'updating';

    return (
        <div
            role="status"
            className="flex flex-none items-center justify-between gap-3 border-b border-line bg-accent-soft py-1.5 pe-2 ps-4 text-sm text-accent-soft-ink print:hidden"
        >
            <span className="flex min-w-0 items-center gap-2">
                <ArrowPathIcon className="h-5 w-5 flex-none" />
                <span className="truncate font-semibold">
                    {updating ? 'Updating…' : 'A new version is ready'}
                </span>
            </span>
            <button
                type="button"
                onClick={() => applyUpdate()}
                disabled={updating}
                aria-busy={updating || undefined}
                className="inline-flex min-h-[44px] flex-none items-center gap-1.5 rounded-control bg-accent px-4 text-sm font-semibold text-on-accent transition-colors duration-quick ease-out hover:bg-accent-hover active:bg-accent-press disabled:opacity-60"
            >
                {updating ? <Spinner className="h-4 w-4" /> : null}
                {updating ? 'Updating…' : 'Update now'}
            </button>
        </div>
    );
};

export default UpdateBanner;
