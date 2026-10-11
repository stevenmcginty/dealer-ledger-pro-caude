import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Badge, Button } from '../ui';
import { ArrowPathIcon, ChevronLeftIcon, ExclamationTriangleIcon, PhoneIcon } from '../icons';
import {
    ConversationStage,
    STAGE_LABELS,
    simulateAgentTurn,
} from '../../services/salesAgentService';

interface SimMessage {
    id: number;
    from: 'customer' | 'agent';
    text: string;
    at: number;
}

const newSessionId = () => `sim-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const clockTime = (at: number) =>
    new Date(at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

/** The three dots WhatsApp shows while the other end is typing. */
const TypingBubble = () => (
    <div className="flex justify-start">
        <div className="rounded-[16px] rounded-es-[4px] bg-bubble-in px-4 py-3">
            <div className="flex items-center gap-1">
                {[0, 150, 300].map(delay => (
                    <span
                        key={delay}
                        className="h-2 w-2 rounded-full bg-ink-3 motion-safe:animate-bounce"
                        style={{ animationDelay: `${delay}ms` }}
                    />
                ))}
            </div>
        </div>
    </div>
);

/**
 * The agent, in a phone, before it is pointed at a real customer.
 *
 * Deliberately dressed as WhatsApp rather than as another panel in the app: the
 * thing being judged is whether the replies sound like a person on a phone, and
 * that is much harder to tell from a form. Nothing here touches the
 * conversations branch — the session id is thrown away when you press Reset.
 */
const AgentSimulator: React.FC<{ companyId: string; dealershipName?: string }> = ({
    companyId,
    dealershipName,
}) => {
    const [sessionId, setSessionId] = useState(newSessionId);
    const [messages, setMessages] = useState<SimMessage[]>([]);
    const [draft, setDraft] = useState('');
    const [waiting, setWaiting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [stage, setStage] = useState<ConversationStage | null>(null);
    const [escalated, setEscalated] = useState(false);
    const [handoff, setHandoff] = useState(false);

    const scrollRef = useRef<HTMLDivElement>(null);
    const nextId = useRef(1);

    useEffect(() => {
        const el = scrollRef.current;
        if (el) el.scrollTop = el.scrollHeight;
    }, [messages, waiting]);

    const reset = useCallback(() => {
        setSessionId(newSessionId());
        setMessages([]);
        setDraft('');
        setError(null);
        setStage(null);
        setEscalated(false);
        setHandoff(false);
        nextId.current = 1;
    }, []);

    const send = useCallback(async () => {
        const text = draft.trim();
        if (!text || waiting) return;

        setMessages(prev => [...prev, { id: nextId.current++, from: 'customer', text, at: Date.now() }]);
        setDraft('');
        setError(null);
        setWaiting(true);

        try {
            const turn = await simulateAgentTurn(companyId, text, sessionId);
            if (turn?.reply) {
                setMessages(prev => [...prev, { id: nextId.current++, from: 'agent', text: turn.reply, at: Date.now() }]);
            }
            if (turn?.stage) setStage(turn.stage);
            setEscalated(!!turn?.escalated);
            setHandoff(!!turn?.handoff);
        } catch (err: any) {
            setError(err?.message || 'The agent did not answer.');
        } finally {
            setWaiting(false);
        }
    }, [companyId, draft, sessionId, waiting]);

    const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            send();
        }
    };

    return (
        <div className="w-full max-w-sm">
            {/* ---- the handset -------------------------------------------- */}
            <div className="rounded-[2.5rem] border border-line-strong bg-bg p-3">
                <div className="relative overflow-hidden rounded-[2rem] bg-bg">
                    {/* notch */}
                    <div className="absolute left-1/2 top-0 z-20 h-6 w-32 -translate-x-1/2 rounded-b-2xl bg-bg" />

                    {/* header */}
                    <div className="relative z-10 flex items-center gap-3 border-b border-line bg-surface px-3 pb-3 pt-8">
                        <ChevronLeftIcon className="h-5 w-5 flex-shrink-0 text-ink-2" />
                        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-surface-3 font-mono text-sm font-bold text-ink">
                            {(dealershipName || 'RC').slice(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-ink">
                                {dealershipName || 'Radlett Car Sales'}
                            </p>
                            <p className="text-xs text-ink-3">{waiting ? 'typing…' : 'online'}</p>
                        </div>
                        <PhoneIcon className="h-5 w-5 flex-shrink-0 text-ink-2" />
                    </div>

                    {/* thread */}
                    <div
                        ref={scrollRef}
                        className="h-[26rem] space-y-2 overflow-y-auto px-3 py-4"
                        style={{
                            // The faint criss-cross WhatsApp puts behind messages, cheap enough
                            // to draw in CSS rather than ship a texture for.
                            backgroundImage:
                                'radial-gradient(circle at 25% 25%, rgb(var(--c-ink) / 0.03) 1px, transparent 1px), radial-gradient(circle at 75% 75%, rgb(var(--c-ink) / 0.03) 1px, transparent 1px)',
                            backgroundSize: '24px 24px',
                        }}
                    >
                        {!messages.length && !waiting && (
                            <div className="mx-auto mt-6 max-w-[15rem] rounded-control bg-surface-2 px-3 py-2 text-center">
                                <p className="text-sm leading-5 text-ink-2">
                                    Say something a customer would say. Try
                                    <span className="text-ink-2"> "is the black Focus still available?"</span>
                                </p>
                            </div>
                        )}

                        {messages.map(message => (
                            <div
                                key={message.id}
                                className={`flex ${message.from === 'customer' ? 'justify-end' : 'justify-start'}`}
                            >
                                <div
                                    className={`max-w-[80%] px-3 py-2 ${
                                        message.from === 'customer'
                                            ? 'rounded-[16px] rounded-ee-[4px] bg-bubble-out text-ink'
                                            : 'rounded-[16px] rounded-es-[4px] bg-bubble-in text-ink'
                                    }`}
                                >
                                    <p className="whitespace-pre-wrap break-words text-base leading-[1.4]">{message.text}</p>
                                    <p className="mt-1 text-end font-mono text-xs text-ink-3">{clockTime(message.at)}</p>
                                </div>
                            </div>
                        ))}

                        {waiting && <TypingBubble />}
                    </div>

                    {/* composer */}
                    <div className="flex items-center gap-2 border-t border-line bg-surface px-3 py-2">
                        <input
                            value={draft}
                            onChange={e => setDraft(e.target.value)}
                            onKeyDown={onKeyDown}
                            placeholder="Message"
                            aria-label="Message to the agent"
                            className="min-h-[44px] min-w-0 flex-1 rounded-full border border-line-strong bg-surface px-4 text-base text-ink placeholder:text-ink-3"
                        />
                        <button
                            onClick={send}
                            disabled={!draft.trim() || waiting}
                            aria-label="Send"
                            className="grid h-12 w-12 flex-shrink-0 place-items-center rounded-full bg-accent text-on-accent transition-colors duration-quick ease-out hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-ink-3"
                        >
                            <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5 rtl:-scale-x-100" aria-hidden>
                                <path d="M2.01 21 23 12 2.01 3 2 10l15 2-15 2z" />
                            </svg>
                        </button>
                    </div>
                </div>
            </div>

            {/* ---- what the agent decided, which the phone deliberately hides -- */}
            <div className="mt-4 space-y-3">
                {error && (
                    <div className="flex items-start gap-2 rounded-control border border-danger bg-danger-soft p-3 text-danger-ink">
                        <ExclamationTriangleIcon className="mt-0.5 h-4 w-4 flex-shrink-0" />
                        <p className="text-sm">{error}</p>
                    </div>
                )}

                <div className="flex flex-wrap items-center gap-2">
                    {stage && <Badge variant="primary">Stage: {STAGE_LABELS[stage] || stage}</Badge>}
                    {escalated && <Badge variant="warning">Would ping you</Badge>}
                    {handoff && <Badge variant="danger">Would hand over</Badge>}
                    <Button size="sm" variant="ghost" onClick={reset} className="ms-auto" icon={<ArrowPathIcon />}>
                        Reset
                    </Button>
                </div>
            </div>
        </div>
    );
};

export default AgentSimulator;
