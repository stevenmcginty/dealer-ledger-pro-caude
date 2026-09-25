/**
 * Dave's pending work on the open thread, docked right above the composer:
 * his drafted reply (approve / edit / bin) and his question (answer inline).
 * All behaviour comes in through props; these are presentation only.
 */

import React, { useEffect, useRef } from 'react';
import Spinner from '../../common/Spinner';
import { ChevronDownIcon, SparklesIcon } from '../../icons';
import SendViaBar, { sendViaLabel, type SendViaChoice } from '../SendViaBar';
import { ChannelIcon } from './parts';

/** Send button colour carries the route: WhatsApp green, email blue, both teal. */
export const sendButtonClass = (via: SendViaChoice): string => (
    via === 'email' ? 'bg-sky-600 text-white hover:bg-sky-500'
        : via === 'both' ? 'bg-teal-600 text-white hover:bg-teal-500'
            : 'bg-emerald-500 text-gray-950 hover:bg-emerald-400'
);

export const SendRouteIcon: React.FC<{ via: SendViaChoice; className?: string }> = ({ via, className = 'h-4 w-4' }) => (
    via === 'both' ? (
        <span className="inline-flex items-center -space-x-0.5" aria-hidden>
            <ChannelIcon channel="email" className={className} />
            <ChannelIcon channel="whatsapp" className={className} />
        </span>
    ) : (
        <span aria-hidden><ChannelIcon channel={via} className={className} /></span>
    )
);

export interface DraftCardProps {
    agentName: string;
    source: 'agent' | 'instruction';
    text: string;
    onText: (text: string) => void;
    open: boolean;
    onOpen: (open: boolean) => void;
    prompt: string;
    onPrompt: (prompt: string) => void;
    onRedo: () => void;
    redoBusy: boolean;
    busy: '' | 'approve' | 'discard';
    onApprove: () => void;
    onDiscard: () => void;
    bounceWarning: boolean;
    via: SendViaChoice;
    onVia: (via: SendViaChoice) => void;
    emailOk: boolean;
    phone?: string;
    needsOpener: boolean;
    onAddPhone: (phone: string) => void | Promise<void>;
}

export const DraftCard: React.FC<DraftCardProps> = ({
    agentName,
    source,
    text,
    onText,
    open,
    onOpen,
    prompt,
    onPrompt,
    onRedo,
    redoBusy,
    busy,
    onApprove,
    onDiscard,
    bounceWarning,
    via,
    onVia,
    emailOk,
    phone,
    needsOpener,
    onAddPhone,
}) => {
    const boxRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        const el = boxRef.current;
        if (!open || !el) return;
        el.style.height = 'auto';
        el.style.height = `${Math.min(el.scrollHeight + 2, window.innerHeight * 0.35)}px`;
    }, [open, text]);

    return (
        <section
            aria-label={`${agentName}'s draft reply`}
            className="overflow-hidden rounded-2xl bg-gradient-to-b from-amber-400/[0.09] to-amber-400/[0.04] ring-1 ring-inset ring-amber-400/25"
        >
            <div className="flex items-center gap-2 pl-3.5 pr-1.5 pt-1.5">
                <SparklesIcon className="h-4 w-4 flex-shrink-0 text-amber-300" />
                <p className="min-w-0 flex-1 truncate text-[11px] font-semibold uppercase tracking-[0.12em] text-amber-300">
                    {source === 'instruction' ? `${agentName}'s draft · from your prompt` : `${agentName} drafted a reply`}
                </p>
                <span className="flex-shrink-0 rounded-md bg-amber-400/15 px-1.5 py-0.5 text-[10.5px] font-semibold text-amber-200">Not sent</span>
                <button
                    type="button"
                    onClick={() => onOpen(!open)}
                    aria-expanded={open}
                    aria-label={open ? 'Fold the draft away' : 'Open the draft to edit it'}
                    className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full text-amber-300/80 hover:bg-amber-400/10 hover:text-amber-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60"
                >
                    <ChevronDownIcon className={`h-4 w-4 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
                </button>
            </div>

            {bounceWarning && (
                <p className="px-3.5 pb-1 text-[12px] leading-snug text-red-300">
                    This may be a reply to the bounce notice, not the customer — read it before sending.
                </p>
            )}

            {open ? (
                <div className="space-y-2 px-3 pb-1">
                    <textarea
                        ref={boxRef}
                        rows={3}
                        value={text}
                        onChange={e => onText(e.target.value)}
                        aria-label={`The reply ${agentName} has drafted — edit it before sending if you like`}
                        className="block w-full resize-none rounded-xl border border-amber-400/20 bg-gray-950/60 px-3 py-2.5 text-[16px] leading-relaxed text-gray-50 focus:border-amber-400/50 focus:outline-none focus:ring-2 focus:ring-amber-400/20 sm:text-[14.5px]"
                    />
                    <div className="flex items-center gap-2">
                        <input
                            value={prompt}
                            onChange={e => onPrompt(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onRedo(); } }}
                            placeholder={`Tell ${agentName} what to change…`}
                            aria-label={`Your prompt to ${agentName} — amend it and run him again`}
                            className="h-11 min-w-0 flex-1 rounded-xl bg-black/30 px-3.5 text-[16px] text-white placeholder-gray-500 ring-1 ring-inset ring-white/[0.06] focus:outline-none focus:ring-2 focus:ring-amber-400/40 sm:h-10 sm:text-[13px]"
                        />
                        <button
                            type="button"
                            onClick={onRedo}
                            disabled={redoBusy || !!busy}
                            title={prompt.trim() ? `Run ${agentName} again with this prompt` : `Have ${agentName} take another go`}
                            className="flex h-11 flex-shrink-0 items-center gap-1.5 rounded-xl border border-amber-400/30 px-3 text-[13px] font-semibold text-amber-200 hover:bg-amber-400/10 disabled:opacity-40 sm:h-10"
                        >
                            {redoBusy ? <Spinner className="h-3.5 w-3.5 text-amber-200" /> : <SparklesIcon className="h-3.5 w-3.5" />}
                            Redo
                        </button>
                    </div>
                    <SendViaBar
                        value={via}
                        onChange={onVia}
                        emailOk={emailOk}
                        phone={phone}
                        needsOpener={needsOpener}
                        disabled={!!busy}
                        onAddPhone={onAddPhone}
                    />
                </div>
            ) : (
                <button
                    type="button"
                    onClick={() => onOpen(true)}
                    className="block w-full px-3.5 pb-0.5 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-amber-400/50"
                    aria-label="Open the draft to edit it"
                >
                    <span className="line-clamp-3 whitespace-pre-wrap text-[14.5px] leading-relaxed text-gray-100">
                        {text || `${agentName} drafted a reply`}
                    </span>
                </button>
            )}

            <div className="flex items-center gap-1.5 px-2 pb-2 pt-1.5">
                <button
                    type="button"
                    onClick={onDiscard}
                    disabled={!!busy}
                    className="flex h-11 flex-shrink-0 items-center justify-center rounded-xl px-3 text-[13px] font-medium text-gray-400 hover:bg-white/[0.06] hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 disabled:opacity-40"
                >
                    {busy === 'discard' ? <Spinner className="h-3.5 w-3.5" /> : 'Bin it'}
                </button>
                {!open && (
                    <button
                        type="button"
                        onClick={() => onOpen(true)}
                        className="flex h-11 flex-shrink-0 items-center justify-center rounded-xl px-3 text-[13px] font-medium text-gray-300 hover:bg-white/[0.06] hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
                    >
                        Edit
                    </button>
                )}
                <button
                    type="button"
                    onClick={onApprove}
                    disabled={!text.trim() || !!busy}
                    className={`ml-auto flex h-11 min-w-0 items-center justify-center gap-2 rounded-xl px-4 text-[14px] font-semibold shadow-lg shadow-black/20 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70 disabled:opacity-40 ${sendButtonClass(via)}`}
                >
                    {busy === 'approve' ? <Spinner className="h-4 w-4" /> : (
                        <>
                            <SendRouteIcon via={via} />
                            <span className="truncate">{sendViaLabel(via)}</span>
                        </>
                    )}
                </button>
            </div>
        </section>
    );
};

export interface QuestionCardProps {
    agentName: string;
    question: string;
    context?: string;
    answer: string;
    onAnswer: (answer: string) => void;
    onSend: () => void;
    busy: boolean;
}

export const QuestionCard: React.FC<QuestionCardProps> = ({ agentName, question, context, answer, onAnswer, onSend, busy }) => {
    const boxRef = useRef<HTMLTextAreaElement>(null);
    const grow = (el: HTMLTextAreaElement | null) => {
        if (!el) return;
        el.style.height = 'auto';
        el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
    };

    return (
        <section
            aria-label={`${agentName} needs an answer`}
            className="rounded-2xl bg-gradient-to-b from-amber-400/[0.09] to-amber-400/[0.04] px-3.5 pb-3 pt-3 ring-1 ring-inset ring-amber-400/25"
        >
            <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-amber-300">
                <SparklesIcon className="h-4 w-4" />
                {agentName} needs an answer
            </p>
            <p className="mt-1.5 text-[15px] font-medium leading-snug text-white">{question}</p>
            {context && <p className="mt-1 text-[12.5px] leading-snug text-gray-400">{context}</p>}
            <div className="mt-2.5 flex items-end gap-2">
                <textarea
                    ref={boxRef}
                    rows={1}
                    value={answer}
                    onChange={e => { onAnswer(e.target.value); grow(e.target); }}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend(); } }}
                    placeholder={`Your answer — ${agentName} phrases it`}
                    aria-label={`Your answer to ${agentName}`}
                    className="min-h-[44px] min-w-0 flex-1 resize-none rounded-xl bg-gray-950/60 px-3.5 py-2.5 text-[16px] leading-snug text-white placeholder-gray-500 ring-1 ring-inset ring-amber-400/20 focus:outline-none focus:ring-2 focus:ring-amber-400/50 sm:text-sm"
                />
                <button
                    type="button"
                    onClick={onSend}
                    disabled={!answer.trim() || busy}
                    className="flex h-11 flex-shrink-0 items-center justify-center gap-1 rounded-xl bg-amber-400 px-4 text-[14px] font-semibold text-gray-950 hover:bg-amber-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70 disabled:opacity-40"
                >
                    {busy ? <Spinner className="h-4 w-4 text-gray-950" /> : 'Answer'}
                </button>
            </div>
        </section>
    );
};
