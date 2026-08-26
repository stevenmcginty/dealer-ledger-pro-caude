/**
 * Outbound WhatsApp from a ledger, before Meta is live.
 *
 *   cd functions && npx tsc && node --test lib/salesAgent/startWhatsApp.test.js
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { decideOutboundHome, parseOutboundPhone } from './startWhatsApp';

describe('parseOutboundPhone', () => {
    it('accepts a UK mobile with spaces', () => {
        assert.equal(parseOutboundPhone('07712 000229'), '+447712000229');
    });

    it('accepts a number already in E.164', () => {
        assert.equal(parseOutboundPhone('+447712000229'), '+447712000229');
    });

    it('rejects empty and junk', () => {
        assert.equal(parseOutboundPhone(''), null);
        assert.equal(parseOutboundPhone('0'), null);
        assert.equal(parseOutboundPhone('not a number'), null);
        assert.equal(parseOutboundPhone('123'), null);
    });
});

describe('decideOutboundHome', () => {
    it('creates a new thread when nobody has spoken to this number', () => {
        assert.deepEqual(decideOutboundHome('steve', null), { action: 'create' });
    });

    it('reopens the thread on this ledger', () => {
        assert.deepEqual(
            decideOutboundHome('steve', { companyId: 'steve', convId: 'c1' }),
            { action: 'reuse', convId: 'c1' }
        );
    });

    it('refuses to open a second thread when the other ledger already has this number', () => {
        assert.deepEqual(
            decideOutboundHome('chris', { companyId: 'steve', convId: 'c1' }),
            { action: 'other_ledger' }
        );
    });
});
