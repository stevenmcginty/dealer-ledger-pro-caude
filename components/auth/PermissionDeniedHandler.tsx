import React, { useState } from 'react';
import { signOut, auth } from '../../services/firebase';
import { ExclamationTriangleIcon, ClipboardIcon, CheckCircleIcon } from '../icons';
import { Button } from '../ui';

const PermissionDeniedHandler = () => {
    const user = auth.currentUser;
    const [copied, setCopied] = useState(false);

    const handleCopy = () => {
        if (!user?.uid) return;
        navigator.clipboard.writeText(user.uid).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    };

    return (
        <main className="flex min-h-[100dvh] items-center justify-center bg-bg px-4 py-10 text-ink">
            <div className="w-full max-w-lg rounded-card border border-line bg-surface p-5 sm:p-6">
                <span className="grid h-12 w-12 place-items-center rounded-full bg-warning-soft text-warning-ink" aria-hidden="true">
                    <ExclamationTriangleIcon className="h-6 w-6" />
                </span>
                <h1 className="mt-4 text-[1.375rem] font-bold leading-7 tracking-[-0.01em] text-ink">Your account isn’t linked yet</h1>
                <p className="mt-2 text-base leading-6 text-ink-2">
                    <span className="font-semibold text-ink [overflow-wrap:anywhere]">{user?.email || '…'}</span> is set up, but it isn’t linked to a business yet.
                </p>
                <p className="mt-3 text-base leading-6 text-ink-2">
                    Copy your user ID below and send it to whoever runs your ledger. They link it, then you can sign in.
                </p>

                <div className="mt-6 flex flex-col gap-1.5">
                    <label htmlFor="user-id" className="text-sm font-semibold leading-5 text-ink">Your user ID</label>
                    <div className="flex gap-2">
                        <input
                            id="user-id"
                            type="text"
                            readOnly
                            value={user?.uid || 'Loading…'}
                            className="min-h-[48px] w-full min-w-0 flex-1 rounded-control border border-line bg-surface-2 px-3.5 font-mono text-base text-ink-2"
                        />
                        <Button
                            type="button"
                            variant="secondary"
                            onClick={handleCopy}
                            icon={copied ? <CheckCircleIcon className="text-success" /> : <ClipboardIcon />}
                            aria-live="polite"
                        >
                            {copied ? 'Copied' : 'Copy'}
                        </Button>
                    </div>
                </div>

                <Button type="button" variant="secondary" block onClick={() => signOut()} className="mt-8">
                    Sign out
                </Button>
            </div>
        </main>
    );
};

export default PermissionDeniedHandler;
