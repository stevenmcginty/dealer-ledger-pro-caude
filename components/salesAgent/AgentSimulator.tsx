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
        <div className="rounded-2xl rounded-tl-sm bg-[#202c33] px-4 py-3 shadow">
            <div className="flex items-center gap-1">
                {[0, 150, 300].map(delay => (
                    <span
                        key={delay}
                        className="h-2 w-2 rounded-full bg-gray-400 animate-bounce"
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
            <div className="rounded-[2.5rem] bg-gray-950 p-3 shadow-2xl shadow-black/60 ring-1 ring-gray-700/60">
                <div className="relative overflow-hidden rounded-[2rem] bg-[#0b141a]">
                    {/* notch */}
                    <div className="absolute left-1/2 top-0 z-20 h-6 w-32 -translate-x-1/2 rounded-b-2xl bg-gray-950" />

                    {/* header */}
                    <div className="relative z-10 flex items-center gap-3 bg-[#075e54] px-3 pb-3 pt-8">
                        <ChevronLeftIcon className="h-5 w-5 text-white/80 flex-shrink-0" />
                        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-white/20 text-sm font-semibold text-white">
                            {(dealershipName || 'RC').slice(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-white">
                                {dealershipName || 'Radlett Car Sales'}
                            </p>
                            <p className="text-[11px] text-white/70">{waiting ? 'typing…' : 'online'}</p>
                        </div>
                        <PhoneIcon className="h-5 w-5 text-white/80 flex-shrink-0" />
                    </div>

                    {/* thread */}
                    <div
                        ref={scrollRef}
                        className="h-[26rem] space-y-2 overflow-y-auto px-3 py-4"
                        style={{
                            // The faint criss-cross WhatsApp puts behind messages, cheap enough
                            // to draw in CSS rather than ship a texture for.
                            backgroundImage:
                                'radial-gradient(circle at 25% 25%, rgba(255,255,255,0.03) 1px, transparent 1px), radial-gradient(circle at 75% 75%, rgba(255,255,255,0.03) 1px, transparent 1px)',
                            backgroundSize: '24px 24px',
                        }}
                    >
                        {!messages.length && !waiting && (
                            <div className="mx-auto mt-6 max-w-[15rem] rounded-lg bg-[#182229] px-3 py-2 text-center">
                                <p className="text-[11px] leading-relaxed text-gray-400">
                                    Say something a customer would say. Try
                                    <span className="text-gray-300"> "is the black Focus still available?"</span>
                                </p>
                            </div>
                        )}

                        {messages.map(message => (
                            <div
                                key={message.id}
                                className={`flex ${message.from === 'customer' ? 'justify-end' : 'justify-start'}`}
                            >
                                <div
                                    className={`max-w-[80%] px-3 py-2 shadow ${
                                        message.from === 'customer'
                                            ? 'rounded-2xl rounded-tr-sm bg-[#005c4b] text-white'
                                            : 'rounded-2xl rounded-tl-sm bg-[#202c33] text-gray-100'
                                    }`}
                                >
                                    <p className="whitespace-pre-wrap break-words text-sm leading-snug">{message.text}</p>
                                    <p className="mt-1 text-right text-[10px] text-white/50">{clockTime(message.at)}</p>
                                </div>
                            </div>
                        ))}

                        {waiting && <TypingBubble />}
                    </div>

                    {/* composer */}
                    <div className="flex items-center gap-2 bg-[#111b21] px-3 py-3">
                        <input
                            value={draft}
                            onChange={e => setDraft(e.target.value)}
                            onKeyDown={onKeyDown}
                            placeholder="Message"
                            aria-label="Message to the agent"
                            className="min-w-0 flex-1 rounded-full bg-[#2a3942] px-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-600/40"
                        />
                        <button
                            onClick={send}
                            disabled={!draft.trim() || waiting}
                            aria-label="Send"
                            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-[#00a884] text-white transition-opacity disabled:opacity-40"
                        >
                            <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
                                <path d="M2.01 21 23 12 2.01 3 2 10l15 2-15 2z" />
                            </svg>
                        </button>
                    </div>
                </div>
            </div>

            {/* ---- what the agent decided, which the phone deliberately hides -- */}
            <div className="mt-4 space-y-3">
                {error && (
                    <div className="flex items-start gap-2 rounded-lg bg-red-900/40 p-3">
                        <ExclamationTriangleIcon className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-400" />
                        <p className="text-sm text-gray-300">{error}</p>
                    </div>
                )}

                <div className="flex flex-wrap items-center gap-2">
                    {stage && <Badge variant="primary">Stage: {STAGE_LABELS[stage] || stage}</Badge>}
                    {escalated && <Badge variant="warning">Would ping you</Badge>}
                    {handoff && <Badge variant="danger">Would hand over</Badge>}
                    <Button size="sm" variant="ghost" onClick={reset} className="ml-auto">
                        <ArrowPathIcon className="h-4 w-4" />
                        Reset
                    </Button>
                </div>
            </div>
        </div>
    );
};

export default AgentSimulator;
