"use strict";
/**
 * Identity matching for inbound: which existing thread a message may attach to.
 *
 *   cd functions && npx tsc && node --test lib/salesAgent/identity.test.js
 */
Object.defineProperty(exports, "__esModule", { value: true });
const node_assert_1 = require("node:assert");
const node_test_1 = require("node:test");
const identity_1 = require("./identity");
(0, node_test_1.describe)('isUsableEmail', () => {
    (0, node_test_1.it)('accepts a personal address', () => {
        node_assert_1.strict.equal((0, identity_1.isUsableEmail)('tobias.knights@gmail.com'), true);
    });
    (0, node_test_1.it)('rejects Cazoo / CarGurus / website robots', () => {
        node_assert_1.strict.equal((0, identity_1.isUsableEmail)('dealerleads@info.cazoo.co.uk'), false);
        node_assert_1.strict.equal((0, identity_1.isUsableEmail)('dealer-leads@messages.cargurus.com'), false);
        node_assert_1.strict.equal((0, identity_1.isUsableEmail)('noreply@cardealer5.co.uk'), false);
    });
    (0, node_test_1.it)('rejects empty', () => {
        node_assert_1.strict.equal((0, identity_1.isUsableEmail)(''), false);
        node_assert_1.strict.equal((0, identity_1.isUsableEmail)(undefined), false);
    });
});
(0, node_test_1.describe)('lookupKeys', () => {
    (0, node_test_1.it)('for email inbound is only the customer email, never a phone in the body', () => {
        const keys = (0, identity_1.lookupKeys)('email', 'mx5.buyer@example.com', {
            email: 'mx5.buyer@example.com',
            phone: '+447700900111',
        });
        node_assert_1.strict.deepEqual(keys, [['email', 'mx5.buyer@example.com']]);
    });
    (0, node_test_1.it)('does not look up a Cazoo noreply, so two unparsed leads cannot collapse', () => {
        const keys = (0, identity_1.lookupKeys)('email', 'dealerleads@info.cazoo.co.uk', {
            phone: '+447700900111',
        });
        node_assert_1.strict.deepEqual(keys, []);
    });
    (0, node_test_1.it)('still finds a WhatsApp follow-up by phone', () => {
        const keys = (0, identity_1.lookupKeys)('whatsapp', '+447700900111', {
            email: 'tobias@example.com',
            phone: '+447700900111',
        });
        node_assert_1.strict.deepEqual(keys, [
            ['whatsapp', '+447700900111'],
            ['sms', '+447700900111'],
            ['email', 'tobias@example.com'],
        ]);
    });
});
(0, node_test_1.describe)('indexKeys', () => {
    (0, node_test_1.it)('still writes the mobile so a later WhatsApp can find the email thread', () => {
        const keys = (0, identity_1.indexKeys)('email', 'tobias@example.com', {
            email: 'tobias@example.com',
            phone: '+447700900111',
        });
        node_assert_1.strict.ok(keys.some(([ch, addr]) => ch === 'whatsapp' && addr === '+447700900111'));
        node_assert_1.strict.ok(keys.some(([ch, addr]) => ch === 'email' && addr === 'tobias@example.com'));
    });
    (0, node_test_1.it)('does not index a platform noreply', () => {
        const keys = (0, identity_1.indexKeys)('email', 'noreply@cardealer5.co.uk', {});
        node_assert_1.strict.deepEqual(keys, []);
    });
});
(0, node_test_1.describe)('isDifferentPerson', () => {
    (0, node_test_1.it)('treats two real emails as two people', () => {
        node_assert_1.strict.equal((0, identity_1.isDifferentPerson)('email', 'mx5.buyer@example.com', { email: 'mx5.buyer@example.com' }, { channel: 'email', address: 'tobias@example.com', contact: { email: 'tobias@example.com' } }), true);
    });
    (0, node_test_1.it)('treats the same email as the same person', () => {
        node_assert_1.strict.equal((0, identity_1.isDifferentPerson)('email', 'tobias@example.com', { email: 'tobias@example.com' }, { channel: 'email', address: 'tobias@example.com', contact: { email: 'tobias@example.com' } }), false);
    });
    (0, node_test_1.it)('does not call a WhatsApp-only thread a different person just because it has no email', () => {
        node_assert_1.strict.equal((0, identity_1.isDifferentPerson)('whatsapp', '+447700900111', { phone: '+447700900111' }, { channel: 'whatsapp', address: '+447700900111', contact: { phone: '+447700900111' } }), false);
    });
});
(0, node_test_1.describe)('email helpers', () => {
    (0, node_test_1.it)('reads the stored email off a thread', () => {
        node_assert_1.strict.equal((0, identity_1.existingEmailOf)({ channel: 'email', address: 'a@x.com', contact: { email: 'b@x.com' } }), 'b@x.com');
        node_assert_1.strict.equal((0, identity_1.existingEmailOf)({ channel: 'email', address: 'a@x.com', contact: {} }), 'a@x.com');
    });
    (0, node_test_1.it)('prefers the parsed lead email on inbound', () => {
        node_assert_1.strict.equal((0, identity_1.inboundEmailOf)('email', 'from@x.com', { email: 'lead@x.com' }), 'lead@x.com');
        node_assert_1.strict.equal((0, identity_1.emailsConflict)('a@x.com', 'b@x.com'), true);
        node_assert_1.strict.equal((0, identity_1.emailsConflict)('a@x.com', 'a@x.com'), false);
        node_assert_1.strict.equal((0, identity_1.emailsConflict)('a@x.com', ''), false);
    });
});
//# sourceMappingURL=identity.test.js.map