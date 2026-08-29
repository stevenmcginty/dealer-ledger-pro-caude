/**
 *   cd functions && npx tsc && node --test lib/salesAgent/channels/whatsappInbound.test.js
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { whatsappInboundText } from './whatsappInbound';

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
});
