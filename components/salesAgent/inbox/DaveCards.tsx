/**
 * Dave's pending work on the open thread, docked right above the composer:
 * his drafted reply (approve / edit / discard) and his question (answer inline).
 * All behaviour comes in through props; these are presentation only.
 *
 * The card is outlined in the brand colour and labelled "not sent", so it can
 * never be mistaken for a message that went. Send is the full-width primary
 * at the bottom (thumb reach); Discard sits up in the header, away from it.
 */

import React, { useEffect, useRef } from 'react';
import Spinner from '../../common/Spinner';
import { PencilIcon, SparklesIcon, XMarkIcon } from '../../icons';
import { Button } from '../../ui';
import { controlFrame, controlInput } from '../../ui/cx';
import SendViaBar, { sendViaLabel, type SendViaChoice } from '../SendViaBar';
import { ChannelIcon } from './parts';

/** The send button is always the screen's one accent action; the route shows in its glyph and words. */
export const sendButtonClass = (_via: SendViaChoice): string =>
    'bg-accent text-on-accent hover:bg-accent-hover active:bg-accent-press';

export const SendRouteIcon: React.FC<{ via: SendViaChoice; className?: string }> = ({ via, className = 'h-4 w-4' }) => (
    via === 'both' ? (
        <span className="inline-flex items-center gap-0.5" aria-hidden>
            <ChannelIcon channel="email" className={className} />
            <ChannelIcon channel="whatsapp" className={className} />
        </span>
    ) : (
        <span aria-hidden className="inline-flex"><ChannelIcon channel={via} className={className} /></span>
    )
);

/** Dave's initial, the way the spec draws him: a small accent disc. */
const DaveDisc: React.FC<{ agentName: string }> = ({ agentName }) => (
    <span className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-full bg-accent font-mono text-sm font-bold leading-none text-on-accent" aria-hidden>
        {(agentName.trim()[0] || 'D').toUpperCase()}
    </span>
);

/** The shell both cards share: brand outline, e-2 lift, accent-soft header. */
const daveShell = 'overflow-hidden rounded-card border-[1.5px] border-accent bg-surface shadow-e2 lg:ms-auto lg:max-w-[34rem]';

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
        <section aria-label={`${agentName}'s draft reply`} className={daveShell}>
            <div className="flex items-center gap-2.5 bg-accent-soft py-1 pe-1 ps-3 text-accent-soft-ink">
                <DaveDisc agentName={agentName} />
                <p className="min-w-0 flex-1 truncate text-sm font-semibold">
                    {agentName}&rsquo;s draft
                    {source === 'instruction' && <span className="font-normal"> · from your prompt</span>}
                    <span className="font-normal"> · not sent</span>
                </p>
                <button
                    type="button"
                    onClick={onDiscard}
                    disabled={!!busy}
                    aria-label="Discard draft"
                    title="Discard draft"
                    className="grid h-12 w-12 flex-shrink-0 place-items-center rounded-control text-accent-soft-ink transition-colors duration-quick ease-out hover:bg-surface disabled:cursor-not-allowed disabled:text-ink-3 sm:h-10 sm:w-10"
                >
                    {busy === 'discard' ? <Spinner className="h-5 w-5" /> : <XMarkIcon className="h-5 w-5" />}
                </button>
            </div>

            {bounceWarning && (
                <p className="border-b border-line bg-danger-soft px-3 py-2 text-sm leading-5 text-danger-ink">
                    This may be a reply to the bounce notice, not the customer — read it before sending.
                </p>
            )}

            {open ? (
                <div className="space-y-2.5 px-3 pt-3">
                    <div className={`${controlFrame()} items-stretch`}>
                        <textarea
                            ref={boxRef}
                            rows={3}
                            value={text}
                            onChange={e => onText(e.target.value)}
                            aria-label={`The reply ${agentName} has drafted — edit it before sending if you like`}
                            className={`${controlInput} resize-none leading-[1.45]`}
                        />
                    </div>
                    <div className="flex items-center gap-2">
                        <div className={`${controlFrame()} min-w-0 flex-1`}>
                            <input
                                value={prompt}
                                onChange={e => onPrompt(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onRedo(); } }}
                                placeholder={`Tell ${agentName} what to change…`}
                                aria-label={`Your prompt to ${agentName} — amend it and run him again`}
                                className={controlInput}
                            />
                        </div>
                        <Button
                            type="button"
                            variant="secondary"
                            onClick={onRedo}
                            disabled={redoBusy || !!busy}
                            loading={redoBusy}
                            icon={<SparklesIcon />}
                            title={prompt.trim() ? `Run ${agentName} again with this prompt` : `Have ${agentName} take another go`}
                            className="flex-shrink-0"
                        >
                            Redo
                        </Button>
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
                    className="block w-full px-3 pt-3 text-start focus-visible:[outline-offset:-3px]"
                    aria-label="Open the draft to edit it"
                >
                    <span className="line-clamp-4 whitespace-pre-wrap text-base leading-[1.45] text-ink">
                        {text || `${agentName} drafted a reply`}
                    </span>
                </button>
            )}

            <div className="flex items-center gap-2 p-3">
                {open ? (
                    <Button type="button" variant="secondary" onClick={() => onOpen(false)} className="flex-shrink-0">
                        Done
                    </Button>
                ) : (
                    <Button type="button" variant="secondary" onClick={() => onOpen(true)} icon={<PencilIcon />} className="flex-shrink-0">
                        Edit
                    </Button>
                )}
                <Button
                    type="button"
                    variant={via === 'whatsapp' ? 'whatsapp' : 'primary'}
                    onClick={onApprove}
                    disabled={!text.trim() || !!busy}
                    loading={busy === 'approve'}
                    icon={<SendRouteIcon via={via} className="h-5 w-5" />}
                    className="min-w-0 flex-1"
                >
                    <span className="truncate">{sendViaLabel(via)}</span>
                </Button>
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
        <section aria-label={`${agentName} needs an answer`} className={daveShell}>
            <div className="flex min-h-[48px] items-center gap-2.5 bg-accent-soft px-3 text-accent-soft-ink">
                <DaveDisc agentName={agentName} />
                <p className="min-w-0 flex-1 truncate text-sm font-semibold">
                    {agentName} needs an answer
                </p>
            </div>
            <div className="px-3 pb-3 pt-3">
                <p className="text-base font-semibold leading-snug text-ink">{question}</p>
                {context && <p className="mt-1 text-sm leading-5 text-ink-2">{context}</p>}
                <div className="mt-3 flex items-end gap-2">
                    <div className={`${controlFrame()} min-w-0 flex-1 items-stretch`}>
                        <textarea
                            ref={boxRef}
                            rows={1}
                            value={answer}
                            onChange={e => { onAnswer(e.target.value); grow(e.target); }}
                            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend(); } }}
                            placeholder={`Your answer — ${agentName} phrases it`}
                            aria-label={`Your answer to ${agentName}`}
                            className={`${controlInput} resize-none`}
                        />
                    </div>
                    <Button
                        type="button"
                        onClick={onSend}
                        disabled={!answer.trim() || busy}
                        loading={busy}
                        className="flex-shrink-0"
                    >
                        Answer
                    </Button>
                </div>
            </div>
        </section>
    );
};
