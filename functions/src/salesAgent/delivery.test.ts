/**
 * Delivery receipts: a state only ever moves forward.
 *
 *   cd functions && npx tsc && node --test lib/salesAgent/delivery.test.js
 */
import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { DELIVERY_RANK, DeliveryState } from './types';

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
