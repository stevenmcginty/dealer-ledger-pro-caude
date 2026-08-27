import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useData } from '../../hooks/useData';
import { useUI } from '../../hooks/useUI';
import { Badge, Button, useToast } from '../ui';
import Spinner from '../common/Spinner';
import Modal from '../common/Modal';
import {
    ArrowLeftIcon,
    ArrowTopRightOnSquareIcon,
    CarIcon,
    ChevronDownIcon,
    EllipsisVerticalIcon,
    EnvelopeIcon,
    ExclamationTriangleIcon,
    MagnifyingGlassIcon,
    PaperClipIcon,
    PhoneIcon,
    PlusIcon,
    SparklesIcon,
    TrashIcon,
    WhatsAppIcon,
    XMarkIcon,
} from '../icons';
import {
    AgentMessage,
    CHANNEL_LABELS,
    Channel,
    Conversation,
    ConversationMode,
    STAGE_LABELS,
    SharedInboxMeta,
    answerAgentQuestion,
    approveAgentDraft,
    approvedSendMessage,
    bounceNoticeText,
    conversationEmail,
    conversationName,
    conversationPhone,
    deleteAgentConversation,
    deleteAgentMessage,
    discardAgentDraft,
    formatAgentTime,
    instructAgent,
    instructionText,
    markConversationRead,
    MessageMedia,
    sendAgentReply,
    SendVia,
    setConversationMode,
    subscribeToAgentConversations,
    subscribeToAgentConversationsAcross,
    subscribeToAgentMessages,
    subscribeToSalesAgentSettings,
    subscribeToSharedInbox,
    uploadWhatsAppFile,
} from '../../services/salesAgentService';
import {
    onAgentConversationRequest,
    takeConversationFromUrl,
    takeRequestedConversation,
} from '../../utils/agentInboxLink';
import {
    CustomerGroup,
    InboxFilter,
    conversationRefKey,
    conversationsForFilter,
    groupConversations,
    groupHasChannel,
} from '../../utils/agentInboxGroups';
import { dismissConversationNotifications } from '../../utils/inboxNotify';
import {
    WHATSAPP_ACCEPT,
    classifyWhatsAppFile,
    describeWhatsAppFileError,
    describeWhatsAppPickError,
    prepareWhatsAppFile,
} from '../../utils/whatsappMedia';
import StartWhatsAppSheet from './StartWhatsAppSheet';
import { displayUkPhone, phoneFromThread, threadLooksBounced } from '../../utils/agentInboxBounce';

const whatsappOpener = (firstName?: string, vehicleTitle?: string): string => {
    const name = (firstName || 'there').trim() || 'there';
    const vehicle = (vehicleTitle || 'car').trim() || 'car';
    return `Hi ${name}, thanks for enquiring about the ${vehicle}. It's still available. Would you like any more details, or to arrange a viewing or test drive?`;
};

const defaultSendVia = (conv: Conversation): Exclude<SendVia, 'auto'> => {
    const phone = conversationPhone(conv) || phoneFromThread(conv);
    if (threadLooksBounced(conv) && phone) return 'whatsapp';
    if (conv.channel === 'whatsapp' && phone) return 'whatsapp';
    return 'email';
};

const homeOf = (conv: Conversation, fallback: string): string => conv.companyId || fallback;

/** A failure shown under the compose bar: plain English up front, the technical bit behind a toggle. */
type InlineError = { message: string; detail?: string };

const describeError = (err: any, fallback: string): InlineError => {
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

const ComposeError: React.FC<{ error: InlineError; onDismiss: () => void }> = ({ error, onDismiss }) => {
    const [open, setOpen] = useState(false);
    return (
        <div role="alert" className="mb-2 rounded-xl border border-red-400/25 bg-red-950/40 px-3 py-2 text-[13px] leading-snug text-red-100">
            <div className="flex items-start gap-2">
                <ExclamationTriangleIcon className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-300" />
                <p className="min-w-0 flex-1">{error.message}</p>
                <button type="button" onClick={onDismiss} aria-label="Dismiss" className="-mr-1 -mt-0.5 flex-shrink-0 rounded-full p-1 text-red-200/70 hover:bg-white/10 hover:text-white">
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

const Disclosure: React.FC<{ label: string; children: React.ReactNode; className?: string }> = ({ label, children, className }) => {
    const [open, setOpen] = useState(false);
    return (
        <div className={className}>
            <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open} className="inline-flex items-center gap-1 text-[11px] font-medium text-[#8696a0] hover:text-white">
                {label}
                <ChevronDownIcon className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>
            {open && children}
        </div>
    );
};

const MenuItem: React.FC<{ onClick: () => void; disabled?: boolean; danger?: boolean; children: React.ReactNode }> = ({ onClick, disabled, danger, children }) => (
    <button
        type="button"
        role="menuitem"
        onClick={onClick}
        disabled={disabled}
        className={`flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm disabled:opacity-40 ${
            danger ? 'text-red-300 hover:bg-red-500/10' : 'text-[#e9edef] hover:bg-white/5'
        }`}
    >
        {children}
    </button>
);

const ChannelChip: React.FC<{ channel: Channel; compact?: boolean }> = ({ channel, compact }) => {
    if (channel === 'whatsapp') {
        return (
            <span className="inline-flex items-center gap-1 rounded-full bg-[#25d366]/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#25d366]">
                <WhatsAppIcon className="h-3 w-3" />
                {compact ? null : 'WhatsApp'}
            </span>
        );
    }
    if (channel === 'email') {
        return (
            <span className="inline-flex items-center gap-1 rounded-full bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-300">
                <EnvelopeIcon className="h-3 w-3" />
                {compact ? null : 'Email'}
            </span>
        );
    }
    if (channel === 'sms') {
        return (
            <span className="inline-flex items-center gap-1 rounded-full bg-violet-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-300">
                <PhoneIcon className="h-3 w-3" />
                {compact ? null : 'SMS'}
            </span>
        );
    }
    return null;
};

const initials = (name: string): string => {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return name.slice(0, 2).toUpperCase() || '?';
};

const avatarTone = (name: string, whatsapp: boolean): string => {
    if (whatsapp) return 'bg-[#075e54] text-[#d1f4de]';
    const tones = ['bg-sky-800 text-sky-100', 'bg-indigo-800 text-indigo-100', 'bg-slate-700 text-white'];
    return tones[name.split('').reduce((n, c) => n + c.charCodeAt(0), 0) % tones.length];
};

const GroupRow: React.FC<{
    group: CustomerGroup;
    active: boolean;
    onClick: () => void;
}> = ({ group, active, onClick }) => {
    const wa = group.channels.includes('whatsapp');

    return (
        <button
            type="button"
            onClick={onClick}
            className={`flex w-full items-center gap-3 px-3 py-3 text-left transition-colors ${
                active
                    ? 'bg-[#2a3942]'
                    : group.waiting || group.pending
                        ? 'bg-amber-950/25 hover:bg-amber-950/40'
                        : 'hover:bg-white/[0.04]'
            }`}
        >
            <div className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full text-sm font-semibold ${avatarTone(group.name, wa)}`}>
                {initials(group.name)}
            </div>
            <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                    <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-[#e9edef]">{group.name}</span>
                    <span className={`flex-shrink-0 text-[11px] ${group.unread ? 'font-semibold text-[#25d366]' : 'text-[#8696a0]'}`}>
                        {formatAgentTime(group.updatedAt)}
                    </span>
                </div>
                <p className={`mt-0.5 truncate text-[13px] ${group.unread ? 'font-medium text-[#e9edef]' : 'text-[#8696a0]'}`}>
                    {group.preview || 'No messages yet'}
                </p>
                <div className="mt-1.5 flex flex-wrap items-center gap-1">
                    {group.channels.map(ch => <ChannelChip key={ch} channel={ch} compact />)}
                    {group.shared && (
                        <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] font-medium text-[#8696a0]">Shared</span>
                    )}
                    {group.waiting && <span className="text-[10px] font-medium text-amber-300">Needs you</span>}
                    {group.pending && !group.waiting && <span className="text-[10px] font-medium text-amber-300">Draft</span>}
                </div>
            </div>
            {group.unread > 0 && (
                <span className="flex h-5 min-w-[1.25rem] flex-shrink-0 items-center justify-center rounded-full bg-[#25d366] px-1.5 text-[11px] font-bold text-[#111b21]">
                    {group.unread > 99 ? '99+' : group.unread}
                </span>
            )}
        </button>
    );
};

const MessageBubble: React.FC<{
    message: AgentMessage;
    agentName: string;
    mixed: boolean;
    onDelete: () => void;
}> = ({ message, agentName, mixed, onDelete }) => {
    const mine = message.from !== 'customer';
    const fromOwner = message.from === 'owner';
    const instruction = instructionText(message);
    const bounce = bounceNoticeText(message);
    const wa = message.channel === 'whatsapp';
    const email = message.channel === 'email';

    if (bounce) {
        return (
            <div className="group flex items-center justify-center gap-2">
                <div className="max-w-[90%] rounded-lg bg-black/25 px-3 py-1.5 text-center text-[11px] leading-relaxed text-[#8696a0]">
                    <span className="font-medium text-red-300/90">Email bounced</span>
                    <span className="mx-1.5 opacity-50">·</span>
                    <span className="opacity-70">{formatAgentTime(message.createdAt)}</span>
                    <Disclosure label="Bounce details" className="mt-0.5">
                        <p className="mt-1 whitespace-pre-wrap break-words text-left font-mono text-[10.5px] leading-relaxed text-[#8696a0]">{bounce}</p>
                    </Disclosure>
                </div>
                <button type="button" onClick={onDelete} aria-label="Delete this note" className="flex-shrink-0 p-1 text-[#8696a0] hover:text-red-400 sm:opacity-0 sm:group-hover:opacity-100">
                    <TrashIcon className="h-3.5 w-3.5" />
                </button>
            </div>
        );
    }

    if (instruction) {
        return (
            <div className="group flex items-center justify-center gap-2">
                <p className="max-w-[85%] rounded-lg bg-black/25 px-3 py-1.5 text-center text-[11px] leading-relaxed text-[#8696a0]">
                    <span className="font-medium text-[#e9edef]/70">You told {agentName}:</span> {instruction}
                </p>
                <button type="button" onClick={onDelete} aria-label="Delete this note" className="flex-shrink-0 p-1 text-[#8696a0] hover:text-red-400 sm:opacity-0 sm:group-hover:opacity-100">
                    <TrashIcon className="h-3.5 w-3.5" />
                </button>
            </div>
        );
    }

    const bubble = !mine
        ? email
            ? 'rounded-tl-sm bg-[#1c2d4a] text-[#e9edef]'
            : 'rounded-tl-sm bg-[#202c33] text-[#e9edef]'
        : fromOwner
            ? 'rounded-tr-sm bg-emerald-800 text-white'
            : wa
                ? 'rounded-tr-sm bg-[#005c4b] text-[#e9edef]'
                : email
                    ? 'rounded-tr-sm bg-[#1e3a8a] text-white'
                    : 'rounded-tr-sm bg-brand-700 text-white';

    return (
        <div className={`group flex ${mine ? 'justify-end' : 'justify-start'}`}>
            <div className="max-w-[78%] sm:max-w-[70%]">
                {mine && (
                    <p className={`mb-0.5 text-right text-[11px] font-medium ${fromOwner ? 'text-emerald-300' : wa ? 'text-[#25d366]' : 'text-sky-300'}`}>
                        {fromOwner ? 'You' : agentName}
                    </p>
                )}
                <div className={`flex items-end gap-1 ${mine ? 'flex-row-reverse' : ''}`}>
                    <div className={`rounded-2xl px-3 py-2 shadow ${bubble}`}>
                        {mixed && (
                            <div className="mb-1">
                                <ChannelChip channel={message.channel} />
                            </div>
                        )}
                        {message.subject && (
                            <p className="mb-1 border-b border-white/15 pb-1 text-xs font-semibold opacity-90">
                                {message.subject}
                            </p>
                        )}
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
                        {message.text && message.text !== '[photo]' && message.text !== '[video]' && message.text !== '[document]' && (
                            <p className="whitespace-pre-wrap break-words text-[14.5px] leading-relaxed">{message.text}</p>
                        )}
                        <p className={`mt-1 text-[10px] ${mine ? 'text-right text-white/50' : 'text-[#8696a0]'}`}>
                            {formatAgentTime(message.createdAt)}
                        </p>
                    </div>
                    <button type="button" onClick={onDelete} aria-label="Delete this message" className="flex-shrink-0 p-1 text-[#8696a0] hover:text-red-400 sm:opacity-0 sm:group-hover:opacity-100">
                        <TrashIcon className="h-3.5 w-3.5" />
                    </button>
                </div>
            </div>
        </div>
    );
};

const AgentInboxPage = () => {
    const { companyId, leads, setSelectedLeadId } = useData();
    const { setView } = useUI();
    const toast = useToast();

    const [own, setOwn] = useState<Conversation[] | null>(null);
    const [shared, setShared] = useState<Conversation[]>([]);
    const [inbox, setInbox] = useState<SharedInboxMeta | null>(null);
    const [filter, setFilter] = useState<InboxFilter>('all');
    const [query, setQuery] = useState('');
    const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
    const [activeConvId, setActiveConvId] = useState<string | null>(null);
    const [messagesByConv, setMessagesByConv] = useState<Record<string, AgentMessage[]>>({});
    const [reply, setReply] = useState('');
    const [sending, setSending] = useState(false);
    const [answer, setAnswer] = useState('');
    const [answering, setAnswering] = useState(false);
    const [changingMode, setChangingMode] = useState(false);
    const [agentName, setAgentName] = useState('Dave');
    const [draftText, setDraftText] = useState('');
    const [draftBusy, setDraftBusy] = useState<'' | 'approve' | 'discard'>('');
    const [replyMode, setReplyMode] = useState<'human' | 'agent'>('agent');
    const [sendVia, setSendVia] = useState<Exclude<SendVia, 'auto'>>('email');
    const [phrasingSince, setPhrasingSince] = useState<number | null>(null);
    const [pendingDelete, setPendingDelete] = useState<
        { kind: 'thread'; conv: Conversation } | { kind: 'message'; message: AgentMessage; conv: Conversation } | null
    >(null);
    const [deleting, setDeleting] = useState(false);
    const [composeOpen, setComposeOpen] = useState(false);
    const [attachment, setAttachment] = useState<File | null>(null);
    const [sendStatus, setSendStatus] = useState<string | null>(null);
    const [sendError, setSendError] = useState<InlineError | null>(null);
    const [menuOpen, setMenuOpen] = useState(false);
    const [answerMode, setAnswerMode] = useState(true);
    const [detailsOpen, setDetailsOpen] = useState(false);

    const threadRef = useRef<HTMLDivElement>(null);
    const replyBoxRef = useRef<HTMLTextAreaElement>(null);
    const fileRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (!companyId) return;
        return subscribeToAgentConversations(companyId, setOwn);
    }, [companyId]);

    useEffect(() => {
        if (!companyId) return;
        return subscribeToSharedInbox(companyId, setInbox);
    }, [companyId]);

    useEffect(() => {
        if (!inbox?.memberCompanyIds?.length) {
            setShared([]);
            return;
        }
        return subscribeToAgentConversationsAcross(inbox.memberCompanyIds, setShared);
    }, [inbox]);

    useEffect(() => {
        if (!companyId) return;
        return subscribeToSalesAgentSettings(companyId, settings => setAgentName(settings.agentName || 'Dave'));
    }, [companyId]);

    const conversations = useMemo(() => {
        const list = own || [];
        if (!shared.length) return list;
        const seen = new Set<string>();
        const merged: Conversation[] = [];
        [...shared, ...list].forEach(conv => {
            const key = conversationRefKey(conv);
            if (seen.has(key)) return;
            seen.add(key);
            merged.push(conv);
        });
        merged.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
        return merged;
    }, [own, shared]);

    const groups = useMemo(() => {
        const all = groupConversations(conversations, companyId || undefined);
        const q = query.trim().toLowerCase();
        return all.filter(group => {
            if (!groupHasChannel(group, filter)) return false;
            if (!q) return true;
            return (
                group.name.toLowerCase().includes(q)
                || group.preview.toLowerCase().includes(q)
                || group.conversations.some(conv =>
                    (conv.address || '').toLowerCase().includes(q)
                    || (conv.contact?.email || '').toLowerCase().includes(q)
                    || (conv.contact?.phone || '').includes(q)
                )
            );
        });
    }, [conversations, companyId, filter, query]);

    const linkHandled = useRef(false);
    useEffect(() => {
        if (linkHandled.current) return;
        linkHandled.current = true;
        const convId = takeRequestedConversation() || takeConversationFromUrl();
        if (convId) setActiveConvId(convId);
    }, []);

    useEffect(() => onAgentConversationRequest(setActiveConvId), []);

    const activeGroup = useMemo(() => {
        if (activeGroupId) {
            const byId = groups.find(g => g.id === activeGroupId);
            if (byId) return byId;
        }
        if (activeConvId) return groups.find(g => g.conversations.some(c => c.id === activeConvId)) || null;
        return null;
    }, [groups, activeGroupId, activeConvId]);

    const threadConversations = useMemo(() => {
        if (!activeGroup) return [];
        return conversationsForFilter(activeGroup, filter);
    }, [activeGroup, filter]);

    const active = useMemo(() => {
        if (!activeGroup) return null;
        const pool = threadConversations.length ? threadConversations : activeGroup.conversations;
        return pool.find(c => c.id === activeConvId) || pool[0] || activeGroup.latest;
    }, [activeGroup, activeConvId, threadConversations]);

    useEffect(() => {
        if (!activeGroup || !threadConversations.length) return;
        if (activeConvId && threadConversations.some(c => c.id === activeConvId)) return;
        setActiveConvId(threadConversations[0].id);
    }, [activeGroup, threadConversations, activeConvId]);

    useEffect(() => {
        if (activeGroupId || activeConvId || !groups.length) return;
        if (typeof window !== 'undefined' && window.innerWidth < 1024) return;
        setActiveGroupId(groups[0].id);
        setActiveConvId(groups[0].latest.id);
    }, [groups, activeGroupId, activeConvId]);

    useEffect(() => {
        if (!companyId || !activeGroup) {
            setMessagesByConv({});
            return;
        }
        setReply('');
        setAnswer('');
        setAttachment(null);
        setPhrasingSince(null);
        setSendError(null);
        setMenuOpen(false);
        setAnswerMode(true);
        setDetailsOpen(false);
        const unsubs = activeGroup.conversations.map(conv => {
            const home = homeOf(conv, companyId);
            void markConversationRead(home, conv.id).catch(() => undefined);
            void dismissConversationNotifications(conv.id);
            return subscribeToAgentMessages(home, conv.id, msgs => {
                setMessagesByConv(prev => ({ ...prev, [conversationRefKey(conv)]: msgs }));
            });
        });
        return () => unsubs.forEach(stop => stop());
    }, [companyId, activeGroup?.id]);

    const draftId = active?.pendingDraft?.id || '';
    useEffect(() => {
        setDraftText(active?.pendingDraft?.text || '');
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [draftId]);

    useEffect(() => {
        setReplyMode(active?.mode === 'agent' ? 'agent' : 'human');
        if (active) setSendVia(defaultSendVia(active));
    }, [active?.id, active?.mode, active?.emailBounce?.at]);

    const messages = useMemo(() => {
        if (!activeGroup) return [];
        const pool = threadConversations.length ? threadConversations : activeGroup.conversations;
        const mixed = filter === 'all' && (pool.length > 1 || activeGroup.channels.length > 1);
        const list: Array<AgentMessage & { conv: Conversation; mixed: boolean }> = [];
        pool.forEach(conv => {
            const key = conversationRefKey(conv);
            (messagesByConv[key] || []).forEach(message => {
                if (filter !== 'all' && message.channel && message.channel !== filter) return;
                list.push({ ...message, conv, mixed });
            });
        });
        list.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
        return list;
    }, [activeGroup, threadConversations, messagesByConv, filter]);

    useEffect(() => {
        if (!phrasingSince) return;
        if (messages.some(m => m.direction === 'out' && m.from === 'agent' && (m.createdAt || 0) >= phrasingSince)) {
            setPhrasingSince(null);
        }
    }, [messages, phrasingSince]);

    useEffect(() => {
        if (!phrasingSince) return;
        const timer = window.setTimeout(() => setPhrasingSince(null), 180_000);
        return () => window.clearTimeout(timer);
    }, [phrasingSince]);

    useEffect(() => {
        const el = threadRef.current;
        if (el) el.scrollTop = el.scrollHeight;
    }, [messages]);

    const openGroup = useCallback((group: CustomerGroup) => {
        setActiveGroupId(group.id);
        const preferred = filter === 'whatsapp'
            ? group.conversations.find(c => c.channel === 'whatsapp') || group.latest
            : filter === 'email'
                ? group.conversations.find(c => c.channel === 'email') || group.latest
                : group.latest;
        setActiveConvId(preferred.id);
    }, [filter]);

    const handleMode = useCallback(async (mode: ConversationMode) => {
        if (!companyId || !active) return;
        setChangingMode(true);
        try {
            await setConversationMode(homeOf(active, companyId), active.id, mode);
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
        if (!companyId || !active || sending) return;
        if (!text && !attachment) return;
        setSending(true);
        try {
            let media: MessageMedia | undefined;
            if (attachment) {
                const kind = classifyWhatsAppFile(attachment);
                if (!kind) throw new Error('That file cannot go on WhatsApp.');
                setSendStatus(kind === 'video' ? 'Uploading video…' : kind === 'image' ? 'Preparing photo…' : 'Uploading file…');
                // Photos are squeezed here; a video is uploaded whole and re-encoded
                // by the function, which is why this can take a moment.
                const ready = await prepareWhatsAppFile(attachment);
                const problem = describeWhatsAppFileError(ready);
                if (problem) throw new Error(problem);
                const url = await uploadWhatsAppFile(companyId, ready);
                media = { kind, url, mime: ready.type, filename: ready.name };
            }
            setSendStatus(null);
            const result = await sendAgentReply(homeOf(active, companyId), active.id, text, media, sendVia, conversationPhone(active) || phoneFromThread(active));
            setReply('');
            setAttachment(null);
            setSendError(null);
            const sent = (result?.sent || []).map(ch => CHANNEL_LABELS[ch] || ch);
            toast.success(
                result?.skippedWhatsApp
                    ? `${sent.length ? `Sent on ${sent.join(' and ')}. ` : ''}${result.skippedWhatsApp}`
                    : sent.length ? `Sent on ${sent.join(' and ')}.` : 'Sent.'
            );
        } catch (err: any) {
            setSendError(describeError(err, 'That message was not sent.'));
        } finally {
            setSendStatus(null);
            setSending(false);
        }
    }, [companyId, active, reply, attachment, sending, toast, sendVia]);

    const handleInstruct = useCallback(async () => {
        const text = reply.trim();
        if (!companyId || !active || !text || sending) return;
        setSending(true);
        setPhrasingSince(Date.now());
        try {
            await instructAgent(homeOf(active, companyId), active.id, text);
            setReply('');
            setSendError(null);
        } catch (err: any) {
            setPhrasingSince(null);
            setSendError(describeError(err, `Could not pass that on to ${agentName}.`));
        } finally {
            setSending(false);
        }
    }, [companyId, active, reply, sending, toast, agentName]);

    const handleAnswer = useCallback(async () => {
        const text = answer.trim();
        if (!companyId || !active || !text || answering) return;
        setAnswering(true);
        try {
            await answerAgentQuestion(homeOf(active, companyId), active.id, text);
            setAnswer('');
            setSendError(null);
            toast.success('Sent back to the agent — it will put that in its own words.');
        } catch (err: any) {
            setSendError(describeError(err, 'Could not pass that answer back to the agent.'));
        } finally {
            setAnswering(false);
        }
    }, [companyId, active, answer, answering, toast]);

    const handleApproveDraft = useCallback(async () => {
        const text = draftText.trim();
        if (!companyId || !active || !text || draftBusy) return;
        setDraftBusy('approve');
        try {
            const result = await approveAgentDraft(homeOf(active, companyId), active.id, text);
            const sent = (result.sent || [active.channel]).map(ch => CHANNEL_LABELS[ch] || ch).join(' and ');
            toast.success(approvedSendMessage(sent, result.sendAfter));
        } catch (err: any) {
            toast.error(err?.message || 'That draft was not sent.');
        } finally {
            setDraftBusy('');
        }
    }, [companyId, active, draftText, draftBusy, toast]);

    const handleConfirmDelete = useCallback(async () => {
        if (!companyId || !pendingDelete || deleting) return;
        setDeleting(true);
        try {
            if (pendingDelete.kind === 'thread') {
                const conv = pendingDelete.conv;
                await deleteAgentConversation(homeOf(conv, companyId), conv);
                if (activeConvId === conv.id) {
                    setActiveConvId(null);
                    setActiveGroupId(null);
                }
                toast.success('Conversation deleted.');
            } else {
                await deleteAgentMessage(
                    homeOf(pendingDelete.conv, companyId),
                    pendingDelete.conv.id,
                    pendingDelete.message.id,
                    pendingDelete.message.media?.url
                );
                toast.success('Message deleted.');
            }
            setPendingDelete(null);
        } catch (err: any) {
            toast.error(err?.message || 'That could not be deleted.');
        } finally {
            setDeleting(false);
        }
    }, [companyId, pendingDelete, deleting, activeConvId, toast]);

    const handleDiscardDraft = useCallback(async () => {
        if (!companyId || !active || draftBusy) return;
        setDraftBusy('discard');
        try {
            await discardAgentDraft(homeOf(active, companyId), active.id);
            toast.success('Draft binned. Nothing was sent.');
        } catch (err: any) {
            toast.error(err?.message || 'That draft could not be discarded.');
        } finally {
            setDraftBusy('');
        }
    }, [companyId, active, draftBusy, toast]);

    const handleAskForChanges = useCallback(() => {
        setReplyMode('agent');
        replyBoxRef.current?.focus();
    }, []);

    const handleWhatsAppHer = useCallback(async () => {
        if (!companyId || !active || sending) return;
        const phone = conversationPhone(active) || phoneFromThread(active);
        if (!phone) {
            setSendError({ message: 'No mobile number on file.' });
            return;
        }
        const text = reply.trim() || whatsappOpener(active.contact?.firstName, active.vehicleInterest?.title);
        setSending(true);
        try {
            const result = await sendAgentReply(homeOf(active, companyId), active.id, text, undefined, 'whatsapp', phone);
            setReply('');
            if (result?.skippedWhatsApp) {
                setSendError({ message: result.skippedWhatsApp });
            } else {
                setSendError(null);
                toast.success(active.lastCustomerMessageAt
                    ? 'Sent on WhatsApp.'
                    : 'WhatsApp opener sent. Free text can go once they reply.');
            }
        } catch (err: any) {
            setSendError(describeError(err, 'That WhatsApp could not be sent.'));
        } finally {
            setSending(false);
        }
    }, [companyId, active, reply, sending, toast]);

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

    const counts = useMemo(() => {
        const all = groupConversations(conversations, companyId || undefined);
        return {
            all: all.length,
            whatsapp: all.filter(g => groupHasChannel(g, 'whatsapp')).length,
            email: all.filter(g => groupHasChannel(g, 'email')).length,
        };
    }, [conversations, companyId]);

    if (!companyId || own === null) {
        return (
            <div className="flex h-full items-center justify-center">
                <Spinner className="h-8 w-8 text-[#25d366]" />
            </div>
        );
    }

    const mixed = !!activeGroup && filter === 'all' && (activeGroup.conversations.length > 1 || activeGroup.channels.length > 1);
    const phoneOnFile = active ? (conversationPhone(active) || phoneFromThread(active)) : undefined;
    const emailOnFile = active ? conversationEmail(active) : undefined;
    const bounced = !!(active && threadLooksBounced(active, messages));
    const whatsappNeedsOpener = !!phoneOnFile && !(active?.lastCustomerMessageAt);
    const asking = !!active?.pendingQuestion && answerMode;
    const tabs: Array<{ id: InboxFilter; label: string; count: number; accent?: string }> = [
        { id: 'all', label: 'All', count: counts.all },
        { id: 'whatsapp', label: inbox ? 'WhatsApp · Shared' : 'WhatsApp', count: counts.whatsapp, accent: 'text-[#25d366]' },
        { id: 'email', label: 'Email', count: counts.email, accent: 'text-sky-300' },
    ];

    return (
        <div className="flex h-full min-h-0 bg-[#0b141a] text-[#e9edef]">
            <aside className={`min-h-0 w-full flex-col border-r border-white/5 bg-[#111b21] lg:flex lg:w-[22rem] xl:w-[26rem] ${activeGroup ? 'hidden lg:flex' : 'flex'}`}>
                <div className="flex items-center justify-between gap-2 px-4 py-3">
                    <div className="flex min-w-0 items-center gap-2">
                        <button
                            type="button"
                            onClick={() => setView('dashboard')}
                            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-[#8696a0] hover:bg-white/5 hover:text-white lg:hidden"
                            aria-label="Back to the app"
                        >
                            <ArrowLeftIcon className="h-5 w-5" />
                        </button>
                        <div className="min-w-0">
                            <h2 className="text-lg font-semibold text-white">Inbox</h2>
                            <p className="text-[11px] text-[#8696a0]">
                                {inbox
                                    ? `${inbox.name || 'Shared number'} · every ledger`
                                    : 'WhatsApp and email'}
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={() => setComposeOpen(true)}
                        className="inline-flex items-center gap-1.5 rounded-full bg-[#25d366] px-3 py-1.5 text-xs font-semibold text-[#111b21] hover:bg-[#20bd5a]"
                    >
                        <PlusIcon className="h-4 w-4" />
                        WhatsApp
                    </button>
                </div>

                <div className="flex gap-1 px-3 pb-2">
                    {tabs.map(tab => (
                        <button
                            key={tab.id}
                            type="button"
                            onClick={() => setFilter(tab.id)}
                            className={`flex-1 rounded-full px-2 py-1.5 text-xs font-semibold transition-colors ${
                                filter === tab.id
                                    ? tab.id === 'whatsapp'
                                        ? 'bg-[#25d366] text-[#111b21]'
                                        : tab.id === 'email'
                                            ? 'bg-sky-500 text-white'
                                            : 'bg-[#2a3942] text-white'
                                    : 'text-[#8696a0] hover:bg-white/5 hover:text-white'
                            }`}
                        >
                            {tab.label}
                            <span className="ml-1 opacity-70">{tab.count}</span>
                        </button>
                    ))}
                </div>

                {filter === 'whatsapp' && inbox && (
                    <p className="px-4 pb-2 text-[11px] text-[#25d366]/80">
                        Every WhatsApp to the shared number, whichever Dealer Ledger user is signed in.
                    </p>
                )}

                <div className="px-3 pb-2">
                    <label className="flex items-center gap-2 rounded-lg bg-[#202c33] px-3 py-2">
                        <MagnifyingGlassIcon className="h-4 w-4 text-[#8696a0]" />
                        <input
                            value={query}
                            onChange={e => setQuery(e.target.value)}
                            placeholder="Search name, number or email"
                            className="min-w-0 flex-1 bg-transparent text-sm text-white placeholder-[#8696a0] outline-none"
                        />
                    </label>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto">
                    {groups.length === 0 ? (
                        <div className="px-6 py-16 text-center">
                            <WhatsAppIcon className="mx-auto h-10 w-10 text-[#25d366]/40" />
                            <p className="mt-3 text-sm font-medium text-[#e9edef]">No conversations yet</p>
                            <p className="mt-1 text-xs text-[#8696a0]">
                                Incoming WhatsApp and email land here. You can also start a WhatsApp to a new number.
                            </p>
                        </div>
                    ) : groups.map(group => (
                        <GroupRow
                            key={group.id}
                            group={group}
                            active={activeGroup?.id === group.id}
                            onClick={() => openGroup(group)}
                        />
                    ))}
                </div>
            </aside>

            <section className={`min-h-0 min-w-0 flex-1 flex-col ${activeGroup ? 'flex' : 'hidden lg:flex'}`}>
                {active && activeGroup ? (
                    <>
                        <div className="relative border-b border-white/5 bg-[#202c33] px-2 py-2 sm:px-3">
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => { setActiveGroupId(null); setActiveConvId(null); }}
                                    className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-[#8696a0] hover:bg-white/5 hover:text-white lg:hidden"
                                    aria-label="Back to the list"
                                >
                                    <ArrowLeftIcon className="h-5 w-5" />
                                </button>
                                <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-sm font-semibold ${avatarTone(activeGroup.name, activeGroup.channels.includes('whatsapp'))}`}>
                                    {initials(activeGroup.name)}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2">
                                        <h2 className="min-w-0 truncate text-[15px] font-semibold leading-tight text-white">{activeGroup.name}</h2>
                                        {active.escalated && <Badge size="sm" variant="danger">Escalated</Badge>}
                                    </div>
                                    <div className="mt-0.5 flex items-center gap-1.5 text-[12px] leading-tight text-[#8696a0]">
                                        <span className="flex flex-shrink-0 items-center gap-1">
                                            {(threadConversations.length ? threadConversations : activeGroup.conversations).map(conv => (
                                                <button
                                                    key={conversationRefKey(conv)}
                                                    type="button"
                                                    onClick={() => setActiveConvId(conv.id)}
                                                    aria-label={`Show the ${CHANNEL_LABELS[conv.channel] || conv.channel} thread`}
                                                    aria-pressed={conv.id === active.id}
                                                    className={`rounded-full ${conv.id === active.id ? 'ring-1 ring-white/40' : 'opacity-60'}`}
                                                >
                                                    <ChannelChip channel={conv.channel} compact />
                                                </button>
                                            ))}
                                        </span>
                                        {active.vehicleInterest?.title ? (
                                            <span className="flex min-w-0 items-center gap-1">
                                                <CarIcon className="h-3.5 w-3.5 flex-shrink-0 text-[#25d366]" />
                                                <span className="truncate">{active.vehicleInterest.title}</span>
                                            </span>
                                        ) : (
                                            <span className="truncate">{phoneOnFile ? displayUkPhone(phoneOnFile) : emailOnFile || active.address}</span>
                                        )}
                                    </div>
                                    <div className="mt-1 flex items-center gap-2">
                                        <span className={`inline-flex items-center gap-1.5 whitespace-nowrap text-[11px] font-medium ${
                                            active.mode === 'agent' ? 'text-sky-300' : active.mode === 'human' ? 'text-emerald-300' : 'text-amber-300'
                                        }`}>
                                            <span className={`h-1.5 w-1.5 rounded-full ${
                                                active.mode === 'agent' ? 'bg-sky-400' : active.mode === 'human' ? 'bg-emerald-400' : 'bg-amber-400'
                                            }`} aria-hidden />
                                            {active.mode === 'agent' ? `${agentName} is answering` : active.mode === 'human' ? 'You are answering' : 'Paused'}
                                        </span>
                                        <span className="text-[#8696a0]/50" aria-hidden>·</span>
                                        <button type="button" onClick={() => setDetailsOpen(o => !o)} aria-expanded={detailsOpen} className="inline-flex items-center gap-1 text-[11px] font-medium text-[#8696a0] hover:text-white">
                                            Details
                                            <ChevronDownIcon className={`h-3 w-3 transition-transform ${detailsOpen ? 'rotate-180' : ''}`} />
                                        </button>
                                    </div>
                                </div>
                                {phoneOnFile && active.channel === 'email' && !bounced && (
                                    <button
                                        type="button"
                                        onClick={handleWhatsAppHer}
                                        disabled={sending}
                                        aria-label="Send WhatsApp"
                                        title="Send WhatsApp"
                                        className="inline-flex h-10 w-10 flex-shrink-0 items-center justify-center gap-1.5 rounded-full bg-[#25d366] text-[13px] font-semibold text-[#111b21] hover:bg-[#20bd5a] disabled:opacity-50 sm:w-auto sm:px-3.5"
                                    >
                                        <WhatsAppIcon className="h-5 w-5 sm:h-4 sm:w-4" />
                                        <span className="hidden sm:inline">WhatsApp</span>
                                    </button>
                                )}
                                <button
                                    type="button"
                                    onClick={() => setMenuOpen(o => !o)}
                                    aria-haspopup="menu"
                                    aria-expanded={menuOpen}
                                    aria-label="Conversation options"
                                    className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-[#8696a0] hover:bg-white/5 hover:text-white"
                                >
                                    <EllipsisVerticalIcon className="h-5 w-5" />
                                </button>
                            </div>

                            {detailsOpen && (
                            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 rounded-xl bg-black/25 px-3 py-2.5 text-[12px] text-[#e9edef]">
                                {phoneOnFile && (
                                    <>
                                        <dt className="text-[#8696a0]">Mobile</dt>
                                        <dd><a href={`tel:${phoneOnFile}`} className="inline-flex items-center gap-1 text-[#25d366] hover:underline"><PhoneIcon className="h-3 w-3" />{displayUkPhone(phoneOnFile)}</a></dd>
                                    </>
                                )}
                                {emailOnFile && (
                                    <>
                                        <dt className="text-[#8696a0]">Email</dt>
                                        <dd className={`break-all ${bounced ? 'text-red-300' : ''}`}>{emailOnFile}{bounced ? ' · bounces' : ''}</dd>
                                    </>
                                )}
                                {!emailOnFile && !phoneOnFile && (
                                    <>
                                        <dt className="text-[#8696a0]">From</dt>
                                        <dd className="break-all">{active.address}</dd>
                                    </>
                                )}
                                {active.partExOrFinance && (
                                    <>
                                        <dt className="text-[#8696a0]">Deal</dt>
                                        <dd>{active.partExOrFinance}</dd>
                                    </>
                                )}
                                {active.preferredTime && (
                                    <>
                                        <dt className="text-[#8696a0]">Prefers</dt>
                                        <dd>{active.preferredTime}</dd>
                                    </>
                                )}
                                {active.booking && (
                                    <>
                                        <dt className="text-[#8696a0]">Booked</dt>
                                        <dd className="text-emerald-300">{active.booking.window}</dd>
                                    </>
                                )}
                                <dt className="text-[#8696a0]">Stage</dt>
                                <dd>{STAGE_LABELS[active.stage] || active.stage}{activeGroup.shared ? ' · other ledger' : ''}</dd>
                                <dt className="text-[#8696a0]">Ref</dt>
                                <dd className="font-mono text-[#8696a0]">#{active.shortId}</dd>
                                {active.contact?.leadId && (
                                    <>
                                        <dt className="text-[#8696a0]">CRM</dt>
                                        <dd>
                                            <button type="button" onClick={openLead} className="inline-flex items-center gap-1 text-sky-300 hover:text-sky-200">
                                                <ArrowTopRightOnSquareIcon className="h-3 w-3" />
                                                {linkedLead
                                                    ? `Lead: ${[linkedLead.firstName, linkedLead.lastName].filter(Boolean).join(' ') || 'open'}`
                                                    : 'Open lead'}
                                            </button>
                                        </dd>
                                    </>
                                )}
                            </dl>
                            )}

                            {menuOpen && (
                                <>
                                    <div className="fixed inset-0 z-20" onClick={() => setMenuOpen(false)} aria-hidden />
                                    <div role="menu" className="absolute right-2 top-12 z-30 w-56 overflow-hidden rounded-xl border border-white/10 bg-[#233138] py-1 shadow-2xl">
                                        {active.mode !== 'human' && (
                                            <MenuItem onClick={() => { setMenuOpen(false); handleMode('human'); }} disabled={changingMode}>Take over — I'll answer</MenuItem>
                                        )}
                                        {active.mode !== 'agent' && (
                                            <MenuItem onClick={() => { setMenuOpen(false); handleMode('agent'); }} disabled={changingMode}>
                                                <SparklesIcon className="h-4 w-4 text-[#25d366]" />
                                                Hand back to {agentName}
                                            </MenuItem>
                                        )}
                                        {active.mode !== 'paused' && (
                                            <MenuItem onClick={() => { setMenuOpen(false); handleMode('paused'); }} disabled={changingMode}>Pause — send nothing</MenuItem>
                                        )}
                                        {(phoneOnFile || active.contact?.leadId) && <div className="my-1 border-t border-white/5" />}
                                        {phoneOnFile && (
                                            <a href={`tel:${phoneOnFile}`} role="menuitem" onClick={() => setMenuOpen(false)} className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-[#e9edef] hover:bg-white/5">
                                                <PhoneIcon className="h-4 w-4 text-[#8696a0]" />
                                                Call {displayUkPhone(phoneOnFile)}
                                            </a>
                                        )}
                                        {active.contact?.leadId && (
                                            <MenuItem onClick={() => { setMenuOpen(false); openLead(); }}>
                                                <ArrowTopRightOnSquareIcon className="h-4 w-4 text-[#8696a0]" />
                                                Open CRM lead
                                            </MenuItem>
                                        )}
                                        <div className="my-1 border-t border-white/5" />
                                        <MenuItem danger onClick={() => { setMenuOpen(false); setPendingDelete({ kind: 'thread', conv: active }); }}>
                                            <TrashIcon className="h-4 w-4" />
                                            Delete conversation
                                        </MenuItem>
                                    </div>
                                </>
                            )}
                        </div>

                        {bounced && (
                            <div className="border-b border-white/5 border-l-2 border-l-red-400/80 bg-[#141c22] px-4 py-3">
                                <p className="text-[13px] font-semibold text-white">Email bounced — {phoneOnFile ? 'reach them on WhatsApp instead' : 'no other way through'}</p>
                                <p className="mt-0.5 text-[12px] leading-snug text-[#8696a0]">
                                    {emailOnFile ? `${emailOnFile} is undeliverable` : 'Their address is undeliverable'}
                                    {active.emailBounce?.reason ? ` (${active.emailBounce.reason})` : ''}.
                                    {phoneOnFile ? ' Email replies are switched off for this thread.' : ' No mobile number on file.'}
                                </p>
                                {phoneOnFile && (
                                    <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                                        <button
                                            type="button"
                                            onClick={handleWhatsAppHer}
                                            disabled={sending}
                                            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-[#25d366] px-4 text-[14px] font-semibold text-[#111b21] hover:bg-[#20bd5a] disabled:opacity-50 sm:w-auto"
                                        >
                                            <WhatsAppIcon className="h-4 w-4" />
                                            Send WhatsApp to {active.contact?.firstName || displayUkPhone(phoneOnFile)}
                                        </button>
                                        <a href={`tel:${phoneOnFile}`} className="text-center text-[13px] font-medium text-[#8696a0] hover:text-white sm:px-3">
                                            or call {displayUkPhone(phoneOnFile)}
                                        </a>
                                    </div>
                                )}
                            </div>
                        )}

                        {active.pendingQuestion && (
                            <div className="border-b border-white/5 border-l-2 border-l-amber-400/80 bg-[#141c22] px-4 py-3">
                                <div className="flex items-start gap-2.5">
                                    <SparklesIcon className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-300" />
                                    <div className="min-w-0 flex-1">
                                        <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-300">{agentName} needs an answer</p>
                                        <p className="mt-1 text-[14px] leading-snug text-white">{active.pendingQuestion.question}</p>
                                        {active.pendingQuestion.context && (
                                            <p className="mt-1 text-[12px] leading-snug text-[#8696a0]">{active.pendingQuestion.context}</p>
                                        )}
                                        {!answerMode && (
                                            <button type="button" onClick={() => { setAnswerMode(true); replyBoxRef.current?.focus(); }} className="mt-2 text-[12px] font-medium text-amber-300 hover:text-amber-200">
                                                Answer below ↓
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}

                        {active.pendingDraft && (
                            <div className="border-b border-white/5 border-l-2 border-l-amber-400/80 bg-[#141c22] px-4 py-3">
                                <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-300">{agentName} drafted a reply — your approval needed</p>
                                <p className="mt-0.5 text-[11px] text-[#8696a0]">
                                    Written {formatAgentTime(active.pendingDraft.createdAt)} · nothing has been sent
                                    {active.pendingDraft.subject ? ` · ${active.pendingDraft.subject}` : ''}
                                </p>
                                {bounced && (
                                    <p className="mt-2 text-[12px] leading-snug text-red-300">
                                        This looks like a reply to a bounce, not to the customer. Discard it and WhatsApp them instead.
                                    </p>
                                )}
                                <textarea
                                    rows={5}
                                    value={draftText}
                                    onChange={e => setDraftText(e.target.value)}
                                    aria-label={`The reply ${agentName} has drafted`}
                                    className="mt-3 w-full resize-y rounded-xl border-0 bg-black/30 px-3 py-2 text-sm leading-relaxed text-white focus:outline-none focus:ring-2 focus:ring-amber-400/40"
                                />
                                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                                    <Button size="sm" variant="primary" onClick={handleApproveDraft} loading={draftBusy === 'approve'} disabled={!draftText.trim() || !!draftBusy}>
                                        Approve &amp; send
                                    </Button>
                                    <Button size="sm" variant="ghost" onClick={handleAskForChanges} disabled={!!draftBusy}>
                                        Ask {agentName} to change…
                                    </Button>
                                    <Button size="sm" variant="ghost" onClick={handleDiscardDraft} loading={draftBusy === 'discard'} disabled={!!draftBusy} className="ml-auto text-[#8696a0]">
                                        Discard
                                    </Button>
                                </div>
                            </div>
                        )}

                        {active.escalated && active.escalationReason && !active.pendingQuestion && (
                            <div className="flex items-start gap-2.5 border-b border-white/5 border-l-2 border-l-red-400/80 bg-[#141c22] px-4 py-3">
                                <ExclamationTriangleIcon className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-300" />
                                <p className="text-[13px] leading-snug text-[#e9edef]">{active.escalationReason}</p>
                            </div>
                        )}

                        <div
                            ref={threadRef}
                            className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-4 sm:px-4"
                            style={{
                                backgroundColor: '#0b141a',
                                backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.035) 1px, transparent 0)',
                                backgroundSize: '22px 22px',
                            }}
                        >
                            {messages.length ? (
                                messages.map(message => (
                                    <MessageBubble
                                        key={`${conversationRefKey(message.conv)}:${message.id}`}
                                        message={message}
                                        agentName={agentName}
                                        mixed={mixed}
                                        onDelete={() => setPendingDelete({ kind: 'message', message, conv: message.conv })}
                                    />
                                ))
                            ) : (
                                <p className="py-12 text-center text-sm text-[#8696a0]">Nothing said yet.</p>
                            )}
                        </div>

                        <div
                            className="border-t border-white/5 bg-[#202c33] px-3 pt-2.5"
                            style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
                        >
                            {asking ? (
                                <div className="mb-2 flex items-center justify-between gap-2">
                                    <p className="flex min-w-0 items-center gap-1.5 text-[12px] font-semibold text-amber-300">
                                        <SparklesIcon className="h-3.5 w-3.5 flex-shrink-0" />
                                        <span className="truncate">Answering {agentName}<span className="hidden font-normal text-amber-300/70 sm:inline"> — he phrases it for the customer</span></span>
                                    </p>
                                    <button type="button" onClick={() => setAnswerMode(false)} className="flex-shrink-0 text-[11px] font-medium text-[#8696a0] hover:text-white">
                                        Reply to customer<span className="hidden sm:inline"> instead</span>
                                    </button>
                                </div>
                            ) : (
                                <div className="mb-2 grid grid-cols-2 gap-1 rounded-xl bg-black/35 p-1">
                                    <button
                                        type="button"
                                        onClick={() => setReplyMode('human')}
                                        aria-pressed={replyMode === 'human'}
                                        className={`rounded-lg px-3 py-1.5 text-left transition-colors ${
                                            replyMode === 'human'
                                                ? 'bg-emerald-700 text-white shadow'
                                                : 'text-[#8696a0] hover:text-white'
                                        }`}
                                    >
                                        <span className="block text-[13px] font-semibold leading-tight">Send as you</span>
                                        <span className={`block text-[10px] leading-tight ${replyMode === 'human' ? 'text-emerald-100/80' : 'text-[#8696a0]'}`}>
                                            Customer sees these words
                                        </span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => { if (!attachment) setReplyMode('agent'); }}
                                        aria-pressed={replyMode === 'agent'}
                                        disabled={!!attachment}
                                        className={`rounded-lg px-3 py-1.5 text-left transition-colors ${
                                            replyMode === 'agent'
                                                ? 'bg-[#005c4b] text-white shadow'
                                                : 'text-[#8696a0] hover:text-white disabled:opacity-40'
                                        }`}
                                    >
                                        <span className="flex items-center gap-1 text-[13px] font-semibold leading-tight">
                                            <SparklesIcon className="h-3.5 w-3.5" />
                                            Tell {agentName}
                                        </span>
                                        <span className={`block text-[10px] leading-tight ${replyMode === 'agent' ? 'text-[#d1f4de]/80' : 'text-[#8696a0]'}`}>
                                            He phrases it for you
                                        </span>
                                    </button>
                                </div>
                            )}

                            {phrasingSince && (
                                <p className="mb-2 flex items-center gap-2 text-xs text-[#25d366]">
                                    <Spinner className="h-3.5 w-3.5" />
                                    {agentName} is phrasing that…
                                </p>
                            )}

                            {sendStatus && (
                                <p className="mb-2 flex items-center gap-2 text-xs text-[#25d366]">
                                    <Spinner className="h-3.5 w-3.5" />
                                    {sendStatus}
                                </p>
                            )}

                            {!asking && phoneOnFile && !bounced && sendVia !== 'whatsapp' && replyMode === 'human' && (
                                <button
                                    type="button"
                                    onClick={() => setSendVia(sendVia === 'both' ? 'email' : 'both')}
                                    aria-pressed={sendVia === 'both'}
                                    className={`mb-2 flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors ${
                                        sendVia === 'both'
                                            ? 'bg-[#005c4b] text-white'
                                            : 'bg-black/35 text-[#e9edef] hover:bg-black/50'
                                    }`}
                                >
                                    <span
                                        className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md border ${
                                            sendVia === 'both' ? 'border-white bg-white text-[#005c4b]' : 'border-[#8696a0]'
                                        }`}
                                        aria-hidden
                                    >
                                        {sendVia === 'both' ? (
                                            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="currentColor">
                                                <path d="M6.2 11.4 2.8 8l1.1-1.1 2.3 2.3 5.9-5.9L13.2 4.4z" />
                                            </svg>
                                        ) : null}
                                    </span>
                                    <span className="flex min-w-0 flex-1 items-center gap-1.5 text-[13px] font-medium">
                                        <WhatsAppIcon className="h-4 w-4 flex-shrink-0" />
                                        <span className="truncate">Also send on WhatsApp · {displayUkPhone(phoneOnFile)}</span>
                                    </span>
                                </button>
                            )}

                            {!asking && replyMode === 'human' && sendVia !== 'email' && whatsappNeedsOpener && (
                                <p className="mb-2 text-[11px] leading-snug text-[#8696a0]">
                                    They have not WhatsApp&apos;d us yet, so the first message has to be the approved opener. Free text goes once they reply.
                                </p>
                            )}

                            {attachment && (
                                <div className="mb-2 flex items-center gap-2 rounded-lg bg-black/30 px-3 py-2 text-xs text-[#e9edef]">
                                    <PaperClipIcon className="h-4 w-4 text-[#25d366]" />
                                    <span className="min-w-0 flex-1 truncate">{attachment.name}</span>
                                    <button type="button" onClick={() => setAttachment(null)} className="text-[#8696a0] hover:text-white" aria-label="Remove attachment">
                                        <TrashIcon className="h-3.5 w-3.5" />
                                    </button>
                                </div>
                            )}

                            {sendError && <ComposeError error={sendError} onDismiss={() => setSendError(null)} />}

                            {asking ? (
                                <div className="flex items-end gap-2">
                                    <textarea
                                        ref={replyBoxRef}
                                        rows={1}
                                        value={answer}
                                        onChange={e => setAnswer(e.target.value)}
                                        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAnswer(); } }}
                                        placeholder="Answer in your own words…"
                                        aria-label={`Your answer to ${agentName}`}
                                        className="min-w-0 flex-1 resize-none rounded-2xl border-0 bg-[#2a3942] px-4 py-2.5 text-sm text-white placeholder-[#8696a0] focus:outline-none focus:ring-2 focus:ring-amber-400/40"
                                    />
                                    <button
                                        type="button"
                                        onClick={handleAnswer}
                                        disabled={!answer.trim() || answering}
                                        className="flex h-11 flex-shrink-0 items-center justify-center gap-1 rounded-full bg-[#005c4b] px-4 text-sm font-semibold text-white disabled:opacity-40"
                                    >
                                        {answering ? <Spinner className="h-4 w-4" /> : 'Send answer'}
                                    </button>
                                </div>
                            ) : (
                                <div className="flex items-end gap-2">
                                    {phoneOnFile && sendVia !== 'email' && (
                                        <>
                                            <input
                                                ref={fileRef}
                                                type="file"
                                                accept={WHATSAPP_ACCEPT}
                                                className="hidden"
                                                onChange={e => {
                                                    const file = e.target.files?.[0] || null;
                                                    e.target.value = '';
                                                    if (!file) return;
                                                    const problem = describeWhatsAppPickError(file);
                                                    if (problem) {
                                                        setSendError({ message: problem });
                                                        return;
                                                    }
                                                    setAttachment(file);
                                                    setReplyMode('human');
                                                }}
                                            />
                                            <button
                                                type="button"
                                                onClick={() => fileRef.current?.click()}
                                                className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-[#2a3942] text-[#e9edef] hover:bg-[#3b4a54]"
                                                aria-label="Attach a photo, video or file"
                                                title="Attach a photo, video or file"
                                            >
                                                <PaperClipIcon className="h-5 w-5" />
                                            </button>
                                        </>
                                    )}
                                    <textarea
                                        ref={replyBoxRef}
                                        rows={1}
                                        value={reply}
                                        onChange={e => setReply(e.target.value)}
                                        onKeyDown={e => {
                                            if (e.key === 'Enter' && !e.shiftKey) {
                                                e.preventDefault();
                                                if (attachment || replyMode === 'human') handleSend(); else handleInstruct();
                                            }
                                        }}
                                        placeholder={replyMode === 'agent' && !attachment
                                            ? `Tell ${agentName} what to say…`
                                            : sendVia === 'both' ? 'Reply by email — and WhatsApp as well…'
                                                : sendVia === 'whatsapp' ? 'Reply on WhatsApp…'
                                                    : 'Reply by email…'}
                                        aria-label={replyMode === 'agent' && !attachment ? `What to tell ${agentName} to say` : 'Your reply to the customer'}
                                        className="min-w-0 flex-1 resize-none rounded-2xl border-0 bg-[#2a3942] px-4 py-2.5 text-sm text-white placeholder-[#8696a0] focus:outline-none focus:ring-2 focus:ring-[#25d366]/40"
                                    />
                                    <button
                                        type="button"
                                        onClick={attachment || replyMode === 'human' ? handleSend : handleInstruct}
                                        disabled={(!reply.trim() && !attachment) || sending}
                                        className={`flex h-11 flex-shrink-0 items-center justify-center rounded-full px-3 text-sm font-semibold disabled:opacity-40 ${
                                            attachment || replyMode === 'human'
                                                ? 'min-w-[2.75rem] bg-[#25d366] text-[#111b21]'
                                                : 'gap-1 bg-[#005c4b] text-white'
                                        }`}
                                        aria-label={attachment || replyMode === 'human' ? 'Send' : `Tell ${agentName}`}
                                    >
                                        {sending ? <Spinner className="h-4 w-4" /> : attachment || replyMode === 'human' ? (
                                            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
                                                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                                            </svg>
                                        ) : (
                                            <>
                                                <SparklesIcon className="h-4 w-4" />
                                                <span className="hidden sm:inline">Tell {agentName}</span>
                                            </>
                                        )}
                                    </button>
                                </div>
                            )}
                        </div>
                    </>
                ) : (
                    <div className="flex h-full flex-col items-center justify-center bg-[#0b141a] text-center">
                        <WhatsAppIcon className="h-16 w-16 text-[#25d366]/30" />
                        <p className="mt-4 text-sm text-[#8696a0]">Pick a conversation.</p>
                    </div>
                )}
            </section>

            {composeOpen && companyId && (
                <StartWhatsAppSheet
                    companyId={companyId}
                    onClose={() => setComposeOpen(false)}
                    onStarted={convId => {
                        setComposeOpen(false);
                        setActiveConvId(convId);
                    }}
                />
            )}

            {pendingDelete && (
                <Modal onClose={() => { if (!deleting) setPendingDelete(null); }} size="sm">
                    <div className="p-6 text-center">
                        <h3 className="text-lg font-semibold text-white">
                            {pendingDelete.kind === 'thread' ? 'Delete conversation' : 'Delete message'}
                        </h3>
                        <p className="mt-2 text-sm text-gray-400">
                            {pendingDelete.kind === 'thread'
                                ? `Remove the thread with ${conversationName(pendingDelete.conv)}? A new message from them will start a fresh conversation. Queued replies for this thread will not be sent.`
                                : 'Remove this message from the thread? It does not unsend anything that already went out.'}
                        </p>
                        <div className="mt-6 flex justify-center gap-3">
                            <Button variant="secondary" onClick={() => setPendingDelete(null)} disabled={deleting}>Cancel</Button>
                            <Button variant="danger" onClick={handleConfirmDelete} loading={deleting} disabled={deleting}>Delete</Button>
                        </div>
                    </div>
                </Modal>
            )}
        </div>
    );
};

export default AgentInboxPage;
