import React from 'react';
import { useAppUpdate } from '../../contexts/AppUpdateContext';
import { updateButtonLabel } from '../../utils/appUpdate';
import { ArrowPathIcon } from '../icons';
import Spinner from './Spinner';

type AppUpdateButtonProps = {
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
                className={`relative inline-flex items-center gap-1.5 rounded-full transition-colors disabled:opacity-50 ${
                    ready
                        ? 'bg-emerald-600 text-white hover:bg-emerald-500 px-2.5 py-2'
                        : 'p-2 text-gray-300 hover:bg-gray-700 hover:text-white'
                }`}
            >
                {busy ? <Spinner className="h-5 w-5" /> : <ArrowPathIcon className="h-5 w-5" />}
                {ready && !busy && <span className="hidden md:inline text-xs font-semibold pr-1">Update</span>}
                {ready && !busy && (
                    <span className="absolute top-0.5 right-0.5 h-2 w-2 rounded-full bg-emerald-300 ring-2 ring-gray-900" />
                )}
            </button>
        );
    }

    const className =
        variant === 'menu'
            ? `w-full flex items-center p-3 text-sm font-medium rounded-xl transition-all ${
                  ready ? 'bg-emerald-600/80 text-white' : 'text-gray-300 hover:bg-white/10'
              }`
            : `flex items-center w-full p-2 text-base font-normal rounded-lg transition-all duration-200 group ${
                  ready ? 'bg-emerald-600 text-white shadow-lg' : 'text-gray-300 hover:bg-gray-700 hover:text-white'
              }`;

    return (
        <button type="button" onClick={onClick} disabled={busy} className={className} aria-label={label}>
            {busy
                ? <Spinner className="h-5 w-5" />
                : <ArrowPathIcon className={variant === 'menu' ? 'h-5 w-5' : 'w-6 h-6'} />}
            <span className="ml-3 flex-1 whitespace-nowrap text-left">{label}</span>
        </button>
    );
};

export default AppUpdateButton;
