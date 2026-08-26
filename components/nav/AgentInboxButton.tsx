import React, { useEffect, useMemo, useState } from 'react';
import { InboxIcon } from '../icons';
import { useData } from '../../hooks/useData';
import { useUI } from '../../hooks/useUI';
import { Conversation, subscribeToAgentConversations } from '../../services/salesAgentService';

/**
 * The Agent Inbox, one tap from anywhere.
 *
 * Sits beside the bell in the header. The badge counts everything waiting on a
 * human: drafts to approve, questions Dave has asked, escalated threads and
 * unread customer messages. Tapping it opens the inbox itself; the bell stays
 * the place to approve a draft without leaving the current page.
 */
const AgentInboxButton: React.FC = () => {
    const { companyId } = useData();
    const { view, setView } = useUI();
    const [conversations, setConversations] = useState<Conversation[]>([]);

    useEffect(() => {
        if (!companyId) return;
        return subscribeToAgentConversations(companyId, setConversations);
    }, [companyId]);

    const { pending, unread } = useMemo(() => {
        let pending = 0;
        let unread = 0;
        for (const conv of conversations) {
            if (conv.pendingDraft || conv.pendingQuestion || conv.escalated) pending += 1;
            unread += Number(conv.unread) || 0;
        }
        return { pending, unread };
    }, [conversations]);

    const count = pending + unread;
    const active = view === 'agentInbox';

    return (
        <button
            type="button"
            onClick={() => setView('agentInbox')}
            className={`relative p-2 rounded-full hover:bg-gray-700 ${active ? 'text-white' : 'text-gray-400 hover:text-white'}`}
            aria-label={count > 0 ? `Agent Inbox, ${count} waiting` : 'Agent Inbox'}
            title="Agent Inbox"
        >
            <InboxIcon className="h-6 w-6" />
            {count > 0 && (
                <span
                    className={`absolute top-0 right-0 flex h-4 min-w-[1rem] items-center justify-center rounded-full px-1 text-[10px] font-bold leading-none text-white ring-2 ring-gray-900 ${
                        pending > 0 ? 'bg-amber-500' : 'bg-brand-500'
                    }`}
                >
                    {count > 9 ? '9+' : count}
                </span>
            )}
        </button>
    );
};

export default AgentInboxButton;
