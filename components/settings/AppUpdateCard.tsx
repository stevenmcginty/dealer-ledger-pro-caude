import React from 'react';
import { useAppUpdate } from '../../contexts/AppUpdateContext';
import { updateButtonLabel } from '../../utils/appUpdate';
import { ArrowPathIcon, CheckCircleIcon } from '../icons';
import { Button } from '../ui';
import { Panel, PanelSection } from './SettingsKit';

const AppUpdateCard = () => {
    const { status, needRefresh, builtVersion, checkForUpdate, applyUpdate } = useAppUpdate();
    const busy = status === 'checking' || status === 'updating';
    const ready = status === 'ready' || needRefresh;
    const label = updateButtonLabel(ready && !busy ? 'ready' : status);

    return (
        <Panel ariaLabel="App update">
            <PanelSection
                title={ready ? 'A new version is ready' : 'Check for a new version'}
                description="Installs without clearing cookies or signing you out."
            >
                <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
                    <Button
                        onClick={() => (ready ? applyUpdate() : checkForUpdate())}
                        loading={busy}
                        variant={ready ? 'primary' : 'secondary'}
                        icon={<ArrowPathIcon />}
                        className="w-full sm:w-auto"
                    >
                        {label}
                    </Button>
                    {status === 'up-to-date' && (
                        <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-success" role="status">
                            <CheckCircleIcon className="h-5 w-5" />
                            You&apos;re on the latest version
                        </span>
                    )}
                </div>
            </PanelSection>
            <div className="flex items-baseline justify-between gap-3 px-4 py-3 sm:px-5">
                <span className="text-sm text-ink-3">Build</span>
                <span className="break-all text-end font-mono text-sm text-ink-2">{builtVersion}</span>
            </div>
        </Panel>
    );
};

export default AppUpdateCard;
