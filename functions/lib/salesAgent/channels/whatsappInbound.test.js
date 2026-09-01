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
    (0, node_test_1.it)('keeps [unsupported] so the inbox can show a notice, not Meta jargon as a chat line', () => {
        node_assert_1.strict.equal((0, whatsappInbound_1.whatsappInboundText)({ type: 'unsupported' }), '[unsupported]');
    });
});
(0, node_test_1.describe)('inboundNeedsNoReply', () => {
    (0, node_test_1.it)('skips Dave for a photo album wrapper and captionless media', () => {
        node_assert_1.strict.equal((0, whatsappInbound_1.inboundNeedsNoReply)({ type: 'unsupported' }), true);
        node_assert_1.strict.equal((0, whatsappInbound_1.inboundNeedsNoReply)({ type: 'image', image: {} }), true);
        node_assert_1.strict.equal((0, whatsappInbound_1.inboundNeedsNoReply)({ type: 'video', video: {} }), true);
        node_assert_1.strict.equal((0, whatsappInbound_1.inboundNeedsNoReply)({ type: 'sticker' }), true);
        node_assert_1.strict.equal((0, whatsappInbound_1.inboundNeedsNoReply)({ type: 'audio' }), true);
    });
    (0, node_test_1.it)('still lets Dave answer a caption that is a real message', () => {
        node_assert_1.strict.equal((0, whatsappInbound_1.inboundNeedsNoReply)({ type: 'image', image: { caption: 'Back wheel' } }), false);
        node_assert_1.strict.equal((0, whatsappInbound_1.inboundNeedsNoReply)({ type: 'text', text: { body: 'Left the key here' } }), false);
    });
});
(0, node_test_1.describe)('isWhatsAppPlaceholderText', () => {
    (0, node_test_1.it)('matches the stored placeholders, not a real caption', () => {
        node_assert_1.strict.equal((0, whatsappInbound_1.isWhatsAppPlaceholderText)('[unsupported]'), true);
        node_assert_1.strict.equal((0, whatsappInbound_1.isWhatsAppPlaceholderText)('[photo]'), true);
        node_assert_1.strict.equal((0, whatsappInbound_1.isWhatsAppPlaceholderText)('Back wheel'), false);
    });
});
(0, node_test_1.describe)('inboundMediaFileName', () => {
    (0, node_test_1.it)('does not use the wamid as the filename the inbox shows', () => {
        node_assert_1.strict.equal((0, whatsappInbound_1.inboundMediaFileName)('image', 'image/jpeg'), 'image.jpg');
        node_assert_1.strict.equal((0, whatsappInbound_1.inboundMediaFileName)('image', 'image/jpeg', 'image-wamid.HBgMxxxx'), 'image.jpg');
        node_assert_1.strict.equal((0, whatsappInbound_1.inboundMediaFileName)('document', 'application/pdf', 'V5C.pdf'), 'V5C.pdf');
    });
});
(0, node_test_1.describe)('inboundMediaMime', () => {
    (0, node_test_1.it)('normalises WhatsApp image types so the browser will paint the file', () => {
        node_assert_1.strict.equal((0, whatsappInbound_1.inboundMediaMime)('image', 'image/jpg'), 'image/jpeg');
        node_assert_1.strict.equal((0, whatsappInbound_1.inboundMediaMime)('image', ''), 'image/jpeg');
        node_assert_1.strict.equal((0, whatsappInbound_1.inboundMediaMime)('image', 'application/octet-stream'), 'image/jpeg');
        node_assert_1.strict.equal((0, whatsappInbound_1.inboundMediaMime)('video', 'video/mp4'), 'video/mp4');
    });
});
//# sourceMappingURL=whatsappInbound.test.js.map