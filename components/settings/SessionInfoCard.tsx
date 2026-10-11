import React, { useState } from 'react';
import { useData } from '../../hooks/useData';
import { auth } from '../../services/firebase';
import { IconButton, useToast } from '../ui';
import { ClipboardIcon, CheckCircleIcon } from '../icons';
import { Panel, PanelSection } from './SettingsKit';

const SessionInfoCard = () => {
    const { companyId, userId } = useData();
    const toast = useToast();
    const userEmail = auth.currentUser?.email;
    const [copied, setCopied] = useState<string | null>(null);

    const handleCopy = (text: string | null, field: string) => {
        if (!text) return;
        navigator.clipboard.writeText(text).then(() => {
            setCopied(field);
            setTimeout(() => setCopied(null), 2000);
        }).catch(err => {
            console.error('Failed to copy text: ', err);
            toast.error("Couldn't copy to the clipboard.");
        });
    };

    const rows: { label: string; value: string | null | undefined; field: string }[] = [
        { label: 'Email', value: userEmail, field: 'email' },
        { label: 'User ID (uid)', value: userId, field: 'userId' },
        { label: 'Company ID', value: companyId, field: 'companyId' },
    ];

    return (
        <Panel ariaLabel="Session">
            <PanelSection title="Signed in as" description="Use these IDs to check the Firebase security rules." />
            <dl className="m-0 divide-y divide-line">
                {rows.map(({ label, value, field }) => (
                    <div key={field} className="flex items-center gap-3 py-2 pe-2 ps-4 sm:ps-5">
                        <div className="min-w-0 flex-1">
                            <dt className="text-sm font-semibold text-ink-3">{label}</dt>
                            <dd className="m-0 mt-0.5 break-all font-mono text-sm text-ink">{value || 'Not set'}</dd>
                        </div>
                        <IconButton
                            label={copied === field ? `${label} copied` : `Copy ${label}`}
                            icon={copied === field ? <CheckCircleIcon className="text-success" /> : <ClipboardIcon />}
                            onClick={() => handleCopy(value || null, field)}
                            disabled={!value}
                        />
                    </div>
                ))}
            </dl>
        </Panel>
    );
};

export default SessionInfoCard;
