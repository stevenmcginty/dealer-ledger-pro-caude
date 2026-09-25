/**
 * Small shared pieces of the Agent Inbox: avatar, channel mark, the inline
 * compose error and a menu row. Presentation only.
 *
 * Colour roles across the inbox (kept on the app's gray scale):
 *   amber   = needs Steve / Dave's pending work (the one loud accent)
 *   emerald = WhatsApp, sky = email (small marks and the send button only)
 */

import React, { useState } from 'react';
import { EnvelopeIcon, ExclamationTriangleIcon, PhoneIcon, WhatsAppIcon, XMarkIcon } from '../../icons';
import type { Channel } from '../../../services/salesAgentService';

/** A failure shown above the composer: plain English up front, the technical bit behind a toggle. */
export type InlineError = { message: string; detail?: string };

export const describeError = (err: any, fallback: string): InlineError => {
    const code = typeof err?.code === 'string' ? err.code : '';
    const detail = [code, typeof err?.details === 'string' ? err.details : err?.details ? JSON.stringify(err.details) : '']
        .filter(Boolean)
        .join(' · ');
    if (code === 'storage/unauthorized') {
        return {
            message: 'Firebase would not store that file. Photos, MP4 videos and PDFs are allowed — if this keeps happening the storage rules need deploying.',
            detail: detail || undefined,
        };
    }
    return { message: (typeof err?.message === 'string' && err.message.trim()) || fallback, detail: detail || undefined };
};

export const ComposeError: React.FC<{ error: InlineError; onDismiss: () => void }> = ({ error, onDismiss }) => {
    const [open, setOpen] = useState(false);
    return (
        <div role="alert" className="rounded-xl border border-red-400/25 bg-red-950/40 px-3 py-2 text-[13px] leading-snug text-red-100">
            <div className="flex items-start gap-2">
                <ExclamationTriangleIcon className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-300" />
                <p className="min-w-0 flex-1">{error.message}</p>
                <button
                    type="button"
                    onClick={onDismiss}
                    aria-label="Dismiss"
                    className="-my-2 -mr-2 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-red-200/70 hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-red-300/60"
                >
                    <XMarkIcon className="h-3.5 w-3.5" />
                </button>
            </div>
            {error.detail && (
                <div className="mt-1 pl-6">
                    <button type="button" onClick={() => setOpen(o => !o)} className="text-[11px] font-medium text-red-200/70 hover:text-white">
                        {open ? 'Hide details' : 'Details'}
                    </button>
                    {open && <p className="mt-1 break-all font-mono text-[11px] text-red-100/70">{error.detail}</p>}
                </div>
            )}
        </div>
    );
};

export const MenuItem: React.FC<{ onClick: () => void; disabled?: boolean; danger?: boolean; children: React.ReactNode }> = ({ onClick, disabled, danger, children }) => (
    <button
        type="button"
        role="menuitem"
        onClick={onClick}
        disabled={disabled}
        className={`flex min-h-[44px] w-full items-center gap-2.5 px-4 text-left text-sm focus:outline-none focus-visible:bg-white/[0.06] disabled:opacity-40 ${
            danger ? 'text-red-300 hover:bg-red-500/10' : 'text-gray-100 hover:bg-white/[0.06]'
        }`}
    >
        {children}
    </button>
);

export const initials = (name: string): string => {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return name.slice(0, 2).toUpperCase() || '?';
};

/** Quiet, per-person tone so neighbouring rows are easy to tell apart. */
const TONES = [
    'bg-slate-700 text-slate-100',
    'bg-stone-700 text-stone-100',
    'bg-zinc-700 text-zinc-100',
    'bg-neutral-700 text-neutral-100',
    'bg-gray-700 text-gray-100',
];

const toneOf = (name: string): string =>
    TONES[name.split('').reduce((n, c) => n + c.charCodeAt(0), 0) % TONES.length];

export const channelTextClass = (channel: Channel): string =>
    channel === 'whatsapp' ? 'text-emerald-400' : channel === 'email' ? 'text-sky-400' : 'text-violet-300';

export const ChannelIcon: React.FC<{ channel: Channel; className?: string }> = ({ channel, className = 'h-3.5 w-3.5' }) => (
    channel === 'whatsapp' ? <WhatsAppIcon className={className} />
        : channel === 'email' ? <EnvelopeIcon className={className} />
            : <PhoneIcon className={className} />
);

export const channelName = (channel: Channel): string =>
    channel === 'whatsapp' ? 'WhatsApp' : channel === 'email' ? 'Email' : 'SMS';

/** Initials disc with a small mark for the channel they last used. */
export const Avatar: React.FC<{ name: string; channel?: Channel; size?: 'md' | 'lg' }> = ({ name, channel, size = 'md' }) => {
    const box = size === 'lg' ? 'h-11 w-11 text-[14px]' : 'h-10 w-10 text-[13px]';
    return (
        <span className={`relative inline-flex flex-shrink-0 items-center justify-center rounded-full font-semibold tracking-wide ${box} ${toneOf(name)}`} aria-hidden>
            {initials(name)}
            {channel && (
                <span className={`absolute -bottom-0.5 -right-0.5 flex h-[18px] w-[18px] items-center justify-center rounded-full bg-gray-900 ring-2 ring-gray-900 ${channelTextClass(channel)}`}>
                    <ChannelIcon channel={channel} className="h-3 w-3" />
                </span>
            )}
        </span>
    );
};

/** "Today", "Yesterday", "Mon", "22 Sep", "22 Sep 2025" — for day breaks in a thread. */
export const dayLabel = (at: number, now: number = Date.now()): string => {
    const day = new Date(at);
    const today = new Date(now);
    const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const diff = Math.round((startOf(today) - startOf(day)) / (24 * 3600_000));
    if (diff <= 0) return 'Today';
    if (diff === 1) return 'Yesterday';
    if (diff < 7) return day.toLocaleDateString('en-GB', { weekday: 'long' });
    return day.toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        ...(day.getFullYear() !== today.getFullYear() ? { year: 'numeric' } : {}),
    });
};
