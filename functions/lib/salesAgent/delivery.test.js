"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Delivery receipts: a state only ever moves forward.
 *
 *   cd functions && npx tsc && node --test lib/salesAgent/delivery.test.js
 */
const node_assert_1 = require("node:assert");
const node_test_1 = require("node:test");
const types_1 = require("./types");
const gmail_1 = require("./channels/gmail");
/** Mirrors the guard in recordDelivery. */
const advances = (current, next) => !current || types_1.DELIVERY_RANK[next] > types_1.DELIVERY_RANK[current];
(0, node_test_1.describe)('delivery state ordering', () => {
    (0, node_test_1.it)('accepts the first receipt whatever it is', () => {
        node_assert_1.strict.equal(advances(null, 'delivered'), true);
    });
    (0, node_test_1.it)('moves sent -> delivered -> read', () => {
        node_assert_1.strict.equal(advances('sent', 'delivered'), true);
        node_assert_1.strict.equal(advances('delivered', 'read'), true);
    });
    (0, node_test_1.it)('ignores a receipt that arrives late and out of order', () => {
        node_assert_1.strict.equal(advances('read', 'delivered'), false);
        node_assert_1.strict.equal(advances('delivered', 'sent'), false);
        node_assert_1.strict.equal(advances('read', 'sent'), false);
    });
    (0, node_test_1.it)('does not re-apply the same state', () => {
        node_assert_1.strict.equal(advances('delivered', 'delivered'), false);
    });
    (0, node_test_1.it)('lets a failure land on top of anything earlier', () => {
        node_assert_1.strict.equal(advances('sent', 'failed'), true);
        node_assert_1.strict.equal(advances('read', 'failed'), true);
    });
});
/** Shared mailbox: each dealer's label keeps its own colour, from Gmail's palette. */
(0, node_test_1.describe)('ledgerColour', () => {
    const PALETTE = ['#4a86e8', '#a479e2', '#f691b3', '#ffad47', '#fad165', '#fb4c2f'];
    (0, node_test_1.it)('always picks a colour Gmail will accept', () => {
        for (const name of ['Lead: Steve', 'Lead: Chris', 'Lead: other ledger', '']) {
            node_assert_1.strict.ok(PALETTE.includes((0, gmail_1.ledgerColour)(name)), `${name} -> ${(0, gmail_1.ledgerColour)(name)}`);
        }
    });
    (0, node_test_1.it)('gives the same dealer the same colour every time', () => {
        node_assert_1.strict.equal((0, gmail_1.ledgerColour)('Lead: Steve'), (0, gmail_1.ledgerColour)('Lead: Steve'));
    });
    (0, node_test_1.it)('does not put the two current dealers on the same colour', () => {
        node_assert_1.strict.notEqual((0, gmail_1.ledgerColour)('Lead: Steve'), (0, gmail_1.ledgerColour)('Lead: Chris'));
    });
});
//# sourceMappingURL=delivery.test.js.map