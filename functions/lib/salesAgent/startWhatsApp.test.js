"use strict";
/**
 * Outbound WhatsApp from a ledger, before Meta is live.
 *
 *   cd functions && npx tsc && node --test lib/salesAgent/startWhatsApp.test.js
 */
Object.defineProperty(exports, "__esModule", { value: true });
const node_assert_1 = require("node:assert");
const node_test_1 = require("node:test");
const startWhatsApp_1 = require("./startWhatsApp");
(0, node_test_1.describe)('parseOutboundPhone', () => {
    (0, node_test_1.it)('accepts a UK mobile with spaces', () => {
        node_assert_1.strict.equal((0, startWhatsApp_1.parseOutboundPhone)('07712 000229'), '+447712000229');
    });
    (0, node_test_1.it)('accepts a number already in E.164', () => {
        node_assert_1.strict.equal((0, startWhatsApp_1.parseOutboundPhone)('+447712000229'), '+447712000229');
    });
    (0, node_test_1.it)('rejects empty and junk', () => {
        node_assert_1.strict.equal((0, startWhatsApp_1.parseOutboundPhone)(''), null);
        node_assert_1.strict.equal((0, startWhatsApp_1.parseOutboundPhone)('0'), null);
        node_assert_1.strict.equal((0, startWhatsApp_1.parseOutboundPhone)('not a number'), null);
        node_assert_1.strict.equal((0, startWhatsApp_1.parseOutboundPhone)('123'), null);
    });
});
(0, node_test_1.describe)('decideOutboundHome', () => {
    (0, node_test_1.it)('creates a new thread when nobody has spoken to this number', () => {
        node_assert_1.strict.deepEqual((0, startWhatsApp_1.decideOutboundHome)('steve', null), { action: 'create' });
    });
    (0, node_test_1.it)('reopens the thread on this ledger', () => {
        node_assert_1.strict.deepEqual((0, startWhatsApp_1.decideOutboundHome)('steve', { companyId: 'steve', convId: 'c1' }), { action: 'reuse', convId: 'c1' });
    });
    (0, node_test_1.it)('refuses to open a second thread when the other ledger already has this number', () => {
        node_assert_1.strict.deepEqual((0, startWhatsApp_1.decideOutboundHome)('chris', { companyId: 'steve', convId: 'c1' }), { action: 'other_ledger' });
    });
});
//# sourceMappingURL=startWhatsApp.test.js.map