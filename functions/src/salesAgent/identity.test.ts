/**
 * Identity matching for inbound: which existing thread a message may attach to.
 *
 *   cd functions && npx tsc && node --test lib/salesAgent/identity.test.js
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import {
    emailsConflict,
    existingEmailOf,
    inboundEmailOf,
    indexKeys,
    isDifferentPerson,
    isUsableEmail,
    lookupKeys,
} from './identity';

describe('isUsableEmail', () => {
    it('accepts a personal address', () => {
        assert.equal(isUsableEmail('tobias.knights@gmail.com'), true);
    });

    it('rejects Cazoo / CarGurus / website robots', () => {
        assert.equal(isUsableEmail('dealerleads@info.cazoo.co.uk'), false);
        assert.equal(isUsableEmail('dealer-leads@messages.cargurus.com'), false);
        assert.equal(isUsableEmail('noreply@cardealer5.co.uk'), false);
    });

    it('rejects empty', () => {
        assert.equal(isUsableEmail(''), false);
        assert.equal(isUsableEmail(undefined), false);
    });
});

describe('lookupKeys', () => {
    it('for email inbound is only the customer email, never a phone in the body', () => {
        const keys = lookupKeys('email', 'mx5.buyer@example.com', {
            email: 'mx5.buyer@example.com',
            phone: '+447700900111',
        });
        assert.deepEqual(keys, [['email', 'mx5.buyer@example.com']]);
    });

    it('does not look up a Cazoo noreply, so two unparsed leads cannot collapse', () => {
        const keys = lookupKeys('email', 'dealerleads@info.cazoo.co.uk', {
            phone: '+447700900111',
        });
        assert.deepEqual(keys, []);
    });

    it('still finds a WhatsApp follow-up by phone', () => {
        const keys = lookupKeys('whatsapp', '+447700900111', {
            email: 'tobias@example.com',
            phone: '+447700900111',
        });
        assert.deepEqual(keys, [
            ['whatsapp', '+447700900111'],
            ['sms', '+447700900111'],
            ['email', 'tobias@example.com'],
        ]);
    });
});

describe('indexKeys', () => {
    it('still writes the mobile so a later WhatsApp can find the email thread', () => {
        const keys = indexKeys('email', 'tobias@example.com', {
            email: 'tobias@example.com',
            phone: '+447700900111',
        });
        assert.ok(keys.some(([ch, addr]) => ch === 'whatsapp' && addr === '+447700900111'));
        assert.ok(keys.some(([ch, addr]) => ch === 'email' && addr === 'tobias@example.com'));
    });

    it('does not index a platform noreply', () => {
        const keys = indexKeys('email', 'noreply@cardealer5.co.uk', {});
        assert.deepEqual(keys, []);
    });
});

describe('isDifferentPerson', () => {
    it('treats two real emails as two people', () => {
        assert.equal(
            isDifferentPerson(
                'email',
                'mx5.buyer@example.com',
                { email: 'mx5.buyer@example.com' },
                { channel: 'email', address: 'tobias@example.com', contact: { email: 'tobias@example.com' } }
            ),
            true
        );
    });

    it('treats the same email as the same person', () => {
        assert.equal(
            isDifferentPerson(
                'email',
                'tobias@example.com',
                { email: 'tobias@example.com' },
                { channel: 'email', address: 'tobias@example.com', contact: { email: 'tobias@example.com' } }
            ),
            false
        );
    });

    it('does not call a WhatsApp-only thread a different person just because it has no email', () => {
        assert.equal(
            isDifferentPerson(
                'whatsapp',
                '+447700900111',
                { phone: '+447700900111' },
                { channel: 'whatsapp', address: '+447700900111', contact: { phone: '+447700900111' } }
            ),
            false
        );
    });
});

describe('email helpers', () => {
    it('reads the stored email off a thread', () => {
        assert.equal(
            existingEmailOf({ channel: 'email', address: 'a@x.com', contact: { email: 'b@x.com' } }),
            'b@x.com'
        );
        assert.equal(existingEmailOf({ channel: 'email', address: 'a@x.com', contact: {} }), 'a@x.com');
    });

    it('prefers the parsed lead email on inbound', () => {
        assert.equal(inboundEmailOf('email', 'from@x.com', { email: 'lead@x.com' }), 'lead@x.com');
        assert.equal(emailsConflict('a@x.com', 'b@x.com'), true);
        assert.equal(emailsConflict('a@x.com', 'a@x.com'), false);
        assert.equal(emailsConflict('a@x.com', ''), false);
    });
});
