"use strict";
/**
 *   cd functions && npx tsc && node --test lib/salesAgent/channels/whatsappInbound.test.js
 */
Object.defineProperty(exports, "__esModule", { value: true });
const node_assert_1 = require("node:assert");
const node_test_1 = require("node:test");
const whatsappInbound_1 = require("./whatsappInbound");
(0, node_test_1.describe)('whatsappInboundText', () => {
    (0, node_test_1.it)('returns the body of a text message', () => {
        node_assert_1.strict.equal((0, whatsappInbound_1.whatsappInboundText)({ type: 'text', text: { body: 'ETA 7 mins' } }), 'ETA 7 mins');
    });
    (0, node_test_1.it)('returns the actual emoji on a reaction, not [reaction]', () => {
        node_assert_1.strict.equal((0, whatsappInbound_1.whatsappInboundText)({
            type: 'reaction',
            reaction: { message_id: 'wamid.x', emoji: '👍' },
        }), '👍');
    });
    (0, node_test_1.it)('returns empty when the reaction was removed', () => {
        node_assert_1.strict.equal((0, whatsappInbound_1.whatsappInboundText)({
            type: 'reaction',
            reaction: { message_id: 'wamid.x' },
        }), '');
    });
    (0, node_test_1.it)('keeps a caption on a photo and falls back to [photo]', () => {
        node_assert_1.strict.equal((0, whatsappInbound_1.whatsappInboundText)({ type: 'image', image: { caption: 'the dent' } }), 'the dent');
        node_assert_1.strict.equal((0, whatsappInbound_1.whatsappInboundText)({ type: 'image', image: {} }), '[photo]');
    });
    (0, node_test_1.it)('still placeholders unknown types', () => {
        node_assert_1.strict.equal((0, whatsappInbound_1.whatsappInboundText)({ type: 'order' }), '[order]');
    });
});
//# sourceMappingURL=whatsappInbound.test.js.map