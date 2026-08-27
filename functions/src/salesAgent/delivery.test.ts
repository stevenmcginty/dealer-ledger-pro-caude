/**
 * Delivery receipts: a state only ever moves forward.
 *
 *   cd functions && npx tsc && node --test lib/salesAgent/delivery.test.js
 */
import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { DELIVERY_RANK, DeliveryState } from './types';
import { ledgerColour } from './channels/gmail';

/** Mirrors the guard in recordDelivery. */
const advances = (current: DeliveryState | null, next: DeliveryState): boolean =>
    !current || DELIVERY_RANK[next] > DELIVERY_RANK[current];

describe('delivery state ordering', () => {
    it('accepts the first receipt whatever it is', () => {
        assert.equal(advances(null, 'delivered'), true);
    });

    it('moves sent -> delivered -> read', () => {
        assert.equal(advances('sent', 'delivered'), true);
        assert.equal(advances('delivered', 'read'), true);
    });

    it('ignores a receipt that arrives late and out of order', () => {
        assert.equal(advances('read', 'delivered'), false);
        assert.equal(advances('delivered', 'sent'), false);
        assert.equal(advances('read', 'sent'), false);
    });

    it('does not re-apply the same state', () => {
        assert.equal(advances('delivered', 'delivered'), false);
    });

    it('lets a failure land on top of anything earlier', () => {
        assert.equal(advances('sent', 'failed'), true);
        assert.equal(advances('read', 'failed'), true);
    });
});

/** Shared mailbox: each dealer's label keeps its own colour, from Gmail's palette. */
describe('ledgerColour', () => {
    const PALETTE = ['#4a86e8', '#a479e2', '#f691b3', '#ffad47', '#fad165', '#fb4c2f'];

    it('always picks a colour Gmail will accept', () => {
        for (const name of ['Lead: Steve', 'Lead: Chris', 'Lead: other ledger', '']) {
            assert.ok(PALETTE.includes(ledgerColour(name)), `${name} -> ${ledgerColour(name)}`);
        }
    });

    it('gives the same dealer the same colour every time', () => {
        assert.equal(ledgerColour('Lead: Steve'), ledgerColour('Lead: Steve'));
    });

    it('does not put the two current dealers on the same colour', () => {
        assert.notEqual(ledgerColour('Lead: Steve'), ledgerColour('Lead: Chris'));
    });
});
