/**
 *   cd functions && npx tsc && node --test lib/salesAgent/sendHours.test.js
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import {
    DEFAULT_SEND_HOURS,
    formatSendAt,
    isWithinSendHours,
    resolveSendHours,
    scheduleSendAfter,
    startOfNextWindow,
    zonedUtcMs,
} from './sendHours';

const hours = DEFAULT_SEND_HOURS;
const tz = hours.timeZone;

/** Wall clock in London as an epoch ms. */
const at = (isoLocal: string): number => {
    // isoLocal is '2026-08-26T16:00:00' meaning that time in Europe/London.
    const [date, time] = isoLocal.split('T');
    const [y, m, d] = date.split('-').map(Number);
    const [hh, mm, ss] = (time || '00:00:00').split(':').map(Number);
    return zonedUtcMs(tz, y, m, d, hh, mm) + (ss || 0) * 1000;
};

describe('resolveSendHours', () => {
    it('fills in the 8am–5pm Mon–Sat default', () => {
        const resolved = resolveSendHours({});
        assert.equal(resolved.enabled, true);
        assert.equal(resolved.start, '08:00');
        assert.equal(resolved.end, '17:00');
        assert.deepEqual(resolved.days, [1, 2, 3, 4, 5, 6]);
        assert.equal(resolved.timeZone, 'Europe/London');
    });

    it('keeps an explicit off switch', () => {
        assert.equal(resolveSendHours({ sendHours: { enabled: false } }).enabled, false);
    });
});

describe('isWithinSendHours', () => {
    it('is inside on a Wednesday afternoon', () => {
        assert.equal(isWithinSendHours(hours, at('2026-08-26T10:00:00')), true);
        assert.equal(isWithinSendHours(hours, at('2026-08-26T08:00:00')), true);
        assert.equal(isWithinSendHours(hours, at('2026-08-26T16:59:00')), true);
    });

    it('is outside from 5pm, before 8am, and on Sunday', () => {
        assert.equal(isWithinSendHours(hours, at('2026-08-26T17:00:00')), false);
        assert.equal(isWithinSendHours(hours, at('2026-08-26T07:59:00')), false);
        assert.equal(isWithinSendHours(hours, at('2026-08-30T12:00:00')), false);
    });

    it('is always inside when the window is switched off', () => {
        assert.equal(isWithinSendHours({ ...hours, enabled: false }, at('2026-08-26T23:00:00')), true);
    });
});

describe('scheduleSendAfter', () => {
    it('keeps a daytime send on the human-feel delay', () => {
        const now = at('2026-08-26T10:00:00');
        assert.equal(scheduleSendAfter({ sendHours: hours }, now, 12_000, 99_000), now + 12_000);
    });

    it('holds an evening approval until 8am the next weekday', () => {
        const now = at('2026-08-26T21:00:00');
        const next = at('2026-08-27T08:00:00');
        assert.equal(scheduleSendAfter({ sendHours: hours }, now, 0, 0), next);
        assert.equal(scheduleSendAfter({ sendHours: hours }, now, 0, 45_000), next + 45_000);
    });

    it('holds a Sunday afternoon until Monday 8am', () => {
        const now = at('2026-08-30T14:00:00');
        assert.equal(scheduleSendAfter({ sendHours: hours }, now, 0, 0), at('2026-08-31T08:00:00'));
    });

    it('holds Saturday evening until Monday 8am', () => {
        const now = at('2026-08-29T18:30:00');
        assert.equal(startOfNextWindow(hours, now), at('2026-08-31T08:00:00'));
    });

    it('sends at 8am the same morning if approved before opening', () => {
        const now = at('2026-08-26T07:15:00');
        assert.equal(scheduleSendAfter({ sendHours: hours }, now, 0, 0), at('2026-08-26T08:00:00'));
    });

    it('sends immediately when hours are disabled', () => {
        const now = at('2026-08-26T22:00:00');
        assert.equal(scheduleSendAfter({ sendHours: { enabled: false } }, now, 5_000, 99_000), now + 5_000);
    });
});

describe('formatSendAt', () => {
    it('names the weekday and time in London', () => {
        const label = formatSendAt(at('2026-08-27T08:00:00'), tz);
        assert.match(label, /Thu/i);
        assert.match(label, /8:00/);
    });
});
