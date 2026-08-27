import React, { useEffect, useMemo, useRef, useState } from 'react';
import { InboxIcon } from '../icons';
import { useData } from '../../hooks/useData';
import { useUI } from '../../hooks/useUI';
import {
    Conversation,
    SharedInboxMeta,
    subscribeToAgentConversations,
    subscribeToAgentConversationsAcross,
    subscribeToSharedInbox,
} from '../../services/salesAgentService';
import { inboxWaitingCount } from '../../utils/agentInboxGroups';
import { playInboxChime, setInboxBadge } from '../../utils/inboxNotify';

/**
 * The Agent Inbox, one tap from anywhere.
 *
 * Sits beside the bell in the header. The badge counts everything waiting on a
 * human: drafts, questions, escalations and unread customer messages — including
 * WhatsApp that landed on a shared-inbox sibling ledger. Tapping it opens the
 * inbox; the bell stays the place to approve a draft without leaving the page.
 */
const AgentInboxButton: React.FC = () => {
    const { companyId } = useData();
    const { view, setView } = useUI();
    const [own, setOwn] = useState<Conversation[]>([]);
    const [shared, setShared] = useState<Conversation[]>([]);
    const [inbox, setInbox] = useState<SharedInboxMeta | null>(null);
    const prevCount = useRef<number | null>(null);
    const mountedAt = useRef(Date.now());

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

    const conversations = useMemo(() => {
        if (!shared.length) return own;
        const seen = new Set<string>();
        const list: Conversation[] = [];
        [...shared, ...own].forEach(conv => {
            const key = `${conv.companyId || ''}:${conv.id}`;
            if (seen.has(key)) return;
            seen.add(key);
            list.push(conv);
        });
        return list;
    }, [own, shared]);

    const { pending, unread } = useMemo(() => inboxWaitingCount(conversations), [conversations]);
    const count = pending + unread;
    const whatsappUnread = useMemo(
        () => conversations.reduce((n, conv) => n + (conv.channel === 'whatsapp' ? Number(conv.unread) || 0 : 0), 0),
        [conversations]
    );

    useEffect(() => {
        setInboxBadge(count);
        // Shared-inbox conversations arrive a tick after this company's, and
        // that extra count is not a new message. Ignore increases until the
        // first snapshots have settled; the push handler still chimes at once.
        const settled = Date.now() - mountedAt.current > 2500;
        if (settled && prevCount.current !== null && count > prevCount.current) playInboxChime();
        prevCount.current = count;
    }, [count]);

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
                        pending > 0 ? 'bg-amber-500' : whatsappUnread > 0 ? 'bg-[#25d366]' : 'bg-sky-500'
                    }`}
                >
                    {count > 9 ? '9+' : count}
                </span>
            )}
        </button>
    );
};

export default AgentInboxButton;
