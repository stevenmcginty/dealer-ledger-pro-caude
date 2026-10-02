/**
 * Priority sections for the Agent Inbox list.
 *
 * Steve reads the list top-down, so it is ordered by what he has to do:
 *   0. WhatsApp — every customer with WhatsApp activity in the last two
 *      weeks, newest first. The app is the only place WhatsApp can be read
 *      (email he sees in Gmail first), so it sits above everything.
 *   1. Needs you — Dave is holding a draft or a question, or the customer
 *      spoke last and nobody has answered yet.
 *   2. Recent — anything else with activity in the last two weeks.
 *   3. Earlier — threads that have gone quiet. Collapsed by default, so a
 *      backlog of old emails can never bury the live conversations.
 *
 * Presentation only: nothing here writes to Firebase or changes a thread.
 */

import type { CustomerGroup } from './agentInboxGroups';

/** A thread with no activity for this long is finished enough to fold away. */
export const EARLIER_AFTER_MS = 14 * 24 * 3600_000;

export type NeedsReason = 'question' | 'draft' | 'waiting' | 'escalated';

export interface InboxSections {
    whatsapp: CustomerGroup[];
    needsYou: CustomerGroup[];
    recent: CustomerGroup[];
    earlier: CustomerGroup[];
}

/** The customer wrote last on at least one thread and has had no reply since. */
export const groupAwaitsReply = (group: CustomerGroup): boolean =>
    group.conversations.some(conv => (conv.lastCustomerMessageAt || 0) > (conv.lastOutboundAt || 0));

export const isStaleGroup = (group: CustomerGroup, now: number): boolean =>
    now - (group.updatedAt || 0) >= EARLIER_AFTER_MS;

/**
 * Why this customer needs Steve, most urgent first — or null.
 *
 * Dave's draft and question always count, however old: Dave is stopped until
 * Steve acts. "Awaiting reply" and "escalated" only count while the thread is
 * recent, and "awaiting reply" never counts on the other ledger's threads
 * (their owner answers their own leads).
 */
export const needsReasonOf = (group: CustomerGroup, now: number): NeedsReason | null => {
    if (group.waiting) return 'question';
    if (group.pending) return 'draft';
    if (isStaleGroup(group, now)) return null;
    if (!group.shared && groupAwaitsReply(group)) return 'waiting';
    if (group.escalated) return 'escalated';
    return null;
};

/** Latest WhatsApp activity on this customer, or 0 when they have no WhatsApp thread. */
export const whatsappActivityAt = (group: CustomerGroup): number =>
    group.conversations.reduce((latest, conv) => conv.channel === 'whatsapp'
        ? Math.max(latest, conv.lastCustomerMessageAt || 0, conv.lastOutboundAt || 0, conv.updatedAt || 0)
        : latest, 0);

export interface SectionOptions {
    /** Lift recent WhatsApp customers into their own top section. Default true. */
    whatsappFirst?: boolean;
}

/**
 * Split an already-sorted list into sections, keeping the order inside each —
 * except WhatsApp, which is ordered by its own WhatsApp activity, newest first.
 */
export const sectionGroups = (
    groups: CustomerGroup[],
    now: number,
    { whatsappFirst = true }: SectionOptions = {}
): InboxSections => {
    const sections: InboxSections = { whatsapp: [], needsYou: [], recent: [], earlier: [] };
    const whatsappAt = new Map<CustomerGroup, number>();
    groups.forEach(group => {
        const at = whatsappFirst ? whatsappActivityAt(group) : 0;
        if (at && now - at < EARLIER_AFTER_MS) {
            whatsappAt.set(group, at);
            sections.whatsapp.push(group);
        } else if (needsReasonOf(group, now)) sections.needsYou.push(group);
        else if (isStaleGroup(group, now)) sections.earlier.push(group);
        else sections.recent.push(group);
    });
    sections.whatsapp.sort((a, b) => (whatsappAt.get(b) || 0) - (whatsappAt.get(a) || 0));
    return sections;
};
