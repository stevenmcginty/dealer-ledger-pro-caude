/**
 * Small shared pieces of the Agent Inbox: avatar, channel marks, the inline
 * compose error and a menu row. Presentation only.
 *
 * Colour roles across the inbox (Forecourt Ledger tokens):
 *   accent  = the one main action on screen (Send) and Dave's pending draft
 *   warning = a person is waiting on Steve (needs-you marks only)
 *   danger  = escalations, bounces, failures
 *   WhatsApp green lives only inside the WhatsApp logo glyph (WhatsAppMark).
 */

import React, { useState } from 'react';
import { EnvelopeIcon, ExclamationTriangleIcon, PhoneIcon, XMarkIcon } from '../../icons';
import { Avatar as UiAvatar } from '../../ui';
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
        <div role="alert" className="rounded-control border border-danger bg-danger-soft py-2 pe-1 ps-3 text-sm leading-snug text-danger-ink">
            <div className="flex items-start gap-2">
                <ExclamationTriangleIcon className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <p className="min-w-0 flex-1 pt-px">{error.message}</p>
                <button
                    type="button"
                    onClick={onDismiss}
                    aria-label="Dismiss"
                    className="-my-1.5 grid h-10 w-10 flex-shrink-0 place-items-center rounded-control text-danger-ink transition-colors duration-quick ease-out hover:bg-surface"
                >
                    <XMarkIcon className="h-4 w-4" />
                </button>
            </div>
            {error.detail && (
                <div className="ps-6">
                    <button
                        type="button"
                        onClick={() => setOpen(o => !o)}
                        aria-expanded={open}
                        className="min-h-[36px] text-xs font-semibold underline underline-offset-2"
                    >
                        {open ? 'Hide details' : 'Details'}
                    </button>
                    {open && <p className="mb-1 break-all font-mono text-xs">{error.detail}</p>}
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
        className={`flex min-h-[48px] w-full items-center gap-3 px-4 text-start text-base transition-colors duration-quick ease-out focus-visible:bg-surface-2 focus-visible:[outline-offset:-3px] disabled:cursor-not-allowed disabled:text-ink-3 lg:min-h-[40px] lg:text-sm [&_svg]:h-5 [&_svg]:w-5 [&_svg]:flex-shrink-0 ${
            danger ? 'text-danger hover:bg-danger-soft' : 'text-ink hover:bg-surface-2 active:bg-surface-3'
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

/** WhatsApp's own logo. `brand` paints it WhatsApp green — the only place that green appears. */
export const WhatsAppMark: React.FC<{ className?: string; brand?: boolean }> = ({ className = 'h-4 w-4', brand = false }) => (
    <svg viewBox="0 0 24 24" className={className} fill={brand ? '#25d366' : 'currentColor'} aria-hidden="true" focusable="false">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
);

/** Kept for callers that colour by channel; every channel now reads in ink. */
export const channelTextClass = (_channel: Channel): string => 'text-ink-2';

/** Monochrome channel glyph; pass `brand` to show WhatsApp in its own green. */
export const ChannelIcon: React.FC<{ channel: Channel; className?: string; brand?: boolean }> = ({ channel, className = 'h-4 w-4', brand = false }) => (
    channel === 'whatsapp' ? <WhatsAppMark className={className} brand={brand} />
        : channel === 'email' ? <EnvelopeIcon className={className} />
            : <PhoneIcon className={className} />
);

export const channelName = (channel: Channel): string =>
    channel === 'whatsapp' ? 'WhatsApp' : channel === 'email' ? 'Email' : 'SMS';

/** Initials disc (the app's Avatar) with a small mark for the channel they last used. */
export const Avatar: React.FC<{ name: string; channel?: Channel; size?: 'md' | 'lg' }> = ({ name, channel, size = 'md' }) => (
    <span className="relative inline-flex flex-shrink-0" aria-hidden>
        <UiAvatar name={name} size={size === 'lg' ? 'lg' : 'md'} />
        {channel && (
            <span className="absolute -bottom-1 -end-1 grid h-[18px] w-[18px] place-items-center rounded-full bg-surface text-ink-2 ring-2 ring-surface">
                <ChannelIcon channel={channel} brand className="h-3 w-3" />
            </span>
        )}
    </span>
);

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
