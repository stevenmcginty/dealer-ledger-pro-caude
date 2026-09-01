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
    if (!on) return 'text-[#8696a0] hover:text-white';
    if (id === 'email') return 'bg-sky-600 text-white shadow';
    if (id === 'whatsapp') return 'bg-[#25d366] text-[#111b21] shadow';
    return 'bg-[#005c4b] text-white shadow';
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
            <div className="flex gap-1 rounded-full bg-black/35 p-0.5" role="radiogroup" aria-label="Send via">
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
                            className={`flex h-9 min-h-[36px] flex-1 items-center justify-center gap-1 rounded-full text-[12px] font-semibold transition-colors disabled:opacity-35 ${optionClass(opt.id, on)}`}
                        >
                            {opt.id === 'email' && <EnvelopeIcon className="h-3.5 w-3.5" aria-hidden />}
                            {opt.id === 'whatsapp' && <WhatsAppIcon className="h-3.5 w-3.5" aria-hidden />}
                            {opt.label}
                        </button>
                    );
                })}
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
                            className="h-9 min-w-0 flex-1 rounded-full bg-black/35 px-3 text-[13px] text-white placeholder-[#8696a0] focus:outline-none focus:ring-2 focus:ring-[#25d366]/40"
                        />
                        <button
                            type="button"
                            onClick={() => void savePhone()}
                            disabled={saving || draftPhone.replace(/\D/g, '').length < 10}
                            className="h-9 rounded-full bg-[#25d366] px-3 text-[12px] font-semibold text-[#111b21] disabled:opacity-40"
                        >
                            {saving ? <Spinner className="h-3.5 w-3.5" /> : 'Save'}
                        </button>
                        <button
                            type="button"
                            onClick={() => { setAdding(false); setDraftPhone(''); }}
                            className="text-[12px] text-[#8696a0] hover:text-white"
                        >
                            Cancel
                        </button>
                    </div>
                ) : (
                    <button
                        type="button"
                        onClick={() => setAdding(true)}
                        className="flex items-center gap-1.5 px-1 py-1 text-[12px] font-medium text-[#25d366] hover:underline"
                    >
                        <PhoneIcon className="h-3.5 w-3.5" />
                        Add a mobile to send WhatsApp
                    </button>
                )
            )}

            {canWhatsApp && (value === 'whatsapp' || value === 'both') && needsOpener && (
                <p className="px-1 text-[11px] leading-snug text-[#8696a0]">
                    WhatsApp: they get the short opener now. Your full reply follows when they answer.
                </p>
            )}
        </div>
    );
};

export default SendViaBar;
