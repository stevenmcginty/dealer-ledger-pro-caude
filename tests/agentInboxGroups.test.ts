import { describe, expect, it } from 'vitest';
import type { Conversation } from '../services/salesAgentService';
import {
    conversationKeys,
    conversationsForFilter,
    conversationForChannel,
    defaultThreadChannel,
    groupConversations,
    groupHasChannel,
    keepMessageOnChannel,
    partitionSharedGroups,
    phoneKey,
    threadChannelsOf,
} from '../utils/agentInboxGroups';
import { displayUkPhone, phoneFromThread, threadLooksBounced } from '../utils/agentInboxBounce';

const conv = (over: Partial<Conversation>): Conversation => ({
    id: over.id || 'c1',
    shortId: over.shortId || 1,
    companyId: over.companyId || 'co-a',
    channel: over.channel || 'whatsapp',
    address: over.address || '+447700900000',
    originChannel: over.originChannel || over.channel || 'whatsapp',
    contact: over.contact || {},
    mode: 'agent',
    stage: 'vehicle',
    escalated: false,
    priceRequests: 0,
    lastInboundAt: 1,
    lastCustomerMessageAt: 1,
    createdAt: 1,
    updatedAt: over.updatedAt || 1,
    unread: over.unread || 0,
    ...over,
});

describe('phoneKey', () => {
    it('treats +44 and 0 as the same last-10 digits', () => {
        expect(phoneKey('+447700900123')).toBe(phoneKey('07700900123'));
    });
});

describe('groupConversations', () => {
    it('keeps strangers on their own rows', () => {
        const groups = groupConversations([
            conv({ id: 'a', address: '+447700900001', contact: { phone: '+447700900001' } }),
            conv({ id: 'b', address: '+447700900002', contact: { phone: '+447700900002' } }),
        ]);
        expect(groups).toHaveLength(2);
    });

    it('groups a WhatsApp and an email that share a phone', () => {
        const groups = groupConversations([
            conv({
                id: 'wa',
                channel: 'whatsapp',
                address: '+447700900111',
                contact: { firstName: 'Barry', phone: '+447700900111' },
                updatedAt: 20,
            }),
            conv({
                id: 'em',
                channel: 'email',
                address: 'barry@example.com',
                contact: { firstName: 'Barry', phone: '+447700900111', email: 'barry@example.com' },
                updatedAt: 10,
            }),
        ]);
        expect(groups).toHaveLength(1);
        expect(groups[0].conversations.map(c => c.id).sort()).toEqual(['em', 'wa']);
        expect(groups[0].channels).toEqual(['whatsapp', 'email']);
        expect(groups[0].name).toBe('Barry');
    });

    it('groups through a shared CRM lead when phone and email sit on different threads', () => {
        const groups = groupConversations([
            conv({
                id: 'wa',
                channel: 'whatsapp',
                address: '+447700900222',
                contact: { leadId: 'lead-9', phone: '+447700900222' },
            }),
            conv({
                id: 'em',
                channel: 'email',
                address: 'pat@example.com',
                contact: { leadId: 'lead-9', email: 'pat@example.com' },
            }),
        ]);
        expect(groups).toHaveLength(1);
        expect(conversationKeys(groups[0].conversations[0]).some(k => k.startsWith('l:'))).toBe(true);
    });

    it('marks a group shared when a thread lives on another ledger', () => {
        const groups = groupConversations([
            conv({ id: 'mine', companyId: 'co-a', contact: { phone: '+447700900333' } }),
            conv({ id: 'theirs', companyId: 'co-b', contact: { phone: '+447700900333' } }),
        ], 'co-a');
        expect(groups).toHaveLength(1);
        expect(groups[0].shared).toBe(true);
    });

    it('filters WhatsApp groups without dropping mixed customers', () => {
        const groups = groupConversations([
            conv({
                id: 'wa',
                channel: 'whatsapp',
                address: '+447700900444',
                contact: { phone: '+447700900444', email: 'a@b.c' },
            }),
            conv({
                id: 'em',
                channel: 'email',
                originChannel: 'email',
                address: 'a@b.c',
                contact: { email: 'a@b.c', phone: '+447700900444' },
            }),
            conv({
                id: 'mail-only',
                channel: 'email',
                originChannel: 'email',
                address: 'only@b.c',
                contact: { email: 'only@b.c' },
            }),
        ]);
        expect(groups.filter(g => groupHasChannel(g, 'whatsapp'))).toHaveLength(1);
        expect(groups.filter(g => groupHasChannel(g, 'email'))).toHaveLength(2);
    });

    it('shows only that channel inside a mixed group', () => {
        const groups = groupConversations([
            conv({
                id: 'wa',
                channel: 'whatsapp',
                address: '+447700900555',
                contact: { phone: '+447700900555', email: 'mix@b.c' },
            }),
            conv({
                id: 'em',
                channel: 'email',
                originChannel: 'email',
                address: 'mix@b.c',
                contact: { email: 'mix@b.c', phone: '+447700900555' },
            }),
        ]);
        expect(conversationsForFilter(groups[0], 'whatsapp').map(c => c.id)).toEqual(['wa']);
        expect(conversationsForFilter(groups[0], 'email').map(c => c.id)).toEqual(['em']);
        expect(conversationsForFilter(groups[0], 'all')).toHaveLength(2);
    });

    it('opens a mixed person on the list filter, else the latest channel', () => {
        const groups = groupConversations([
            conv({
                id: 'wa',
                channel: 'whatsapp',
                address: '+447700900555',
                contact: { phone: '+447700900555', email: 'mix@b.c' },
                updatedAt: 20,
            }),
            conv({
                id: 'em',
                channel: 'email',
                originChannel: 'email',
                address: 'mix@b.c',
                contact: { email: 'mix@b.c', phone: '+447700900555' },
                updatedAt: 10,
            }),
        ]);
        expect(threadChannelsOf(groups[0])).toEqual(['whatsapp', 'email']);
        expect(defaultThreadChannel(groups[0], 'all')).toBe('whatsapp');
        expect(defaultThreadChannel(groups[0], 'email')).toBe('email');
        expect(conversationForChannel(groups[0], 'email').id).toBe('em');
    });

    it('keeps email bodies off the WhatsApp pane even on one conversation', () => {
        const wa = conv({ id: 'wa', channel: 'whatsapp' });
        expect(keepMessageOnChannel({ channel: 'email' }, wa, 'whatsapp')).toBe(false);
        expect(keepMessageOnChannel({ channel: 'whatsapp' }, wa, 'whatsapp')).toBe(true);
        expect(keepMessageOnChannel({}, wa, 'whatsapp')).toBe(true);
    });
});

describe('partitionSharedGroups', () => {
    it('splits other-ledger groups out so the list can hide them by default', () => {
        const groups = groupConversations([
            conv({ id: 'mine', companyId: 'co-a', address: '+447700900666', contact: { phone: '+447700900666' } }),
            conv({ id: 'theirs', companyId: 'co-b', address: '+447700900777', contact: { phone: '+447700900777' } }),
        ], 'co-a');
        const { mine, other } = partitionSharedGroups(groups);
        expect(mine.map(g => g.latest.id)).toEqual(['mine']);
        expect(other.map(g => g.latest.id)).toEqual(['theirs']);
    });

    it('puts a mixed group on the other side so it is hidden with the toggle, never double-listed', () => {
        const groups = groupConversations([
            conv({ id: 'mine', companyId: 'co-a', address: '+447700900888', contact: { phone: '+447700900888' } }),
            conv({ id: 'theirs', companyId: 'co-b', address: '+447700900888', contact: { phone: '+447700900888' } }),
        ], 'co-a');
        expect(groups).toHaveLength(1);
        const { mine, other } = partitionSharedGroups(groups);
        expect(mine).toHaveLength(0);
        expect(other).toHaveLength(1);
    });

    it('hides nothing when there is no viewer company (everything counts as mine)', () => {
        const groups = groupConversations([
            conv({ id: 'a', companyId: 'co-b', address: '+447700900999', contact: { phone: '+447700900999' } }),
        ]);
        const { mine, other } = partitionSharedGroups(groups);
        expect(mine).toHaveLength(1);
        expect(other).toHaveLength(0);
    });
});

describe('threadLooksBounced', () => {
    it('reads the stored bounce and the Gmail failure subject', () => {
        expect(threadLooksBounced(conv({
            emailBounce: { address: 'jackandtash@hotmail.com', reason: 'undeliverable', at: 1 },
        }))).toBe(true);
        expect(threadLooksBounced(conv({
            emailSubject: 'Delivery Status Notification (Failure)',
        }))).toBe(true);
        expect(threadLooksBounced(conv({
            pendingQuestion: {
                id: 'q',
                question: 'Email to Natasha White-foy bounced. Please call her on +447826555653.',
                askedAt: 1,
                context: 'Customer email jackandtash@hotmail.com is undeliverable.',
            },
        }))).toBe(true);
        expect(threadLooksBounced(conv({}))).toBe(false);
    });

    it('formats a UK mobile the way the desk reads it', () => {
        expect(displayUkPhone('+447826555653')).toBe('07826 555 653');
    });

    it('pulls the mobile out of Dave asking you to call them', () => {
        expect(phoneFromThread(conv({
            channel: 'email',
            address: 'jackandtash@hotmail.com',
            contact: { email: 'jackandtash@hotmail.com' },
            pendingQuestion: {
                id: 'q',
                question: 'Email to Natasha White-foy bounced. Please call her on +447826555653 to confirm the Mini.',
                askedAt: 1,
            },
        }))).toBe('+447826555653');
    });
});
