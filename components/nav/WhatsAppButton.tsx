import React, { useMemo } from 'react';
import { WhatsAppIcon } from '../icons';
import { useUI } from '../../hooks/useUI';
import { useAgentInboxConversations } from '../../hooks/useAgentInboxConversations';
import { requestAgentConversation, requestInboxFilter } from '../../utils/agentInboxLink';

/**
 * WhatsApp, first in the header.
 *
 * The app is the only place customer WhatsApp can be read (email Steve sees in
 * Gmail first), so it gets its own button. Green with a count when anything is
 * unread; grey like the other header icons when not. A tap opens the Agent
 * Inbox on the WhatsApp tab, on the newest unread chat when there is one.
 */
const WhatsAppButton: React.FC = () => {
    const { setView } = useUI();
    const conversations = useAgentInboxConversations();

    const { unread, newestUnreadId } = useMemo(() => {
        let total = 0;
        let newestId = '';
        let newestAt = -1;
        for (const conv of conversations) {
            if (conv.channel !== 'whatsapp') continue;
            const n = Number(conv.unread) || 0;
            if (n <= 0) continue;
            total += n;
            const at = conv.updatedAt || 0;
            if (at > newestAt) {
                newestAt = at;
                newestId = conv.id;
            }
        }
        return { unread: total, newestUnreadId: newestId };
    }, [conversations]);

    const lit = unread > 0;

    const open = () => {
        setView('agentInbox');
        requestInboxFilter('whatsapp');
        if (newestUnreadId) requestAgentConversation(newestUnreadId);
    };

    return (
        <button
            type="button"
            onClick={open}
            className={`relative rounded-full p-2 transition-colors ${
                lit
                    ? 'bg-[#25d366] text-white hover:bg-[#1ebe5b]'
                    : 'text-gray-400 hover:bg-gray-700 hover:text-white'
            }`}
            aria-label={`WhatsApp, ${unread} unread`}
            title="WhatsApp"
        >
            {lit && (
                <span
                    className="pointer-events-none absolute inset-0 rounded-full bg-[#25d366] opacity-40 motion-safe:animate-ping"
                    aria-hidden
                />
            )}
            <WhatsAppIcon className="relative h-6 w-6" />
            {lit && (
                <span className="absolute -top-1 -right-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-white px-1 text-[10px] font-bold leading-none text-[#128c4a] ring-2 ring-gray-900">
                    {unread > 9 ? '9+' : unread}
                </span>
            )}
        </button>
    );
};

export default WhatsAppButton;
