/**
 * Customer grouping for the Agent Inbox.
 *
 * The backend already tries to keep one person on one conversation, but a
 * WhatsApp and an email can still land as two threads (no shared phone, no
 * shared lead). The list groups those together so Steve sees one customer.
 */

import type { Channel, Conversation } from '../services/salesAgentService';

const nameOf = (conv: Conversation): string => {
    const full = [conv.contact?.firstName, conv.contact?.lastName].filter(Boolean).join(' ').trim();
    return full || conv.contact?.phone || conv.contact?.email || conv.address || 'Unknown';
};

export type InboxFilter = 'all' | 'whatsapp' | 'email';

export const conversationRefKey = (conv: Pick<Conversation, 'id' | 'companyId'>): string =>
    `${conv.companyId || ''}:${conv.id}`;

export interface CustomerGroup {
    id: string;
    name: string;
    conversations: Conversation[];
    latest: Conversation;
    channels: Channel[];
    unread: number;
    pending: boolean;
    waiting: boolean;
    escalated: boolean;
    preview: string;
    updatedAt: number;
    /** True when any thread in the group lives on another ledger. */
    shared: boolean;
}

const last10 = (digits: string): string => digits.slice(-10);

export const phoneKey = (raw?: string): string | null => {
    const digits = (raw || '').replace(/\D/g, '');
    return digits.length >= 9 ? `p:${last10(digits)}` : null;
};

export const emailKey = (raw?: string): string | null => {
    const email = (raw || '').trim().toLowerCase();
    return email.includes('@') ? `e:${email}` : null;
};

/** Stable identifiers used to recognise the same person across threads. */
export const conversationKeys = (conv: Conversation): string[] => {
    const keys = new Set<string>();
    const phone = phoneKey(conv.contact?.phone)
        || (conv.channel !== 'email' ? phoneKey(conv.address) : null);
    const email = emailKey(conv.contact?.email)
        || (conv.channel === 'email' ? emailKey(conv.address) : null);
    if (phone) keys.add(phone);
    if (email) keys.add(email);
    if (conv.contact?.leadId) keys.add(`l:${conv.contact.leadId}`);
    if (!keys.size) keys.add(`id:${conv.companyId || ''}:${conv.id}`);
    return [...keys];
};

export const conversationChannels = (conv: Conversation): Channel[] => {
    const set = new Set<Channel>();
    if (conv.channel) set.add(conv.channel);
    if (conv.originChannel) set.add(conv.originChannel);
    return [...set];
};

const uniqueChannels = (conversations: Conversation[]): Channel[] => {
    const order: Channel[] = ['whatsapp', 'email', 'sms'];
    const present = new Set<Channel>();
    conversations.forEach(conv => conversationChannels(conv).forEach(ch => present.add(ch)));
    return order.filter(ch => present.has(ch));
};

/**
 * Union-find over phone / email / lead so a WhatsApp thread and an email
 * thread about the same person sit on one row.
 */
export const groupConversations = (
    conversations: Conversation[],
    myCompanyId?: string
): CustomerGroup[] => {
    const parent = new Map<string, string>();
    const find = (key: string): string => {
        const p = parent.get(key) || key;
        if (p !== key) {
            const root = find(p);
            parent.set(key, root);
            return root;
        }
        return key;
    };
    const union = (a: string, b: string) => {
        const ra = find(a);
        const rb = find(b);
        if (ra !== rb) parent.set(ra, rb);
    };

    conversations.forEach(conv => {
        const keys = conversationKeys(conv);
        keys.forEach(key => {
            if (!parent.has(key)) parent.set(key, key);
        });
        for (let i = 1; i < keys.length; i += 1) union(keys[0], keys[i]);
    });

    const buckets = new Map<string, Conversation[]>();
    conversations.forEach(conv => {
        const root = find(conversationKeys(conv)[0]);
        const list = buckets.get(root) || [];
        list.push(conv);
        buckets.set(root, list);
    });

    const groups: CustomerGroup[] = [];
    buckets.forEach((list, root) => {
        list.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
        const latest = list[0];
        groups.push({
            id: root,
            name: nameOf(latest),
            conversations: list,
            latest,
            channels: uniqueChannels(list),
            unread: list.reduce((n, conv) => n + (Number(conv.unread) || 0), 0),
            pending: list.some(conv => !!conv.pendingDraft),
            waiting: list.some(conv => !!conv.pendingQuestion),
            escalated: list.some(conv => !!conv.escalated),
            preview: latest.summary || latest.vehicleInterest?.title || latest.address || '',
            updatedAt: latest.updatedAt || 0,
            shared: !!myCompanyId && list.some(conv => conv.companyId && conv.companyId !== myCompanyId),
        });
    });

    groups.sort((a, b) => b.updatedAt - a.updatedAt);
    return groups;
};

export const groupHasChannel = (group: CustomerGroup, filter: InboxFilter): boolean => {
    if (filter === 'all') return true;
    return group.channels.includes(filter);
};

/**
 * Threads to show inside a group for the WhatsApp / Email tabs.
 * Prefer the conversation that actually sends on that channel; fall back to
 * origin so a WhatsApp that started from an email is not a blank screen.
 */
export const conversationsForFilter = (group: CustomerGroup, filter: InboxFilter): Conversation[] => {
    if (filter === 'all') return group.conversations;
    const exact = group.conversations.filter(conv => conv.channel === filter);
    if (exact.length) return exact;
    return group.conversations.filter(conv => conversationChannels(conv).includes(filter));
};

export const inboxWaitingCount = (conversations: Conversation[]): { pending: number; unread: number } => {
    let pending = 0;
    let unread = 0;
    conversations.forEach(conv => {
        if (conv.pendingDraft || conv.pendingQuestion || conv.escalated) pending += 1;
        unread += Number(conv.unread) || 0;
    });
    return { pending, unread };
};
