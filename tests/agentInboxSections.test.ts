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

const sectionIds = (list: Conversation[], opts?: { whatsappFirst?: boolean }) => {
    const s = sectionGroups(groupConversations(list, 'co-a'), NOW, opts);
    return {
        whatsapp: s.whatsapp.map(g => g.latest.id),
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
        expect(ids.whatsapp).toEqual([]);
    });
});

describe('sectionGroups — WhatsApp first', () => {
    it('lifts a recent WhatsApp customer above Needs you, keeping the needs-you reason', () => {
        const list = [
            conv({ id: 'wa', channel: 'whatsapp', address: '+447700900001', updatedAt: NOW - DAY, lastCustomerMessageAt: NOW - DAY, lastOutboundAt: 0 }),
            conv({ id: 'mail', updatedAt: NOW - DAY, lastCustomerMessageAt: NOW - DAY, lastOutboundAt: 0 }),
        ];
        const ids = sectionIds(list);
        expect(ids.whatsapp).toEqual(['wa']);
        expect(ids.needsYou).toEqual(['mail']);
        const s = sectionGroups(groupConversations(list, 'co-a'), NOW);
        expect(needsReasonOf(s.whatsapp[0], NOW)).toBe('waiting');
    });

    it('orders the WhatsApp section by WhatsApp activity, newest first', () => {
        const ids = sectionIds([
            // Recently touched, but the last WhatsApp word was three days ago.
            conv({ id: 'older', channel: 'whatsapp', address: '+447700900001', updatedAt: NOW - 3 * DAY, lastCustomerMessageAt: NOW - 3 * DAY, lastOutboundAt: NOW - 3 * DAY }),
            conv({ id: 'mid', channel: 'whatsapp', address: '+447700900002', updatedAt: NOW - 2 * DAY, lastCustomerMessageAt: NOW - 2 * DAY, lastOutboundAt: NOW - 2 * DAY }),
            conv({ id: 'newest', channel: 'whatsapp', address: '+447700900003', updatedAt: NOW - 5 * DAY, lastCustomerMessageAt: NOW - 60_000, lastOutboundAt: NOW - 5 * DAY }),
        ]);
        expect(ids.whatsapp).toEqual(['newest', 'mid', 'older']);
    });

    it('folds a WhatsApp customer quiet for 15 days into Earlier', () => {
        const ids = sectionIds([
            conv({ id: 'stale-wa', channel: 'whatsapp', address: '+447700900001', updatedAt: NOW - 15 * DAY }),
        ]);
        expect(ids.whatsapp).toEqual([]);
        expect(ids.earlier).toEqual(['stale-wa']);
    });

    it('gives the old sections when whatsappFirst is off', () => {
        const list = [
            conv({ id: 'wa-waiting', channel: 'whatsapp', address: '+447700900001', updatedAt: NOW - DAY, lastCustomerMessageAt: NOW - DAY, lastOutboundAt: 0 }),
            conv({ id: 'wa-quiet', channel: 'whatsapp', address: '+447700900002', updatedAt: NOW - 2 * DAY }),
        ];
        const ids = sectionIds(list, { whatsappFirst: false });
        expect(ids.whatsapp).toEqual([]);
        expect(ids.needsYou).toEqual(['wa-waiting']);
        expect(ids.recent).toEqual(['wa-quiet']);
    });

    it('leaves email-only customers where they were', () => {
        const list = [
            conv({ id: 'e-wait', updatedAt: NOW - DAY, lastCustomerMessageAt: NOW - DAY, lastOutboundAt: 0 }),
            conv({ id: 'e-recent', updatedAt: NOW - 2 * DAY }),
            conv({ id: 'e-old', updatedAt: NOW - 20 * DAY }),
        ];
        const on = sectionIds(list);
        const off = sectionIds(list, { whatsappFirst: false });
        expect(on).toEqual(off);
        expect(on).toEqual({ whatsapp: [], needsYou: ['e-wait'], recent: ['e-recent'], earlier: ['e-old'] });
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
