import { describe, expect, it } from 'vitest';
import type { Conversation } from '../services/salesAgentService';
import { groupConversations } from '../utils/agentInboxGroups';
import {
    lockAxis,
    pastThreshold,
    releaseOutcome,
    releaseVelocity,
    swipeDeletableConversations,
} from '../utils/swipeToDelete';

describe('lockAxis', () => {
    it('waits until the finger has moved 10px', () => {
        expect(lockAxis(0, 0)).toBeNull();
        expect(lockAxis(9, 0)).toBeNull();
        expect(lockAxis(-9, 5)).toBeNull();
        expect(lockAxis(3, 9)).toBeNull();
    });

    it('locks sideways when horizontal clearly beats vertical, either way', () => {
        expect(lockAxis(10, 0)).toBe('x');
        expect(lockAxis(-10, 0)).toBe('x');
        expect(lockAxis(13, 10)).toBe('x');
        expect(lockAxis(-25, -20)).toBe('x');
    });

    it('treats vertical or diagonal movement as a scroll', () => {
        expect(lockAxis(0, 10)).toBe('y');
        expect(lockAxis(0, -10)).toBe('y');
        expect(lockAxis(12, 10)).toBe('y'); // 12 is not more than 10 × 1.2
        expect(lockAxis(-15, 15)).toBe('y');
    });

    it('does not lock sideways on a near-diagonal below 10px vertical', () => {
        expect(lockAxis(10, 9)).toBeNull();
    });
});

describe('pastThreshold', () => {
    it('is 40% of the row width', () => {
        expect(pastThreshold(155, 390)).toBe(false);
        expect(pastThreshold(156, 390)).toBe(true);
        expect(pastThreshold(-156, 390)).toBe(true);
    });

    it('never fires on a row with no width', () => {
        expect(pastThreshold(50, 0)).toBe(false);
    });
});

describe('releaseOutcome', () => {
    const width = 390;

    it('deletes past 40% of the width in either direction, even when slow', () => {
        expect(releaseOutcome({ dx: 160, width, velocity: 0 })).toBe('delete-right');
        expect(releaseOutcome({ dx: -160, width, velocity: 0 })).toBe('delete-left');
    });

    it('springs back below the threshold without a flick', () => {
        expect(releaseOutcome({ dx: 150, width, velocity: 0.2 })).toBe('cancel');
        expect(releaseOutcome({ dx: -150, width, velocity: -0.2 })).toBe('cancel');
        expect(releaseOutcome({ dx: 0, width, velocity: 0 })).toBe('cancel');
    });

    it('deletes on a fast flick past 64px in the same direction', () => {
        expect(releaseOutcome({ dx: 64, width, velocity: 0.5 })).toBe('delete-right');
        expect(releaseOutcome({ dx: -80, width, velocity: -1.2 })).toBe('delete-left');
    });

    it('a flick that is too short or too slow springs back', () => {
        expect(releaseOutcome({ dx: 63, width, velocity: 2 })).toBe('cancel');
        expect(releaseOutcome({ dx: 100, width, velocity: 0.49 })).toBe('cancel');
    });

    it('a flick back the other way cancels', () => {
        expect(releaseOutcome({ dx: 100, width, velocity: -1 })).toBe('cancel');
        expect(releaseOutcome({ dx: -100, width, velocity: 1 })).toBe('cancel');
    });
});

describe('releaseVelocity', () => {
    it('is zero with fewer than two samples', () => {
        expect(releaseVelocity([])).toBe(0);
        expect(releaseVelocity([{ x: 10, t: 0 }])).toBe(0);
    });

    it('measures only the last 100ms of the drag, signed', () => {
        const samples = [
            { x: 0, t: 0 },
            { x: 5, t: 200 },
            { x: 10, t: 300 },
            { x: 110, t: 400 },
        ];
        expect(releaseVelocity(samples)).toBe(1);
        expect(releaseVelocity(samples.map(s => ({ ...s, x: -s.x })))).toBe(-1);
    });
});

describe('swipeDeletableConversations', () => {
    const NOW = 1_800_000_000_000;
    const conv = (over: Partial<Conversation>): Conversation => ({
        id: 'c1',
        shortId: 1,
        companyId: 'co-a',
        channel: 'email',
        address: 'pat@example.com',
        originChannel: over.channel || 'email',
        contact: { leadId: 'lead-pat' },
        mode: 'agent',
        stage: 'vehicle',
        escalated: false,
        priceRequests: 0,
        lastInboundAt: 1,
        lastCustomerMessageAt: NOW - 60_000,
        lastOutboundAt: NOW,
        createdAt: 1,
        updatedAt: NOW,
        unread: 0,
        ...over,
    });
    const groupOf = (list: Conversation[]) => {
        const groups = groupConversations(list, 'co-a');
        expect(groups).toHaveLength(1);
        return groups[0];
    };
    const ids = (list: Conversation[]) => list.map(c => c.id).sort();

    const email = conv({ id: 'em1' });
    const email2 = conv({ id: 'em2', updatedAt: NOW - 1000 });
    const whatsapp = conv({ id: 'wa1', channel: 'whatsapp', address: '+447700900111' });

    it('an email-only customer: every email thread', () => {
        expect(ids(swipeDeletableConversations(groupOf([email, email2]), 'all'))).toEqual(['em1', 'em2']);
        expect(ids(swipeDeletableConversations(groupOf([email, email2]), 'email'))).toEqual(['em1', 'em2']);
    });

    it('a customer on both, All tab: only the email thread', () => {
        expect(ids(swipeDeletableConversations(groupOf([email, whatsapp]), 'all'))).toEqual(['em1']);
    });

    it('a WhatsApp-only customer: nothing', () => {
        expect(swipeDeletableConversations(groupOf([whatsapp]), 'all')).toEqual([]);
        expect(swipeDeletableConversations(groupOf([whatsapp]), 'whatsapp')).toEqual([]);
    });

    it('the WhatsApp tab on a customer on both: nothing', () => {
        expect(swipeDeletableConversations(groupOf([email, whatsapp]), 'whatsapp')).toEqual([]);
    });

    it('an email thread that has carried WhatsApp is kept', () => {
        const opened = conv({ id: 'em3', whatsappOpenerAt: NOW - 5000 });
        const fromWhatsApp = conv({ id: 'em4', originChannel: 'whatsapp' });
        expect(swipeDeletableConversations(groupOf([opened]), 'all')).toEqual([]);
        expect(swipeDeletableConversations(groupOf([fromWhatsApp]), 'email')).toEqual([]);
        expect(ids(swipeDeletableConversations(groupOf([email, opened]), 'all'))).toEqual(['em1']);
    });
});
