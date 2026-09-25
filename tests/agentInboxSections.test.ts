import { describe, expect, it } from 'vitest';
import type { Conversation } from '../services/salesAgentService';
import { groupConversations } from '../utils/agentInboxGroups';
import { EARLIER_AFTER_MS, needsReasonOf, sectionGroups } from '../utils/agentInboxSections';

const NOW = 1_800_000_000_000;
const DAY = 24 * 3600_000;

const conv = (over: Partial<Conversation>): Conversation => ({
    id: over.id || 'c1',
    shortId: 1,
    companyId: over.companyId || 'co-a',
    channel: over.channel || 'email',
    address: over.address || `${over.id || 'c1'}@example.com`,
    originChannel: over.channel || 'email',
    contact: over.contact || {},
    mode: 'agent',
    stage: 'vehicle',
    escalated: false,
    priceRequests: 0,
    lastInboundAt: 1,
    // Replied to by default: the customer did not speak last.
    lastCustomerMessageAt: (over.updatedAt || NOW) - 60_000,
    lastOutboundAt: over.updatedAt || NOW,
    createdAt: 1,
    updatedAt: over.updatedAt || NOW,
    unread: 0,
    ...over,
});

const sectionIds = (list: Conversation[]) => {
    const s = sectionGroups(groupConversations(list, 'co-a'), NOW);
    return {
        needsYou: s.needsYou.map(g => g.latest.id),
        recent: s.recent.map(g => g.latest.id),
        earlier: s.earlier.map(g => g.latest.id),
    };
};

describe('sectionGroups', () => {
    it('folds threads quiet for two weeks into Earlier, even when unread', () => {
        const ids = sectionIds([
            conv({ id: 'live', updatedAt: NOW - DAY }),
            conv({ id: 'old', updatedAt: NOW - EARLIER_AFTER_MS - DAY }),
            conv({ id: 'old-unread', updatedAt: NOW - 40 * DAY, unread: 3 }),
        ]);
        expect(ids.recent).toEqual(['live']);
        expect(ids.earlier).toEqual(['old', 'old-unread']);
        expect(ids.needsYou).toEqual([]);
    });

    it('keeps a pending draft or Dave question in Needs you however old it is', () => {
        const ids = sectionIds([
            conv({
                id: 'draft',
                updatedAt: NOW - 60 * DAY,
                pendingDraft: { id: 'd', text: 'Hi', createdAt: 1, source: 'agent' },
            }),
            conv({
                id: 'question',
                updatedAt: NOW - 90 * DAY,
                pendingQuestion: { id: 'q', question: 'Price?', askedAt: 1 },
            }),
        ]);
        expect(ids.needsYou).toEqual(['draft', 'question']);
        expect(ids.earlier).toEqual([]);
    });

    it('flags a customer waiting on a reply only while the thread is recent', () => {
        const ids = sectionIds([
            conv({ id: 'waiting', updatedAt: NOW - 2 * DAY, lastCustomerMessageAt: NOW - 2 * DAY, lastOutboundAt: NOW - 3 * DAY }),
            conv({ id: 'gone-cold', updatedAt: NOW - 30 * DAY, lastCustomerMessageAt: NOW - 30 * DAY, lastOutboundAt: 0 }),
        ]);
        expect(ids.needsYou).toEqual(['waiting']);
        expect(ids.earlier).toEqual(['gone-cold']);
    });

    it('never flags the other ledger as waiting on Steve', () => {
        const ids = sectionIds([
            conv({ id: 'chris', companyId: 'co-b', updatedAt: NOW - DAY, lastCustomerMessageAt: NOW - DAY, lastOutboundAt: 0 }),
        ]);
        expect(ids.needsYou).toEqual([]);
        expect(ids.recent).toEqual(['chris']);
    });

    it('keeps the incoming recency order inside each section', () => {
        const ids = sectionIds([
            conv({ id: 'a', updatedAt: NOW - 1 * DAY }),
            conv({ id: 'b', updatedAt: NOW - 2 * DAY }),
            conv({ id: 'c', updatedAt: NOW - 3 * DAY }),
        ]);
        expect(ids.recent).toEqual(['a', 'b', 'c']);
    });
});

describe('needsReasonOf', () => {
    it('ranks a question over a draft over a waiting customer over an escalation', () => {
        const [group] = groupConversations([
            conv({
                id: 'all',
                escalated: true,
                lastCustomerMessageAt: NOW,
                lastOutboundAt: 0,
                pendingDraft: { id: 'd', text: 'Hi', createdAt: 1, source: 'agent' },
                pendingQuestion: { id: 'q', question: 'Price?', askedAt: 1 },
            }),
        ], 'co-a');
        expect(needsReasonOf(group, NOW)).toBe('question');
        expect(needsReasonOf({ ...group, waiting: false }, NOW)).toBe('draft');
        expect(needsReasonOf({ ...group, waiting: false, pending: false }, NOW)).toBe('waiting');
        const replied = groupConversations([conv({ id: 'esc', escalated: true })], 'co-a')[0];
        expect(needsReasonOf(replied, NOW)).toBe('escalated');
    });
});
