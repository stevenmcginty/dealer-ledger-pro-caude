"use strict";
/**
 *   cd functions && npx tsc && node --test lib/salesAgent/sendTargets.test.js
 */
Object.defineProperty(exports, "__esModule", { value: true });
const node_assert_1 = require("node:assert");
const node_test_1 = require("node:test");
const sendTargets_1 = require("./sendTargets");
const conv = (over) => ({
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
(0, node_test_1.describe)('contact details', () => {
    (0, node_test_1.it)('reads the mobile and the email off the thread', () => {
        const c = conv({});
        node_assert_1.strict.equal((0, sendTargets_1.contactPhone)(c), '+447826555653');
        node_assert_1.strict.equal((0, sendTargets_1.contactEmail)(c), 'jackandtash@hotmail.com');
    });
});
(0, node_test_1.describe)('resolveSendVia', () => {
    (0, node_test_1.it)('stays on email until Steve ticks WhatsApp as well', () => {
        node_assert_1.strict.equal((0, sendTargets_1.resolveSendVia)(conv({}), 'auto'), 'email');
        node_assert_1.strict.equal((0, sendTargets_1.resolveSendVia)(conv({}), 'both'), 'both');
    });
    (0, node_test_1.it)('falls back to WhatsApp when the email has bounced', () => {
        node_assert_1.strict.equal((0, sendTargets_1.resolveSendVia)(conv({
            emailBounce: { address: 'jackandtash@hotmail.com', reason: 'undeliverable', at: 1 },
        }), 'auto'), 'whatsapp');
        node_assert_1.strict.equal((0, sendTargets_1.resolveSendVia)(conv({
            emailBounce: { address: 'jackandtash@hotmail.com', reason: 'undeliverable', at: 1 },
        }), 'both'), 'whatsapp');
        node_assert_1.strict.equal((0, sendTargets_1.resolveSendVia)(conv({
            emailBounce: { address: 'jackandtash@hotmail.com', reason: 'undeliverable', at: 1 },
        }), 'email'), 'whatsapp');
    });
    (0, node_test_1.it)('stays on email when there is no phone', () => {
        node_assert_1.strict.equal((0, sendTargets_1.resolveSendVia)(conv({ contact: { email: 'a@b.com' }, address: 'a@b.com' }), 'auto'), 'email');
    });
});
(0, node_test_1.describe)('resolveSendTargets', () => {
    (0, node_test_1.it)('sends email only until both is asked for', () => {
        node_assert_1.strict.deepEqual((0, sendTargets_1.resolveSendTargets)(conv({}), 'auto').map(t => t.channel), ['email']);
        const both = (0, sendTargets_1.resolveSendTargets)(conv({}), 'both');
        node_assert_1.strict.deepEqual(both.map(t => t.channel), ['email', 'whatsapp']);
        node_assert_1.strict.equal(both[1].to, '+447826555653');
        node_assert_1.strict.equal(both[1].templateOnly, true);
    });
    (0, node_test_1.it)('drops the bounced address and keeps WhatsApp', () => {
        const targets = (0, sendTargets_1.resolveSendTargets)(conv({
            emailBounce: { address: 'jackandtash@hotmail.com', reason: 'address not found, or unable to receive mail', at: 1 },
        }), 'both');
        node_assert_1.strict.equal(targets.length, 1);
        node_assert_1.strict.equal(targets[0].channel, 'whatsapp');
        node_assert_1.strict.equal(targets[0].to, '+447826555653');
    });
    (0, node_test_1.it)('sends free text on WhatsApp inside the 24h window', () => {
        const targets = (0, sendTargets_1.resolveSendTargets)(conv({ lastCustomerMessageAt: Date.now() - 60000 }), 'whatsapp');
        node_assert_1.strict.equal(targets[0].templateOnly, false);
    });
});
//# sourceMappingURL=sendTargets.test.js.map