import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Notification } from '../../types';
import { BellIcon, XMarkIcon } from '../icons';
import { useData } from '../../hooks/useData';
import DraftReviewCard, { QuestionReviewCard } from '../salesAgent/DraftReviewCard';
import {
    Conversation,
    subscribeToAgentConversations,
    subscribeToSalesAgentSettings,
} from '../../services/salesAgentService';
import { onDraftApproveRequest, onDraftReviewRequest } from '../../utils/agentInboxLink';

interface NotificationBellProps {
    notifications: Notification[];
}

const NotificationBell = ({ notifications }: NotificationBellProps) => {
    const { companyId } = useData();
    const [isOpen, setIsOpen] = useState(false);
    const [focusId, setFocusId] = useState('');
    const [conversations, setConversations] = useState<Conversation[]>([]);
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

    const motCount = notifications.length;
    const actionCount = drafts.length + questions.length;
    const count = actionCount + motCount;
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

                        {motCount > 0 && (
                            <ul>
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
