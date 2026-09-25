import React, { useState } from 'react';
import {
    CameraIcon,
    EnvelopeIcon,
    ExclamationTriangleIcon,
    PaperClipIcon,
    TrashIcon,
    UsersIcon,
    WhatsAppIcon,
} from '../icons';
import {
    AgentMessage,
    Channel,
    bounceNoticeText,
    formatAgentTime,
    instructionText,
    isReactionMessage,
    reactionEmojiOf,
} from '../../services/salesAgentService';
import { isLongEmailBody, looksLikeEmailBody, looksLikeForwardedEmail, splitQuotedEmail } from '../../utils/emailQuote';
import { friendlyWhatsAppMediaName } from '../../utils/whatsappMedia';

const Chevron: React.FC<{ open: boolean }> = ({ open }) => (
    <svg viewBox="0 0 12 12" className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
        <path d="M2 4.5 6 8.5 10 4.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
);

const ChannelChip: React.FC<{ channel: Channel }> = ({ channel }) => {
    if (channel === 'whatsapp') {
        return (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-emerald-400">
                <WhatsAppIcon className="h-3 w-3" />
                WhatsApp
            </span>
        );
    }
    if (channel === 'email') {
        return (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-sky-400">
                <EnvelopeIcon className="h-3 w-3" />
                Email
            </span>
        );
    }
    return (
        <span className="text-[10px] font-semibold uppercase tracking-wide text-violet-300">SMS</span>
    );
};

const deliveryStateOf = (message: AgentMessage): 'sent' | 'delivered' | 'read' | 'failed' | 'pending' | null => {
    if (message.direction !== 'out') return null;
    if (message.delivery) return message.delivery;
    if (message.providerId) return 'sent';
    if (Date.now() - (message.createdAt || 0) < 5 * 60_000) return 'pending';
    return null;
};

const DeliveryTicks: React.FC<{ message: AgentMessage }> = ({ message }) => {
    const state = deliveryStateOf(message);
    if (!state) return null;
    if (state === 'pending') {
        return (
            <svg viewBox="0 0 16 16" className="inline h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.4" aria-label="Sending" role="img">
                <circle cx="8" cy="8" r="5.6" />
                <path d="M8 5v3.2l2.1 1.3" strokeLinecap="round" />
            </svg>
        );
    }
    if (state === 'failed') {
        return <ExclamationTriangleIcon className="inline h-3 w-3 text-red-300" aria-label="Not delivered" />;
    }
    const label = state === 'read' ? 'Read' : state === 'delivered' ? 'Delivered' : 'Sent';
    return (
        <svg
            viewBox="0 0 18 12"
            className={`inline h-3 w-[18px] ${state === 'read' ? 'text-sky-400' : ''}`}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
            role="img"
            aria-label={label}
        >
            <path d="M1.5 6.5 5 10 11.5 3" />
            {state !== 'sent' && <path d="M8 8 10 10 16.5 3" />}
        </svg>
    );
};

const BounceNote: React.FC<{
    bounce: string;
    at: number;
    selected: boolean;
    onToggleSelect: () => void;
    onDelete: () => void;
}> = ({ bounce, at, selected, onToggleSelect, onDelete }) => {
    const [open, setOpen] = useState(false);
    return (
        <div className="group flex items-center justify-center gap-2" onClick={onToggleSelect}>
            <div className="max-w-[90%] rounded-lg bg-black/25 px-3 py-1.5 text-center text-[11px] leading-relaxed text-gray-400">
                <span className="font-medium text-red-300/90">Email bounced</span>
                <span className="mx-1.5 opacity-50">·</span>
                <span className="opacity-70">{formatAgentTime(at)}</span>
                <div className="mt-0.5">
                    <button type="button" onClick={() => setOpen(o => !o)} className="inline-flex items-center gap-1 text-[11px] font-medium text-gray-400 hover:text-white">
                        Bounce details
                        <Chevron open={open} />
                    </button>
                    {open && <p className="mt-1 whitespace-pre-wrap break-words text-left font-mono text-[10.5px] leading-relaxed text-gray-400">{bounce}</p>}
                </div>
            </div>
            <IconBtn label="Delete this note" danger onClick={e => { e.stopPropagation(); onDelete(); }} selected={selected}>
                <TrashIcon className="h-3.5 w-3.5" />
            </IconBtn>
        </div>
    );
};

const QuotedBlock: React.FC<{ quoted: string; from?: string; defaultOpen?: boolean }> = ({ quoted, from, defaultOpen }) => {
    const [open, setOpen] = useState(!!defaultOpen);
    const long = isLongEmailBody(quoted);
    return (
        <div className="mt-2 overflow-hidden rounded-lg border border-white/10 bg-black/25">
            <button
                type="button"
                onClick={e => { e.stopPropagation(); setOpen(o => !o); }}
                aria-expanded={open}
                className="flex min-h-[44px] w-full items-center gap-2 px-2.5 py-1.5 text-left text-[11.5px] font-medium text-gray-300 hover:text-white sm:min-h-[36px]"
            >
                <Chevron open={open} />
                <span className="min-w-0 flex-1 truncate">
                    {open ? 'Hide quoted email' : from ? `Quoted email from ${from}` : 'Quoted email'}
                </span>
            </button>
            {open && (
                <p className={`whitespace-pre-wrap break-words border-t border-white/10 px-2.5 py-2 text-[12px] leading-relaxed text-gray-300 ${long ? 'max-h-64 overflow-y-auto' : ''}`}>
                    {quoted}
                </p>
            )}
        </div>
    );
};

const LongBody: React.FC<{ text: string; className?: string }> = ({ text, className }) => {
    const long = isLongEmailBody(text);
    const [open, setOpen] = useState(!long);
    if (!long) {
        return <p className={`whitespace-pre-wrap break-words ${className || ''}`}>{text}</p>;
    }
    const preview = text.split('\n').slice(0, 5).join('\n').trimEnd();
    return (
        <div>
            <p className={`whitespace-pre-wrap break-words ${className || ''}`}>{open ? text : `${preview}\n…`}</p>
            <button
                type="button"
                onClick={e => { e.stopPropagation(); setOpen(o => !o); }}
                className="mt-1 text-[11px] font-medium text-sky-300 hover:text-white"
            >
                {open ? 'Show less' : 'Show more'}
            </button>
        </div>
    );
};

const ImageMedia: React.FC<{ url: string; label: string }> = ({ url, label }) => {
    const [failed, setFailed] = useState(false);
    if (failed) {
        return (
            <a
                href={url}
                target="_blank"
                rel="noreferrer"
                className="mb-1 inline-flex items-center gap-2 rounded-lg bg-black/25 px-3 py-2 text-sm"
            >
                <CameraIcon className="h-4 w-4" />
                {label}: tap to open
            </a>
        );
    }
    return (
        <a href={url} target="_blank" rel="noreferrer" className="mb-1 block">
            <img
                src={url}
                alt={label}
                referrerPolicy="no-referrer"
                onError={() => setFailed(true)}
                className="max-h-64 max-w-full rounded-lg object-cover"
            />
        </a>
    );
};

const MediaBlock: React.FC<{ message: AgentMessage }> = ({ message }) => {
    const media = message.media;
    if (!media?.url) return null;
    const label = friendlyWhatsAppMediaName(media.kind, media.filename);
    return (
        <>
            {media.kind === 'image' && <ImageMedia url={media.url} label={label} />}
            {media.kind === 'video' && (
                <video src={media.url} controls className="mb-1 max-h-64 w-full rounded-lg bg-black" />
            )}
            {media.kind === 'document' && (
                <a
                    href={media.url}
                    target="_blank"
                    rel="noreferrer"
                    className="mb-1 inline-flex items-center gap-2 rounded-lg bg-black/25 px-3 py-2 text-sm underline"
                >
                    <PaperClipIcon className="h-4 w-4" />
                    {label}
                </a>
            )}
        </>
    );
};

const IconBtn: React.FC<{
    label: string;
    onClick: (e: React.MouseEvent) => void;
    selected: boolean;
    danger?: boolean;
    children: React.ReactNode;
}> = ({ label, onClick, selected, danger, children }) => (
    <button
        type="button"
        onClick={onClick}
        aria-label={label}
        title={label}
        className={`h-11 w-11 flex-shrink-0 items-center justify-center rounded-full transition-opacity sm:h-7 sm:w-7 ${
            danger ? 'text-gray-400 hover:text-red-400' : 'text-gray-400 hover:text-amber-300'
        } ${selected ? 'flex opacity-100' : 'hidden pointer-events-none opacity-0 sm:flex sm:group-hover:pointer-events-auto sm:group-hover:opacity-100'}`}
    >
        {children}
    </button>
);

interface ThreadMessageProps {
    message: AgentMessage;
    agentName: string;
    deskEmail?: string;
    selected: boolean;
    onToggleSelect: () => void;
    onDelete: () => void;
    onDetach?: () => void;
}

export const EmailCard: React.FC<ThreadMessageProps> = ({
    message,
    agentName,
    deskEmail,
    selected,
    onToggleSelect,
    onDelete,
    onDetach,
}) => {
    const mine = message.from !== 'customer';
    const fromOwner = message.from === 'owner';
    const split = splitQuotedEmail(message.text || '');
    const who = mine ? (fromOwner ? 'You' : agentName) : (message.fromAddress || 'Customer');
    const emptyNew = !split.body.trim() && !!split.quoted;
    const showAddress = !!message.fromAddress && who !== message.fromAddress;

    return (
        <div className={`group flex ${mine ? 'justify-end' : 'justify-start'}`} onClick={onToggleSelect}>
            <div className="flex w-full max-w-[40rem] items-start gap-1">
                <article
                    className={`min-w-0 flex-1 overflow-hidden rounded-xl border shadow-sm ${
                        mine
                            ? fromOwner
                                ? 'border-emerald-400/15 bg-emerald-950/50'
                                : 'border-sky-400/15 bg-sky-950/40'
                            : 'border-white/[0.08] bg-gray-900'
                    }`}
                >
                    <header className="flex items-start gap-3 border-b border-white/[0.06] px-3.5 py-2.5">
                        <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                                <ChannelChip channel="email" />
                                <span className="truncate text-[13px] font-semibold text-white">{who}</span>
                            </div>
                            {mine && deskEmail && (
                                <p className="mt-0.5 truncate text-[11px] text-gray-400">From {deskEmail}</p>
                            )}
                            {showAddress && (
                                <p className="mt-0.5 truncate text-[11px] text-gray-400">{message.fromAddress}</p>
                            )}
                            {message.subject && (
                                <p className="mt-1 truncate text-[12.5px] font-medium text-gray-200">{message.subject}</p>
                            )}
                        </div>
                        <time className="flex-shrink-0 pt-0.5 text-[11px] text-gray-400">
                            {formatAgentTime(message.createdAt)}
                            {mine && (
                                <span className="ml-1 inline-flex align-middle">
                                    <DeliveryTicks message={message} />
                                </span>
                            )}
                        </time>
                    </header>
                    <div className="px-3.5 py-3">
                        <MediaBlock message={message} />
                        {emptyNew ? (
                            <p className="text-[12px] italic text-gray-400">Replied — no new text.</p>
                        ) : split.body && split.body !== '[photo]' && split.body !== '[video]' && split.body !== '[document]' ? (
                            <LongBody text={split.body} className="text-[14.5px] leading-relaxed text-gray-100" />
                        ) : null}
                        {split.quoted && <QuotedBlock quoted={split.quoted} from={split.quotedFrom} />}
                        {mine && message.delivery === 'failed' && (
                            <p className="mt-2 text-[11px] font-medium text-red-300">
                                Not delivered{message.deliveryError ? ` — ${message.deliveryError}` : ''}
                            </p>
                        )}
                    </div>
                </article>
                {onDetach && (
                    <IconBtn label="This email is someone else" onClick={e => { e.stopPropagation(); onDetach(); }} selected={selected}>
                        <UsersIcon className="h-3.5 w-3.5" />
                    </IconBtn>
                )}
                <IconBtn label="Delete this email" danger onClick={e => { e.stopPropagation(); onDelete(); }} selected={selected}>
                    <TrashIcon className="h-3.5 w-3.5" />
                </IconBtn>
            </div>
        </div>
    );
};

export const ChatBubble: React.FC<ThreadMessageProps> = ({
    message,
    agentName,
    selected,
    onToggleSelect,
    onDelete,
}) => {
    const mine = message.from !== 'customer';
    const fromOwner = message.from === 'owner';
    const split = splitQuotedEmail(message.text || '');
    const forwarded = looksLikeForwardedEmail(split.quoted);
    const body = forwarded ? split.body : (message.text || '');
    const quoted = forwarded ? split.quoted : null;
    const emailShaped = !forwarded && looksLikeEmailBody(body);

    const bubble = !mine
        ? 'rounded-tl-md bg-gray-800 text-gray-100 ring-1 ring-inset ring-white/[0.04]'
        : fromOwner
            ? 'rounded-tr-md bg-emerald-800/80 text-white'
            : 'rounded-tr-md bg-teal-900/90 text-teal-50 ring-1 ring-inset ring-teal-400/10';

    return (
        <div className={`group flex ${mine ? 'justify-end' : 'justify-start'}`} onClick={onToggleSelect}>
            <div className="max-w-[78%] sm:max-w-[70%]">
                {mine && (
                    <p className={`mb-0.5 text-right text-[11px] font-medium ${fromOwner ? 'text-emerald-300' : 'text-amber-300'}`}>
                        {fromOwner ? 'You' : agentName}
                    </p>
                )}
                <div className={`flex items-end gap-1 ${mine ? 'flex-row-reverse' : ''}`}>
                    <div className={`relative rounded-2xl px-3.5 py-2 shadow-sm ${bubble} ${message.customerReaction ? 'mb-3' : ''}`}>
                        <MediaBlock message={message} />
                        {body && body !== '[photo]' && body !== '[video]' && body !== '[document]' && (
                            emailShaped
                                ? <LongBody text={body} className="text-[14.5px] leading-relaxed" />
                                : <p className="whitespace-pre-wrap break-words text-[14.5px] leading-relaxed">{body}</p>
                        )}
                        {quoted && <QuotedBlock quoted={quoted} from={split.quotedFrom} defaultOpen={!body.trim()} />}
                        <p className={`mt-1 flex items-center gap-1 text-[10px] ${mine ? 'justify-end text-white/60' : 'text-gray-400'}`}>
                            {formatAgentTime(message.createdAt)}
                            {mine && <DeliveryTicks message={message} />}
                        </p>
                        {mine && message.delivery === 'failed' && (
                            <p className="mt-0.5 text-right text-[10px] font-medium text-red-300">
                                Not delivered{message.deliveryError ? ` — ${message.deliveryError}` : ''}
                            </p>
                        )}
                        {message.customerReaction && (
                            <span
                                className={`absolute -bottom-3 ${mine ? 'left-2' : 'right-2'} rounded-full bg-gray-800 px-1.5 py-0.5 text-[15px] leading-none shadow ring-2 ring-gray-950`}
                                title={`Reacted ${message.customerReaction}`}
                            >
                                {message.customerReaction}
                            </span>
                        )}
                    </div>
                    <IconBtn label="Delete this message" danger onClick={e => { e.stopPropagation(); onDelete(); }} selected={selected}>
                        <TrashIcon className="h-3.5 w-3.5" />
                    </IconBtn>
                </div>
            </div>
        </div>
    );
};

export const ThreadMessage: React.FC<ThreadMessageProps> = (props) => {
    const { message, agentName, selected, onToggleSelect, onDelete } = props;
    const bounce = bounceNoticeText(message);
    const instruction = instructionText(message);

    if (bounce) {
        return (
            <BounceNote
                bounce={bounce}
                at={message.createdAt}
                selected={selected}
                onToggleSelect={onToggleSelect}
                onDelete={onDelete}
            />
        );
    }

    if (instruction) {
        return (
            <div className="group flex items-center justify-center gap-2" onClick={onToggleSelect}>
                <p className="max-w-[85%] rounded-lg bg-black/25 px-3 py-1.5 text-center text-[11px] leading-relaxed text-gray-400">
                    <span className="font-medium text-gray-200">You told {agentName}:</span> {instruction}
                </p>
                <IconBtn label="Delete this note" danger onClick={e => { e.stopPropagation(); onDelete(); }} selected={selected}>
                    <TrashIcon className="h-3.5 w-3.5" />
                </IconBtn>
            </div>
        );
    }

    if ((message.text || '').trim() === '[unsupported]' && !message.media) {
        return (
            <div className="group flex items-center justify-center gap-2" onClick={onToggleSelect}>
                <p className="max-w-[85%] rounded-lg bg-black/25 px-3 py-1.5 text-center text-[11px] leading-relaxed text-gray-400">
                    WhatsApp did not pass this one. Often a photo album or a view-once.
                </p>
                <IconBtn label="Delete this note" danger onClick={e => { e.stopPropagation(); onDelete(); }} selected={selected}>
                    <TrashIcon className="h-3.5 w-3.5" />
                </IconBtn>
            </div>
        );
    }

    if (isReactionMessage(message)) {
        const emoji = reactionEmojiOf(message);
        return (
            <div className="group flex justify-start" onClick={onToggleSelect}>
                <div className="flex items-end gap-1">
                    <div className="rounded-2xl rounded-tl-md bg-gray-800 px-2.5 py-1.5 shadow-sm">
                        {emoji ? (
                            <p className="text-[22px] leading-none" aria-label={`Reacted ${emoji}`}>{emoji}</p>
                        ) : (
                            <p className="text-[13px] text-gray-100">Reacted</p>
                        )}
                        <p className="mt-1 text-[10px] text-gray-400">{formatAgentTime(message.createdAt)}</p>
                    </div>
                    <IconBtn label="Delete this reaction" danger onClick={e => { e.stopPropagation(); onDelete(); }} selected={selected}>
                        <TrashIcon className="h-3.5 w-3.5" />
                    </IconBtn>
                </div>
            </div>
        );
    }

    if (message.channel === 'email' || looksLikeEmailBody(message.text)) return <EmailCard {...props} />;
    return <ChatBubble {...props} />;
};
