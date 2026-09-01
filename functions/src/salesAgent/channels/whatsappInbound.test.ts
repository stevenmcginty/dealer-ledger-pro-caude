/**
 *   cd functions && npx tsc && node --test lib/salesAgent/channels/whatsappInbound.test.js
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import {
    inboundMediaFileName,
    inboundMediaMime,
    inboundNeedsNoReply,
    isWhatsAppPlaceholderText,
    whatsappInboundText,
} from './whatsappInbound';

describe('whatsappInboundText', () => {
    it('returns the body of a text message', () => {
        assert.equal(whatsappInboundText({ type: 'text', text: { body: 'ETA 7 mins' } }), 'ETA 7 mins');
    });

    it('returns the actual emoji on a reaction, not [reaction]', () => {
        assert.equal(whatsappInboundText({
            type: 'reaction',
            reaction: { message_id: 'wamid.x', emoji: '👍' },
        }), '👍');
    });

    it('returns empty when the reaction was removed', () => {
        assert.equal(whatsappInboundText({
            type: 'reaction',
            reaction: { message_id: 'wamid.x' },
        }), '');
    });

    it('keeps a caption on a photo and falls back to [photo]', () => {
        assert.equal(whatsappInboundText({ type: 'image', image: { caption: 'the dent' } }), 'the dent');
        assert.equal(whatsappInboundText({ type: 'image', image: {} }), '[photo]');
    });

    it('still placeholders unknown types', () => {
        assert.equal(whatsappInboundText({ type: 'order' }), '[order]');
    });

    it('keeps [unsupported] so the inbox can show a notice, not Meta jargon as a chat line', () => {
        assert.equal(whatsappInboundText({ type: 'unsupported' }), '[unsupported]');
    });
});

describe('inboundNeedsNoReply', () => {
    it('skips Dave for a photo album wrapper and captionless media', () => {
        assert.equal(inboundNeedsNoReply({ type: 'unsupported' }), true);
        assert.equal(inboundNeedsNoReply({ type: 'image', image: {} }), true);
        assert.equal(inboundNeedsNoReply({ type: 'video', video: {} }), true);
        assert.equal(inboundNeedsNoReply({ type: 'sticker' }), true);
        assert.equal(inboundNeedsNoReply({ type: 'audio' }), true);
    });

    it('still lets Dave answer a caption that is a real message', () => {
        assert.equal(inboundNeedsNoReply({ type: 'image', image: { caption: 'Back wheel' } }), false);
        assert.equal(inboundNeedsNoReply({ type: 'text', text: { body: 'Left the key here' } }), false);
    });
});

describe('isWhatsAppPlaceholderText', () => {
    it('matches the stored placeholders, not a real caption', () => {
        assert.equal(isWhatsAppPlaceholderText('[unsupported]'), true);
        assert.equal(isWhatsAppPlaceholderText('[photo]'), true);
        assert.equal(isWhatsAppPlaceholderText('Back wheel'), false);
    });
});

describe('inboundMediaFileName', () => {
    it('does not use the wamid as the filename the inbox shows', () => {
        assert.equal(inboundMediaFileName('image', 'image/jpeg'), 'image.jpg');
        assert.equal(inboundMediaFileName('image', 'image/jpeg', 'image-wamid.HBgMxxxx'), 'image.jpg');
        assert.equal(inboundMediaFileName('document', 'application/pdf', 'V5C.pdf'), 'V5C.pdf');
    });
});

describe('inboundMediaMime', () => {
    it('normalises WhatsApp image types so the browser will paint the file', () => {
        assert.equal(inboundMediaMime('image', 'image/jpg'), 'image/jpeg');
        assert.equal(inboundMediaMime('image', ''), 'image/jpeg');
        assert.equal(inboundMediaMime('image', 'application/octet-stream'), 'image/jpeg');
        assert.equal(inboundMediaMime('video', 'video/mp4'), 'video/mp4');
    });
});
