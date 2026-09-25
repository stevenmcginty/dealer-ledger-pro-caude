/**
 * Where this reply should go: email, WhatsApp, or both.
 *
 * Email leads often have a mobile and no WhatsApp history yet. The old
 * "Also send on WhatsApp" tick sat under Me-mode only and was easy to miss;
 * Dave's Send ignored it. This bar sits on the draft and on the composer.
 */

import React, { useState } from 'react';
import Spinner from '../common/Spinner';
import { EnvelopeIcon, PhoneIcon, WhatsAppIcon } from '../icons';

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

const optionClass = (id: SendViaChoice, on: boolean): string => {
    if (!on) return 'text-gray-400 hover:text-gray-100';
    if (id === 'email') return 'bg-sky-500/15 text-sky-200 ring-1 ring-inset ring-sky-400/40';
    if (id === 'whatsapp') return 'bg-emerald-500/15 text-emerald-200 ring-1 ring-inset ring-emerald-400/40';
    return 'bg-teal-500/15 text-teal-100 ring-1 ring-inset ring-teal-400/40';
};

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
        <div className="space-y-1.5">
            <div className="flex items-center gap-2">
                <span className="hidden flex-shrink-0 pl-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-400 sm:inline" aria-hidden>Send via</span>
                <div className="flex min-w-0 flex-1 gap-1 rounded-xl bg-black/30 p-0.5 ring-1 ring-inset ring-white/[0.05] sm:p-1" role="radiogroup" aria-label="Send via">
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
                                className={`flex h-11 flex-1 items-center justify-center gap-1.5 rounded-lg text-[12.5px] font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 disabled:opacity-35 sm:h-8 ${optionClass(opt.id, on)}`}
                            >
                                {opt.id === 'email' && <EnvelopeIcon className="h-3.5 w-3.5" aria-hidden />}
                                {opt.id === 'whatsapp' && <WhatsAppIcon className="h-3.5 w-3.5" aria-hidden />}
                                {opt.label}
                            </button>
                        );
                    })}
                </div>
            </div>

            {!canWhatsApp && onAddPhone && (
                adding ? (
                    <div className="flex items-center gap-2">
                        <input
                            value={draftPhone}
                            onChange={e => setDraftPhone(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void savePhone(); } }}
                            placeholder="07…"
                            inputMode="tel"
                            autoComplete="tel"
                            aria-label="Mobile number for WhatsApp"
                            className="h-11 min-w-0 flex-1 rounded-xl bg-black/30 px-3 text-[16px] text-white placeholder-gray-500 ring-1 ring-inset ring-white/[0.06] focus:outline-none focus:ring-2 focus:ring-emerald-400/40 sm:h-9 sm:text-[13px]"
                        />
                        <button
                            type="button"
                            onClick={() => void savePhone()}
                            disabled={saving || draftPhone.replace(/\D/g, '').length < 10}
                            className="h-11 rounded-xl bg-emerald-500 px-3.5 text-[13px] font-semibold text-gray-950 hover:bg-emerald-400 disabled:opacity-40 sm:h-9"
                        >
                            {saving ? <Spinner className="h-3.5 w-3.5" /> : 'Save'}
                        </button>
                        <button
                            type="button"
                            onClick={() => { setAdding(false); setDraftPhone(''); }}
                            className="h-11 px-2 text-[12.5px] text-gray-400 hover:text-white sm:h-9"
                        >
                            Cancel
                        </button>
                    </div>
                ) : (
                    <button
                        type="button"
                        onClick={() => setAdding(true)}
                        className="flex min-h-[36px] items-center gap-1.5 px-1 text-[12.5px] font-medium text-emerald-300 hover:underline"
                    >
                        <PhoneIcon className="h-3.5 w-3.5" />
                        Add a mobile to send WhatsApp
                    </button>
                )
            )}

            {canWhatsApp && (value === 'whatsapp' || value === 'both') && needsOpener && (
                <p className="px-1 text-[11.5px] leading-snug text-gray-400">
                    WhatsApp: they get the short opener now. Your full reply follows when they answer.
                </p>
            )}
        </div>
    );
};

export default SendViaBar;
