import React, { useState } from 'react';
import {
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
import { isLongEmailBody, looksLikeForwardedEmail, splitQuotedEmail } from '../../utils/emailQuote';

const Chevron: React.FC<{ open: boolean }> = ({ open }) => (
    <svg viewBox="0 0 12 12" className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
        <path d="M2 4.5 6 8.5 10 4.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
);

const ChannelChip: React.FC<{ channel: Channel }> = ({ channel }) => {
    if (channel === 'whatsapp') {
        return (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-[#25d366]">
                <WhatsAppIcon className="h-3 w-3" />
                WhatsApp
            </span>
        );
    }
    if (channel === 'email') {
        return (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-sky-300">
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
            className={`inline h-3 w-[18px] ${state === 'read' ? 'text-[#53bdeb]' : ''}`}
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
            <div className="max-w-[90%] rounded-lg bg-black/25 px-3 py-1.5 text-center text-[11px] leading-relaxed text-[#8696a0]">
                <span className="font-medium text-red-300/90">Email bounced</span>
                <span className="mx-1.5 opacity-50">·</span>
                <span className="opacity-70">{formatAgentTime(at)}</span>
                <div className="mt-0.5">
                    <button type="button" onClick={() => setOpen(o => !o)} className="inline-flex items-center gap-1 text-[11px] font-medium text-[#8696a0] hover:text-white">
                        Bounce details
                        <Chevron open={open} />
                    </button>
                    {open && <p className="mt-1 whitespace-pre-wrap break-words text-left font-mono text-[10.5px] leading-relaxed text-[#8696a0]">{bounce}</p>}
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
                className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[11px] font-medium text-[#aebac1] hover:text-white"
            >
                <Chevron open={open} />
                <span className="min-w-0 flex-1 truncate">
                    {open ? 'Hide quoted email' : from ? `Quoted email from ${from}` : 'Quoted email'}
                </span>
            </button>
            {open && (
                <p className={`whitespace-pre-wrap break-words border-t border-white/10 px-2.5 py-2 text-[12px] leading-relaxed text-[#c5d0d6] ${long ? 'max-h-64 overflow-y-auto' : ''}`}>
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
    return (
        <div>
            <p className={`whitespace-pre-wrap break-words ${className || ''} ${open ? '' : 'line-clamp-6'}`}>{text}</p>
            <button
                type="button"
                onClick={() => setOpen(o => !o)}
                className="mt-1 text-[11px] font-medium text-sky-300 hover:text-white"
            >
                {open ? 'Show less' : 'Show more'}
            </button>
        </div>
    );
};

const MediaBlock: React.FC<{ message: AgentMessage }> = ({ message }) => (
    <>
        {message.media?.kind === 'image' && (
            <a href={message.media.url} target="_blank" rel="noreferrer" className="mb-1 block">
                <img src={message.media.url} alt={message.media.filename || 'Photo'} className="max-h-64 max-w-full rounded-lg object-cover" />
            </a>
        )}
        {message.media?.kind === 'video' && (
            <video src={message.media.url} controls className="mb-1 max-h-64 w-full rounded-lg bg-black" />
        )}
        {message.media?.kind === 'document' && (
            <a
                href={message.media.url}
                target="_blank"
                rel="noreferrer"
                className="mb-1 inline-flex items-center gap-2 rounded-lg bg-black/25 px-3 py-2 text-sm underline"
            >
                <PaperClipIcon className="h-4 w-4" />
                {message.media.filename || 'File'}
            </a>
        )}
    </>
);

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
        className={`flex-shrink-0 p-1 transition-opacity ${
            danger ? 'text-[#8696a0] hover:text-red-400' : 'text-[#8696a0] hover:text-amber-300'
        } ${selected ? 'opacity-100' : 'pointer-events-none opacity-0 sm:group-hover:pointer-events-auto sm:group-hover:opacity-100'}`}
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
                                ? 'border-emerald-500/20 bg-[#16352c]'
                                : 'border-sky-500/20 bg-[#152238]'
                            : 'border-white/10 bg-[#1c2730]'
                    }`}
                >
                    <header className="flex items-start gap-3 border-b border-white/10 px-3 py-2">
                        <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                                <ChannelChip channel="email" />
                                <span className="truncate text-[13px] font-semibold text-white">{who}</span>
                            </div>
                            {mine && deskEmail && (
                                <p className="mt-0.5 truncate text-[11px] text-[#8696a0]">From {deskEmail}</p>
                            )}
                            {showAddress && (
                                <p className="mt-0.5 truncate text-[11px] text-[#8696a0]">{message.fromAddress}</p>
                            )}
                            {message.subject && (
                                <p className="mt-1 truncate text-[12px] font-medium text-[#e9edef]">{message.subject}</p>
                            )}
                        </div>
                        <time className="flex-shrink-0 pt-0.5 text-[11px] text-[#8696a0]">
                            {formatAgentTime(message.createdAt)}
                            {mine && (
                                <span className="ml-1 inline-flex align-middle">
                                    <DeliveryTicks message={message} />
                                </span>
                            )}
                        </time>
                    </header>
                    <div className="px-3 py-2.5">
                        <MediaBlock message={message} />
                        {emptyNew ? (
                            <p className="text-[12px] italic text-[#8696a0]">Replied — no new text.</p>
                        ) : split.body && split.body !== '[photo]' && split.body !== '[video]' && split.body !== '[document]' ? (
                            <LongBody text={split.body} className="text-[14px] leading-relaxed text-[#e9edef]" />
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

    const bubble = !mine
        ? 'rounded-tl-sm bg-[#202c33] text-[#e9edef]'
        : fromOwner
            ? 'rounded-tr-sm bg-emerald-800 text-white'
            : 'rounded-tr-sm bg-[#005c4b] text-[#e9edef]';

    return (
        <div className={`group flex ${mine ? 'justify-end' : 'justify-start'}`} onClick={onToggleSelect}>
            <div className="max-w-[78%] sm:max-w-[70%]">
                {mine && (
                    <p className={`mb-0.5 text-right text-[11px] font-medium ${fromOwner ? 'text-emerald-300' : 'text-[#25d366]'}`}>
                        {fromOwner ? 'You' : agentName}
                    </p>
                )}
                <div className={`flex items-end gap-1 ${mine ? 'flex-row-reverse' : ''}`}>
                    <div className={`relative rounded-2xl px-3 py-2 shadow ${bubble} ${message.customerReaction ? 'mb-3' : ''}`}>
                        <MediaBlock message={message} />
                        {body && body !== '[photo]' && body !== '[video]' && body !== '[document]' && (
                            <p className="whitespace-pre-wrap break-words text-[14.5px] leading-relaxed">{body}</p>
                        )}
                        {quoted && <QuotedBlock quoted={quoted} from={split.quotedFrom} defaultOpen={!body.trim()} />}
                        <p className={`mt-1 flex items-center gap-1 text-[10px] ${mine ? 'justify-end text-white/50' : 'text-[#8696a0]'}`}>
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
                                className={`absolute -bottom-3 ${mine ? 'left-2' : 'right-2'} rounded-full bg-[#1f2c33] px-1.5 py-0.5 text-[15px] leading-none shadow ring-2 ring-[#0b141a]`}
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
                <p className="max-w-[85%] rounded-lg bg-black/25 px-3 py-1.5 text-center text-[11px] leading-relaxed text-[#8696a0]">
                    <span className="font-medium text-[#e9edef]/70">You told {agentName}:</span> {instruction}
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
                    <div className="rounded-2xl rounded-tl-sm bg-[#202c33] px-2.5 py-1.5 shadow">
                        {emoji ? (
                            <p className="text-[22px] leading-none" aria-label={`Reacted ${emoji}`}>{emoji}</p>
                        ) : (
                            <p className="text-[13px] text-[#e9edef]">Reacted</p>
                        )}
                        <p className="mt-1 text-[10px] text-[#8696a0]">{formatAgentTime(message.createdAt)}</p>
                    </div>
                    <IconBtn label="Delete this reaction" danger onClick={e => { e.stopPropagation(); onDelete(); }} selected={selected}>
                        <TrashIcon className="h-3.5 w-3.5" />
                    </IconBtn>
                </div>
            </div>
        );
    }

    if (message.channel === 'email') return <EmailCard {...props} />;
    return <ChatBubble {...props} />;
};
