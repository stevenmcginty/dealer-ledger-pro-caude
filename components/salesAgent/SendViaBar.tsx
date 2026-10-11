/**
 * Where this reply should go: email, WhatsApp, or both.
 *
 * Email leads often have a mobile and no WhatsApp history yet. The old
 * "Also send on WhatsApp" tick sat under Me-mode only and was easy to miss;
 * Dave's Send ignored it. This bar sits on the draft and on the composer.
 */

import React, { useState } from 'react';
import { EnvelopeIcon, PhoneIcon } from '../icons';
import { Button } from '../ui';
import { controlFrame, controlInput } from '../ui/cx';
import { WhatsAppMark } from './inbox/parts';

export type SendViaChoice = 'email' | 'whatsapp' | 'both';

export const sendViaLabel = (via: SendViaChoice): string => (
    via === 'both' ? 'Send by email and WhatsApp'
        : via === 'email' ? 'Send by email'
            : 'Send on WhatsApp'
);

const OPTIONS: Array<{ id: SendViaChoice; label: string }> = [
    { id: 'email', label: 'Email' },
    { id: 'whatsapp', label: 'WhatsApp' },
    { id: 'both', label: 'Both' },
];

const SendViaBar: React.FC<{
    value: SendViaChoice;
    onChange: (via: SendViaChoice) => void;
    emailOk: boolean;
    phone?: string;
    needsOpener?: boolean;
    disabled?: boolean;
    onAddPhone?: (phone: string) => void | Promise<void>;
}> = ({ value, onChange, emailOk, phone, needsOpener, disabled, onAddPhone }) => {
    const [adding, setAdding] = useState(false);
    const [draftPhone, setDraftPhone] = useState('');
    const [saving, setSaving] = useState(false);

    const canWhatsApp = !!phone;
    const canEmail = emailOk;
    const canBoth = canWhatsApp && canEmail;
    if (!canWhatsApp && !canEmail && !onAddPhone) return null;

    const enabledFor = (id: SendViaChoice): boolean => (
        id === 'email' ? canEmail : id === 'whatsapp' ? canWhatsApp : canBoth
    );

    const savePhone = async () => {
        const raw = draftPhone.trim();
        if (raw.replace(/\D/g, '').length < 10 || !onAddPhone || saving) return;
        setSaving(true);
        try {
            await onAddPhone(raw);
            setAdding(false);
            setDraftPhone('');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="space-y-2">
            <div className="flex items-center gap-3">
                <span className="hidden flex-shrink-0 font-mono text-xs font-semibold uppercase tracking-[0.08em] text-ink-3 sm:inline" aria-hidden>Send via</span>
                <div
                    className="flex min-w-0 flex-1 gap-[3px] rounded-control border border-line bg-surface-2 p-[3px]"
                    role="radiogroup"
                    aria-label="Send via"
                >
                    {OPTIONS.map(opt => {
                        const on = value === opt.id;
                        const ok = enabledFor(opt.id);
                        return (
                            <button
                                key={opt.id}
                                type="button"
                                role="radio"
                                aria-checked={on}
                                disabled={disabled || !ok}
                                onClick={() => ok && onChange(opt.id)}
                                className={`flex min-h-[48px] flex-1 items-center justify-center gap-1.5 rounded-[6px] text-sm font-semibold transition-colors duration-quick ease-out disabled:cursor-not-allowed disabled:text-ink-3 [@media(pointer:fine)]:min-h-[34px] ${
                                    on ? 'bg-surface text-ink shadow-e1 ring-1 ring-line' : 'text-ink-2 hover:text-ink'
                                }`}
                            >
                                {(opt.id === 'email' || opt.id === 'both') && <EnvelopeIcon className="h-4 w-4" />}
                                {(opt.id === 'whatsapp' || opt.id === 'both') && <WhatsAppMark brand={on && ok} className="h-4 w-4" />}
                                {opt.label}
                            </button>
                        );
                    })}
                </div>
            </div>

            {!canWhatsApp && onAddPhone && (
                adding ? (
                    <div className="flex items-center gap-2">
                        <div className={`${controlFrame()} min-w-0 flex-1`}>
                            <input
                                value={draftPhone}
                                onChange={e => setDraftPhone(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void savePhone(); } }}
                                placeholder="07…"
                                inputMode="tel"
                                autoComplete="tel"
                                aria-label="Mobile number for WhatsApp"
                                className={`${controlInput} num`}
                            />
                        </div>
                        <Button
                            type="button"
                            size="md"
                            onClick={() => void savePhone()}
                            loading={saving}
                            disabled={saving || draftPhone.replace(/\D/g, '').length < 10}
                        >
                            Save
                        </Button>
                        <Button
                            type="button"
                            size="md"
                            variant="ghost"
                            onClick={() => { setAdding(false); setDraftPhone(''); }}
                        >
                            Cancel
                        </Button>
                    </div>
                ) : (
                    <button
                        type="button"
                        onClick={() => setAdding(true)}
                        className="flex min-h-[44px] items-center gap-2 px-1 text-sm font-semibold text-accent-text hover:underline hover:underline-offset-2"
                    >
                        <PhoneIcon className="h-4 w-4" />
                        Add a mobile to send WhatsApp
                    </button>
                )
            )}

            {canWhatsApp && (value === 'whatsapp' || value === 'both') && needsOpener && (
                <p className="px-1 text-xs leading-4 text-ink-2">
                    WhatsApp: they get the short opener now. Your full reply follows when they answer.
                </p>
            )}
        </div>
    );
};

export default SendViaBar;
