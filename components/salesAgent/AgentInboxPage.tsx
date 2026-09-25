import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useData } from '../../hooks/useData';
import { useUI } from '../../hooks/useUI';
import { Button, useToast } from '../ui';
import Spinner from '../common/Spinner';
import Modal from '../common/Modal';
import {
    EnvelopeIcon,
    ExclamationTriangleIcon,
    InboxIcon,
    PaperClipIcon,
    SparklesIcon,
    TrashIcon,
    WhatsAppIcon,
    XMarkIcon,
} from '../icons';
import {
    AgentMessage,
    CHANNEL_LABELS,
    Conversation,
    ConversationMode,
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
import { needsReasonOf, sectionGroups } from '../../utils/agentInboxSections';
import { dismissConversationNotifications } from '../../utils/inboxNotify';
import {
    WHATSAPP_ACCEPT,
    classifyWhatsAppFile,
    describeWhatsAppFileError,
    describeWhatsAppPickError,
    prepareWhatsAppFile,
} from '../../utils/whatsappMedia';
import StartWhatsAppSheet from './StartWhatsAppSheet';
import SendViaBar, { type SendViaChoice } from './SendViaBar';
import { ThreadMessage } from './inboxMessages';
import { DEMO_CONVERSATIONS, DEMO_MESSAGES } from './inboxDemo';
import { displayUkPhone, resolveThreadPhone, threadLooksBounced } from '../../utils/agentInboxBounce';
import ThreadList from './inbox/ThreadList';
import ThreadHeader from './inbox/ThreadHeader';
import { DraftCard, QuestionCard, SendRouteIcon, sendButtonClass } from './inbox/DaveCards';
import { ComposeError, type InlineError, dayLabel, describeError } from './inbox/parts';

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
    const [gmailDown, setGmailDown] = useState(false);
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
    const [detailsOpen, setDetailsOpen] = useState(false);
    const [carFixOpen, setCarFixOpen] = useState(false);
    const [carFixNote, setCarFixNote] = useState('');
    const [carFixBusy, setCarFixBusy] = useState(false);
    const [pendingSplit, setPendingSplit] = useState<{ message: AgentMessage; conv: Conversation } | null>(null);
    const [splitting, setSplitting] = useState(false);
    const [showOther, setShowOther] = useState(readShowOtherLedger);
    const [selectedMsgKey, setSelectedMsgKey] = useState<string | null>(null);
    const [bannerCollapsed, setBannerCollapsed] = useState(false);
    /** Dave's draft starts folded — still one tap to approve — so the thread and composer keep the screen. */
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
        el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
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
        return subscribeToSalesAgentSettings(companyId, settings => {
            setAgentName(settings.agentName || 'Dave');
            // Only a flag the server has set to false counts: a company that never
            // linked Gmail has no key at all and should not be nagged.
            setGmailDown(settings.connections?.gmail === false);
        });
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

    // Needs you → Recent → Earlier. `now` moves with the data, which is often enough for a 14-day fold.
    const listNow = useMemo(() => Date.now(), [groups]);
    const sections = useMemo(() => sectionGroups(groups, listNow), [groups, listNow]);
    const orderedGroups = useMemo(
        () => [...sections.needsYou, ...sections.recent, ...sections.earlier],
        [sections]
    );
    // The header summary ignores the search box: typing a name must not make "3 need you" vanish.
    const summary = useMemo(() => {
        const base = (showOther ? allGroups : partitionSharedGroups(allGroups).mine)
            .filter(group => groupHasChannel(group, filter));
        return {
            needsYou: base.filter(group => needsReasonOf(group, listNow)).length,
            unread: base.reduce((n, group) => n + (group.unread || 0), 0),
        };
    }, [allGroups, showOther, filter, listNow]);

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
        if (activeGroupId || activeConvId || !orderedGroups.length) return;
        if (typeof window !== 'undefined' && window.innerWidth < 1024) return;
        openGroup(orderedGroups[0]);
    }, [orderedGroups, activeGroupId, activeConvId, openGroup]);

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
            <div className="flex h-full items-center justify-center bg-gray-950">
                <Spinner className="h-8 w-8 text-brand-400" />
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
    const hasDraft = !!draftHost?.pendingDraft;
    const offerWhatsAppFollowUp = !!(
        active
        && phoneOnFile
        && !whatsappAlreadySent
        && lastEmailOut
        && !hasDraft
        && !bounced
        && pane === 'email'
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
    const showSendVia = !!phoneOnFile || emailOk || !!handleAddPhone;
    const emailPane = pane === 'email';
    const agentComposing = replyMode === 'agent' && !attachment;
    const sendDestination = agentComposing
        ? `${agentName} writes it, you approve`
        : sendViaNow === 'email'
            ? (emailOnFile ? `to ${emailOnFile}` : '')
            : sendViaNow === 'whatsapp'
                ? (phoneOnFile ? `to ${displayUkPhone(phoneOnFile)} on WhatsApp` : '')
                : (phoneOnFile && emailOnFile ? `to ${emailOnFile} and ${displayUkPhone(phoneOnFile)}` : '');
    const firstName = active?.contact?.firstName || activeGroup?.name.split(' ')[0] || '';
    const submitComposer = () => {
        if (attachment || replyMode === 'human') handleSend();
        else if (reply.trim()) handleInstruct();
        else if (active) void requestDraft(active, true);
    };

    const closeThread = () => { setActiveGroupId(null); setActiveConvId(null); };
    const chatTexture = {
        backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.028) 1px, transparent 0)',
        backgroundSize: '24px 24px',
    };

    return (
        <div
            className="flex h-full min-h-0 bg-gray-950 text-gray-100"
            style={kbInset ? { height: `calc(100% - ${kbInset}px)` } : undefined}
        >
            <aside
                className={`min-h-0 w-full flex-col border-r border-white/[0.06] bg-gray-900 lg:flex lg:w-[23rem] xl:w-[26rem] ${activeGroup ? 'hidden lg:flex' : 'flex'}`}
                aria-label="Conversations"
            >
                {gmailDown && (
                    <div role="alert" className="flex-shrink-0 border-b border-red-500/30 bg-red-950/60 px-4 py-3 text-[13px] text-red-100">
                        <p className="font-semibold">Gmail is not connected. No new emails are coming in.</p>
                        <button
                            type="button"
                            onClick={() => setView('settings')}
                            className="mt-1.5 min-h-[44px] text-left font-semibold text-white underline underline-offset-2 hover:text-red-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-300"
                        >
                            Settings → Sales agent → Reconnect
                        </button>
                    </div>
                )}
                <ThreadList
                    sections={sections}
                    activeGroupId={activeGroup?.id || null}
                    onOpen={openGroup}
                    agentName={agentName}
                    now={listNow}
                    filter={filter}
                    onFilter={setFilter}
                    counts={counts}
                    query={query}
                    onQuery={setQuery}
                    otherLedgerCount={otherLedgerCount}
                    showOther={showOther}
                    onToggleOther={toggleShowOther}
                    inboxName={inbox ? (inbox.name || 'Shared number') : null}
                    needsYouTotal={summary.needsYou}
                    unreadTotal={summary.unread}
                    onBack={() => setView('dashboard')}
                    onStartWhatsApp={() => setComposeOpen(true)}
                />
            </aside>

            <section className={`min-h-0 min-w-0 flex-1 flex-col ${activeGroup ? 'flex' : 'hidden lg:flex'}`}>
                {active && activeGroup ? (
                    <>
                        <ThreadHeader
                            group={activeGroup}
                            conv={active}
                            agentName={agentName}
                            bounced={bounced}
                            phone={phoneOnFile}
                            email={emailOnFile}
                            leadLabel={linkedLead
                                ? `Lead: ${[linkedLead.firstName, linkedLead.lastName].filter(Boolean).join(' ') || 'open'}`
                                : null}
                            pane={pane}
                            paneChannels={paneChannels}
                            channelCounts={channelCounts}
                            onPane={setThreadChannel}
                            onBack={closeThread}
                            menuOpen={menuOpen}
                            onMenuOpen={setMenuOpen}
                            changingMode={changingMode}
                            onMode={handleMode}
                            detailsOpen={detailsOpen}
                            onToggleDetails={() => { setDetailsOpen(o => !o); setCarFixOpen(false); }}
                            carFixOpen={carFixOpen}
                            onCarFixOpen={open => { setCarFixOpen(open); if (open) setDetailsOpen(false); }}
                            carFixNote={carFixNote}
                            onCarFixNote={setCarFixNote}
                            carFixBusy={carFixBusy}
                            onCarFix={handleCarFix}
                            onSplit={() => requestSplit()}
                            onOpenLead={openLead}
                            canWhatsAppFollowUp={!!phoneOnFile && !whatsappAlreadySent}
                            onWhatsAppFollowUp={() => {
                                setThreadChannel('whatsapp');
                                void handleWhatsAppHer(reply.trim() || lastEmailOut?.text || '');
                            }}
                            onDelete={() => setPendingDelete({ kind: 'thread', conv: active })}
                        />

                        {bounced && (whatsappAlreadySent || bannerCollapsed ? (
                            /* Handled or put away: one quiet line, the chat gets the screen back. */
                            <div className="flex items-center gap-2 border-b border-white/[0.06] bg-gray-900/60 px-4 py-2">
                                {phoneOnFile ? (
                                    <WhatsAppIcon className="h-3.5 w-3.5 flex-shrink-0 text-emerald-400" />
                                ) : (
                                    <ExclamationTriangleIcon className="h-3.5 w-3.5 flex-shrink-0 text-red-300" />
                                )}
                                <p className="min-w-0 flex-1 truncate text-[12.5px] text-gray-400">
                                    {phoneOnFile
                                        ? whatsappAlreadySent
                                            ? 'Email bounces — this thread runs on WhatsApp now.'
                                            : 'Email bounces — replies go by WhatsApp.'
                                        : 'Email bounces — no number on file either.'}
                                </p>
                            </div>
                        ) : (
                            <div className="relative border-b border-white/[0.06] bg-red-500/[0.06] px-4 py-3">
                                <button
                                    type="button"
                                    onClick={() => setBannerCollapsed(true)}
                                    aria-label="Put this notice away"
                                    className="absolute right-2 top-2 flex h-10 w-10 items-center justify-center rounded-full text-gray-400 hover:bg-white/[0.06] hover:text-white"
                                >
                                    <XMarkIcon className="h-4 w-4" />
                                </button>
                                <div className="mx-auto max-w-3xl pr-10">
                                    <p className="flex items-center gap-2 text-[13.5px] font-semibold text-white">
                                        <ExclamationTriangleIcon className="h-4 w-4 flex-shrink-0 text-red-300" />
                                        Email bounced — {phoneOnFile ? 'reach them on WhatsApp instead' : 'no other way through'}
                                    </p>
                                    <p className="mt-1 text-[12.5px] leading-snug text-gray-300">
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
                                                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 text-[14px] font-semibold text-gray-950 hover:bg-emerald-400 disabled:opacity-50 sm:w-auto"
                                            >
                                                <WhatsAppIcon className="h-4 w-4" />
                                                Send WhatsApp to {active.contact?.firstName || displayUkPhone(phoneOnFile)}
                                            </button>
                                            <a href={`tel:${phoneOnFile}`} className="flex h-11 items-center justify-center text-[13px] font-medium text-gray-400 hover:text-white sm:px-3">
                                                or call {displayUkPhone(phoneOnFile)}
                                            </a>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}

                        {active.escalated && active.escalationReason && !questionHost?.pendingQuestion && !bounced && !bannerCollapsed && (
                            <div className="border-b border-white/[0.06] bg-red-500/[0.06] px-4 py-2.5">
                                <div className="mx-auto flex max-w-3xl items-start gap-2.5">
                                    <ExclamationTriangleIcon className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-300" />
                                    <p className="min-w-0 flex-1 text-[13px] leading-snug text-gray-100">{active.escalationReason}</p>
                                    <button
                                        type="button"
                                        onClick={() => setBannerCollapsed(true)}
                                        aria-label="Put this notice away"
                                        className="-mr-2 -mt-2 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-gray-400 hover:bg-white/[0.06] hover:text-white"
                                    >
                                        <XMarkIcon className="h-4 w-4" />
                                    </button>
                                </div>
                            </div>
                        )}

                        <div
                            ref={threadRef}
                            className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-gray-950"
                            style={emailPane ? undefined : chatTexture}
                        >
                            <div className={`mx-auto w-full max-w-3xl px-3 py-5 sm:px-6 ${emailPane ? 'space-y-4' : 'space-y-2.5'}`}>
                                {messages.length ? (
                                    messages.map((message, i) => {
                                        const key = `${conversationRefKey(message.conv)}:${message.id}`;
                                        const day = dayLabel(message.createdAt);
                                        const newDay = i === 0 || dayLabel(messages[i - 1].createdAt) !== day;
                                        return (
                                            <React.Fragment key={key}>
                                                {newDay && (
                                                    <div className="flex items-center gap-3 pb-1 pt-2" role="separator" aria-label={day}>
                                                        <span className="h-px flex-1 bg-white/[0.06]" aria-hidden />
                                                        <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-400">{day}</span>
                                                        <span className="h-px flex-1 bg-white/[0.06]" aria-hidden />
                                                    </div>
                                                )}
                                                <ThreadMessage
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
                                            </React.Fragment>
                                        );
                                    })
                                ) : (
                                    <div className="px-4 py-16 text-center">
                                        {emailPane ? (
                                            <>
                                                <EnvelopeIcon className="mx-auto h-9 w-9 text-sky-400/40" />
                                                <p className="mt-3 text-sm font-medium text-gray-100">No emails in this thread</p>
                                                <p className="mt-1 text-[13px] text-gray-400">
                                                    {emailOnFile
                                                        ? `Mail to ${emailOnFile} will show here. WhatsApp stays on the other tab.`
                                                        : 'No email address on file. Switch to WhatsApp to keep talking.'}
                                                </p>
                                            </>
                                        ) : (
                                            <>
                                                <WhatsAppIcon className="mx-auto h-9 w-9 text-emerald-400/40" />
                                                <p className="mt-3 text-sm font-medium text-gray-100">No WhatsApp yet</p>
                                                <p className="mt-1 text-[13px] text-gray-400">
                                                    {phoneOnFile
                                                        ? `Chat with ${displayUkPhone(phoneOnFile)} shows here. Emails stay on the other tab.`
                                                        : 'No mobile number on file. Switch to Email to keep talking.'}
                                                </p>
                                            </>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div
                            className="border-t border-white/[0.06] bg-gray-900 px-3 pt-3 sm:px-4"
                            style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
                        >
                            <div className="mx-auto w-full max-w-3xl space-y-2">
                                {questionHost?.pendingQuestion && (
                                    <QuestionCard
                                        agentName={agentName}
                                        question={questionHost.pendingQuestion.question}
                                        context={questionHost.pendingQuestion.context}
                                        answer={answer}
                                        onAnswer={setAnswer}
                                        onSend={handleAnswer}
                                        busy={answering}
                                    />
                                )}

                                {hasDraft && draftHost?.pendingDraft && (
                                    <DraftCard
                                        agentName={agentName}
                                        source={draftHost.pendingDraft.source}
                                        text={draftText}
                                        onText={setDraftText}
                                        open={draftOpen}
                                        onOpen={setDraftOpen}
                                        prompt={promptText}
                                        onPrompt={setPromptText}
                                        onRedo={handleReprompt}
                                        redoBusy={sending}
                                        busy={draftBusy}
                                        onApprove={handleApproveDraft}
                                        onDiscard={handleDiscardDraft}
                                        bounceWarning={bounced && draftHost.pendingDraft.source === 'agent'}
                                        via={sendViaNow}
                                        onVia={setSendVia}
                                        emailOk={emailOk}
                                        phone={phoneOnFile}
                                        needsOpener={whatsappNeedsOpener}
                                        onAddPhone={handleAddPhone}
                                    />
                                )}

                                {phrasingSince && (
                                    <p className="flex items-center gap-2 px-1 text-[12.5px] text-amber-200">
                                        <Spinner className="h-3.5 w-3.5 text-amber-300" />
                                        {agentName} is drafting…
                                    </p>
                                )}

                                {sendStatus && (
                                    <p className="flex items-center gap-2 px-1 text-[12.5px] text-gray-300">
                                        <Spinner className="h-3.5 w-3.5 text-gray-300" />
                                        {sendStatus}
                                    </p>
                                )}

                                {drafting === 'working' && !hasDraft && (
                                    <p className="flex items-center gap-2 px-1 text-[12.5px] text-amber-200">
                                        <Spinner className="h-3.5 w-3.5 text-amber-300" />
                                        {agentName} is writing a draft — or just type your own reply.
                                    </p>
                                )}
                                {drafting === 'failed' && !hasDraft && (
                                    <p className="flex items-center gap-2 px-1 text-[12.5px] text-gray-400">
                                        {agentName} could not draft a reply.
                                        <button
                                            type="button"
                                            onClick={() => { if (active) void requestDraft(active, true); }}
                                            className="min-h-[44px] font-semibold text-amber-300 hover:underline"
                                        >
                                            Try again
                                        </button>
                                    </p>
                                )}

                                {active?.heldWords?.text && (
                                    <div className="rounded-xl border border-emerald-400/25 bg-emerald-400/[0.07] px-3 py-2 text-[12px] leading-snug text-gray-100">
                                        <span className="font-semibold text-emerald-300">Waiting for their reply on WhatsApp, then this goes: </span>
                                        {active.heldWords.text}
                                    </div>
                                )}

                                {offerWhatsAppFollowUp && replyMode === 'human' && (
                                    <div className="flex items-center gap-2 rounded-xl border border-emerald-400/25 bg-emerald-400/[0.07] py-1.5 pl-3 pr-1.5">
                                        <WhatsAppIcon className="h-4 w-4 flex-shrink-0 text-emerald-400" />
                                        <p className="min-w-0 flex-1 text-[12.5px] leading-snug text-gray-100">
                                            They have a mobile. This reply went by email only.
                                        </p>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setThreadChannel('whatsapp');
                                                void handleWhatsAppHer(reply.trim() || lastEmailOut?.text || '');
                                            }}
                                            disabled={sending}
                                            className="h-11 flex-shrink-0 rounded-lg bg-emerald-500 px-3 text-[12.5px] font-semibold text-gray-950 hover:bg-emerald-400 disabled:opacity-50"
                                        >
                                            Send on WhatsApp
                                        </button>
                                    </div>
                                )}

                                {replyMode === 'human' && pane === 'whatsapp' && whatsappNeedsOpener && sendViaNow !== 'email' && (
                                    <div className="flex items-center gap-2 rounded-xl bg-black/30 py-1.5 pl-3 pr-1.5 ring-1 ring-inset ring-white/[0.05]">
                                        <p className="min-w-0 flex-1 text-[11.5px] leading-snug text-gray-400">
                                            {'They have not written on WhatsApp in 24 hours, so Meta’s rule applies: your words go now inside the approved “update about your car” message. Or send just the opener.'}
                                        </p>
                                        {!reply.trim() && (
                                            <button
                                                type="button"
                                                onClick={() => void handleWhatsAppHer()}
                                                disabled={sending}
                                                className="h-11 flex-shrink-0 rounded-lg bg-emerald-500 px-3 text-[12.5px] font-semibold text-gray-950 hover:bg-emerald-400 disabled:opacity-50"
                                            >
                                                Send opener
                                            </button>
                                        )}
                                    </div>
                                )}

                                {sendError && <ComposeError error={sendError} onDismiss={() => setSendError(null)} />}

                                {replyMode === 'human' && showSendVia && !hasDraft && (
                                    <SendViaBar
                                        value={sendViaNow}
                                        onChange={setSendVia}
                                        emailOk={emailOk && !attachment}
                                        phone={phoneOnFile}
                                        needsOpener={whatsappNeedsOpener && sendViaNow !== 'email' && pane !== 'whatsapp'}
                                        disabled={sending}
                                        onAddPhone={handleAddPhone}
                                    />
                                )}

                                <div className={`rounded-2xl bg-gray-800/60 ring-1 ring-inset transition-shadow focus-within:ring-2 ${
                                    agentComposing
                                        ? 'ring-amber-400/25 focus-within:ring-amber-400/50'
                                        : 'ring-white/[0.08] focus-within:ring-white/25'
                                }`}>
                                    {attachment && (
                                        <div className="mx-2 mt-2 flex items-center gap-2 rounded-xl bg-black/30 px-3 py-2 text-[12.5px] text-gray-100">
                                            <PaperClipIcon className="h-4 w-4 flex-shrink-0 text-emerald-400" />
                                            <span className="min-w-0 flex-1 truncate">{attachment.name}</span>
                                            <button
                                                type="button"
                                                onClick={() => setAttachment(null)}
                                                className="-my-1 -mr-2 flex h-10 w-10 items-center justify-center rounded-full text-gray-400 hover:bg-white/[0.06] hover:text-white"
                                                aria-label="Remove attachment"
                                            >
                                                <TrashIcon className="h-3.5 w-3.5" />
                                            </button>
                                        </div>
                                    )}
                                    <textarea
                                        ref={replyBoxRef}
                                        rows={1}
                                        value={reply}
                                        onChange={e => { setReply(e.target.value); growBox(e.target); }}
                                        onKeyDown={e => {
                                            if (e.key === 'Enter' && !e.shiftKey) {
                                                e.preventDefault();
                                                submitComposer();
                                            }
                                        }}
                                        placeholder={agentComposing
                                            ? `Tell ${agentName} what to say…`
                                            : firstName ? `Write to ${firstName}…` : 'Your words, exactly'}
                                        aria-label={agentComposing ? `What to tell ${agentName} to say` : 'Your reply to the customer — sent exactly as typed'}
                                        className="block min-h-[48px] w-full resize-none bg-transparent px-4 pb-1 pt-3 sm:min-h-[64px] text-[16px] leading-relaxed text-gray-50 placeholder-gray-500 focus:outline-none sm:text-[15px]"
                                    />
                                    <div className="flex items-center gap-1.5 px-2 pb-2">
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
                                                    className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl text-gray-400 hover:bg-white/[0.06] hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
                                                    aria-label="Attach a photo, video or file"
                                                    title="Attach a photo, video or file"
                                                >
                                                    <PaperClipIcon className="h-5 w-5" />
                                                </button>
                                            </>
                                        )}
                                        <div className="flex flex-shrink-0 rounded-xl bg-black/30 sm:p-1" role="group" aria-label="Who writes this reply">
                                            <button
                                                type="button"
                                                onClick={() => setReplyMode('human')}
                                                aria-pressed={replyMode === 'human'}
                                                className={`flex h-11 items-center rounded-xl px-3 text-[13px] font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 sm:h-8 sm:rounded-lg ${
                                                    replyMode === 'human' ? 'bg-gray-700 text-white shadow-sm' : 'text-gray-400 hover:text-white'
                                                }`}
                                            >
                                                Me
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => { if (!attachment) setReplyMode('agent'); }}
                                                aria-pressed={replyMode === 'agent'}
                                                disabled={!!attachment}
                                                className={`flex h-11 items-center gap-1.5 rounded-xl px-3 text-[13px] font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60 disabled:opacity-40 sm:h-8 sm:rounded-lg ${
                                                    replyMode === 'agent' ? 'bg-amber-400/15 text-amber-200 shadow-sm' : 'text-gray-400 hover:text-white'
                                                }`}
                                            >
                                                <SparklesIcon className="h-3.5 w-3.5" />
                                                {agentName}
                                            </button>
                                        </div>
                                        <p className="hidden min-w-0 flex-1 truncate px-1 text-right text-[12px] text-gray-400 sm:block">
                                            {sendDestination}
                                        </p>
                                        <span className="flex-1 sm:hidden" />
                                        <button
                                            type="button"
                                            onClick={submitComposer}
                                            disabled={sending || (replyMode === 'human' && sendViaNow === 'email' && !emailOk) || (replyMode === 'human' && sendViaNow !== 'email' && !phoneOnFile) || (replyMode === 'human' && !reply.trim() && !attachment)}
                                            className={`flex h-11 flex-shrink-0 items-center justify-center gap-2 rounded-xl px-4 text-[14px] font-semibold shadow-lg shadow-black/20 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70 disabled:opacity-40 disabled:shadow-none ${
                                                agentComposing ? 'bg-amber-400 text-gray-950 hover:bg-amber-300' : sendButtonClass(sendViaNow)
                                            }`}
                                            aria-label={
                                                !agentComposing
                                                    ? sendViaNow === 'both' ? 'Send by email and WhatsApp' : sendViaNow === 'email' ? 'Send by email' : 'Send on WhatsApp'
                                                    : reply.trim() ? `Tell ${agentName}` : `Ask ${agentName} to draft`
                                            }
                                        >
                                            {sending ? <Spinner className="h-4 w-4" /> : !agentComposing ? (
                                                <>
                                                    <SendRouteIcon via={sendViaNow} />
                                                    <span>Send</span>
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
                                </div>

                                {customerWaiting && replyMode === 'human' && (
                                    <button
                                        type="button"
                                        onClick={() => { setReplyMode('agent'); if (active) void requestDraft(active, true); }}
                                        className="flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-lg text-[12.5px] font-medium text-gray-400 transition-colors hover:bg-amber-400/[0.06] hover:text-amber-200"
                                    >
                                        <SparklesIcon className="h-3.5 w-3.5" />
                                        {firstName ? `${firstName} is waiting — ` : ''}ask {agentName} to draft a reply
                                    </button>
                                )}
                            </div>
                        </div>
                    </>
                ) : (
                    <div className="flex h-full flex-col items-center justify-center bg-gray-950 px-8 text-center" style={chatTexture}>
                        <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/[0.04] ring-1 ring-inset ring-white/[0.06]">
                            <InboxIcon className="h-8 w-8 text-gray-500" />
                        </span>
                        <p className="mt-4 text-[15px] font-semibold text-gray-100">
                            {summary.needsYou
                                ? `${summary.needsYou} conversation${summary.needsYou === 1 ? '' : 's'} need${summary.needsYou === 1 ? 's' : ''} you`
                                : 'Pick a conversation'}
                        </p>
                        <p className="mt-1 max-w-xs text-[13px] leading-relaxed text-gray-400">
                            {summary.needsYou
                                ? `They are at the top of the list — ${agentName}'s drafts and questions first.`
                                : 'Everything is answered. New WhatsApps and emails appear on the left.'}
                        </p>
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
