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
    UsersIcon,
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
    correctThreadCar,
    detachAgentMessage,
    deleteAgentConversation,
    deleteAgentMessage,
    discardAgentDraft,
    draftNow,
    formatAgentTime,
    instructAgent,
    instructionText,
    markConversationRead,
    MessageMedia,
    saveConversationPhone,
    sendAgentReply,
    setConversationMode,
    subscribeToAgentConversations,
    subscribeToAgentConversationsAcross,
    subscribeToAgentMessages,
    subscribeToSalesAgentSettings,
    subscribeToSharedInbox,
    uploadWhatsAppFile,
} from '../../services/salesAgentService';
import { onDatabaseResume } from '../../services/firebase';
import {
    onAgentConversationRequest,
    takeConversationFromUrl,
    takeRequestedConversation,
} from '../../utils/agentInboxLink';
import {
    CustomerGroup,
    InboxFilter,
    ThreadChannel,
    conversationForChannel,
    conversationRefKey,
    defaultThreadChannel,
    groupConversations,
    groupHasChannel,
    keepMessageOnChannel,
    partitionSharedGroups,
    threadChannelsOf,
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
import SendViaBar, { sendViaLabel, type SendViaChoice } from './SendViaBar';
import { ThreadMessage } from './inboxMessages';
import { DEMO_CONVERSATIONS, DEMO_MESSAGES } from './inboxDemo';
import { displayUkPhone, resolveThreadPhone, threadLooksBounced } from '../../utils/agentInboxBounce';

const whatsappOpener = (firstName?: string, vehicleTitle?: string): string => {
    const name = (firstName || 'there').trim() || 'there';
    const vehicle = (vehicleTitle || 'car').trim() || 'car';
    return `Hi ${name}, thanks for enquiring about the ${vehicle}. It's still available. Would you like any more details, or to arrange a viewing or test drive?`;
};

const homeOf = (conv: Conversation, fallback: string): string => conv.companyId || fallback;

const viaIsAvailable = (via: SendViaChoice, phone?: string, emailOk?: boolean): boolean => {
    if (via === 'whatsapp') return !!phone;
    if (via === 'email') return !!emailOk;
    return !!phone && !!emailOk;
};

const defaultSendVia = (opts: {
    pane: ThreadChannel;
    phone?: string;
    emailOk: boolean;
    bounced: boolean;
    whatsappAlreadySent: boolean;
    firstReply: boolean;
}): SendViaChoice => {
    const { pane, phone, emailOk, bounced, whatsappAlreadySent, firstReply } = opts;
    if (bounced && phone) return 'whatsapp';
    if (pane === 'whatsapp' && phone) return 'whatsapp';
    if (pane === 'email' && phone && emailOk && firstReply && !whatsappAlreadySent) return 'both';
    if (pane === 'email' && emailOk) return 'email';
    if (phone) return 'whatsapp';
    return emailOk ? 'email' : 'whatsapp';
};

/** Steve's choice to reveal the other ledger's leads, remembered on this phone. */
const SHOW_OTHER_LEDGER_KEY = 'agentInbox.showOtherLedger';

const readShowOtherLedger = (): boolean => {
    try {
        return window.localStorage.getItem(SHOW_OTHER_LEDGER_KEY) === '1';
    } catch {
        return false;
    }
};

const writeShowOtherLedger = (on: boolean): void => {
    try {
        window.localStorage.setItem(SHOW_OTHER_LEDGER_KEY, on ? '1' : '0');
    } catch {
        // Private mode etc. — the toggle still works for this visit.
    }
};

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

/** Tiny muted channel glyphs — quieter than pills, still tells Steve how they talk. */
const ChannelGlyphs: React.FC<{ channels: Channel[] }> = ({ channels }) => (
    <span className="inline-flex flex-shrink-0 translate-y-[2px] items-center gap-1 text-[#8696a0]" aria-hidden>
        {channels.includes('whatsapp') && <WhatsAppIcon className="h-3.5 w-3.5" />}
        {channels.includes('email') && <EnvelopeIcon className="h-3.5 w-3.5" />}
        {channels.includes('sms') && <PhoneIcon className="h-3.5 w-3.5" />}
    </span>
);

const GroupRow: React.FC<{
    group: CustomerGroup;
    active: boolean;
    onClick: () => void;
}> = ({ group, active, onClick }) => {
    const wa = group.channels.includes('whatsapp');
    const attention = group.waiting ? 'Needs you' : group.pending ? 'Draft' : group.escalated ? 'Escalated' : null;

    return (
        <button
            type="button"
            onClick={onClick}
            className={`flex min-h-[44px] w-full items-center gap-3 px-3 py-3 text-left transition-colors ${
                active ? 'bg-[#2a3942]' : 'hover:bg-white/[0.04]'
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
                <div className="mt-0.5 flex items-center gap-2">
                    <p className={`min-w-0 flex-1 truncate text-[13px] ${group.unread ? 'font-medium text-[#e9edef]' : 'text-[#8696a0]'}`}>
                        <span className={`font-semibold ${
                            group.latest.channel === 'whatsapp' ? 'text-[#25d366]' : group.latest.channel === 'email' ? 'text-sky-300' : 'text-violet-300'
                        }`}>
                            {group.latest.channel === 'whatsapp' ? 'WhatsApp' : group.latest.channel === 'email' ? 'Email' : 'SMS'}
                        </span>
                        <span className="mx-1.5 text-[#8696a0]/40" aria-hidden>·</span>
                        {group.preview || 'No messages yet'}
                    </p>
                    {attention ? (
                        <span className="flex-shrink-0 rounded-full bg-amber-400/15 px-2 py-0.5 text-[10px] font-semibold text-amber-300">
                            {attention}
                        </span>
                    ) : group.unread > 0 ? (
                        <span className="flex h-5 min-w-[1.25rem] flex-shrink-0 items-center justify-center rounded-full bg-[#25d366] px-1.5 text-[11px] font-bold text-[#111b21]">
                            {group.unread > 99 ? '99+' : group.unread}
                        </span>
                    ) : null}
                </div>
                {(group.channels.length > 1 || group.shared) && (
                    <div className="mt-1 flex items-center gap-1.5">
                        {group.channels.length > 1 && <ChannelGlyphs channels={group.channels} />}
                        {group.shared && (
                            <span className="inline-flex rounded bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-medium text-[#8696a0]">
                                Other ledger
                            </span>
                        )}
                    </div>
                )}
            </div>
        </button>
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
    const [threadChannel, setThreadChannel] = useState<ThreadChannel>('whatsapp');
    const [sendVia, setSendVia] = useState<SendViaChoice | null>(null);
    const [messagesByConv, setMessagesByConv] = useState<Record<string, AgentMessage[]>>({});
    const [reply, setReply] = useState('');
    const [sending, setSending] = useState(false);
    const [answer, setAnswer] = useState('');
    const [answering, setAnswering] = useState(false);
    const [changingMode, setChangingMode] = useState(false);
    const [agentName, setAgentName] = useState('Dave');
    const [draftText, setDraftText] = useState('');
    const [promptText, setPromptText] = useState('');
    const [draftBusy, setDraftBusy] = useState<'' | 'approve' | 'discard'>('');
    const [replyMode, setReplyMode] = useState<'human' | 'agent'>('human');
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
    const [answerMode, setAnswerMode] = useState(false);
    const [detailsOpen, setDetailsOpen] = useState(false);
    const [carFixOpen, setCarFixOpen] = useState(false);
    const [carFixNote, setCarFixNote] = useState('');
    const [carFixBusy, setCarFixBusy] = useState(false);
    const [pendingSplit, setPendingSplit] = useState<{ message: AgentMessage; conv: Conversation } | null>(null);
    const [splitting, setSplitting] = useState(false);
    const [showOther, setShowOther] = useState(readShowOtherLedger);
    const [selectedMsgKey, setSelectedMsgKey] = useState<string | null>(null);
    const [bannerCollapsed, setBannerCollapsed] = useState(false);
    /** Dave's draft card starts collapsed so the Me composer stays on screen. */
    const [draftOpen, setDraftOpen] = useState(false);
    /** Keyboard overlap on phones — visualViewport height, not layout height. */
    const [kbInset, setKbInset] = useState(0);
    /** draftNow in flight ('working') or fell over ('failed') — never blocks typing. */
    const [drafting, setDrafting] = useState<null | 'working' | 'failed'>(null);

    const toggleShowOther = useCallback(() => {
        setShowOther(on => {
            writeShowOtherLedger(!on);
            return !on;
        });
    }, []);

    const threadRef = useRef<HTMLDivElement>(null);
    const replyBoxRef = useRef<HTMLTextAreaElement>(null);
    const fileRef = useRef<HTMLInputElement>(null);

    const growBox = (el: HTMLTextAreaElement | null) => {
        if (!el) return;
        el.style.height = 'auto';
        el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
    };

    useEffect(() => {
        const vv = window.visualViewport;
        if (!vv) return;
        const sync = () => {
            const inset = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
            setKbInset(inset > 40 ? inset : 0);
        };
        vv.addEventListener('resize', sync);
        vv.addEventListener('scroll', sync);
        sync();
        return () => {
            vv.removeEventListener('resize', sync);
            vv.removeEventListener('scroll', sync);
        };
    }, []);

    /**
     * Bumped every time the database socket is bounced, and threaded through the
     * dependency list of every subscription below so they are all torn down and
     * re-attached. Bouncing the socket alone is not enough: a listener attached
     * before the bounce can keep the snapshot it had and never fire again, which
     * is a thread that looks frozen while sends still work.
     */
    const [resumeTick, setResumeTick] = useState(0);
    useEffect(() => onDatabaseResume(() => setResumeTick(tick => tick + 1)), []);

    useEffect(() => {
        if (!companyId) return;
        if (companyId === 'demo-company') {
            setOwn(DEMO_CONVERSATIONS);
            return;
        }
        return subscribeToAgentConversations(companyId, setOwn);
    }, [companyId, resumeTick]);

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
    }, [inbox, resumeTick]);

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

    const allGroups = useMemo(
        () => groupConversations(conversations, companyId || undefined),
        [conversations, companyId]
    );
    const otherLedgerCount = useMemo(() => partitionSharedGroups(allGroups).other.length, [allGroups]);

    const groups = useMemo(() => {
        const base = showOther ? allGroups : partitionSharedGroups(allGroups).mine;
        const q = query.trim().toLowerCase();
        return base.filter(group => {
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
    }, [allGroups, showOther, filter, query]);

    const linkHandled = useRef(false);
    useEffect(() => {
        if (linkHandled.current) return;
        linkHandled.current = true;
        const convId = takeRequestedConversation() || takeConversationFromUrl();
        if (convId) setActiveConvId(convId);
    }, []);

    useEffect(() => onAgentConversationRequest(setActiveConvId), []);

    // Resolved against every group (not the visible list) so a notification
    // link still opens a thread the shared-ledger toggle is hiding.
    const activeGroup = useMemo(() => {
        if (activeGroupId) {
            const byId = allGroups.find(g => g.id === activeGroupId);
            if (byId) return byId;
        }
        if (activeConvId) return allGroups.find(g => g.conversations.some(c => c.id === activeConvId)) || null;
        return null;
    }, [allGroups, activeGroupId, activeConvId]);

    const paneChannels = useMemo(
        () => (activeGroup ? threadChannelsOf(activeGroup) : []),
        [activeGroup]
    );

    const pane: ThreadChannel = paneChannels.includes(threadChannel)
        ? threadChannel
        : (paneChannels[0] || 'email');

    const active = useMemo(() => {
        if (!activeGroup) return null;
        const preferred = conversationForChannel(activeGroup, pane);
        return activeGroup.conversations.find(c => c.id === activeConvId && keepMessageOnChannel({ channel: c.channel }, c, pane))
            || preferred;
    }, [activeGroup, activeConvId, pane]);

    useEffect(() => {
        if (activeGroupId || !activeConvId) return;
        const group = allGroups.find(g => g.conversations.some(c => c.id === activeConvId));
        if (!group) return;
        const conv = group.conversations.find(c => c.id === activeConvId);
        setActiveGroupId(group.id);
        if (conv && (conv.channel === 'whatsapp' || conv.channel === 'email')) {
            setThreadChannel(conv.channel);
        }
    }, [activeConvId, activeGroupId, allGroups]);

    useEffect(() => {
        if (!activeGroup) return;
        const next = conversationForChannel(activeGroup, pane);
        if (activeConvId === next.id) return;
        setActiveConvId(next.id);
    }, [activeGroup?.id, pane]);

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
        setAnswerMode(false);
        setDetailsOpen(false);
        setCarFixOpen(false);
        setCarFixNote('');
        setSelectedMsgKey(null);
        setBannerCollapsed(false);
        setDrafting(null);
        setDraftOpen(false);
        setReplyMode('human');
        setSendVia(null);
        if (companyId === 'demo-company') {
            const next: Record<string, AgentMessage[]> = {};
            activeGroup.conversations.forEach(conv => {
                next[conversationRefKey(conv)] = DEMO_MESSAGES[conv.id] || [];
            });
            setMessagesByConv(next);
            return;
        }
        const unsubs = activeGroup.conversations.map(conv => {
            const home = homeOf(conv, companyId);
            void markConversationRead(home, conv.id).catch(() => undefined);
            void dismissConversationNotifications(conv.id);
            return subscribeToAgentMessages(home, conv.id, msgs => {
                setMessagesByConv(prev => ({ ...prev, [conversationRefKey(conv)]: msgs }));
            });
        });
        return () => unsubs.forEach(stop => stop());
    }, [companyId, activeGroup?.id, resumeTick]);

    const draftHost = useMemo(() => {
        if (!activeGroup) return active;
        return activeGroup.conversations.find(c => c.channel === pane && c.pendingDraft)
            || activeGroup.conversations.find(c => c.pendingDraft)
            || active;
    }, [activeGroup, pane, active]);

    const questionHost = useMemo(() => {
        if (!activeGroup) return active;
        return activeGroup.conversations.find(c => c.channel === pane && c.pendingQuestion)
            || activeGroup.conversations.find(c => c.pendingQuestion)
            || active;
    }, [activeGroup, pane, active]);

    const draftId = draftHost?.pendingDraft?.id || '';
    useEffect(() => {
        setDraftText(draftHost?.pendingDraft?.text || '');
        // The prompt that produced this draft stays amendable, so a tweak-and-
        // re-run never means retyping. Unprompted drafts start with a blank prompt.
        setPromptText(draftHost?.pendingDraft?.source === 'instruction' ? (draftHost?.ownerAnswer?.answer || '') : '');
        if (draftId) {
            setPhrasingSince(null);
            setReplyMode('human');
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [draftId]);

    useEffect(() => {
        setSendVia(null);
    }, [active?.id, pane]);

    useEffect(() => {
        if (filter === 'all') return;
        setThreadChannel(filter);
    }, [filter]);

    useEffect(() => {
        if (answerMode) replyBoxRef.current?.focus();
    }, [answerMode]);

    const allMessages = useMemo(() => {
        if (!activeGroup) return [];
        const list: Array<AgentMessage & { conv: Conversation }> = [];
        activeGroup.conversations.forEach(conv => {
            const key = conversationRefKey(conv);
            (messagesByConv[key] || []).forEach(message => {
                list.push({ ...message, conv });
            });
        });
        list.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
        return list;
    }, [activeGroup, messagesByConv]);

    const messages = useMemo(
        () => allMessages.filter(message => keepMessageOnChannel(message, message.conv, pane)),
        [allMessages, pane]
    );

    const channelCounts = useMemo(() => ({
        whatsapp: allMessages.filter(m => keepMessageOnChannel(m, m.conv, 'whatsapp')).length,
        email: allMessages.filter(m => keepMessageOnChannel(m, m.conv, 'email')).length,
    }), [allMessages]);

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
        const channel = defaultThreadChannel(group, filter);
        setActiveGroupId(group.id);
        setThreadChannel(channel);
        setActiveConvId(conversationForChannel(group, channel).id);
    }, [filter]);

    useEffect(() => {
        if (activeGroupId || activeConvId || !groups.length) return;
        if (typeof window !== 'undefined' && window.innerWidth < 1024) return;
        openGroup(groups[0]);
    }, [groups, activeGroupId, activeConvId, openGroup]);

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
            const phone = resolveThreadPhone(active, allMessages, leads.find(l => l.id === active.contact?.leadId)?.phone);
            const emailOk = !threadLooksBounced(active, allMessages) && !!conversationEmail(active);
            const whatsappAlreadySent = allMessages.some(m => m.direction === 'out' && m.channel === 'whatsapp');
            const via = (sendVia && viaIsAvailable(sendVia, phone, emailOk))
                ? sendVia
                : defaultSendVia({
                    pane,
                    phone,
                    emailOk,
                    bounced: !emailOk,
                    whatsappAlreadySent,
                    firstReply: !active.lastOutboundAt,
                });
            const result = await sendAgentReply(homeOf(active, companyId), active.id, text, media, via, phone);
            setReply('');
            setAttachment(null);
            setSendError(null);
            if (replyBoxRef.current) replyBoxRef.current.style.height = '';
            const sent = (result?.sent || []).map(ch => CHANNEL_LABELS[ch] || ch);
            toast.success(
                result?.skippedWhatsApp
                    ? `${sent.length && !result.held ? `Sent on ${sent.join(' and ')}. ` : ''}${result.skippedWhatsApp}`
                    : sent.length ? `Sent on ${sent.join(' and ')}.` : 'Sent.'
            );
        } catch (err: any) {
            setSendError(describeError(err, 'That message was not sent.'));
        } finally {
            setSendStatus(null);
            setSending(false);
        }
    }, [companyId, active, reply, attachment, sending, toast, sendVia, pane, allMessages, leads]);

    const handleInstruct = useCallback(async () => {
        const text = reply.trim();
        if (!companyId || !active || !text || sending) return;
        setSending(true);
        setPhrasingSince(Date.now());
        setDraftOpen(true);
        try {
            await instructAgent(homeOf(active, companyId), active.id, text);
            setReply('');
            setSendError(null);
            if (replyBoxRef.current) replyBoxRef.current.style.height = '';
        } catch (err: any) {
            setPhrasingSince(null);
            setSendError(describeError(err, `Could not pass that on to ${agentName}.`));
        } finally {
            setSending(false);
        }
    }, [companyId, active, reply, sending, toast, agentName]);

    const handleAnswer = useCallback(async () => {
        const text = answer.trim();
        const host = questionHost || active;
        if (!companyId || !host || !text || answering) return;
        setAnswering(true);
        try {
            await answerAgentQuestion(homeOf(host, companyId), host.id, text);
            setAnswer('');
            setSendError(null);
            toast.success('Sent back to the agent — it will put that in its own words.');
        } catch (err: any) {
            setSendError(describeError(err, 'Could not pass that answer back to the agent.'));
        } finally {
            setAnswering(false);
        }
    }, [companyId, questionHost, active, answer, answering, toast]);

    const handleApproveDraft = useCallback(async () => {
        const text = draftText.trim();
        const host = draftHost;
        if (!companyId || !host || !text || draftBusy) return;
        setDraftBusy('approve');
        try {
            const phone = resolveThreadPhone(host, allMessages, leads.find(l => l.id === host.contact?.leadId)?.phone);
            const emailOk = !threadLooksBounced(host, allMessages) && !!conversationEmail(host);
            const whatsappAlreadySent = allMessages.some(m => m.direction === 'out' && m.channel === 'whatsapp');
            const via = (sendVia && viaIsAvailable(sendVia, phone, emailOk))
                ? sendVia
                : defaultSendVia({
                    pane,
                    phone,
                    emailOk,
                    bounced: !emailOk,
                    whatsappAlreadySent,
                    firstReply: !host.lastOutboundAt,
                });
            const result = await approveAgentDraft(homeOf(host, companyId), host.id, text, 'agent', via, phone);
            const sent = (result.sent || [host.channel]).map(ch => CHANNEL_LABELS[ch] || ch).join(' and ');
            toast.success(approvedSendMessage(sent, result.sendAfter));
        } catch (err: any) {
            toast.error(err?.message || 'That draft was not sent.');
        } finally {
            setDraftBusy('');
        }
    }, [companyId, draftHost, draftText, draftBusy, toast, sendVia, pane, allMessages, leads]);

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
        if (!companyId || !draftHost || draftBusy) return;
        setDraftBusy('discard');
        try {
            await discardAgentDraft(homeOf(draftHost, companyId), draftHost.id);
            toast.success('Draft binned. Nothing was sent.');
        } catch (err: any) {
            toast.error(err?.message || 'That draft could not be discarded.');
        } finally {
            setDraftBusy('');
        }
    }, [companyId, draftHost, draftBusy, toast]);

    /**
     * "Wrong car." Put Dave right about which car this thread is about.
     *
     * The thread can come back on another ledger — that is the point of it — so the
     * selection is dropped rather than left pointing at an id that no longer exists.
     * The live subscription brings it back under the other dealer within the second.
     */
    const handleCarFix = useCallback(async () => {
        if (!companyId || !active || carFixBusy) return;
        const note = carFixNote.trim();
        if (!note) return;

        setCarFixBusy(true);
        try {
            const result = await correctThreadCar(homeOf(active, companyId), active.id, note);
            setCarFixOpen(false);
            setCarFixNote('');
            if (result.moved) {
                setActiveGroupId(null);
                setActiveConvId(null);
            }
            toast.success(result.message);
        } catch (err: any) {
            toast.error(err?.message || 'That correction could not be applied.');
        } finally {
            setCarFixBusy(false);
        }
    }, [companyId, active, carFixNote, carFixBusy, toast]);

    const pickSplitTarget = useCallback((): { message: AgentMessage; conv: Conversation } | null => {
        const isCustomerEmail = (m: AgentMessage) =>
            m.from === 'customer' && m.channel === 'email' && !instructionText(m) && !bounceNoticeText(m);
        if (selectedMsgKey) {
            const found = allMessages.find(m => `${conversationRefKey(m.conv)}:${m.id}` === selectedMsgKey);
            if (found && isCustomerEmail(found)) return { message: found, conv: found.conv };
        }
        const inbounds = allMessages.filter(isCustomerEmail);
        if (inbounds.length < 2) return null;
        const latest = inbounds[inbounds.length - 1];
        return { message: latest, conv: latest.conv };
    }, [allMessages, selectedMsgKey]);

    const requestSplit = useCallback((target?: { message: AgentMessage; conv: Conversation } | null) => {
        const picked = target || pickSplitTarget();
        if (!picked) {
            toast.error('Tap the email that is the other person, then try again.');
            return;
        }
        setPendingSplit(picked);
    }, [pickSplitTarget, toast]);

    const handleConfirmSplit = useCallback(async () => {
        if (!companyId || !pendingSplit || splitting) return;
        setSplitting(true);
        try {
            const result = await detachAgentMessage(
                homeOf(pendingSplit.conv, companyId),
                pendingSplit.conv.id,
                pendingSplit.message.id
            );
            setPendingSplit(null);
            setSelectedMsgKey(null);
            toast.success(result.message);
        } catch (err: any) {
            toast.error(err?.message || 'That email could not be separated.');
        } finally {
            setSplitting(false);
        }
    }, [companyId, pendingSplit, splitting, toast]);

    /**
     * Ask the backend to draft a reply to whatever the customer is waiting on.
     * Benign refusals (already drafted, paused, nothing waiting) stay silent;
     * a real failure only shows a quiet retry line — never a blocked thread.
     */
    const requestDraft = useCallback(async (conv: Conversation, force = false) => {
        if (!companyId) return;
        setDraftOpen(true);
        setDrafting('working');
        try {
            await draftNow(homeOf(conv, companyId), conv.id, force);
            setDrafting(null);
        } catch {
            setDrafting('failed');
        }
    }, [companyId]);

    /**
     * Run Dave again from the vetting card. With an amended prompt it follows
     * the prompt; with the prompt left empty it just has another go.
     */
    const handleReprompt = useCallback(async () => {
        const text = promptText.trim();
        if (!companyId || !active || sending) return;
        setSending(true);
        setPhrasingSince(Date.now());
        setDraftOpen(true);
        try {
            const host = draftHost || active;
            if (!host) return;
            if (text) {
                await instructAgent(homeOf(host, companyId), host.id, text);
            } else {
                await draftNow(homeOf(host, companyId), host.id, true);
                setPhrasingSince(null);
            }
            setSendError(null);
        } catch (err: any) {
            setPhrasingSince(null);
            setSendError(describeError(err, `Could not pass that on to ${agentName}.`));
        } finally {
            setSending(false);
        }
    }, [companyId, active, draftHost, promptText, sending, agentName]);

    const handleWhatsAppHer = useCallback(async (preset?: string) => {
        if (!companyId || !active || sending) return;
        const phone = resolveThreadPhone(active, allMessages, leads.find(l => l.id === active.contact?.leadId)?.phone);
        if (!phone) {
            setSendError({ message: 'No mobile number on file.' });
            return;
        }
        const typed = (typeof preset === 'string' ? preset : reply).trim();
        const text = typed || whatsappOpener(active.contact?.firstName, active.vehicleInterest?.title);
        setSending(true);
        try {
            const opener = !typed;
            const result = await sendAgentReply(homeOf(active, companyId), active.id, text, undefined, 'whatsapp', phone, opener);
            if (typeof preset !== 'string') setReply('');
            setSendError(null);
            toast.success(result?.skippedWhatsApp || (active.lastCustomerMessageAt ? 'Sent on WhatsApp.' : 'WhatsApp opener sent.'));
        } catch (err: any) {
            setSendError(describeError(err, 'That WhatsApp could not be sent.'));
        } finally {
            setSending(false);
        }
    }, [companyId, active, reply, sending, toast, allMessages, leads]);

    const handleAddPhone = useCallback(async (raw: string) => {
        if (!active || !companyId) return;
        const home = homeOf(active, companyId);
        if (companyId !== 'demo-company') {
            await saveConversationPhone(home, active.id, raw);
        } else {
            setOwn(list => (list || []).map(conv => (
                conv.id === active.id ? { ...conv, contact: { ...conv.contact, phone: raw } } : conv
            )));
        }
        setSendVia(current => current || 'both');
        toast.success('Mobile saved. You can send WhatsApp on this thread.');
    }, [active, companyId, toast]);

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

    // Tab counts match what the list actually shows for the current toggle.
    const counts = useMemo(() => {
        const base = showOther ? allGroups : partitionSharedGroups(allGroups).mine;
        return {
            all: base.length,
            whatsapp: base.filter(g => groupHasChannel(g, 'whatsapp')).length,
            email: base.filter(g => groupHasChannel(g, 'email')).length,
        };
    }, [allGroups, showOther]);

    if (!companyId || own === null) {
        return (
            <div className="flex h-full items-center justify-center">
                <Spinner className="h-8 w-8 text-[#25d366]" />
            </div>
        );
    }

    const emailOnFile = active ? conversationEmail(active) : undefined;
    const bounced = !!(active && threadLooksBounced(active, allMessages));
    const phoneOnFile = active
        ? resolveThreadPhone(active, allMessages, linkedLead?.phone)
        : undefined;
    const whatsappAlreadySent = allMessages.some(m => m.direction === 'out' && m.channel === 'whatsapp');
    const whatsappNeedsOpener = !!phoneOnFile && !(active?.lastCustomerMessageAt);
    const lastEmailOut = [...allMessages].reverse().find(m => m.direction === 'out' && m.channel === 'email');
    const asking = !!questionHost?.pendingQuestion && answerMode;
    const hasDraft = !!draftHost?.pendingDraft;
    const offerWhatsAppFollowUp = !!(
        active
        && phoneOnFile
        && !whatsappAlreadySent
        && lastEmailOut
        && !hasDraft
        && !bounced
        && pane === 'email'
        && !asking
    );
    const customerWaiting = !!(
        active
        && !hasDraft
        && !questionHost?.pendingQuestion
        && (active.lastCustomerMessageAt || 0) > (active.lastOutboundAt || 0)
    );
    const emailOk = !!emailOnFile && !bounced;
    const sendViaNow: SendViaChoice = attachment && phoneOnFile
        ? 'whatsapp'
        : (sendVia && viaIsAvailable(sendVia, phoneOnFile, emailOk))
            ? sendVia
            : defaultSendVia({
                pane,
                phone: phoneOnFile,
                emailOk,
                bounced,
                whatsappAlreadySent,
                firstReply: !active?.lastOutboundAt,
            });
    const showSendVia = !asking && (!!phoneOnFile || emailOk || !!handleAddPhone);
    const emailPane = pane === 'email';
    const showChannelSwitch = paneChannels.length > 1;
    const tabs: Array<{ id: InboxFilter; label: string; count: number; accent?: string }> = [
        { id: 'all', label: 'All', count: counts.all },
        { id: 'whatsapp', label: 'WhatsApp', count: counts.whatsapp, accent: 'text-[#25d366]' },
        { id: 'email', label: 'Email', count: counts.email, accent: 'text-sky-300' },
    ];

    return (
        <div
            className="flex h-full min-h-0 bg-[#0b141a] text-[#e9edef]"
            style={kbInset ? { height: `calc(100% - ${kbInset}px)` } : undefined}
        >
            <aside className={`min-h-0 w-full flex-col border-r border-white/5 bg-[#111b21] lg:flex lg:w-[22rem] xl:w-[26rem] ${activeGroup ? 'hidden lg:flex' : 'flex'}`}>
                <div className="flex items-center justify-between gap-2 px-4 py-3">
                    <div className="flex min-w-0 items-center gap-2">
                        <button
                            type="button"
                            onClick={() => setView('dashboard')}
                            className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full text-[#8696a0] hover:bg-white/5 hover:text-white lg:hidden"
                            aria-label="Back to the app"
                        >
                            <ArrowLeftIcon className="h-5 w-5" />
                        </button>
                        <div className="min-w-0">
                            <h2 className="text-lg font-semibold text-white">Inbox</h2>
                            <p className="text-[11px] text-[#8696a0]">
                                {inbox
                                    ? `${inbox.name || 'Shared number'} · every ledger`
                                    : 'One person, one channel at a time'}
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={() => setComposeOpen(true)}
                        className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full bg-[#25d366] px-3.5 text-xs font-semibold text-[#111b21] hover:bg-[#20bd5a]"
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
                            {tab.label}{' '}
                            <span className="opacity-70">{tab.count}</span>
                        </button>
                    ))}
                </div>

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

                {otherLedgerCount > 0 && (
                    <div className="px-3 pb-1">
                        <button
                            type="button"
                            onClick={toggleShowOther}
                            aria-pressed={showOther}
                            className="flex min-h-[44px] w-full items-center justify-between rounded-lg px-3 text-[12px] font-medium text-[#8696a0] transition-colors hover:bg-white/5 hover:text-white"
                        >
                            <span>
                                Other ledger&apos;s leads
                                {!showOther && (
                                    <span className="ml-1.5 rounded-full bg-white/[0.08] px-1.5 py-0.5 text-[10px] font-semibold text-[#e9edef]">
                                        {otherLedgerCount} hidden
                                    </span>
                                )}
                            </span>
                            <span className={showOther ? 'font-semibold text-[#e9edef]' : ''}>
                                {showOther ? 'Hide' : 'Show'}
                            </span>
                        </button>
                    </div>
                )}

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
                        <div className="relative border-b border-white/5 bg-[#202c33] px-2 py-1.5 sm:px-3 sm:py-2">
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => { setActiveGroupId(null); setActiveConvId(null); }}
                                    className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full text-[#8696a0] hover:bg-white/5 hover:text-white lg:hidden"
                                    aria-label="Back to the list"
                                >
                                    <ArrowLeftIcon className="h-5 w-5" />
                                </button>
                                <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-sm font-semibold ${avatarTone(activeGroup.name, activeGroup.channels.includes('whatsapp'))}`}>
                                    {initials(activeGroup.name)}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2">
                                        <h2 className="min-w-0 truncate text-[16px] font-semibold leading-tight text-white">{activeGroup.name}</h2>
                                        {active.escalated && !bounced && <Badge size="sm" variant="danger">Escalated</Badge>}
                                    </div>
                                    <div className="mt-0.5 text-[12px] leading-tight text-[#8696a0]">
                                        {active.vehicleInterest?.title && (
                                            <span className="flex min-w-0 items-center gap-1">
                                                <CarIcon className="h-3.5 w-3.5 flex-shrink-0 text-[#25d366]" />
                                                <span className="truncate">{active.vehicleInterest.title}</span>
                                            </span>
                                        )}
                                        <span className="mt-0.5 flex min-w-0 items-center gap-1.5">
                                            {phoneOnFile ? (
                                                <a href={`tel:${phoneOnFile}`} className="inline-flex min-w-0 items-center gap-1 truncate text-[#25d366] hover:underline">
                                                    <PhoneIcon className="h-3 w-3 flex-shrink-0" />
                                                    {displayUkPhone(phoneOnFile)}
                                                </a>
                                            ) : !active.vehicleInterest?.title ? (
                                                <span className="truncate">{emailOnFile || active.address}</span>
                                            ) : null}
                                            {(phoneOnFile || !active.vehicleInterest?.title) && (
                                                <span className="text-[#8696a0]/40" aria-hidden>·</span>
                                            )}
                                            <span className={`flex-shrink-0 font-medium ${
                                                active.mode === 'agent' ? 'text-sky-300' : active.mode === 'human' ? 'text-emerald-300' : 'text-amber-300'
                                            }`}>
                                                {active.mode === 'agent' ? agentName : active.mode === 'human' ? 'You' : 'Paused'}
                                            </span>
                                        </span>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setMenuOpen(o => !o)}
                                    aria-haspopup="menu"
                                    aria-expanded={menuOpen}
                                    aria-label="Conversation options"
                                    className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full text-[#8696a0] hover:bg-white/5 hover:text-white"
                                >
                                    <EllipsisVerticalIcon className="h-5 w-5" />
                                </button>
                            </div>

                            {showChannelSwitch ? (
                                <div className="mt-2 flex rounded-lg bg-black/35 p-0.5" role="tablist" aria-label="Channel">
                                    {paneChannels.map(ch => {
                                        const on = pane === ch;
                                        const n = channelCounts[ch];
                                        return (
                                            <button
                                                key={ch}
                                                type="button"
                                                role="tab"
                                                aria-selected={on}
                                                onClick={() => setThreadChannel(ch)}
                                                className={`flex h-9 flex-1 items-center justify-center gap-1.5 rounded-md text-[12px] font-semibold transition-colors ${
                                                    on
                                                        ? ch === 'whatsapp'
                                                            ? 'bg-[#25d366] text-[#111b21] shadow'
                                                            : 'bg-sky-600 text-white shadow'
                                                        : 'text-[#8696a0] hover:text-white'
                                                }`}
                                            >
                                                {ch === 'whatsapp' ? <WhatsAppIcon className="h-3.5 w-3.5" /> : <EnvelopeIcon className="h-3.5 w-3.5" />}
                                                {ch === 'whatsapp' ? 'WhatsApp' : 'Email'}
                                                <span className={`tabular-nums ${on ? 'opacity-80' : 'opacity-50'}`}>{n}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            ) : (
                                <p className={`mt-1.5 inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide ${
                                    pane === 'whatsapp' ? 'text-[#25d366]' : 'text-sky-300'
                                }`}>
                                    {pane === 'whatsapp' ? <WhatsAppIcon className="h-3.5 w-3.5" /> : <EnvelopeIcon className="h-3.5 w-3.5" />}
                                    {pane === 'whatsapp' ? 'WhatsApp' : 'Email'}
                                </p>
                            )}

                            {carFixOpen && (
                                <div className="mt-2 rounded-xl border border-amber-400/25 bg-amber-400/[0.06] px-3 py-2.5">
                                    <p className="text-[12px] leading-snug text-[#e9edef]">
                                        {active.vehicleInterest?.title
                                            ? <>{agentName} has this down as the <span className="font-medium text-amber-200">{active.vehicleInterest.title}</span>. Which car is it really?</>
                                            : <>Which car is this enquiry about?</>}
                                    </p>
                                    <textarea
                                        value={carFixNote}
                                        onChange={e => setCarFixNote(e.target.value)}
                                        onKeyDown={e => {
                                            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void handleCarFix(); }
                                        }}
                                        rows={2}
                                        autoFocus
                                        placeholder="It's the black Boxster, not the Taycan. That one sold months ago."
                                        className="mt-2 w-full resize-none rounded-lg border border-white/10 bg-black/30 px-2.5 py-2 text-[13px] text-[#e9edef] placeholder:text-[#8696a0]/70 focus:border-amber-400/40 focus:outline-none"
                                    />
                                    <div className="mt-2 flex items-center justify-between gap-2">
                                        <p className="text-[11px] leading-snug text-[#8696a0]">
                                            {agentName} re-pins the thread, bins the draft and remembers this. If the car is the other ledger's, the thread goes to them.
                                        </p>
                                        <div className="flex flex-shrink-0 items-center gap-2">
                                            <button
                                                type="button"
                                                onClick={() => { setCarFixOpen(false); setCarFixNote(''); }}
                                                className="text-[12px] font-medium text-[#8696a0] hover:text-white"
                                            >
                                                Cancel
                                            </button>
                                            <Button size="sm" onClick={handleCarFix} disabled={carFixBusy || !carFixNote.trim()}>
                                                {carFixBusy ? <Spinner className="h-3.5 w-3.5" /> : `Tell ${agentName}`}
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            )}

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
                                        <div className="my-1 border-t border-white/5" />
                                        <MenuItem onClick={() => { setMenuOpen(false); setDetailsOpen(o => !o); setCarFixOpen(false); }}>
                                            Details
                                        </MenuItem>
                                        <MenuItem onClick={() => { setMenuOpen(false); setCarFixOpen(true); setDetailsOpen(false); }}>
                                            <CarIcon className="h-4 w-4 text-amber-300" />
                                            Wrong car
                                        </MenuItem>
                                        <MenuItem onClick={() => { setMenuOpen(false); requestSplit(); }}>
                                            <UsersIcon className="h-4 w-4 text-amber-300" />
                                            Different person
                                        </MenuItem>
                                        {(phoneOnFile || active.contact?.leadId) && <div className="my-1 border-t border-white/5" />}
                                        {phoneOnFile && (
                                            <a href={`tel:${phoneOnFile}`} role="menuitem" onClick={() => setMenuOpen(false)} className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-[#e9edef] hover:bg-white/5">
                                                <PhoneIcon className="h-4 w-4 text-[#8696a0]" />
                                                Call {displayUkPhone(phoneOnFile)}
                                            </a>
                                        )}
                                        {phoneOnFile && !whatsappAlreadySent && (
                                            <MenuItem onClick={() => {
                                                setMenuOpen(false);
                                                setThreadChannel('whatsapp');
                                                void handleWhatsAppHer(reply.trim() || lastEmailOut?.text || '');
                                            }}>
                                                <WhatsAppIcon className="h-4 w-4 text-[#25d366]" />
                                                Follow up on WhatsApp
                                            </MenuItem>
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

                        {bounced && (whatsappAlreadySent || bannerCollapsed ? (
                            /* Handled or put away: one quiet line, the chat gets the screen back. */
                            <div className="flex items-center gap-2 border-b border-white/5 bg-[#141c22] px-4 py-1.5">
                                {phoneOnFile ? (
                                    <WhatsAppIcon className="h-3.5 w-3.5 flex-shrink-0 text-[#25d366]" />
                                ) : (
                                    <ExclamationTriangleIcon className="h-3.5 w-3.5 flex-shrink-0 text-red-300" />
                                )}
                                <p className="min-w-0 flex-1 truncate text-[12px] text-[#8696a0]">
                                    {phoneOnFile
                                        ? whatsappAlreadySent
                                            ? 'Email bounces — this thread runs on WhatsApp now.'
                                            : 'Email bounces — replies go by WhatsApp.'
                                        : 'Email bounces — no number on file either.'}
                                </p>
                            </div>
                        ) : (
                            <div className="relative border-b border-white/5 border-l-2 border-l-red-400/80 bg-[#141c22] px-4 py-3">
                                <button
                                    type="button"
                                    onClick={() => setBannerCollapsed(true)}
                                    aria-label="Put this notice away"
                                    className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full text-[#8696a0] hover:bg-white/5 hover:text-white"
                                >
                                    <XMarkIcon className="h-4 w-4" />
                                </button>
                                <p className="pr-8 text-[13px] font-semibold text-white">Email bounced — {phoneOnFile ? 'reach them on WhatsApp instead' : 'no other way through'}</p>
                                <p className="mt-0.5 pr-8 text-[12px] leading-snug text-[#8696a0]">
                                    {emailOnFile ? `${emailOnFile} is undeliverable` : 'Their address is undeliverable'}
                                    {active.emailBounce?.reason ? ` (${active.emailBounce.reason})` : ''}.
                                    {phoneOnFile ? ' Email replies are switched off for this thread.' : ' No mobile number on file.'}
                                </p>
                                {phoneOnFile && (
                                    <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setThreadChannel('whatsapp');
                                                void handleWhatsAppHer();
                                            }}
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
                        ))}

                        {questionHost?.pendingQuestion && (
                            <div className="border-b border-white/5 border-l-2 border-l-amber-400/80 bg-[#141c22] px-4 py-3">
                                <div className="flex items-start gap-2.5">
                                    <SparklesIcon className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-300" />
                                    <div className="min-w-0 flex-1">
                                        <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-300">{agentName} needs an answer</p>
                                        <p className="mt-1 text-[14px] leading-snug text-white">{questionHost.pendingQuestion.question}</p>
                                        {questionHost.pendingQuestion.context && (
                                            <p className="mt-1 text-[12px] leading-snug text-[#8696a0]">{questionHost.pendingQuestion.context}</p>
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

                        {active.escalated && active.escalationReason && !questionHost?.pendingQuestion && !bounced && !bannerCollapsed && (
                            <div className="flex items-start gap-2.5 border-b border-white/5 border-l-2 border-l-red-400/80 bg-[#141c22] px-4 py-3">
                                <ExclamationTriangleIcon className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-300" />
                                <p className="min-w-0 flex-1 text-[13px] leading-snug text-[#e9edef]">{active.escalationReason}</p>
                                <button
                                    type="button"
                                    onClick={() => setBannerCollapsed(true)}
                                    aria-label="Put this notice away"
                                    className="-mr-1 -mt-1 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-[#8696a0] hover:bg-white/5 hover:text-white"
                                >
                                    <XMarkIcon className="h-4 w-4" />
                                </button>
                            </div>
                        )}

                        <div
                            ref={threadRef}
                            className={`min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-4 sm:px-4 ${emailPane ? 'space-y-4' : ''}`}
                            style={emailPane ? {
                                backgroundColor: '#0e1620',
                            } : {
                                backgroundColor: '#0b141a',
                                backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.035) 1px, transparent 0)',
                                backgroundSize: '22px 22px',
                            }}
                        >
                            {messages.length ? (
                                messages.map(message => {
                                    const key = `${conversationRefKey(message.conv)}:${message.id}`;
                                    return (
                                        <ThreadMessage
                                            key={key}
                                            message={message}
                                            agentName={agentName}
                                            deskEmail={inbox?.gmailAddress}
                                            selected={selectedMsgKey === key}
                                            onToggleSelect={() => setSelectedMsgKey(k => (k === key ? null : key))}
                                            onDelete={() => setPendingDelete({ kind: 'message', message, conv: message.conv })}
                                            onDetach={
                                                message.from === 'customer' && message.channel === 'email'
                                                    ? () => requestSplit({ message, conv: message.conv })
                                                    : undefined
                                            }
                                        />
                                    );
                                })
                            ) : (
                                <div className="px-4 py-16 text-center">
                                    {emailPane ? (
                                        <>
                                            <EnvelopeIcon className="mx-auto h-10 w-10 text-sky-400/30" />
                                            <p className="mt-3 text-sm font-medium text-[#e9edef]">No emails in this thread</p>
                                            <p className="mt-1 text-xs text-[#8696a0]">
                                                {emailOnFile
                                                    ? `Mail to ${emailOnFile} will show here. WhatsApp stays on the other tab.`
                                                    : 'No email address on file. Switch to WhatsApp to keep talking.'}
                                            </p>
                                        </>
                                    ) : (
                                        <>
                                            <WhatsAppIcon className="mx-auto h-10 w-10 text-[#25d366]/30" />
                                            <p className="mt-3 text-sm font-medium text-[#e9edef]">No WhatsApp yet</p>
                                            <p className="mt-1 text-xs text-[#8696a0]">
                                                {phoneOnFile
                                                    ? `Chat with ${displayUkPhone(phoneOnFile)} shows here. Emails stay on the other tab.`
                                                    : 'No mobile number on file. Switch to Email to keep talking.'}
                                            </p>
                                        </>
                                    )}
                                </div>
                            )}
                        </div>

                        <div
                            className="border-t border-white/5 bg-[#202c33] px-3 pt-2"
                            style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
                        >
                            {!asking && hasDraft && draftHost?.pendingDraft && (
                                <div className="mb-2 overflow-hidden rounded-xl border border-amber-400/25 bg-amber-400/[0.06]">
                                    <button
                                        type="button"
                                        onClick={() => setDraftOpen(o => !o)}
                                        aria-expanded={draftOpen}
                                        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left"
                                    >
                                        <SparklesIcon className="h-3.5 w-3.5 flex-shrink-0 text-amber-300" />
                                        <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-amber-200">
                                            {draftOpen
                                                ? (draftHost.pendingDraft.source === 'instruction'
                                                    ? `${agentName}'s draft, from your prompt`
                                                    : `${agentName} drafted this`)
                                                : (draftText || `${agentName} drafted a reply`)}
                                        </span>
                                        <span className="flex-shrink-0 rounded-full bg-amber-400/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-300">
                                            Not sent
                                        </span>
                                        <ChevronDownIcon className={`h-3.5 w-3.5 flex-shrink-0 text-amber-300/80 transition-transform ${draftOpen ? 'rotate-180' : ''}`} />
                                    </button>
                                    <div className="space-y-2 border-t border-amber-400/15 px-2.5 pb-2.5 pt-2">
                                        {draftOpen && (
                                            <>
                                                {bounced && draftHost.pendingDraft.source === 'agent' && (
                                                    <p className="text-[12px] leading-snug text-red-300">
                                                        This may be a reply to the bounce notice, not the customer — read it before sending.
                                                    </p>
                                                )}
                                                <textarea
                                                    rows={3}
                                                    value={draftText}
                                                    onChange={e => setDraftText(e.target.value)}
                                                    aria-label={`The reply ${agentName} has drafted — edit it before sending if you like`}
                                                    className="w-full resize-y rounded-xl border border-amber-400/25 bg-[#2a3942] px-3 py-2 text-sm leading-relaxed text-white focus:outline-none focus:ring-2 focus:ring-amber-400/40"
                                                />
                                                <div className="flex items-center gap-2">
                                                    <input
                                                        value={promptText}
                                                        onChange={e => setPromptText(e.target.value)}
                                                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleReprompt(); } }}
                                                        placeholder={`Tell ${agentName} what to change…`}
                                                        aria-label={`Your prompt to ${agentName} — amend it and run him again`}
                                                        className="h-10 min-w-0 flex-1 rounded-full bg-black/35 px-3.5 text-[13px] text-white placeholder-[#8696a0] focus:outline-none focus:ring-2 focus:ring-[#25d366]/30"
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={handleReprompt}
                                                        disabled={sending || !!draftBusy}
                                                        title={promptText.trim() ? `Run ${agentName} again with this prompt` : `Have ${agentName} take another go`}
                                                        className="flex h-10 flex-shrink-0 items-center gap-1 rounded-full bg-[#005c4b] px-3 text-[12px] font-semibold text-white disabled:opacity-40"
                                                    >
                                                        {sending ? <Spinner className="h-3.5 w-3.5" /> : <SparklesIcon className="h-3.5 w-3.5" />}
                                                        Redo
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={handleDiscardDraft}
                                                        disabled={!!draftBusy}
                                                        className="flex h-10 flex-shrink-0 items-center justify-center rounded-full px-3 text-[12px] font-medium text-[#8696a0] hover:bg-white/5 hover:text-white disabled:opacity-40"
                                                    >
                                                        {draftBusy === 'discard' ? <Spinner className="h-3.5 w-3.5" /> : 'Bin'}
                                                    </button>
                                                </div>
                                            </>
                                        )}
                                        <SendViaBar
                                            value={sendViaNow}
                                            onChange={setSendVia}
                                            emailOk={emailOk}
                                            phone={phoneOnFile}
                                            needsOpener={whatsappNeedsOpener}
                                            disabled={!!draftBusy}
                                            onAddPhone={handleAddPhone}
                                        />
                                        <button
                                            type="button"
                                            onClick={handleApproveDraft}
                                            disabled={!draftText.trim() || !!draftBusy}
                                            className={`flex h-11 w-full items-center justify-center gap-1.5 rounded-full text-[13px] font-semibold disabled:opacity-40 ${
                                                sendViaNow === 'email'
                                                    ? 'bg-sky-600 text-white'
                                                    : sendViaNow === 'both'
                                                        ? 'bg-[#005c4b] text-white'
                                                        : 'bg-[#25d366] text-[#111b21]'
                                            }`}
                                        >
                                            {draftBusy === 'approve' ? <Spinner className="h-4 w-4" /> : sendViaLabel(sendViaNow)}
                                        </button>
                                    </div>
                                </div>
                            )}

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
                                <div className="mb-1.5 flex gap-1 rounded-full bg-black/35 p-0.5">
                                    <button
                                        type="button"
                                        onClick={() => setReplyMode('human')}
                                        aria-pressed={replyMode === 'human'}
                                        className={`flex h-8 flex-1 items-center justify-center rounded-full text-[13px] font-semibold transition-colors ${
                                            replyMode === 'human'
                                                ? 'bg-[#2a3942] text-white shadow'
                                                : 'text-[#8696a0] hover:text-white'
                                        }`}
                                    >
                                        Me
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => { if (!attachment) setReplyMode('agent'); }}
                                        aria-pressed={replyMode === 'agent'}
                                        disabled={!!attachment}
                                        className={`flex h-8 flex-1 items-center justify-center gap-1.5 rounded-full text-[13px] font-semibold transition-colors disabled:opacity-40 ${
                                            replyMode === 'agent'
                                                ? 'bg-[#005c4b] text-white shadow'
                                                : 'text-[#8696a0] hover:text-white'
                                        }`}
                                    >
                                        <SparklesIcon className="h-3.5 w-3.5" />
                                        Ask {agentName}
                                    </button>
                                </div>
                            )}

                            {phrasingSince && (
                                <p className="mb-2 flex items-center gap-2 text-xs text-[#25d366]">
                                    <Spinner className="h-3.5 w-3.5" />
                                    {agentName} is drafting…
                                </p>
                            )}

                            {sendStatus && (
                                <p className="mb-2 flex items-center gap-2 text-xs text-[#25d366]">
                                    <Spinner className="h-3.5 w-3.5" />
                                    {sendStatus}
                                </p>
                            )}

                            {drafting === 'working' && !hasDraft && !asking && (
                                <p className="mb-2 flex items-center gap-2 text-xs text-[#25d366]">
                                    <Spinner className="h-3.5 w-3.5" />
                                    {agentName} is writing a draft — or just type your own reply.
                                </p>
                            )}
                            {drafting === 'failed' && !hasDraft && !asking && (
                                <p className="mb-2 flex items-center gap-2 text-xs text-[#8696a0]">
                                    {agentName} could not draft a reply.
                                    <button
                                        type="button"
                                        onClick={() => { if (active) void requestDraft(active, true); }}
                                        className="font-semibold text-[#25d366] hover:underline"
                                    >
                                        Try again
                                    </button>
                                </p>
                            )}

                            {active?.heldWords?.text && (
                                <div className="mb-2 rounded-xl border border-[#25d366]/30 bg-[#25d366]/10 px-3 py-2 text-[11px] leading-snug text-[#e9edef]">
                                    <span className="font-semibold text-[#25d366]">Waiting for their reply on WhatsApp, then this goes: </span>
                                    {active.heldWords.text}
                                </div>
                            )}

                            {customerWaiting && !asking && replyMode === 'human' && (
                                <button
                                    type="button"
                                    onClick={() => { setReplyMode('agent'); if (active) void requestDraft(active, true); }}
                                    className="mb-2 flex w-full items-center justify-center gap-1.5 rounded-lg py-1.5 text-[12px] font-medium text-[#8696a0] hover:bg-white/5 hover:text-[#25d366]"
                                >
                                    <SparklesIcon className="h-3.5 w-3.5" />
                                    Ask {agentName} to draft a reply
                                </button>
                            )}

                            {offerWhatsAppFollowUp && replyMode === 'human' && (
                                <div className="mb-2 flex items-center gap-2 rounded-xl border border-[#25d366]/30 bg-[#25d366]/10 px-3 py-2">
                                    <WhatsAppIcon className="h-4 w-4 flex-shrink-0 text-[#25d366]" />
                                    <p className="min-w-0 flex-1 text-[12px] leading-snug text-[#e9edef]">
                                        They have a mobile. This reply went by email only.
                                    </p>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setThreadChannel('whatsapp');
                                            void handleWhatsAppHer(reply.trim() || lastEmailOut?.text || '');
                                        }}
                                        disabled={sending}
                                        className="h-9 flex-shrink-0 rounded-full bg-[#25d366] px-3 text-[12px] font-semibold text-[#111b21] hover:bg-[#20bd5a] disabled:opacity-50"
                                    >
                                        Send on WhatsApp
                                    </button>
                                </div>
                            )}

                            {!asking && replyMode === 'human' && showSendVia && !hasDraft && (
                                <div className="mb-1.5">
                                    <SendViaBar
                                        value={sendViaNow}
                                        onChange={setSendVia}
                                        emailOk={emailOk && !attachment}
                                        phone={phoneOnFile}
                                        needsOpener={whatsappNeedsOpener && sendViaNow !== 'email' && pane !== 'whatsapp'}
                                        disabled={sending}
                                        onAddPhone={handleAddPhone}
                                    />
                                </div>
                            )}

                            {!asking && replyMode === 'human' && pane === 'whatsapp' && whatsappNeedsOpener && sendViaNow !== 'email' && (
                                <div className="mb-2 flex items-center gap-2 rounded-xl bg-black/35 px-3 py-2">
                                    <p className="min-w-0 flex-1 text-[11px] leading-snug text-[#8696a0]">
                                        {active?.whatsappOpenerAt
                                            ? 'Opener sent. Type your words and they go the moment they reply on WhatsApp.'
                                            : 'First WhatsApp is the approved opener (Meta\u2019s rule). Type your words: the opener goes now and your words follow the moment they reply.'}
                                    </p>
                                    {!reply.trim() && (
                                        <button
                                            type="button"
                                            onClick={() => void handleWhatsAppHer()}
                                            disabled={sending}
                                            className="h-9 flex-shrink-0 rounded-full bg-[#25d366] px-3 text-[12px] font-semibold text-[#111b21] hover:bg-[#20bd5a] disabled:opacity-50"
                                        >
                                            Send opener
                                        </button>
                                    )}
                                </div>
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
                                        onChange={e => { setAnswer(e.target.value); growBox(e.target); }}
                                        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAnswer(); } }}
                                        placeholder="Answer in your own words…"
                                        aria-label={`Your answer to ${agentName}`}
                                        className="min-h-[44px] min-w-0 flex-1 resize-none rounded-2xl border-0 bg-[#2a3942] px-4 py-2.5 text-sm text-white placeholder-[#8696a0] focus:outline-none focus:ring-2 focus:ring-amber-400/40"
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
                                    {phoneOnFile && pane === 'whatsapp' && (
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
                                                    setThreadChannel('whatsapp');
                                                    setSendVia('whatsapp');
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
                                        onChange={e => { setReply(e.target.value); growBox(e.target); }}
                                        onKeyDown={e => {
                                            if (e.key === 'Enter' && !e.shiftKey) {
                                                e.preventDefault();
                                                if (attachment || replyMode === 'human') handleSend();
                                                else if (reply.trim()) handleInstruct();
                                                else if (active) void requestDraft(active, true);
                                            }
                                        }}
                                        placeholder={replyMode === 'agent' && !attachment
                                            ? `Tell ${agentName} what to say…`
                                            : 'Your words, exactly'}
                                        aria-label={replyMode === 'agent' && !attachment ? `What to tell ${agentName} to say` : 'Your reply to the customer — sent exactly as typed'}
                                        className="min-h-[44px] min-w-0 flex-1 resize-none rounded-2xl border-0 bg-[#2a3942] px-4 py-2.5 text-[16px] leading-snug text-white placeholder-[#8696a0] focus:outline-none focus:ring-2 focus:ring-[#25d366]/40 sm:text-sm"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => {
                                            if (attachment || replyMode === 'human') handleSend();
                                            else if (reply.trim()) handleInstruct();
                                            else if (active) void requestDraft(active, true);
                                        }}
                                        disabled={sending || (replyMode === 'human' && sendViaNow === 'email' && !emailOk) || (replyMode === 'human' && sendViaNow !== 'email' && !phoneOnFile) || (replyMode === 'human' && !reply.trim() && !attachment)}
                                        className={`flex h-11 flex-shrink-0 items-center justify-center gap-1.5 rounded-full px-3.5 text-sm font-semibold transition-colors disabled:opacity-40 ${
                                            attachment || replyMode === 'human'
                                                ? sendViaNow === 'email'
                                                    ? 'bg-sky-600 text-white'
                                                    : sendViaNow === 'both'
                                                        ? 'bg-[#005c4b] text-white'
                                                        : 'bg-[#25d366] text-[#111b21]'
                                                : 'gap-1 bg-[#005c4b] text-white'
                                        }`}
                                        aria-label={
                                            attachment || replyMode === 'human'
                                                ? sendViaNow === 'both' ? 'Send by email and WhatsApp' : sendViaNow === 'email' ? 'Send by email' : 'Send on WhatsApp'
                                                : reply.trim() ? `Tell ${agentName}` : `Ask ${agentName} to draft`
                                        }
                                    >
                                        {sending ? <Spinner className="h-4 w-4" /> : attachment || replyMode === 'human' ? (
                                            <>
                                                {sendViaNow === 'email' ? (
                                                    <EnvelopeIcon className="h-4 w-4" aria-hidden />
                                                ) : sendViaNow === 'whatsapp' ? (
                                                    <WhatsAppIcon className="h-4 w-4" aria-hidden />
                                                ) : null}
                                                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
                                                    <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                                                </svg>
                                            </>
                                        ) : (
                                            <>
                                                <SparklesIcon className="h-4 w-4" />
                                                <span>{reply.trim() ? `Ask ${agentName}` : 'Draft'}</span>
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

            {pendingSplit && (
                <Modal onClose={() => { if (!splitting) setPendingSplit(null); }} size="sm">
                    <div className="p-6 text-center">
                        <h3 className="text-lg font-semibold text-white">Different person</h3>
                        <p className="mt-2 text-sm text-gray-400">
                            Pull this email into its own lead? {agentName} will match the car again, so it can land on the other ledger.
                            {pendingSplit.message.subject ? ` “${pendingSplit.message.subject}”` : ''}
                        </p>
                        <div className="mt-6 flex justify-center gap-3">
                            <Button variant="secondary" onClick={() => setPendingSplit(null)} disabled={splitting}>Cancel</Button>
                            <Button onClick={handleConfirmSplit} loading={splitting} disabled={splitting}>Separate</Button>
                        </div>
                    </div>
                </Modal>
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
