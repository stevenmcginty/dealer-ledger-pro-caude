import { describe, expect, it } from 'vitest';
import type { Conversation } from '../services/salesAgentService';
import {
    conversationKeys,
    groupConversations,
    groupHasChannel,
    phoneKey,
} from '../utils/agentInboxGroups';

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
});
