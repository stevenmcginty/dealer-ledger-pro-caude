import React, { useState } from 'react';
import { useData } from '../../hooks/useData';
import { auth } from '../../services/firebase';
import { ClipboardIcon, CheckCircleIcon } from '../icons';

const SessionInfoCard = () => {
    const { companyId, userId } = useData();
    const userEmail = auth.currentUser?.email;
    const [copied, setCopied] = useState<string | null>(null);

    const handleCopy = (text: string | null, field: string) => {
        if (!text) return;
        navigator.clipboard.writeText(text).then(() => {
            setCopied(field);
            setTimeout(() => setCopied(null), 2000);
        }).catch(err => {
            console.error('Failed to copy text: ', err);
        });
    };

    const InfoRow = ({ label, value, field }: { label: string; value: string | null | undefined; field: string }) => (
        <div className="flex items-center justify-between py-3">
            <div>
                <dt className="text-sm font-medium text-gray-400">{label}</dt>
                <dd className="mt-1 text-sm text-white font-mono break-all">{value || 'N/A'}</dd>
            </div>
            <button
                onClick={() => handleCopy(value || null, field)}
                className="p-2 ml-4 rounded-full text-gray-400 hover:bg-gray-700 hover:text-white transition-colors"
                title={`Copy ${label}`}
                disabled={!value}
            >
                {copied === field ? <CheckCircleIcon className="h-5 w-5 text-green-400" /> : <ClipboardIcon className="h-5 w-5" />}
            </button>
        </div>
    );

    return (
        <div className="bg-gray-800 p-6 rounded-lg shadow-lg">
            <h2 className="text-lg font-semibold text-white">Session Information</h2>
            <p className="text-sm text-gray-400 -mt-1 mb-2">Use these IDs to verify your Firebase security rules.</p>
            <dl className="divide-y divide-gray-700">
                <InfoRow label="User Email" value={userEmail} field="email" />
                <InfoRow label="User ID (uid)" value={userId} field="userId" />
                <InfoRow label="Company ID" value={companyId} field="companyId" />
            </dl>
        </div>
    );
};

export default SessionInfoCard;
