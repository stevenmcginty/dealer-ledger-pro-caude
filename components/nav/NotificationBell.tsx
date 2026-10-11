import React, { useEffect, useMemo, useRef, useState } from 'react';
import { MotSweepSummary, Notification, Vehicle } from '../../types';
import { BellIcon, ChevronDownIcon, ChevronRightIcon, SparklesIcon, WhatsAppIcon, XMarkIcon } from '../icons';
import Plate from '../ui/Plate';
import { cx } from '../ui/cx';
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
        return { text: `Expired ${ago} day${ago === 1 ? '' : 's'} ago`, tone: 'text-danger' };
    }
    if (daysLeft === 0) return { text: 'Due today', tone: 'text-warning' };
    if (daysLeft === 1) return { text: 'Due tomorrow', tone: 'text-warning' };
    if (daysLeft <= MOT_URGENT_DAYS) return { text: `Due in ${daysLeft} days`, tone: 'text-warning' };
    const sameYear = row.dueDate?.slice(0, 4) === String(new Date().getFullYear());
    const when = row.dueDate
        ? formatDate(row.dueDate, sameYear ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' })
        : `in ${daysLeft} days`;
    return { text: `Due ${when}`, tone: 'text-ink-3' };
};

const MotRowItem: React.FC<{ row: MotRow; onOpen: (row: MotRow) => void }> = ({ row, onOpen }) => {
    const status = motStatus(row);
    // Shape as well as colour: a filled dot once expired, a ring while due soon.
    const dot = row.daysLeft < 0
        ? 'bg-danger'
        : row.daysLeft <= MOT_URGENT_DAYS ? 'border-2 border-warning' : 'bg-line-strong';
    return (
        <button
            type="button"
            onClick={() => onOpen(row)}
            className="flex min-h-[48px] w-full items-center gap-3 px-4 py-2 text-start transition-colors duration-quick ease-out hover:bg-surface-2 active:bg-surface-3"
        >
            <span className={`h-2.5 w-2.5 flex-none rounded-full ${dot}`} aria-hidden="true" />
            <Plate reg={row.reg || '—'} size="sm" />
            <span className="min-w-0 flex-1 truncate text-sm text-ink-2">{row.vehicleLabel}</span>
            <span className={`flex-none text-xs font-semibold ${status.tone}`}>{status.text}</span>
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
        <div className="px-4 py-1.5 transition-colors duration-quick ease-out hover:bg-surface-2">
            <div className="flex items-start gap-3">
                <span
                    className={`mt-3 h-2.5 w-2.5 flex-none rounded-full ${isUnseen ? 'bg-accent' : 'bg-transparent'}`}
                    aria-label={isUnseen ? 'New' : undefined}
                />
                <div className="min-w-0 flex-1">
                    <button type="button" onClick={open} className="block min-h-[44px] w-full py-1 text-start">
                        <div className="flex items-baseline gap-2">
                            <span className={`truncate text-sm ${isUnseen ? 'font-bold text-ink' : 'font-semibold text-ink-2'}`}>
                                {customerName}
                            </span>
                            {vehicleTitle ? (
                                <span className="min-w-0 truncate text-xs text-ink-3">{vehicleTitle}</span>
                            ) : null}
                            <span className="num ms-auto flex-none text-xs text-ink-3">{formatAgentTime(alert.sentAt)}</span>
                        </div>
                        <p className="mt-0.5 truncate text-sm text-ink-2">{preview || 'New message'}</p>
                    </button>

                    {alert.convId && !replying && (
                        <button
                            type="button"
                            onClick={() => setReplying(true)}
                            className="-ms-2 inline-flex min-h-[44px] items-center gap-1.5 rounded-control px-2 text-sm font-semibold text-accent-text hover:bg-accent-soft"
                        >
                            <WhatsAppIcon className="h-4 w-4" />
                            Reply
                        </button>
                    )}

                    {replying && (
                        <div className="mt-1 space-y-2 pb-2">
                            <textarea
                                rows={2}
                                value={replyText}
                                onChange={e => setReplyText(e.target.value)}
                                disabled={sending}
                                placeholder={`Reply to ${customerName}…`}
                                aria-label={`Reply to ${customerName}`}
                                autoFocus
                                onKeyDown={e => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        handleSend();
                                    }
                                }}
                                className="w-full resize-none rounded-control border border-line-strong bg-surface p-2.5 text-base text-ink placeholder:text-ink-3 focus-visible:border-focus focus-visible:shadow-[0_0_0_1px_rgb(var(--c-focus))] disabled:opacity-60"
                            />
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={handleSend}
                                    disabled={!replyText.trim() || sending}
                                    className="inline-flex min-h-[44px] items-center gap-1.5 rounded-control bg-accent px-4 text-sm font-semibold text-on-accent transition-colors duration-quick hover:bg-accent-hover active:bg-accent-press disabled:bg-surface-2 disabled:text-ink-3"
                                >
                                    <WhatsAppIcon className="h-4 w-4" />
                                    {sending ? 'Sending…' : 'Send'}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => { setReplying(false); setReplyText(''); }}
                                    disabled={sending}
                                    className="inline-flex min-h-[44px] items-center rounded-control px-3 text-sm font-semibold text-ink-2 transition-colors duration-quick hover:bg-surface-3 hover:text-ink"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    onClick={open}
                                    className="ms-auto inline-flex min-h-[44px] items-center gap-1 rounded-control px-2 text-sm font-semibold text-accent-text transition-colors duration-quick hover:bg-accent-soft"
                                >
                                    Full thread
                                    <ChevronRightIcon className="h-4 w-4 rtl:-scale-x-100" />
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
        <h3 className="font-mono text-xs font-semibold uppercase tracking-[0.08em] text-ink-3">{title}</h3>
        {aside}
    </div>
);

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

const NotificationBell = ({ notifications }: NotificationBellProps) => {
    const { companyId, vehicles, isServiceBusiness } = useData();
    const { setView, openVehicle } = useUI();
    const [isOpen, setIsOpen] = useState(false);
    const [showLaterMots, setShowLaterMots] = useState(false);
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [alerts, setAlerts] = useState<OwnerAlert[]>([]);
    const [sweep, setSweep] = useState<MotSweepSummary | null>(null);
    const [seenAt, setSeenAt] = useState(readSeenAt);
    const [agentName, setAgentName] = useState('Dave');
    const menuRef = useRef<HTMLDivElement>(null);
    const buttonRef = useRef<HTMLButtonElement>(null);

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

    // Esc closes the panel and puts focus back on the bell.
    useEffect(() => {
        if (!isOpen) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== 'Escape') return;
            setIsOpen(false);
            buttonRef.current?.focus();
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [isOpen]);

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
            .sort((a, b) => (b.sentAt || 0) - (a.sentAt || 0))
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

    // An MOT row opens that car's page; a sweep-only car with no stock record opens the list.
    const handleOpenMot = (row: MotRow) => {
        setIsOpen(false);
        const vehicle = row.vehicleId ? vehicles.find(v => v.id === row.vehicleId) : undefined;
        if (vehicle) openVehicle(vehicle.id);
        else setView('stock');
    };

    const daveSummary = [
        pending.drafts.length ? plural(pending.drafts.length, 'reply to approve', 'replies to approve') : '',
        pending.questions.length ? plural(pending.questions.length, 'question', 'questions') : '',
    ].filter(Boolean).join(', ');

    return (
        <div className="relative" ref={menuRef}>
            <button
                ref={buttonRef}
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                aria-expanded={isOpen}
                aria-haspopup="dialog"
                className={cx(
                    'relative grid h-12 w-12 place-items-center rounded-control transition-colors duration-quick ease-out',
                    isOpen ? 'bg-surface-2 text-ink' : 'text-ink-2 hover:bg-surface-2 hover:text-ink active:bg-surface-3',
                )}
                aria-label={count > 0 ? `Alerts, ${count} new` : 'Alerts'}
                title="Alerts"
            >
                <BellIcon className="h-6 w-6" />
                {count > 0 && (
                    <span
                        aria-hidden="true"
                        className="num absolute end-1 top-1.5 h-5 min-w-[20px] rounded-full bg-danger px-[5px] text-center text-xs font-semibold leading-5 text-on-danger shadow-[0_0_0_2px_rgb(var(--c-surface))]"
                    >
                        {count > 99 ? '99+' : count}
                    </span>
                )}
            </button>

            {isOpen && (
                <>
                    {/* Phone: the panel is a sheet, so dim what is behind it. */}
                    <div className="anim-fade-in fixed inset-0 z-sheet bg-scrim md:hidden" onClick={() => setIsOpen(false)} aria-hidden="true" />
                    <div
                        role="dialog"
                        aria-label="Alerts"
                        className="anim-sheet-in fixed inset-x-0 bottom-0 top-14 z-sheet flex flex-col overflow-hidden rounded-t-sheet bg-surface pb-[env(safe-area-inset-bottom)] shadow-e3 md:anim-pop-in md:absolute md:inset-x-auto md:bottom-auto md:end-0 md:top-[calc(100%+6px)] md:max-h-[min(85vh,40rem)] md:w-[26rem] md:rounded-card md:border md:border-line md:pb-0"
                    >
                        <div className="flex flex-none items-center justify-between gap-2 border-b border-line py-1 pe-1 ps-4">
                            <h2 className="text-base font-bold text-ink">Alerts</h2>
                            <button
                                type="button"
                                onClick={() => setIsOpen(false)}
                                className="grid h-12 w-12 place-items-center rounded-control text-ink-2 transition-colors duration-quick hover:bg-surface-2 hover:text-ink"
                                aria-label="Close alerts"
                            >
                                <XMarkIcon className="h-5 w-5" />
                            </button>
                        </div>

                        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-2">
                            {shownWhatsApp.length > 0 && (
                                <section>
                                    <SectionHeader
                                        title="WhatsApp"
                                        aside={unseenWhatsApp.length > 0 ? (
                                            <span className="num text-xs font-semibold text-accent-text">{unseenWhatsApp.length} new</span>
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

                            {motRows.length > 0 && (
                                <section className={shownWhatsApp.length > 0 ? 'mt-1 border-t border-line' : ''}>
                                    <SectionHeader title="MOT" />
                                    {nearMots.map(row => (
                                        <MotRowItem key={row.key} row={row} onOpen={handleOpenMot} />
                                    ))}
                                    {nearMots.length === 0 && (
                                        <p className="px-4 py-2 text-sm text-ink-3">Nothing due in the next {MOT_SHOWN_DAYS} days.</p>
                                    )}
                                    {showLaterMots && laterMots.map(row => (
                                        <MotRowItem key={row.key} row={row} onOpen={handleOpenMot} />
                                    ))}
                                    {laterMots.length > 0 && (
                                        <button
                                            type="button"
                                            onClick={() => setShowLaterMots(v => !v)}
                                            aria-expanded={showLaterMots}
                                            className="flex min-h-[44px] items-center gap-1.5 px-4 text-sm font-semibold text-ink-2 hover:text-ink"
                                        >
                                            <ChevronDownIcon className={`h-4 w-4 transition-transform duration-quick ${showLaterMots ? 'rotate-180' : ''}`} />
                                            {showLaterMots ? 'Hide later ones' : `Show later ones (${laterMots.length})`}
                                        </button>
                                    )}
                                </section>
                            )}

                            {actionCount > 0 && (
                                <section className={shownWhatsApp.length > 0 || motRows.length > 0 ? 'mt-1 border-t border-line' : ''}>
                                    <SectionHeader title={`${agentName} needs you`} />
                                    <button
                                        type="button"
                                        onClick={handleOpenDave}
                                        className="flex min-h-[56px] w-full items-center gap-3 px-4 py-2 text-start transition-colors duration-quick ease-out hover:bg-surface-2 active:bg-surface-3"
                                    >
                                        <span className="grid h-8 w-8 flex-none place-items-center rounded-full bg-accent-soft text-accent-soft-ink">
                                            <SparklesIcon className="h-5 w-5" />
                                        </span>
                                        <span className="min-w-0 flex-1 text-sm text-ink-2">
                                            <span className="font-semibold text-ink">{agentName} needs you</span>
                                            <span> · {daveSummary}</span>
                                        </span>
                                        <ChevronRightIcon className="h-5 w-5 flex-none text-ink-3 rtl:-scale-x-100" />
                                    </button>
                                </section>
                            )}

                            {!hasAnything && (
                                <div className="px-6 py-10 text-start">
                                    <div className="mb-3 grid h-10 w-10 place-items-center rounded-full bg-surface-2 text-ink-2">
                                        <BellIcon className="h-5 w-5" />
                                    </div>
                                    <p className="text-base font-semibold text-ink">All caught up</p>
                                    <p className="mt-1 text-sm text-ink-3">No MOTs due, nothing waiting on {agentName}, no new WhatsApp messages.</p>
                                </div>
                            )}
                        </div>

                        <div className="flex flex-none justify-end border-t border-line px-2 py-1">
                            <button
                                type="button"
                                onClick={() => { setIsOpen(false); setView('agentInbox'); }}
                                className="inline-flex min-h-[44px] items-center gap-1 rounded-control px-3 text-sm font-semibold text-accent-text transition-colors duration-quick hover:bg-accent-soft"
                            >
                                Open Inbox
                                <ChevronRightIcon className="h-4 w-4 rtl:-scale-x-100" />
                            </button>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

export default NotificationBell;
