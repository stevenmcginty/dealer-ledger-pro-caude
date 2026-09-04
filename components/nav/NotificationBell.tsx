import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Notification } from '../../types';
import { BellIcon, CarIcon, EnvelopeIcon, WhatsAppIcon, XMarkIcon } from '../icons';
import { useData } from '../../hooks/useData';
import { useUI } from '../../hooks/useUI';
import { useToast } from '../ui';
import DraftReviewCard, { QuestionReviewCard } from '../salesAgent/DraftReviewCard';
import {
    Conversation,
    OwnerAlert,
    alertBody,
    alertHeadline,
    conversationName,
    conversationPhone,
    formatAgentTime,
    sendAgentReply,
    subscribeToAgentConversations,
    subscribeToOwnerAlerts,
    subscribeToSalesAgentSettings,
} from '../../services/salesAgentService';
import { phoneFromThread } from '../../utils/agentInboxBounce';
import { onDraftApproveRequest, onDraftReviewRequest, requestAgentConversation } from '../../utils/agentInboxLink';

interface NotificationBellProps {
    notifications: Notification[];
}

/**
 * When the bell was last opened. Anything the agent has raised since then counts
 * as new, so the badge means "things you have not looked at" rather than "things
 * still outstanding" — a customer message needs seeing once, not clearing.
 */
const SEEN_KEY = 'agentInbox.alertsSeenAt';

const readSeenAt = (): number => {
    try {
        return Number(localStorage.getItem(SEEN_KEY) || 0) || 0;
    } catch {
        return 0;
    }
};

const writeSeenAt = (at: number): void => {
    try {
        localStorage.setItem(SEEN_KEY, String(at));
    } catch {
        /* private window: the badge just stops persisting, which is survivable */
    }
};

/** Alerts about work already done. The bell has its own cards for those. */
const NOT_LISTED: ReadonlySet<OwnerAlert['kind']> = new Set(['draft', 'question']);

interface WhatsAppAlertCardProps {
    alert: OwnerAlert;
    conv?: Conversation;
    companyId: string;
    isUnseen: boolean;
    onOpen: (convId: string) => void;
}

const WhatsAppAlertCard: React.FC<WhatsAppAlertCardProps> = ({
    alert,
    conv,
    companyId,
    isUnseen,
    onOpen,
}) => {
    const toast = useToast();
    const [replying, setReplying] = useState(false);
    const [replyText, setReplyText] = useState('');
    const [sending, setSending] = useState(false);

    const isWa = conv?.channel === 'whatsapp' || /\bwhatsapp\b/i.test(alert.text) || /\bwhatsapp\b/i.test(alert.push?.title || '') || alert.kind === 'inbound';
    const customerName = conv ? conversationName(conv) : alertHeadline(alert);
    const vehicleTitle = conv?.vehicleInterest?.title;
    const phone = conv ? (conversationPhone(conv) || phoneFromThread(conv)) : '';
    const body = alertBody(alert);

    const handleSend = async () => {
        const next = replyText.trim();
        if (!next || sending || !companyId || !alert.convId) return;
        setSending(true);
        try {
            await sendAgentReply(companyId, alert.convId, next, undefined, isWa ? 'whatsapp' : 'auto', phone);
            toast.success(`Reply sent to ${customerName}.`);
            setReplyText('');
            setReplying(false);
        } catch (err: any) {
            toast.error(err?.message || 'Could not send reply.');
        } finally {
            setSending(false);
        }
    };

    return (
        <div
            className={`border-b border-gray-700/60 p-3.5 transition-colors ${
                isUnseen ? 'bg-[#25d366]/5' : 'hover:bg-gray-700/20'
            }`}
        >
            <div className="flex items-start gap-3">
                {/* Avatar */}
                <div
                    onClick={() => alert.convId && onOpen(alert.convId)}
                    className={`h-9 w-9 rounded-full flex items-center justify-center flex-shrink-0 cursor-pointer shadow-sm ${
                        isWa
                            ? 'bg-[#25d366] text-white shadow-[#25d366]/20'
                            : 'bg-brand-600 text-white'
                    }`}
                >
                    {isWa ? <WhatsAppIcon className="h-4 w-4" /> : <EnvelopeIcon className="h-4 w-4" />}
                </div>

                <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                        <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                            <button
                                type="button"
                                onClick={() => alert.convId && onOpen(alert.convId)}
                                className="font-semibold text-sm text-white hover:text-[#25d366] truncate transition-colors text-left"
                            >
                                {customerName}
                            </button>
                            {conv?.shortId ? (
                                <span className="font-mono text-[10px] text-gray-400">#{conv.shortId}</span>
                            ) : null}
                            {isWa ? (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#25d366]/20 text-[#25d366] border border-[#25d366]/35">
                                    <WhatsAppIcon className="h-2.5 w-2.5" /> WhatsApp
                                </span>
                            ) : null}
                            {vehicleTitle ? (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-gray-800 text-gray-300 border border-gray-700 truncate max-w-[10rem]">
                                    <CarIcon className="h-2.5 w-2.5 text-[#25d366] flex-shrink-0" />
                                    <span className="truncate">{vehicleTitle}</span>
                                </span>
                            ) : null}
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                            <span className="text-[11px] text-gray-400">{formatAgentTime(alert.sentAt)}</span>
                            {isUnseen && <span className="h-2 w-2 rounded-full bg-[#25d366] ring-2 ring-[#25d366]/30"></span>}
                        </div>
                    </div>

                    {/* Message body in WhatsApp chat bubble */}
                    <div
                        onClick={() => alert.convId && onOpen(alert.convId)}
                        className={`mt-2 rounded-xl p-2.5 text-xs sm:text-sm cursor-pointer transition-all ${
                            isWa
                                ? 'bg-[#202c33] border border-gray-700/60 hover:border-[#25d366]/40 text-gray-100 shadow-sm'
                                : 'bg-gray-900/60 border border-gray-700/40 hover:border-gray-600 text-gray-200'
                        }`}
                    >
                        <p className="whitespace-pre-wrap break-words leading-relaxed">{body}</p>
                    </div>

                    {/* Actions */}
                    <div className="mt-2.5">
                        {!replying ? (
                            <div className="flex items-center gap-2">
                                {alert.convId && (
                                    <button
                                        type="button"
                                        onClick={() => setReplying(true)}
                                        className="inline-flex items-center gap-1.5 rounded-lg bg-[#25d366] hover:bg-[#20ba5a] px-3 py-1.5 text-xs font-semibold text-white shadow-sm shadow-[#25d366]/20 transition-all active:scale-95"
                                    >
                                        <WhatsAppIcon className="h-3.5 w-3.5" />
                                        Reply
                                    </button>
                                )}
                                {alert.convId && (
                                    <button
                                        type="button"
                                        onClick={() => onOpen(alert.convId)}
                                        className="inline-flex items-center gap-1 rounded-lg bg-gray-700/60 hover:bg-gray-700 px-2.5 py-1.5 text-xs font-medium text-gray-300 hover:text-white transition-colors"
                                    >
                                        Open Chat &rarr;
                                    </button>
                                )}
                            </div>
                        ) : (
                            <div className="space-y-2 pt-1">
                                <textarea
                                    rows={2}
                                    value={replyText}
                                    onChange={e => setReplyText(e.target.value)}
                                    disabled={sending}
                                    placeholder={`Type your reply to ${customerName}…`}
                                    autoFocus
                                    onKeyDown={e => {
                                        if (e.key === 'Enter' && !e.shiftKey) {
                                            e.preventDefault();
                                            handleSend();
                                        }
                                    }}
                                    className="w-full resize-none rounded-lg border border-[#25d366]/50 bg-[#111b21] p-2.5 text-xs sm:text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#25d366]/40 disabled:opacity-60"
                                />
                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={handleSend}
                                        disabled={!replyText.trim() || sending}
                                        className="inline-flex items-center gap-1.5 rounded-lg bg-[#25d366] hover:bg-[#20ba5a] px-3 py-1.5 text-xs font-semibold text-white shadow-sm disabled:opacity-50 transition-all active:scale-95"
                                    >
                                        <WhatsAppIcon className="h-3.5 w-3.5" />
                                        {sending ? 'Sending…' : 'Send on WhatsApp'}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => { setReplying(false); setReplyText(''); }}
                                        disabled={sending}
                                        className="px-2 py-1 text-xs text-gray-400 hover:text-white transition-colors"
                                    >
                                        Cancel
                                    </button>
                                    {alert.convId && (
                                        <button
                                            type="button"
                                            onClick={() => onOpen(alert.convId)}
                                            className="ml-auto text-xs text-[#25d366] hover:underline"
                                        >
                                            Full thread &rarr;
                                        </button>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

const NotificationBell = ({ notifications }: NotificationBellProps) => {
    const { companyId } = useData();
    const { setView } = useUI();
    const [isOpen, setIsOpen] = useState(false);
    const [focusId, setFocusId] = useState('');
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [alerts, setAlerts] = useState<OwnerAlert[]>([]);
    const [seenAt, setSeenAt] = useState(readSeenAt);
    const [agentName, setAgentName] = useState('Dave');
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!companyId) return;
        return subscribeToAgentConversations(companyId, setConversations);
    }, [companyId]);

    useEffect(() => {
        if (!companyId) return;
        return subscribeToSalesAgentSettings(companyId, settings => setAgentName(settings.agentName || 'Dave'));
    }, [companyId]);

    // Everything the agent has raised — a customer message included.
    useEffect(() => {
        if (!companyId) return;
        return subscribeToOwnerAlerts(companyId, setAlerts);
    }, [companyId]);

    useEffect(() => onDraftReviewRequest(convId => {
        setFocusId(convId);
        setIsOpen(true);
    }), []);

    useEffect(() => onDraftApproveRequest(convId => {
        setFocusId(convId);
        setIsOpen(true);
    }), []);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const drafts = useMemo(() => {
        const waiting = conversations.filter(c => c.pendingDraft);
        if (!focusId) return waiting;
        return [...waiting].sort((a, b) => Number(b.id === focusId) - Number(a.id === focusId));
    }, [conversations, focusId]);

    const questions = useMemo(
        () => conversations.filter(c => c.pendingQuestion && !c.pendingDraft),
        [conversations]
    );

    const listedAlerts = useMemo(
        () => alerts.filter(alert => !NOT_LISTED.has(alert.kind)),
        [alerts]
    );
    const unseenAlerts = useMemo(
        () => listedAlerts.filter(alert => (alert.sentAt || 0) > seenAt),
        [listedAlerts, seenAt]
    );

    // Opening the bell is the act of seeing them.
    useEffect(() => {
        if (!isOpen || !listedAlerts.length) return;
        const newest = Math.max(...listedAlerts.map(alert => alert.sentAt || 0));
        if (newest <= seenAt) return;
        writeSeenAt(newest);
        setSeenAt(newest);
    }, [isOpen, listedAlerts, seenAt]);

    const motCount = notifications.length;
    const actionCount = drafts.length + questions.length;
    const count = actionCount + motCount + unseenAlerts.length;
    const waitingOnFocus = focusId && !drafts.some(c => c.id === focusId) && !questions.some(c => c.id === focusId);

    const handleOpenConversation = (convId: string) => {
        setIsOpen(false);
        setView('agentInbox');
        requestAgentConversation(convId);
    };

    return (
        <div className="relative" ref={menuRef}>
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className="relative p-2 text-gray-400 hover:text-white rounded-full hover:bg-gray-700 transition-colors"
                aria-label="View notifications"
            >
                <span className="sr-only">View notifications</span>
                <BellIcon className="h-6 w-6" />
                {count > 0 && (
                    <>
                        {unseenAlerts.length > 0 && (
                            <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-[#25d366] animate-ping opacity-75 pointer-events-none" />
                        )}
                        <span className="absolute top-0 right-0 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-[#25d366] px-1 text-[10px] font-bold leading-none text-white ring-2 ring-gray-900 shadow-sm">
                            {count > 9 ? '9+' : count}
                        </span>
                    </>
                )}
            </button>

            {isOpen && (
                <div className="fixed inset-x-0 bottom-0 top-12 z-[60] flex max-h-[100dvh] flex-col overflow-hidden rounded-t-2xl bg-[#111b21] pb-[env(safe-area-inset-bottom)] shadow-2xl ring-1 ring-black/60 focus:outline-none md:inset-auto md:absolute md:bottom-auto md:left-auto md:right-0 md:top-auto md:mt-2 md:max-h-[min(85vh,42rem)] md:w-[30rem] md:rounded-2xl md:pb-0 border-t-2 border-t-[#25d366]">
                    {/* Header */}
                    <div className="flex flex-shrink-0 items-center justify-between gap-2 px-4 py-3 bg-[#1f2c34] border-b border-gray-700/80">
                        <div className="flex items-center gap-2 min-w-0">
                            <div className="h-6 w-6 rounded-full bg-[#25d366] flex items-center justify-center text-white shadow-sm flex-shrink-0">
                                <WhatsAppIcon className="h-3.5 w-3.5" />
                            </div>
                            <span className="font-bold text-sm text-white truncate">
                                {actionCount > 0 ? `${agentName} waiting on you (${actionCount})` : 'WhatsApp & Activity Alerts'}
                            </span>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                            <button
                                type="button"
                                onClick={() => { setIsOpen(false); setView('agentInbox'); }}
                                className="text-xs font-semibold text-[#25d366] hover:text-[#20ba5a] hover:underline transition-colors px-1"
                            >
                                Open Inbox &rarr;
                            </button>
                            <button
                                type="button"
                                onClick={() => setIsOpen(false)}
                                className="rounded-md p-1 text-gray-400 hover:text-white hover:bg-gray-700/50 transition-colors"
                                aria-label="Close notifications"
                            >
                                <XMarkIcon className="h-4 w-4" />
                            </button>
                        </div>
                    </div>

                    <div className="overflow-y-auto divide-y divide-gray-700/40">
                        {waitingOnFocus && (
                            <div className="px-4 py-3 text-sm text-gray-400 bg-gray-900/40">
                                {agentName} is still writing that reply…
                            </div>
                        )}

                        {companyId && drafts.map(conv => (
                            <div
                                key={conv.pendingDraft?.id || conv.id}
                                className={`px-4 py-4 ${
                                    conv.id === focusId ? 'bg-[#25d366]/10 border-l-4 border-l-[#25d366]' : ''
                                }`}
                            >
                                <DraftReviewCard conv={conv} companyId={companyId} agentName={agentName} />
                            </div>
                        ))}

                        {companyId && questions.map(conv => (
                            <div
                                key={conv.pendingQuestion?.id || conv.id}
                                className="px-4 py-4"
                            >
                                <QuestionReviewCard conv={conv} companyId={companyId} agentName={agentName} />
                            </div>
                        ))}

                        {listedAlerts.length > 0 && (
                            <div>
                                <div className={`px-4 pb-2 pt-3.5 text-xs font-bold uppercase tracking-wider text-[#25d366] flex items-center justify-between ${actionCount > 0 ? 'border-t border-gray-700/60' : ''}`}>
                                    <span className="flex items-center gap-1.5">
                                        <WhatsAppIcon className="h-3.5 w-3.5" />
                                        Recent WhatsApp & Messages
                                    </span>
                                    {unseenAlerts.length > 0 && (
                                        <span className="rounded-full bg-[#25d366]/20 px-2 py-0.5 text-[10px] font-bold text-[#25d366]">
                                            {unseenAlerts.length} new
                                        </span>
                                    )}
                                </div>
                                {listedAlerts.slice(0, 20).map(alert => {
                                    const conv = conversations.find(c => c.id === alert.convId);
                                    return (
                                        <WhatsAppAlertCard
                                            key={alert.id}
                                            alert={alert}
                                            conv={conv}
                                            companyId={companyId || ''}
                                            isUnseen={(alert.sentAt || 0) > seenAt}
                                            onOpen={handleOpenConversation}
                                        />
                                    );
                                })}
                            </div>
                        )}

                        {motCount > 0 && (
                            <div>
                                <div className="border-t border-gray-700/60 px-4 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                                    MOT reminders
                                </div>
                                {notifications.map(notif => (
                                    <div key={notif.id} className="px-4 py-3 text-sm text-gray-300 hover:bg-gray-800/40">
                                        <p>{notif.message}</p>
                                    </div>
                                ))}
                            </div>
                        )}

                        {count === 0 && !waitingOnFocus && (
                            <div className="px-4 py-10 text-center">
                                <div className="mx-auto mb-2 h-10 w-10 rounded-full bg-[#25d366]/15 flex items-center justify-center text-[#25d366]">
                                    <WhatsAppIcon className="h-5 w-5" />
                                </div>
                                <p className="text-sm font-semibold text-gray-300">All caught up!</p>
                                <p className="mt-0.5 text-xs text-gray-500">No new WhatsApp messages or agent tasks</p>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default NotificationBell;
