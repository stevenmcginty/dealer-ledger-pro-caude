import { describe, expect, it } from 'vitest';

import { planEmailPrune, PrunableConversation } from '../functions/src/salesAgent/emailPrune';
import { messageChannelOf } from '../utils/agentInboxGroups';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 11, 3, 30);
const ago = (days: number) => NOW - days * DAY;

type Msg = { channel?: 'email' | 'whatsapp' | 'sms'; createdAt: number };

const conv = (
    id: string,
    channel: 'email' | 'whatsapp' | undefined,
    messages: Record<string, Msg>,
    over: Partial<PrunableConversation> = {}
): PrunableConversation => {
    const times = Object.values(messages).map(m => m.createdAt);
    const last = times.length ? Math.max(...times) : 0;
    return {
        id,
        channel,
        createdAt: times.length ? Math.min(...times) : 0,
        updatedAt: last,
        lastInboundAt: last,
        messages: Object.fromEntries(
            Object.entries(messages).map(([mid, m]) => [mid, { id: mid, direction: 'in', text: 'hi', from: 'customer', ...m }])
        ),
        ...over,
    } as PrunableConversation;
};

const deletedIds = (list: PrunableConversation[]) => planEmailPrune(list, NOW).deleteWhole.map(c => c.id);
const trims = (list: PrunableConversation[]) =>
    planEmailPrune(list, NOW).trim.map(t => ({ id: t.conversation.id, messageIds: [...t.messageIds].sort() }));

describe('planEmailPrune', () => {
    it('deletes a quiet email-only thread whole', () => {
        const c = conv('c1', 'email', { m1: { channel: 'email', createdAt: ago(40) }, m2: { channel: 'email', createdAt: ago(35) } });
        expect(deletedIds([c])).toEqual(['c1']);
        expect(trims([c])).toEqual([]);
    });

    it('removes only the email messages from a quiet mixed thread', () => {
        const c = conv('c1', 'email', {
            m1: { channel: 'email', createdAt: ago(50) },
            m2: { channel: 'whatsapp', createdAt: ago(45) },
            m3: { channel: 'email', createdAt: ago(40) },
        });
        expect(deletedIds([c])).toEqual([]);
        expect(trims([c])).toEqual([{ id: 'c1', messageIds: ['m1', 'm3'] }]);
    });

    it('leaves a thread alone when any message, on any channel, is inside 30 days', () => {
        const email = conv('c1', 'email', { m1: { channel: 'email', createdAt: ago(60) }, m2: { channel: 'whatsapp', createdAt: ago(3) } }, { updatedAt: ago(60) });
        const wa = conv('c2', 'whatsapp', { m1: { channel: 'email', createdAt: ago(60) }, m2: { channel: 'email', createdAt: ago(29) } }, { updatedAt: ago(60) });
        expect(planEmailPrune([email, wa], NOW)).toEqual({ deleteWhole: [], trim: [] });
    });

    it('leaves a thread alone when updatedAt is recent, even with only old messages', () => {
        const c = conv('c1', 'email', { m1: { channel: 'email', createdAt: ago(90) } }, { updatedAt: ago(2) });
        expect(planEmailPrune([c], NOW)).toEqual({ deleteWhole: [], trim: [] });
    });

    it('resolves a message with no channel the same way as messageChannelOf', () => {
        const emailConv = conv('c1', 'email', { m1: { createdAt: ago(40) } });
        const waConv = conv('c2', 'whatsapp', { m1: { createdAt: ago(40) }, m2: { channel: 'email', createdAt: ago(41) } });
        expect(messageChannelOf({}, { channel: 'email' })).toBe('email');
        expect(messageChannelOf({}, { channel: 'whatsapp' })).toBe('whatsapp');
        expect(deletedIds([emailConv, waConv])).toEqual(['c1']);
        expect(trims([emailConv, waConv])).toEqual([{ id: 'c2', messageIds: ['m2'] }]);
    });

    it('never touches a quiet WhatsApp-only thread', () => {
        const c = conv('c1', 'whatsapp', { m1: { channel: 'whatsapp', createdAt: ago(200) }, m2: { createdAt: ago(190) } });
        expect(planEmailPrune([c], NOW)).toEqual({ deleteWhole: [], trim: [] });
    });

    it('still prunes a quiet thread that is flagged for Steve', () => {
        const old = { m1: { channel: 'email' as const, createdAt: ago(45) } };
        const escalated = conv('c1', 'email', old, { escalated: true, mode: 'human' } as Partial<PrunableConversation>);
        const drafted = conv('c2', 'email', old, {
            pendingDraft: { id: 'd1', text: 'Hi', createdAt: ago(45), source: 'agent' },
        });
        const unread = conv('c3', 'email', old, { unread: 2, inboundCount: 3, mode: 'paused' } as Partial<PrunableConversation>);
        expect(deletedIds([escalated, drafted, unread])).toEqual(['c1', 'c2', 'c3']);
    });

    it('counts exactly 30 days as quiet, and a millisecond less as not', () => {
        const edge = conv('c1', 'email', { m1: { channel: 'email', createdAt: ago(30) } });
        const inside = conv('c2', 'email', { m1: { channel: 'email', createdAt: ago(30) + 1 } });
        expect(deletedIds([edge, inside])).toEqual(['c1']);
    });

    it('skips a stub with no dates and no channel', () => {
        const stub = { id: 's1', unread: 0 } as PrunableConversation;
        expect(planEmailPrune([stub], NOW)).toEqual({ deleteWhole: [], trim: [] });
    });

    it('honours a custom window', () => {
        const c = conv('c1', 'email', { m1: { channel: 'email', createdAt: ago(10) } });
        expect(planEmailPrune([c], NOW, 7).deleteWhole.map(x => x.id)).toEqual(['c1']);
        expect(planEmailPrune([c], NOW, 14).deleteWhole).toEqual([]);
    });
});
