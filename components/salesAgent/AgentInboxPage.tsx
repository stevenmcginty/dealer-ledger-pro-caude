import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useData } from '../../hooks/useData';
import { useUI } from '../../hooks/useUI';
import { Badge, Button, EmptyState, useToast } from '../ui';
import Spinner from '../common/Spinner';
import {
    ArrowLeftIcon,
    ArrowTopRightOnSquareIcon,
    CarIcon,
    ChatBubbleLeftRightIcon,
    EnvelopeIcon,
    ExclamationTriangleIcon,
    InboxIcon,
    PhoneIcon,
    SparklesIcon,
} from '../icons';
import {
    AgentMessage,
    CHANNEL_LABELS,
    Channel,
    Conversation,
    ConversationMode,
    MODE_LABELS,
    STAGE_LABELS,
    answerAgentQuestion,
    conversationName,
    formatAgentTime,
    instructAgent,
    instructionText,
    markConversationRead,
    sendAgentReply,
    setConversationMode,
    subscribeToAgentConversations,
    subscribeToAgentMessages,
    subscribeToSalesAgentSettings,
} from '../../services/salesAgentService';
import {
    onAgentConversationRequest,
    takeConversationFromUrl,
    takeRequestedConversation,
} from '../../utils/agentInboxLink';

const CHANNEL_ICONS: Record<Channel, React.ComponentType<{ className?: string }>> = {
    whatsapp: ChatBubbleLeftRightIcon,
    sms: PhoneIcon,
    email: EnvelopeIcon,
};

const MODE_VARIANT: Record<ConversationMode, 'primary' | 'success' | 'warning'> = {
    agent: 'primary',
    human: 'success',
    paused: 'warning',
};

/** One line in the list. Everything on it answers "does this need me?". */
const ConversationRow: React.FC<{
    conv: Conversation;
    active: boolean;
    onClick: () => void;
}> = ({ conv, active, onClick }) => {
    const ChannelIcon = CHANNEL_ICONS[conv.channel] || ChatBubbleLeftRightIcon;
    const waiting = !!conv.pendingQuestion;

    return (
        <button
            onClick={onClick}
            className={`w-full text-left px-4 py-3 border-l-2 transition-colors ${
                active
                    ? 'bg-gray-700/60 border-brand-500'
                    : waiting
                        ? 'bg-amber-950/30 border-amber-500/70 hover:bg-amber-950/50'
                        : conv.escalated
                            ? 'bg-red-950/25 border-red-500/60 hover:bg-red-950/40'
                            : 'border-transparent hover:bg-gray-700/40'
            }`}
        >
            <div className="flex items-center gap-2">
                <ChannelIcon className="h-4 w-4 flex-shrink-0 text-gray-400" />
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-white">
                    {conversationName(conv)}
                </span>
                <span className="flex-shrink-0 font-mono text-xs text-gray-500">#{conv.shortId}</span>
                {!!conv.unread && (
                    <span className="flex h-5 min-w-[1.25rem] flex-shrink-0 items-center justify-center rounded-full bg-brand-500 px-1.5 text-[11px] font-bold text-white">
                        {conv.unread}
                    </span>
                )}
            </div>

            <p className="mt-1 truncate text-xs text-gray-400">
                {conv.vehicleInterest?.title || conv.summary || conv.address}
            </p>

            <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {waiting && <Badge size="sm" variant="warning">❓ waiting on you</Badge>}
                {conv.escalated && !waiting && <Badge size="sm" variant="danger">Escalated</Badge>}
                <Badge size="sm" variant={MODE_VARIANT[conv.mode] || 'default'}>{MODE_LABELS[conv.mode] || conv.mode}</Badge>
                <Badge size="sm" variant="default">{STAGE_LABELS[conv.stage] || conv.stage}</Badge>
                <span className="ml-auto text-[11px] text-gray-500">{formatAgentTime(conv.updatedAt)}</span>
            </div>
        </button>
    );
};

/** A message in the thread. The customer is on the left, this side on the right. */
const MessageBubble: React.FC<{ message: AgentMessage; agentName: string }> = ({ message, agentName }) => {
    const mine = message.from !== 'customer';
    const fromOwner = message.from === 'owner';
    const instruction = instructionText(message);

    // What you told the agent to say never went to the customer, so it is not a message
    // in the thread — it is a note about one, and it reads as one.
    if (instruction) {
        return (
            <div className="flex justify-center">
                <p className="max-w-[85%] text-center text-[11px] leading-relaxed text-gray-500">
                    <span className="font-medium text-gray-400">You told {agentName}:</span> {instruction}
                </p>
            </div>
        );
    }

    return (
        <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
            <div className="max-w-[75%]">
                {mine && (
                    <p className={`mb-0.5 text-right text-[11px] font-medium ${fromOwner ? 'text-emerald-400' : 'text-brand-400'}`}>
                        {fromOwner ? 'You' : 'Agent'}
                    </p>
                )}
                <div
                    className={`rounded-2xl px-4 py-2.5 shadow ${
                        !mine
                            ? 'rounded-tl-sm bg-gray-700 text-gray-100'
                            : fromOwner
                                ? 'rounded-tr-sm bg-emerald-700 text-white'
                                : 'rounded-tr-sm bg-brand-600 text-white'
                    }`}
                >
                    {message.subject && (
                        <p className="mb-1 border-b border-white/20 pb-1 text-xs font-semibold opacity-80">
                            {message.subject}
                        </p>
                    )}
                    <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{message.text}</p>
                </div>
                <p className={`mt-1 text-[11px] text-gray-500 ${mine ? 'text-right' : ''}`}>
                    {formatAgentTime(message.createdAt)}
                </p>
            </div>
        </div>
    );
};

/**
 * Everything the agent is in the middle of, and the way in when it needs you.
 *
 * The list is sorted by whatever happened last rather than by who arrived
 * first, because the only question worth asking of this screen is "what is
 * waiting on me right now". Conversations the agent has stopped on — it asked
 * you something, or it escalated — are coloured so they read before the rest.
 */
const AgentInboxPage = () => {
    const { companyId, leads, setSelectedLeadId } = useData();
    const { setView } = useUI();
    const toast = useToast();

    const [conversations, setConversations] = useState<Conversation[] | null>(null);
    const [activeId, setActiveId] = useState<string | null>(null);
    const [messages, setMessages] = useState<AgentMessage[]>([]);
    const [reply, setReply] = useState('');
    const [sending, setSending] = useState(false);
    const [answer, setAnswer] = useState('');
    const [answering, setAnswering] = useState(false);
    const [changingMode, setChangingMode] = useState(false);
    const [agentName, setAgentName] = useState('Dave');

    // What the box does: 'human' sends your words as they are, 'agent' hands them to the
    // agent to word itself. Which one it starts on follows who is answering.
    const [replyMode, setReplyMode] = useState<'human' | 'agent'>('agent');
    // Set while the agent is turning an instruction into a message. Cleared by the
    // outbound message landing in the thread, which can be a minute after the fact.
    const [phrasingSince, setPhrasingSince] = useState<number | null>(null);

    const threadRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!companyId) return;
        return subscribeToAgentConversations(companyId, setConversations);
    }, [companyId]);

    useEffect(() => {
        if (!companyId) return;
        return subscribeToSalesAgentSettings(companyId, settings => setAgentName(settings.agentName || 'Dave'));
    }, [companyId]);

    // A tapped owner alert names the conversation it was about: on the URL when
    // the notification opened the app cold, handed straight across when a toast
    // was clicked with the app already running. Either beats the default below.
    const linkHandled = useRef(false);
    useEffect(() => {
        if (linkHandled.current) return;
        linkHandled.current = true;
        const convId = takeRequestedConversation() || takeConversationFromUrl();
        if (convId) setActiveId(convId);
    }, []);

    // And while the inbox is the view already on screen, there is no mount to
    // pick anything up on.
    useEffect(() => onAgentConversationRequest(setActiveId), []);

    const active = useMemo(
        () => conversations?.find(c => c.id === activeId) || null,
        [conversations, activeId]
    );

    // On a wide screen an empty right-hand pane is wasted, so land on whatever
    // is at the top of the list. On a phone the list is the whole screen and
    // nothing should be picked for you.
    useEffect(() => {
        if (activeId || !conversations?.length) return;
        if (typeof window !== 'undefined' && window.innerWidth < 1024) return;
        setActiveId(conversations[0].id);
    }, [conversations, activeId]);

    useEffect(() => {
        if (!companyId || !activeId) {
            setMessages([]);
            return;
        }
        setReply('');
        setAnswer('');
        setPhrasingSince(null);
        markConversationRead(companyId, activeId).catch(() => {
            // Not being able to clear the badge is not worth interrupting anyone over.
        });
        return subscribeToAgentMessages(companyId, activeId, setMessages);
    }, [companyId, activeId]);

    // Telling the agent what to say is the obvious thing to do while it is the one
    // answering. Once you have taken over, the box is yours again.
    useEffect(() => {
        setReplyMode(active?.mode === 'agent' ? 'agent' : 'human');
    }, [activeId, active?.mode]);

    useEffect(() => {
        if (!phrasingSince) return;
        if (messages.some(m => m.direction === 'out' && m.from === 'agent' && (m.createdAt || 0) >= phrasingSince)) {
            setPhrasingSince(null);
        }
    }, [messages, phrasingSince]);

    // The reply is queued rather than sent, and the agent is allowed to decide that the
    // right move is to say nothing at all. Either way this should not sit there forever.
    useEffect(() => {
        if (!phrasingSince) return;
        const timer = window.setTimeout(() => setPhrasingSince(null), 180_000);
        return () => window.clearTimeout(timer);
    }, [phrasingSince]);

    useEffect(() => {
        const el = threadRef.current;
        if (el) el.scrollTop = el.scrollHeight;
    }, [messages]);

    const handleMode = useCallback(async (mode: ConversationMode) => {
        if (!companyId || !active) return;
        setChangingMode(true);
        try {
            await setConversationMode(companyId, active.id, mode);
            toast.success(
                mode === 'human' ? 'You are answering this one now.'
                    : mode === 'agent' ? 'Handed back to the agent.'
                        : 'Paused. Nothing will be sent until you resume.'
            );
        } catch (err: any) {
            toast.error(err?.message || 'Could not change who is answering.');
        } finally {
            setChangingMode(false);
        }
    }, [companyId, active, toast]);

    const handleSend = useCallback(async () => {
        const text = reply.trim();
        if (!companyId || !active || !text || sending) return;
        setSending(true);
        try {
            await sendAgentReply(companyId, active.id, text);
            setReply('');
        } catch (err: any) {
            toast.error(err?.message || 'That message was not sent.');
        } finally {
            setSending(false);
        }
    }, [companyId, active, reply, sending, toast]);

    /**
     * Hand the agent the substance and let it do the wording. Nothing goes out here and
     * now: it queues a reply the way it would for a customer message, so the thread stays
     * in the agent's voice and at the agent's pace.
     */
    const handleInstruct = useCallback(async () => {
        const text = reply.trim();
        if (!companyId || !active || !text || sending) return;
        setSending(true);
        setPhrasingSince(Date.now());
        try {
            await instructAgent(companyId, active.id, text);
            setReply('');
        } catch (err: any) {
            setPhrasingSince(null);
            toast.error(err?.message || `Could not pass that on to ${agentName}.`);
        } finally {
            setSending(false);
        }
    }, [companyId, active, reply, sending, toast, agentName]);

    const handleAnswer = useCallback(async () => {
        const text = answer.trim();
        if (!companyId || !active || !text || answering) return;
        setAnswering(true);
        try {
            await answerAgentQuestion(companyId, active.id, text);
            setAnswer('');
            toast.success('Sent back to the agent — it will put that in its own words.');
        } catch (err: any) {
            toast.error(err?.message || 'Could not pass that answer back to the agent.');
        } finally {
            setAnswering(false);
        }
    }, [companyId, active, answer, answering, toast]);

    const openLead = useCallback(() => {
        const leadId = active?.contact?.leadId;
        if (!leadId) return;
        setSelectedLeadId(leadId);
        setView('leadDetail');
    }, [active, setSelectedLeadId, setView]);

    const linkedLead = useMemo(
        () => leads.find(l => l.id === active?.contact?.leadId) || null,
        [leads, active]
    );

    const waitingCount = useMemo(
        () => (conversations || []).filter(c => c.pendingQuestion).length,
        [conversations]
    );

    if (!companyId || conversations === null) {
        return (
            <div className="flex items-center justify-center py-24">
                <Spinner className="h-8 w-8 text-brand-500" />
            </div>
        );
    }

    if (!conversations.length) {
        return (
            <EmptyState
                icon={<InboxIcon className="w-12 h-12" />}
                title="No enquiries yet"
                description="When somebody messages on WhatsApp, texts, or emails, the agent answers here and you can step in at any point."
            />
        );
    }

    const ChannelIcon = active ? (CHANNEL_ICONS[active.channel] || ChatBubbleLeftRightIcon) : ChatBubbleLeftRightIcon;

    return (
        <div className="space-y-4">
            {waitingCount > 0 && (
                <div className="flex items-center gap-3 rounded-xl border border-amber-500/40 bg-amber-950/30 px-4 py-3">
                    <SparklesIcon className="h-5 w-5 flex-shrink-0 text-amber-400" />
                    <p className="text-sm text-amber-200">
                        The agent is waiting on you in {waitingCount === 1 ? 'one conversation' : `${waitingCount} conversations`}.
                        It has stopped replying there until you answer.
                    </p>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-[22rem_1fr] gap-4">
                {/* ---- list ------------------------------------------------ */}
                <div className={`rounded-xl border border-gray-700/50 bg-gray-800/60 overflow-hidden ${active ? 'hidden lg:block' : ''}`}>
                    <div className="border-b border-gray-700/50 px-4 py-3">
                        <h2 className="text-sm font-semibold text-white">
                            {conversations.length} {conversations.length === 1 ? 'conversation' : 'conversations'}
                        </h2>
                    </div>
                    <div className="max-h-[70vh] divide-y divide-gray-700/40 overflow-y-auto">
                        {conversations.map(conv => (
                            <ConversationRow
                                key={conv.id}
                                conv={conv}
                                active={conv.id === activeId}
                                onClick={() => setActiveId(conv.id)}
                            />
                        ))}
                    </div>
                </div>

                {/* ---- detail ---------------------------------------------- */}
                {active ? (
                    <div className="flex flex-col rounded-xl border border-gray-700/50 bg-gray-800/60 overflow-hidden">
                        {/* header */}
                        <div className="border-b border-gray-700/50 px-4 py-3">
                            <div className="flex items-start gap-3">
                                <button
                                    onClick={() => setActiveId(null)}
                                    className="lg:hidden mt-0.5 text-gray-400 hover:text-white"
                                    aria-label="Back to the list"
                                >
                                    <ArrowLeftIcon className="h-5 w-5" />
                                </button>
                                <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <ChannelIcon className="h-4 w-4 text-gray-400" />
                                        <h2 className="truncate text-lg font-semibold text-white">{conversationName(active)}</h2>
                                        <span className="font-mono text-xs text-gray-500">#{active.shortId}</span>
                                        <Badge size="sm" variant={MODE_VARIANT[active.mode] || 'default'}>
                                            {MODE_LABELS[active.mode] || active.mode}
                                        </Badge>
                                        <Badge size="sm" variant="default">{STAGE_LABELS[active.stage] || active.stage}</Badge>
                                        {active.escalated && <Badge size="sm" variant="danger">Escalated</Badge>}
                                    </div>
                                    <p className="mt-1 text-xs text-gray-500">
                                        {CHANNEL_LABELS[active.channel] || active.channel} · {active.address}
                                        {active.originChannel !== active.channel && ` · came in on ${CHANNEL_LABELS[active.originChannel] || active.originChannel}`}
                                    </p>
                                </div>
                            </div>

                            {/* what this conversation is about */}
                            <div className="mt-3 flex flex-wrap items-center gap-2">
                                {active.vehicleInterest?.title && (
                                    <span className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900/60 px-2.5 py-1 text-xs text-gray-300">
                                        <CarIcon className="h-3.5 w-3.5 text-brand-400" />
                                        {active.vehicleInterest.title}
                                    </span>
                                )}
                                {active.partExOrFinance && (
                                    <span className="rounded-lg bg-gray-900/60 px-2.5 py-1 text-xs text-gray-300">
                                        {active.partExOrFinance}
                                    </span>
                                )}
                                {active.preferredTime && (
                                    <span className="rounded-lg bg-gray-900/60 px-2.5 py-1 text-xs text-gray-300">
                                        Prefers {active.preferredTime}
                                    </span>
                                )}
                                {active.booking && (
                                    <span className="rounded-lg bg-emerald-900/40 px-2.5 py-1 text-xs text-emerald-300">
                                        Booked {active.booking.window}
                                    </span>
                                )}
                                {active.contact?.leadId && (
                                    <button
                                        onClick={openLead}
                                        className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900/60 px-2.5 py-1 text-xs text-brand-400 hover:text-brand-300"
                                    >
                                        <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5" />
                                        {linkedLead
                                            ? `Lead: ${[linkedLead.firstName, linkedLead.lastName].filter(Boolean).join(' ') || 'open'}`
                                            : 'Open CRM lead'}
                                    </button>
                                )}
                            </div>

                            {/* who answers */}
                            <div className="mt-3 flex flex-wrap gap-2">
                                {active.mode !== 'human' && (
                                    <Button size="sm" variant="secondary" onClick={() => handleMode('human')} disabled={changingMode}>
                                        Take over
                                    </Button>
                                )}
                                {active.mode !== 'agent' && (
                                    <Button size="sm" variant="primary" onClick={() => handleMode('agent')} disabled={changingMode}>
                                        Hand back to agent
                                    </Button>
                                )}
                                {active.mode !== 'paused' && (
                                    <Button size="sm" variant="ghost" onClick={() => handleMode('paused')} disabled={changingMode}>
                                        Pause
                                    </Button>
                                )}
                            </div>
                        </div>

                        {/* the agent has stopped and wants an answer */}
                        {active.pendingQuestion && (
                            <div className="border-b border-amber-500/40 bg-amber-950/40 px-4 py-4">
                                <div className="flex items-start gap-3">
                                    <SparklesIcon className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-400" />
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm font-semibold text-amber-200">Agent is asking you</p>
                                        <p className="mt-1 text-sm text-gray-100">{active.pendingQuestion.question}</p>
                                        {active.pendingQuestion.context && (
                                            <p className="mt-1 text-xs text-gray-400">{active.pendingQuestion.context}</p>
                                        )}
                                        <p className="mt-1 text-[11px] text-gray-500">
                                            Asked {formatAgentTime(active.pendingQuestion.askedAt)} · the customer is waiting
                                        </p>
                                        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                                            <input
                                                value={answer}
                                                onChange={e => setAnswer(e.target.value)}
                                                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAnswer(); } }}
                                                placeholder="Answer in your own words — the agent will phrase it"
                                                aria-label="Your answer to the agent"
                                                className="min-w-0 flex-1 rounded-lg border border-amber-500/40 bg-gray-900/70 px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-amber-500/40"
                                            />
                                            <Button
                                                size="sm"
                                                variant="primary"
                                                onClick={handleAnswer}
                                                loading={answering}
                                                disabled={!answer.trim() || answering}
                                            >
                                                Send answer
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {active.escalated && active.escalationReason && !active.pendingQuestion && (
                            <div className="flex items-start gap-3 border-b border-red-500/30 bg-red-950/30 px-4 py-3">
                                <ExclamationTriangleIcon className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-400" />
                                <p className="text-sm text-gray-200">{active.escalationReason}</p>
                            </div>
                        )}

                        {/* thread */}
                        <div ref={threadRef} className="min-h-[20rem] max-h-[50vh] space-y-4 overflow-y-auto px-4 py-4">
                            {messages.length ? (
                                messages.map(message => (
                                    <MessageBubble key={message.id} message={message} agentName={agentName} />
                                ))
                            ) : (
                                <p className="py-8 text-center text-sm text-gray-500">Nothing said yet.</p>
                            )}
                        </div>

                        {/* reply */}
                        <div className="border-t border-gray-700/50 px-4 py-3">
                            {/* Two different things to do with the same box: say it yourself, or
                                say what you want said and let the agent write it. */}
                            <div className="mb-2 inline-flex rounded-lg border border-gray-700 bg-gray-900/50 p-0.5">
                                {([
                                    ['human', 'Send as me'],
                                    ['agent', `Tell ${agentName} what to say`],
                                ] as const).map(([value, label]) => (
                                    <button
                                        key={value}
                                        type="button"
                                        onClick={() => setReplyMode(value)}
                                        aria-pressed={replyMode === value}
                                        className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                                            replyMode === value
                                                ? 'bg-brand-600 text-white'
                                                : 'text-gray-400 hover:text-white'
                                        }`}
                                    >
                                        {label}
                                    </button>
                                ))}
                            </div>

                            <p className="mb-2 text-xs text-gray-500">
                                {replyMode === 'agent'
                                    ? `Type the gist of it. ${agentName} puts it in his own words and carries on from there.`
                                    : active.mode === 'agent'
                                        ? 'The agent is answering this one. Anything you send goes out as you, and the agent keeps going — take over first if you want it to stop.'
                                        : `This goes to the customer exactly as you type it, on ${CHANNEL_LABELS[active.channel] || active.channel}.`}
                            </p>

                            {phrasingSince && (
                                <p className="mb-2 flex items-center gap-2 text-xs text-brand-300">
                                    <Spinner className="h-3.5 w-3.5" />
                                    {agentName} is phrasing that…
                                </p>
                            )}

                            <div className="flex items-end gap-2">
                                <textarea
                                    rows={2}
                                    value={reply}
                                    onChange={e => setReply(e.target.value)}
                                    onKeyDown={e => {
                                        if (e.key === 'Enter' && !e.shiftKey) {
                                            e.preventDefault();
                                            if (replyMode === 'agent') handleInstruct(); else handleSend();
                                        }
                                    }}
                                    placeholder={replyMode === 'agent'
                                        ? `Tell ${agentName} what to say, for example "we can do Saturday 11 but not before"`
                                        : `Reply on ${CHANNEL_LABELS[active.channel] || active.channel}…`}
                                    aria-label={replyMode === 'agent' ? `What to tell ${agentName} to say` : 'Your reply to the customer'}
                                    className="min-w-0 flex-1 resize-none rounded-lg border border-gray-700 bg-gray-900/50 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/50"
                                />
                                <Button
                                    onClick={replyMode === 'agent' ? handleInstruct : handleSend}
                                    loading={sending}
                                    disabled={!reply.trim() || sending}
                                >
                                    {replyMode === 'agent' ? `Tell ${agentName}` : 'Send'}
                                </Button>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="hidden lg:flex items-center justify-center rounded-xl border border-gray-700/50 bg-gray-800/40">
                        <p className="text-sm text-gray-500">Pick a conversation.</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default AgentInboxPage;
