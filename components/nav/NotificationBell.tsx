import React, { useEffect, useMemo, useRef, useState } from 'react';
import { MotSweepSummary, Notification, Vehicle } from '../../types';
import { BellIcon, ChevronDownIcon, ChevronRightIcon, SparklesIcon, WhatsAppIcon, XMarkIcon } from '../icons';
import { useData } from '../../hooks/useData';
import { useUI } from '../../hooks/useUI';
import { useToast } from '../ui';
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
import { subscribeToMotSweep } from '../../services/motSweep';
import { formatDate } from '../../utils/helpers';
import { phoneFromThread } from '../../utils/agentInboxBounce';
import { onDraftApproveRequest, onDraftReviewRequest, requestAgentConversation } from '../../utils/agentInboxLink';

interface NotificationBellProps {
    notifications: Notification[];
}

/**
 * When the bell was last opened. Any WhatsApp message the agent has raised since
 * then counts as new, so the badge means "things you have not looked at" rather
 * than "things still outstanding" — a customer message needs seeing once, not clearing.
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

/** Dave's own work. The bell counts it in one row rather than listing it. */
const NOT_LISTED: ReadonlySet<OwnerAlert['kind']> = new Set(['draft', 'question']);

/** MOTs further out than this sit behind "Show later ones". */
const MOT_SHOWN_DAYS = 60;
/** MOTs this close (or already expired) count towards the badge. */
const MOT_URGENT_DAYS = 30;
/** Seen WhatsApp messages stay in the bell this long; after that only the inbox has them. */
const WHATSAPP_RECENT_MS = 48 * 3600_000;
const WHATSAPP_MAX = 8;

const DAY_MS = 86_400_000;

/**
 * Whole days from today to a 'YYYY-MM-DD' date, negative once it has passed.
 * Both ends are taken as calendar days, so the clock time and timezone cannot
 * move a car from "due today" to "expired".
 */
const daysUntil = (iso: string): number | null => {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
    if (!match) return null;
    const due = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    const now = new Date();
    const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    return Math.round((due - today) / DAY_MS);
};

const normaliseReg = (reg?: string): string => (reg || '').replace(/\s+/g, '').toUpperCase();

interface MotRow {
    key: string;
    vehicleId?: string;
    reg: string;
    vehicleLabel: string;
    dueDate?: string;
    daysLeft: number;
}

/**
 * Stock MOT dates merged with the daily DVSA sweep.
 *
 * The vehicle record wins wherever it has a date: the sweep writes its finding
 * back to the vehicle, and a car re-tested since the sweep ran would otherwise
 * keep showing as expired. The sweep only adds cars whose record has no MOT
 * date yet. Sold or deleted cars are dropped.
 */
const buildMotRows = (
    notifications: Notification[],
    sweep: MotSweepSummary | null,
    vehicles: Vehicle[]
): MotRow[] => {
    const rows: MotRow[] = [];
    const seenIds = new Set<string>();
    const seenRegs = new Set<string>();
    const byId = new Map(vehicles.map(v => [v.id, v]));

    notifications.forEach(notif => {
        const daysLeft = daysUntil(notif.date);
        if (daysLeft === null) return;
        const vehicle = notif.vehicleId ? byId.get(notif.vehicleId) : undefined;
        const reg = notif.reg || vehicle?.reg || '';
        rows.push({
            key: notif.id,
            vehicleId: notif.vehicleId,
            reg,
            vehicleLabel: notif.vehicleLabel ?? [vehicle?.make, vehicle?.model].filter(Boolean).join(' '),
            dueDate: notif.date,
            daysLeft,
        });
        if (notif.vehicleId) seenIds.add(notif.vehicleId);
        if (reg) seenRegs.add(normaliseReg(reg));
    });

    const fromSweep = sweep ? [...sweep.expired, ...sweep.expiringSoon] : [];
    fromSweep.forEach(alert => {
        const regKey = normaliseReg(alert.reg);
        if (seenIds.has(alert.vehicleId) || (regKey && seenRegs.has(regKey))) return;
        const vehicle = byId.get(alert.vehicleId);
        if (!vehicle || vehicle.status === 'Sold' || vehicle.motDueDate) return;
        const daysLeft = alert.motDueDate ? daysUntil(alert.motDueDate) : alert.daysRemaining ?? null;
        if (daysLeft === null) return;
        rows.push({
            key: `sweep-${alert.vehicleId}`,
            vehicleId: alert.vehicleId,
            reg: alert.reg || vehicle.reg,
            vehicleLabel: [alert.make || vehicle.make, alert.model || vehicle.model].filter(Boolean).join(' '),
            dueDate: alert.motDueDate,
            daysLeft,
        });
        seenIds.add(alert.vehicleId);
        if (regKey) seenRegs.add(regKey);
    });

    // Most overdue first, then soonest.
    return rows.sort((a, b) => a.daysLeft - b.daysLeft);
};

const motStatus = (row: MotRow): { text: string; tone: string } => {
    const { daysLeft } = row;
    if (daysLeft < 0) {
        const ago = Math.abs(daysLeft);
        return { text: `Expired ${ago} day${ago === 1 ? '' : 's'} ago`, tone: 'text-red-400' };
    }
    if (daysLeft === 0) return { text: 'Due today', tone: 'text-amber-400' };
    if (daysLeft === 1) return { text: 'Due tomorrow', tone: 'text-amber-400' };
    if (daysLeft <= MOT_URGENT_DAYS) return { text: `Due in ${daysLeft} days`, tone: 'text-amber-400' };
    const sameYear = row.dueDate?.slice(0, 4) === String(new Date().getFullYear());
    const when = row.dueDate
        ? formatDate(row.dueDate, sameYear ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' })
        : `in ${daysLeft} days`;
    return { text: `Due ${when}`, tone: 'text-gray-400' };
};

const MotRowItem: React.FC<{ row: MotRow; onOpen: (row: MotRow) => void }> = ({ row, onOpen }) => {
    const status = motStatus(row);
    const dot = row.daysLeft < 0 ? 'bg-red-400' : row.daysLeft <= MOT_URGENT_DAYS ? 'bg-amber-400' : 'bg-gray-600';
    return (
        <button
            type="button"
            onClick={() => onOpen(row)}
            className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-gray-700/40 transition-colors"
        >
            <span className={`h-2 w-2 flex-shrink-0 rounded-full ${dot}`} aria-hidden="true" />
            <span className="flex-shrink-0 rounded bg-yellow-400 px-1.5 py-0.5 font-mono text-xs font-bold tracking-wide text-gray-900">
                {row.reg || '—'}
            </span>
            <span className="min-w-0 flex-1 truncate text-sm text-gray-300">{row.vehicleLabel}</span>
            <span className={`flex-shrink-0 text-xs font-medium ${status.tone}`}>{status.text}</span>
        </button>
    );
};

interface WhatsAppRowProps {
    alert: OwnerAlert;
    conv?: Conversation;
    companyId: string;
    isUnseen: boolean;
    onOpen: (convId: string) => void;
}

const WhatsAppRow: React.FC<WhatsAppRowProps> = ({ alert, conv, companyId, isUnseen, onOpen }) => {
    const toast = useToast();
    const [replying, setReplying] = useState(false);
    const [replyText, setReplyText] = useState('');
    const [sending, setSending] = useState(false);

    const customerName = conv ? conversationName(conv) : alertHeadline(alert).replace(/\s*·\s*WhatsApp$/i, '');
    const vehicleTitle = conv?.vehicleInterest?.title;
    const phone = conv ? (conversationPhone(conv) || phoneFromThread(conv)) : '';
    const preview = alertBody(alert).replace(/\s+/g, ' ').trim();
    const open = () => alert.convId && onOpen(alert.convId);

    const handleSend = async () => {
        const next = replyText.trim();
        if (!next || sending || !companyId || !alert.convId) return;
        setSending(true);
        try {
            await sendAgentReply(companyId, alert.convId, next, undefined, 'whatsapp', phone);
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
        <div className="px-4 py-2.5 hover:bg-gray-700/30 transition-colors">
            <div className="flex items-start gap-3">
                <span
                    className={`mt-1.5 h-2 w-2 flex-shrink-0 rounded-full ${isUnseen ? 'bg-[#25d366]' : 'bg-transparent'}`}
                    aria-label={isUnseen ? 'New' : undefined}
                />
                <div className="min-w-0 flex-1">
                    <button type="button" onClick={open} className="block w-full text-left">
                        <div className="flex items-baseline gap-2">
                            <span className={`truncate text-sm ${isUnseen ? 'font-semibold text-white' : 'font-medium text-gray-200'}`}>
                                {customerName}
                            </span>
                            {vehicleTitle ? (
                                <span className="min-w-0 truncate text-xs text-gray-500">{vehicleTitle}</span>
                            ) : null}
                            <span className="ml-auto flex-shrink-0 text-[11px] text-gray-500">{formatAgentTime(alert.sentAt)}</span>
                        </div>
                        <p className="mt-0.5 truncate text-xs text-gray-400">{preview || 'New message'}</p>
                    </button>

                    {alert.convId && !replying && (
                        <button
                            type="button"
                            onClick={() => setReplying(true)}
                            className="mt-1 text-xs font-medium text-[#25d366] hover:underline"
                        >
                            Reply
                        </button>
                    )}

                    {replying && (
                        <div className="mt-2 space-y-2">
                            <textarea
                                rows={2}
                                value={replyText}
                                onChange={e => setReplyText(e.target.value)}
                                disabled={sending}
                                placeholder={`Reply to ${customerName}…`}
                                autoFocus
                                onKeyDown={e => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        handleSend();
                                    }
                                }}
                                className="w-full resize-none rounded-md border border-gray-600 bg-gray-900 p-2 text-sm text-white placeholder-gray-500 focus:border-[#25d366]/60 focus:outline-none focus:ring-1 focus:ring-[#25d366]/40 disabled:opacity-60"
                            />
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={handleSend}
                                    disabled={!replyText.trim() || sending}
                                    className="inline-flex items-center gap-1.5 rounded-md bg-[#25d366] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#20ba5a] disabled:opacity-50"
                                >
                                    <WhatsAppIcon className="h-3.5 w-3.5" />
                                    {sending ? 'Sending…' : 'Send'}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => { setReplying(false); setReplyText(''); }}
                                    disabled={sending}
                                    className="px-2 py-1 text-xs text-gray-400 hover:text-white"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    onClick={open}
                                    className="ml-auto text-xs text-gray-400 hover:text-white"
                                >
                                    Full thread &rarr;
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

const SectionHeader: React.FC<{ title: string; aside?: React.ReactNode }> = ({ title, aside }) => (
    <div className="flex items-center justify-between px-4 pb-1 pt-3">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">{title}</span>
        {aside}
    </div>
);

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

const NotificationBell = ({ notifications }: NotificationBellProps) => {
    const { companyId, vehicles, isServiceBusiness } = useData();
    const { setView, openModal } = useUI();
    const [isOpen, setIsOpen] = useState(false);
    const [showLaterMots, setShowLaterMots] = useState(false);
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [alerts, setAlerts] = useState<OwnerAlert[]>([]);
    const [sweep, setSweep] = useState<MotSweepSummary | null>(null);
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

    useEffect(() => {
        if (!companyId) return;
        return subscribeToOwnerAlerts(companyId, setAlerts);
    }, [companyId]);

    useEffect(() => {
        if (!companyId || isServiceBusiness) return;
        return subscribeToMotSweep(companyId, setSweep);
    }, [companyId, isServiceBusiness]);

    // A draft or question ping goes straight to that thread in the Agent Inbox.
    const setViewRef = useRef(setView);
    setViewRef.current = setView;
    useEffect(() => {
        const openThread = (convId: string) => {
            setIsOpen(false);
            setViewRef.current('agentInbox');
            requestAgentConversation(convId);
        };
        const stopReview = onDraftReviewRequest(openThread);
        const stopApprove = onDraftApproveRequest(openThread);
        return () => {
            stopReview();
            stopApprove();
        };
    }, []);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // --- MOT ---
    const motRows = useMemo(
        () => (isServiceBusiness ? [] : buildMotRows(notifications, sweep, vehicles)),
        [notifications, sweep, vehicles, isServiceBusiness]
    );
    const nearMots = motRows.filter(row => row.daysLeft <= MOT_SHOWN_DAYS);
    const laterMots = motRows.filter(row => row.daysLeft > MOT_SHOWN_DAYS);
    const urgentMotCount = motRows.filter(row => row.daysLeft <= MOT_URGENT_DAYS).length;

    // --- Dave ---
    const pending = useMemo(() => {
        const drafts = conversations.filter(c => c.pendingDraft);
        const questions = conversations.filter(c => c.pendingQuestion && !c.pendingDraft);
        return { drafts, questions };
    }, [conversations]);
    const actionCount = pending.drafts.length + pending.questions.length;

    // --- WhatsApp ---
    // The conversation's channel decides. With no conversation, only the push
    // title the server writes ("Name · WhatsApp") counts; anything unknown is
    // treated as email, and email lives in the Agent Inbox only.
    const whatsappAlerts = useMemo(() => {
        const byId = new Map(conversations.map(c => [c.id, c]));
        return alerts.filter(alert => {
            if (NOT_LISTED.has(alert.kind)) return false;
            const conv = byId.get(alert.convId);
            if (conv) return conv.channel === 'whatsapp';
            return /·\s*WhatsApp\s*$/i.test(alert.push?.title || '');
        });
    }, [alerts, conversations]);
    const unseenWhatsApp = whatsappAlerts.filter(alert => (alert.sentAt || 0) > seenAt);
    const shownWhatsApp = useMemo(() => {
        const cutoff = Date.now() - WHATSAPP_RECENT_MS;
        return whatsappAlerts
            .filter(alert => (alert.sentAt || 0) > seenAt || (alert.sentAt || 0) >= cutoff)
            .slice(0, WHATSAPP_MAX);
    }, [whatsappAlerts, seenAt]);

    // Opening the bell is the act of seeing them. `seenAt` is only written once
    // the bell closes, so the "new" dots stay put while Steve is reading.
    const pendingSeen = useRef(0);
    useEffect(() => {
        if (!isOpen || !whatsappAlerts.length) return;
        const newest = Math.max(...whatsappAlerts.map(alert => alert.sentAt || 0));
        if (newest > seenAt) pendingSeen.current = Math.max(pendingSeen.current, newest);
    }, [isOpen, whatsappAlerts, seenAt]);
    useEffect(() => {
        if (isOpen || !pendingSeen.current) return;
        const newest = pendingSeen.current;
        pendingSeen.current = 0;
        if (newest <= seenAt) return;
        writeSeenAt(newest);
        setSeenAt(newest);
    }, [isOpen, seenAt]);

    const count = urgentMotCount + actionCount + unseenWhatsApp.length;
    const hasAnything = motRows.length > 0 || actionCount > 0 || shownWhatsApp.length > 0;

    const handleOpenConversation = (convId: string) => {
        setIsOpen(false);
        setView('agentInbox');
        requestAgentConversation(convId);
    };

    const handleOpenDave = () => {
        const only = actionCount === 1 ? (pending.drafts[0] || pending.questions[0]) : undefined;
        setIsOpen(false);
        setView('agentInbox');
        if (only) requestAgentConversation(only.id);
    };

    const handleOpenMot = (row: MotRow) => {
        setIsOpen(false);
        setView('stock');
        const vehicle = row.vehicleId ? (vehicles).find(v => v.id === row.vehicleId) : undefined;
        if (vehicle) openModal('vehicle', vehicle);
    };

    const daveSummary = [
        pending.drafts.length ? plural(pending.drafts.length, 'reply to approve', 'replies to approve') : '',
        pending.questions.length ? plural(pending.questions.length, 'question', 'questions') : '',
    ].filter(Boolean).join(', ');

    return (
        <div className="relative" ref={menuRef}>
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className="relative p-2 text-gray-400 hover:text-white rounded-full hover:bg-gray-700 transition-colors"
                aria-label={count > 0 ? `View notifications (${count})` : 'View notifications'}
            >
                <BellIcon className="h-6 w-6" />
                {count > 0 && (
                    <span className="absolute top-0 right-0 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-gray-900">
                        {count > 9 ? '9+' : count}
                    </span>
                )}
            </button>

            {isOpen && (
                <div className="fixed inset-x-0 bottom-0 top-12 z-[60] flex max-h-[100dvh] flex-col overflow-hidden rounded-t-2xl bg-gray-800 pb-[env(safe-area-inset-bottom)] shadow-2xl ring-1 ring-black/40 focus:outline-none md:inset-auto md:absolute md:bottom-auto md:left-auto md:right-0 md:top-auto md:mt-2 md:max-h-[min(85vh,40rem)] md:w-[26rem] md:rounded-xl md:pb-0">
                    {/* Header */}
                    <div className="flex flex-shrink-0 items-center justify-between gap-2 border-b border-gray-700 px-4 py-3">
                        <span className="text-sm font-semibold text-white">Notifications</span>
                        <button
                            type="button"
                            onClick={() => setIsOpen(false)}
                            className="rounded-md p-1 text-gray-400 hover:bg-gray-700 hover:text-white transition-colors"
                            aria-label="Close notifications"
                        >
                            <XMarkIcon className="h-4 w-4" />
                        </button>
                    </div>

                    <div className="overflow-y-auto pb-2">
                        {motRows.length > 0 && (
                            <section>
                                <SectionHeader title="MOT" />
                                {nearMots.map(row => (
                                    <MotRowItem key={row.key} row={row} onOpen={handleOpenMot} />
                                ))}
                                {nearMots.length === 0 && (
                                    <p className="px-4 py-2 text-xs text-gray-500">Nothing due in the next {MOT_SHOWN_DAYS} days.</p>
                                )}
                                {showLaterMots && laterMots.map(row => (
                                    <MotRowItem key={row.key} row={row} onOpen={handleOpenMot} />
                                ))}
                                {laterMots.length > 0 && (
                                    <button
                                        type="button"
                                        onClick={() => setShowLaterMots(v => !v)}
                                        className="flex items-center gap-1 px-4 py-2 text-xs text-gray-400 hover:text-white"
                                    >
                                        <ChevronDownIcon className={`h-3.5 w-3.5 transition-transform ${showLaterMots ? 'rotate-180' : ''}`} />
                                        {showLaterMots ? 'Hide later ones' : `Show later ones (${laterMots.length})`}
                                    </button>
                                )}
                            </section>
                        )}

                        {actionCount > 0 && (
                            <section className={motRows.length > 0 ? 'mt-1 border-t border-gray-700/70' : ''}>
                                <SectionHeader title={`${agentName} needs you`} />
                                <button
                                    type="button"
                                    onClick={handleOpenDave}
                                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-gray-700/40 transition-colors"
                                >
                                    <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-brand-600/20 text-brand-400">
                                        <SparklesIcon className="h-4 w-4" />
                                    </span>
                                    <span className="min-w-0 flex-1 text-sm text-gray-200">
                                        <span className="font-semibold text-white">{agentName} needs you</span>
                                        <span className="text-gray-400"> — {daveSummary}</span>
                                    </span>
                                    <ChevronRightIcon className="h-4 w-4 flex-shrink-0 text-gray-500" />
                                </button>
                            </section>
                        )}

                        {shownWhatsApp.length > 0 && (
                            <section className={motRows.length > 0 || actionCount > 0 ? 'mt-1 border-t border-gray-700/70' : ''}>
                                <SectionHeader
                                    title="WhatsApp"
                                    aside={unseenWhatsApp.length > 0 ? (
                                        <span className="text-[11px] font-medium text-[#25d366]">{unseenWhatsApp.length} new</span>
                                    ) : undefined}
                                />
                                {shownWhatsApp.map(alert => (
                                    <WhatsAppRow
                                        key={alert.id}
                                        alert={alert}
                                        conv={conversations.find(c => c.id === alert.convId)}
                                        companyId={companyId || ''}
                                        isUnseen={(alert.sentAt || 0) > seenAt}
                                        onOpen={handleOpenConversation}
                                    />
                                ))}
                            </section>
                        )}

                        {!hasAnything && (
                            <div className="px-4 py-10 text-center">
                                <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-gray-700/60 text-gray-400">
                                    <BellIcon className="h-5 w-5" />
                                </div>
                                <p className="text-sm font-semibold text-gray-300">All caught up</p>
                                <p className="mt-0.5 text-xs text-gray-500">No MOTs due, nothing waiting on {agentName}, no new WhatsApp messages</p>
                            </div>
                        )}
                    </div>

                    <div className="flex-shrink-0 border-t border-gray-700 px-4 py-2.5 text-right">
                        <button
                            type="button"
                            onClick={() => { setIsOpen(false); setView('agentInbox'); }}
                            className="text-xs font-semibold text-brand-400 hover:text-brand-300"
                        >
                            Open Agent Inbox &rarr;
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default NotificationBell;
