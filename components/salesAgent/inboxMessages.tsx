import React, { useState } from 'react';
import {
    CameraIcon,
    EnvelopeIcon,
    ExclamationTriangleIcon,
    PaperClipIcon,
    SparklesIcon,
    TrashIcon,
    UsersIcon,
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
import { WhatsAppMark } from './inbox/parts';

/*
 * One message in an open thread. Chat reads like a messaging app: the
 * customer on the start side in --bubble-in, the desk on the end side in
 * --bubble-out, a small "You" / Dave label over the desk's bubbles, times in
 * mono. Email arrives as a flat card on a hairline.
 */

const Chevron: React.FC<{ open: boolean }> = ({ open }) => (
    <svg viewBox="0 0 12 12" className={`h-3 w-3 flex-shrink-0 transition-transform duration-quick ease-out ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
        <path d="M2 4.5 6 8.5 10 4.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
);

const ChannelChip: React.FC<{ channel: Channel }> = ({ channel }) => {
    if (channel === 'whatsapp') {
        return (
            <span className="inline-flex items-center gap-1 font-mono text-xs font-semibold uppercase tracking-[0.08em] text-ink-2">
                <WhatsAppMark brand className="h-3.5 w-3.5" />
                WhatsApp
            </span>
        );
    }
    if (channel === 'email') {
        return (
            <span className="inline-flex items-center gap-1 font-mono text-xs font-semibold uppercase tracking-[0.08em] text-ink-2">
                <EnvelopeIcon className="h-3.5 w-3.5" />
                Email
            </span>
        );
    }
    return (
        <span className="font-mono text-xs font-semibold uppercase tracking-[0.08em] text-ink-2">SMS</span>
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
            <svg viewBox="0 0 16 16" className="inline h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.4" aria-label="Sending" role="img">
                <circle cx="8" cy="8" r="5.6" />
                <path d="M8 5v3.2l2.1 1.3" strokeLinecap="round" />
            </svg>
        );
    }
    if (state === 'failed') {
        return <ExclamationTriangleIcon className="inline h-3.5 w-3.5 text-danger" title="Not delivered" />;
    }
    const label = state === 'read' ? 'Read' : state === 'delivered' ? 'Delivered' : 'Sent';
    return (
        <svg
            viewBox="0 0 18 12"
            className={`inline h-3 w-[18px] ${state === 'read' ? 'text-info' : ''}`}
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

/** A quiet centred note in the thread (bounce, instruction, unsupported). */
const noteClass = 'max-w-[90%] rounded-control bg-surface-2 px-3 py-2 text-center text-sm leading-5 text-ink-2';

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
            <div className={noteClass}>
                <span className="font-semibold text-danger">Email bounced</span>
                <span className="mx-1.5 text-ink-3" aria-hidden>·</span>
                <span className="text-xs tabular-nums text-ink-3">{formatAgentTime(at)}</span>
                <div className="mt-0.5">
                    <button
                        type="button"
                        onClick={() => setOpen(o => !o)}
                        aria-expanded={open}
                        className="inline-flex min-h-[32px] items-center gap-1 text-xs font-semibold text-ink-2 hover:text-ink"
                    >
                        Bounce details
                        <Chevron open={open} />
                    </button>
                    {open && <p className="mt-1 whitespace-pre-wrap break-words text-start font-mono text-xs leading-relaxed text-ink-3">{bounce}</p>}
                </div>
            </div>
            <IconBtn label="Delete this note" danger onClick={e => { e.stopPropagation(); onDelete(); }} selected={selected}>
                <TrashIcon className="h-4 w-4" />
            </IconBtn>
        </div>
    );
};

const QuotedBlock: React.FC<{ quoted: string; from?: string; defaultOpen?: boolean }> = ({ quoted, from, defaultOpen }) => {
    const [open, setOpen] = useState(!!defaultOpen);
    const long = isLongEmailBody(quoted);
    return (
        <div className="mt-2 overflow-hidden rounded-control border border-line">
            <button
                type="button"
                onClick={e => { e.stopPropagation(); setOpen(o => !o); }}
                aria-expanded={open}
                className="flex min-h-[44px] w-full items-center gap-2 px-3 text-start text-xs font-semibold text-ink-2 transition-colors duration-quick ease-out hover:bg-surface-2 hover:text-ink focus-visible:[outline-offset:-3px] sm:min-h-[36px]"
            >
                <Chevron open={open} />
                <span className="min-w-0 flex-1 truncate">
                    {open ? 'Hide quoted email' : from ? `Quoted email from ${from}` : 'Quoted email'}
                </span>
            </button>
            {open && (
                <p className={`whitespace-pre-wrap break-words border-t border-line px-3 py-2 text-sm leading-relaxed text-ink-2 ${long ? 'max-h-64 overflow-y-auto' : ''}`}>
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
                className="mt-1 min-h-[32px] text-sm font-semibold text-accent-text hover:underline"
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
                className="mb-1 inline-flex min-h-[44px] items-center gap-2 rounded-control bg-surface px-3 text-sm font-semibold text-ink"
            >
                <CameraIcon className="h-5 w-5" />
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
                className="max-h-64 max-w-full rounded-control object-cover"
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
                <video src={media.url} controls className="mb-1 max-h-64 w-full rounded-control bg-scrim" />
            )}
            {media.kind === 'document' && (
                <a
                    href={media.url}
                    target="_blank"
                    rel="noreferrer"
                    className="mb-1 inline-flex min-h-[44px] items-center gap-2 rounded-control bg-surface px-3 text-sm font-semibold text-ink underline underline-offset-2"
                >
                    <PaperClipIcon className="h-5 w-5" />
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
        className={`h-12 w-12 flex-shrink-0 place-items-center rounded-control text-ink-3 transition-[opacity,color,background-color] duration-quick ease-out hover:bg-surface-2 sm:h-8 sm:w-8 ${
            danger ? 'hover:text-danger' : 'hover:text-ink'
        } ${selected ? 'grid opacity-100' : 'hidden pointer-events-none opacity-0 sm:grid sm:group-hover:pointer-events-auto sm:group-hover:opacity-100 sm:focus-visible:pointer-events-auto sm:focus-visible:opacity-100'}`}
    >
        {children}
    </button>
);

/** "You" or Dave over the desk's own messages. */
const SenderLabel: React.FC<{ fromOwner: boolean; agentName: string }> = ({ fromOwner, agentName }) => (
    fromOwner ? (
        <p className="mb-1 text-end text-xs font-semibold text-ink-2">You</p>
    ) : (
        <p className="mb-1 flex items-center justify-end gap-1 text-xs font-semibold text-accent-text">
            <SparklesIcon className="h-3.5 w-3.5" />
            {agentName}
        </p>
    )
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
            <div className={`flex w-full max-w-[40rem] items-start gap-1 ${mine ? 'flex-row-reverse' : ''}`}>
                <article
                    className={`min-w-0 flex-1 overflow-hidden rounded-card border ${
                        mine ? 'border-line bg-bubble-out' : 'border-line bg-surface'
                    }`}
                >
                    <header className="flex items-start gap-3 border-b border-line px-4 py-2.5">
                        <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                                <ChannelChip channel="email" />
                                <span className={`truncate text-sm font-semibold ${mine && !fromOwner ? 'text-accent-text' : 'text-ink'}`}>{who}</span>
                            </div>
                            {mine && deskEmail && (
                                <p className="mt-0.5 truncate text-xs text-ink-3">From {deskEmail}</p>
                            )}
                            {showAddress && (
                                <p className="mt-0.5 truncate text-xs text-ink-3">{message.fromAddress}</p>
                            )}
                            {message.subject && (
                                <p className="mt-1 truncate text-sm font-semibold text-ink">{message.subject}</p>
                            )}
                        </div>
                        <time className="flex flex-shrink-0 items-center gap-1 pt-0.5 font-mono text-xs text-ink-3">
                            {formatAgentTime(message.createdAt)}
                            {mine && <DeliveryTicks message={message} />}
                        </time>
                    </header>
                    <div className="px-4 py-3">
                        <MediaBlock message={message} />
                        {emptyNew ? (
                            <p className="text-sm italic text-ink-3">Replied — no new text.</p>
                        ) : split.body && split.body !== '[photo]' && split.body !== '[video]' && split.body !== '[document]' ? (
                            <LongBody text={split.body} className="text-base leading-relaxed text-ink" />
                        ) : null}
                        {split.quoted && <QuotedBlock quoted={split.quoted} from={split.quotedFrom} />}
                        {mine && message.delivery === 'failed' && (
                            <p className="mt-2 text-sm font-semibold text-danger">
                                Not delivered{message.deliveryError ? ` — ${message.deliveryError}` : ''}
                            </p>
                        )}
                    </div>
                </article>
                {onDetach && (
                    <IconBtn label="This email is someone else" onClick={e => { e.stopPropagation(); onDetach(); }} selected={selected}>
                        <UsersIcon className="h-4 w-4" />
                    </IconBtn>
                )}
                <IconBtn label="Delete this email" danger onClick={e => { e.stopPropagation(); onDelete(); }} selected={selected}>
                    <TrashIcon className="h-4 w-4" />
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

    const bubble = mine
        ? 'rounded-ee-[4px] bg-bubble-out text-ink'
        : 'rounded-es-[4px] bg-bubble-in text-ink';

    return (
        <div className={`group flex ${mine ? 'justify-end' : 'justify-start'}`} onClick={onToggleSelect}>
            <div className="max-w-[84%] sm:max-w-[70%]">
                {mine && <SenderLabel fromOwner={fromOwner} agentName={agentName} />}
                <div className={`flex items-end gap-1 ${mine ? 'flex-row-reverse' : ''}`}>
                    <div className={`relative rounded-[16px] px-3 py-2.5 ${bubble} ${message.customerReaction ? 'mb-3' : ''}`}>
                        <MediaBlock message={message} />
                        {body && body !== '[photo]' && body !== '[video]' && body !== '[document]' && (
                            emailShaped
                                ? <LongBody text={body} className="text-base leading-[1.4]" />
                                : <p className="whitespace-pre-wrap break-words text-base leading-[1.4]">{body}</p>
                        )}
                        {quoted && <QuotedBlock quoted={quoted} from={split.quotedFrom} defaultOpen={!body.trim()} />}
                        <p className={`mt-1 flex items-center gap-1 font-mono text-xs text-ink-3 ${mine ? 'justify-end' : ''}`}>
                            {formatAgentTime(message.createdAt)}
                            {mine && <DeliveryTicks message={message} />}
                        </p>
                        {mine && message.delivery === 'failed' && (
                            <p className="mt-0.5 text-end text-sm font-semibold text-danger">
                                Not delivered{message.deliveryError ? ` — ${message.deliveryError}` : ''}
                            </p>
                        )}
                        {message.customerReaction && (
                            <span
                                className={`absolute -bottom-3 ${mine ? 'start-2' : 'end-2'} rounded-full bg-surface px-1.5 py-0.5 text-base leading-none ring-2 ring-bg`}
                                title={`Reacted ${message.customerReaction}`}
                            >
                                {message.customerReaction}
                            </span>
                        )}
                    </div>
                    <IconBtn label="Delete this message" danger onClick={e => { e.stopPropagation(); onDelete(); }} selected={selected}>
                        <TrashIcon className="h-4 w-4" />
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
                <p className={noteClass}>
                    <span className="font-semibold text-ink">You told {agentName}:</span> {instruction}
                </p>
                <IconBtn label="Delete this note" danger onClick={e => { e.stopPropagation(); onDelete(); }} selected={selected}>
                    <TrashIcon className="h-4 w-4" />
                </IconBtn>
            </div>
        );
    }

    if ((message.text || '').trim() === '[unsupported]' && !message.media) {
        return (
            <div className="group flex items-center justify-center gap-2" onClick={onToggleSelect}>
                <p className={noteClass}>
                    WhatsApp did not pass this one. Often a photo album or a view-once.
                </p>
                <IconBtn label="Delete this note" danger onClick={e => { e.stopPropagation(); onDelete(); }} selected={selected}>
                    <TrashIcon className="h-4 w-4" />
                </IconBtn>
            </div>
        );
    }

    if (isReactionMessage(message)) {
        const emoji = reactionEmojiOf(message);
        return (
            <div className="group flex justify-start" onClick={onToggleSelect}>
                <div className="flex items-end gap-1">
                    <div className="rounded-[16px] rounded-es-[4px] bg-bubble-in px-3 py-2">
                        {emoji ? (
                            <p className="text-[1.375rem] leading-none" aria-label={`Reacted ${emoji}`}>{emoji}</p>
                        ) : (
                            <p className="text-sm text-ink">Reacted</p>
                        )}
                        <p className="mt-1 font-mono text-xs text-ink-3">{formatAgentTime(message.createdAt)}</p>
                    </div>
                    <IconBtn label="Delete this reaction" danger onClick={e => { e.stopPropagation(); onDelete(); }} selected={selected}>
                        <TrashIcon className="h-4 w-4" />
                    </IconBtn>
                </div>
            </div>
        );
    }

    if (message.channel === 'email' || looksLikeEmailBody(message.text)) return <EmailCard {...props} />;
    return <ChatBubble {...props} />;
};
