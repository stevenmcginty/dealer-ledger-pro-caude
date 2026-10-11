import React from 'react';
import { useAppUpdate } from '../../contexts/AppUpdateContext';
import { updateButtonLabel } from '../../utils/appUpdate';
import { ArrowPathIcon } from '../icons';
import Spinner from './Spinner';

type AppUpdateButtonProps = {
    /**
     * header: a 48 px icon button. nav: a sidebar item. menu: a row in the More list.
     * A new build also shows the UpdateBanner, so this is mostly "check now".
     */
    variant?: 'header' | 'nav' | 'menu';
};

const AppUpdateButton = ({ variant = 'header' }: AppUpdateButtonProps) => {
    const { status, needRefresh, checkForUpdate, applyUpdate } = useAppUpdate();
    const busy = status === 'checking' || status === 'updating';
    const ready = status === 'ready' || needRefresh;
    const label = updateButtonLabel(ready && status !== 'updating' && status !== 'checking' ? 'ready' : status);

    const onClick = () => {
        if (busy) return;
        if (ready) applyUpdate();
        else checkForUpdate();
    };

    if (variant === 'header') {
        return (
            <button
                type="button"
                onClick={onClick}
                disabled={busy}
                title={label}
                aria-label={label}
                className={`relative grid h-12 w-12 place-items-center rounded-control transition-colors duration-quick ease-out disabled:opacity-50 ${
                    ready ? 'bg-accent text-on-accent hover:bg-accent-hover' : 'text-ink-2 hover:bg-surface-2 hover:text-ink'
                }`}
            >
                {busy ? <Spinner className="h-5 w-5" /> : <ArrowPathIcon className="h-6 w-6" />}
            </button>
        );
    }

    if (variant === 'menu') {
        return (
            <button
                type="button"
                onClick={onClick}
                disabled={busy}
                aria-busy={busy || undefined}
                className={`flex min-h-[56px] w-full items-center gap-3 border-b border-line px-4 text-start transition-colors duration-quick ease-out focus-visible:outline-offset-[-3px] ${
                    ready ? 'bg-accent-soft text-accent-soft-ink' : 'text-ink hover:bg-surface-2 active:bg-surface-3'
                }`}
            >
                {busy
                    ? <Spinner className="h-6 w-6 flex-none" />
                    : <ArrowPathIcon className={`h-6 w-6 flex-none ${ready ? '' : 'text-ink-2'}`} />}
                <span className="min-w-0 flex-1 truncate text-base font-semibold">{label}</span>
            </button>
        );
    }

    return (
        <button
            type="button"
            onClick={onClick}
            disabled={busy}
            aria-busy={busy || undefined}
            className={`flex min-h-[40px] w-full items-center gap-3 rounded-control px-2.5 text-start text-sm font-semibold transition-colors duration-quick ease-out focus-visible:outline-offset-[-1px] ${
                ready ? 'bg-accent-soft text-accent-soft-ink' : 'text-ink-2 hover:bg-surface-2 hover:text-ink active:bg-surface-3'
            }`}
        >
            {busy ? <Spinner className="h-5 w-5 flex-none" /> : <ArrowPathIcon className="h-5 w-5 flex-none" />}
            <span className="min-w-0 flex-1 truncate">{label}</span>
        </button>
    );
};

export default AppUpdateButton;
