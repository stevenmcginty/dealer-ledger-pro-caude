/**
 *   cd functions && npx tsc && node --test lib/salesAgent/sendTargets.test.js
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { contactEmail, contactPhone, resolveSendTargets, resolveSendVia } from './sendTargets';
import type { Conversation } from './types';

const conv = (over: Partial<Conversation>): Conversation => ({
    id: 'c1',
    shortId: 20,
    companyId: 'co',
    channel: 'email',
    address: 'jackandtash@hotmail.com',
    originChannel: 'email',
    contact: { firstName: 'Natasha', lastName: 'White-foy', email: 'jackandtash@hotmail.com', phone: '+447826555653' },
    mode: 'agent',
    stage: 'booked',
    escalated: false,
    priceRequests: 0,
    lastInboundAt: 1,
    lastCustomerMessageAt: 0,
    createdAt: 1,
    updatedAt: 1,
    unread: 0,
    ...over,
});

describe('contact details', () => {
    it('reads the mobile and the email off the thread', () => {
        const c = conv({});
        assert.equal(contactPhone(c), '+447826555653');
        assert.equal(contactEmail(c), 'jackandtash@hotmail.com');
    });
});

describe('resolveSendVia', () => {
    it('stays on email until Steve ticks WhatsApp as well', () => {
        assert.equal(resolveSendVia(conv({}), 'auto'), 'email');
        assert.equal(resolveSendVia(conv({}), 'both'), 'both');
    });

    it('falls back to WhatsApp when the email has bounced', () => {
        assert.equal(resolveSendVia(conv({
            emailBounce: { address: 'jackandtash@hotmail.com', reason: 'undeliverable', at: 1 },
        }), 'auto'), 'whatsapp');
        assert.equal(resolveSendVia(conv({
            emailBounce: { address: 'jackandtash@hotmail.com', reason: 'undeliverable', at: 1 },
        }), 'both'), 'whatsapp');
        assert.equal(resolveSendVia(conv({
            emailBounce: { address: 'jackandtash@hotmail.com', reason: 'undeliverable', at: 1 },
        }), 'email'), 'whatsapp');
    });

    it('stays on email when there is no phone', () => {
        assert.equal(resolveSendVia(conv({ contact: { email: 'a@b.com' }, address: 'a@b.com' }), 'auto'), 'email');
    });
});

describe('resolveSendTargets', () => {
    it('sends email only until both is asked for', () => {
        assert.deepEqual(resolveSendTargets(conv({}), 'auto').map(t => t.channel), ['email']);
        const both = resolveSendTargets(conv({}), 'both');
        assert.deepEqual(both.map(t => t.channel), ['email', 'whatsapp']);
        assert.equal(both[1].to, '+447826555653');
        assert.equal(both[1].templateOnly, true);
    });

    it('drops the bounced address and keeps WhatsApp', () => {
        const targets = resolveSendTargets(conv({
            emailBounce: { address: 'jackandtash@hotmail.com', reason: 'address not found, or unable to receive mail', at: 1 },
        }), 'both');
        assert.equal(targets.length, 1);
        assert.equal(targets[0].channel, 'whatsapp');
        assert.equal(targets[0].to, '+447826555653');
    });

    it('sends free text on WhatsApp inside the 24h window', () => {
        const targets = resolveSendTargets(conv({ lastCustomerMessageAt: Date.now() - 60_000 }), 'whatsapp');
        assert.equal(targets[0].templateOnly, false);
    });
});
