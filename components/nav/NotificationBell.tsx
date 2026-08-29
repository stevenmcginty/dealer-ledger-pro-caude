import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Notification } from '../../types';
import { BellIcon, XMarkIcon } from '../icons';
import { useData } from '../../hooks/useData';
import DraftReviewCard, { QuestionReviewCard } from '../salesAgent/DraftReviewCard';
import {
    Conversation,
    OwnerAlert,
    alertBody,
    alertHeadline,
    formatAgentTime,
    subscribeToAgentConversations,
    subscribeToOwnerAlerts,
    subscribeToSalesAgentSettings,
} from '../../services/salesAgentService';
import { onDraftApproveRequest, onDraftReviewRequest } from '../../utils/agentInboxLink';

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

const NotificationBell = ({ notifications }: NotificationBellProps) => {
    const { companyId } = useData();
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

    // Everything the agent has raised — a customer message included. The backend has
    // written these all along; until now nothing read them, so a message arriving on a
    // thread Steve had taken over showed nowhere in the app (29 Aug).
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

    return (
        <div className="relative" ref={menuRef}>
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className="relative p-2 text-gray-400 hover:text-white rounded-full hover:bg-gray-700"
            >
                <span className="sr-only">View notifications</span>
                <BellIcon className="h-6 w-6" />
                {count > 0 && (
                    <span className="absolute top-0 right-0 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-gray-900">
                        {count > 9 ? '9+' : count}
                    </span>
                )}
            </button>

            {isOpen && (
                <div className="fixed inset-x-0 bottom-0 top-12 z-[60] flex max-h-[100dvh] flex-col overflow-hidden rounded-t-2xl bg-gray-800 pb-[env(safe-area-inset-bottom)] shadow-2xl ring-1 ring-black/40 focus:outline-none md:inset-auto md:absolute md:bottom-auto md:left-auto md:right-0 md:top-auto md:mt-2 md:max-h-[min(80vh,40rem)] md:w-[28rem] md:rounded-xl md:pb-0">
                    <div className="flex flex-shrink-0 items-center justify-between gap-2 px-4 py-2.5 text-sm font-semibold text-white border-b border-gray-700">
                        <span>{actionCount > 0 ? `${agentName} is waiting on you` : 'Notifications'}</span>
                        <button
                            type="button"
                            onClick={() => setIsOpen(false)}
                            className="rounded-md p-0.5 text-gray-400 hover:text-white"
                            aria-label="Close notifications"
                        >
                            <XMarkIcon className="h-4 w-4" />
                        </button>
                    </div>
                    <div className="overflow-y-auto">
                        {waitingOnFocus && (
                            <div className="border-b border-gray-700/60 px-4 py-3 text-sm text-gray-400">
                                {agentName} is still writing that reply…
                            </div>
                        )}

                        {companyId && drafts.map(conv => (
                            <div
                                key={conv.pendingDraft?.id || conv.id}
                                className={`border-b border-gray-700/60 px-4 py-4 ${
                                    conv.id === focusId ? 'bg-amber-950/25' : ''
                                }`}
                            >
                                <DraftReviewCard conv={conv} companyId={companyId} agentName={agentName} />
                            </div>
                        ))}

                        {companyId && questions.map(conv => (
                            <div
                                key={conv.pendingQuestion?.id || conv.id}
                                className="border-b border-gray-700/60 px-4 py-4"
                            >
                                <QuestionReviewCard conv={conv} companyId={companyId} agentName={agentName} />
                            </div>
                        ))}

                        {listedAlerts.length > 0 && (
                            <ul>
                                <li className={`px-4 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-gray-500 ${actionCount > 0 ? 'border-t border-gray-700/60' : ''}`}>
                                    Activity
                                </li>
                                {listedAlerts.slice(0, 20).map(alert => (
                                    <li
                                        key={alert.id}
                                        className={`border-b border-gray-700/60 px-4 py-3 text-sm ${
                                            (alert.sentAt || 0) > seenAt ? 'bg-sky-950/25' : ''
                                        }`}
                                    >
                                        <div className="flex items-baseline justify-between gap-2">
                                            <p className="min-w-0 truncate font-medium text-gray-200">{alertHeadline(alert)}</p>
                                            <span className="flex-shrink-0 text-[11px] text-gray-500">{formatAgentTime(alert.sentAt)}</span>
                                        </div>
                                        <p className="mt-0.5 line-clamp-3 text-gray-400">{alertBody(alert)}</p>
                                    </li>
                                ))}
                            </ul>
                        )}

                        {motCount > 0 && (
                            <ul>
                                <li className="border-t border-gray-700/60 px-4 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                                    MOT reminders
                                </li>
                                {notifications.map(notif => (
                                    <li key={notif.id} className="px-4 py-3 text-sm text-gray-300 hover:bg-gray-700/40">
                                        <p>{notif.message}</p>
                                    </li>
                                ))}
                            </ul>
                        )}

                        {count === 0 && !waitingOnFocus && (
                            <p className="px-4 py-6 text-center text-sm text-gray-400">No new notifications</p>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default NotificationBell;
