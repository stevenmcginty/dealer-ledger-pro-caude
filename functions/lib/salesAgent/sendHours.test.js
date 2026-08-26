"use strict";
/**
 *   cd functions && npx tsc && node --test lib/salesAgent/sendHours.test.js
 */
Object.defineProperty(exports, "__esModule", { value: true });
const node_assert_1 = require("node:assert");
const node_test_1 = require("node:test");
const sendHours_1 = require("./sendHours");
const hours = sendHours_1.DEFAULT_SEND_HOURS;
const tz = hours.timeZone;
/** Wall clock in London as an epoch ms. */
const at = (isoLocal) => {
    // isoLocal is '2026-08-26T16:00:00' meaning that time in Europe/London.
    const [date, time] = isoLocal.split('T');
    const [y, m, d] = date.split('-').map(Number);
    const [hh, mm, ss] = (time || '00:00:00').split(':').map(Number);
    return (0, sendHours_1.zonedUtcMs)(tz, y, m, d, hh, mm) + (ss || 0) * 1000;
};
(0, node_test_1.describe)('resolveSendHours', () => {
    (0, node_test_1.it)('fills in the 8am–5pm Mon–Sat default', () => {
        const resolved = (0, sendHours_1.resolveSendHours)({});
        node_assert_1.strict.equal(resolved.enabled, true);
        node_assert_1.strict.equal(resolved.start, '08:00');
        node_assert_1.strict.equal(resolved.end, '17:00');
        node_assert_1.strict.deepEqual(resolved.days, [1, 2, 3, 4, 5, 6]);
        node_assert_1.strict.equal(resolved.timeZone, 'Europe/London');
    });
    (0, node_test_1.it)('keeps an explicit off switch', () => {
        node_assert_1.strict.equal((0, sendHours_1.resolveSendHours)({ sendHours: { enabled: false } }).enabled, false);
    });
});
(0, node_test_1.describe)('isWithinSendHours', () => {
    (0, node_test_1.it)('is inside on a Wednesday afternoon', () => {
        node_assert_1.strict.equal((0, sendHours_1.isWithinSendHours)(hours, at('2026-08-26T10:00:00')), true);
        node_assert_1.strict.equal((0, sendHours_1.isWithinSendHours)(hours, at('2026-08-26T08:00:00')), true);
        node_assert_1.strict.equal((0, sendHours_1.isWithinSendHours)(hours, at('2026-08-26T16:59:00')), true);
    });
    (0, node_test_1.it)('is outside from 5pm, before 8am, and on Sunday', () => {
        node_assert_1.strict.equal((0, sendHours_1.isWithinSendHours)(hours, at('2026-08-26T17:00:00')), false);
        node_assert_1.strict.equal((0, sendHours_1.isWithinSendHours)(hours, at('2026-08-26T07:59:00')), false);
        node_assert_1.strict.equal((0, sendHours_1.isWithinSendHours)(hours, at('2026-08-30T12:00:00')), false);
    });
    (0, node_test_1.it)('is always inside when the window is switched off', () => {
        node_assert_1.strict.equal((0, sendHours_1.isWithinSendHours)({ ...hours, enabled: false }, at('2026-08-26T23:00:00')), true);
    });
});
(0, node_test_1.describe)('scheduleSendAfter', () => {
    (0, node_test_1.it)('keeps a daytime send on the human-feel delay', () => {
        const now = at('2026-08-26T10:00:00');
        node_assert_1.strict.equal((0, sendHours_1.scheduleSendAfter)({ sendHours: hours }, now, 12000, 99000), now + 12000);
    });
    (0, node_test_1.it)('holds an evening approval until 8am the next weekday', () => {
        const now = at('2026-08-26T21:00:00');
        const next = at('2026-08-27T08:00:00');
        node_assert_1.strict.equal((0, sendHours_1.scheduleSendAfter)({ sendHours: hours }, now, 0, 0), next);
        node_assert_1.strict.equal((0, sendHours_1.scheduleSendAfter)({ sendHours: hours }, now, 0, 45000), next + 45000);
    });
    (0, node_test_1.it)('holds a Sunday afternoon until Monday 8am', () => {
        const now = at('2026-08-30T14:00:00');
        node_assert_1.strict.equal((0, sendHours_1.scheduleSendAfter)({ sendHours: hours }, now, 0, 0), at('2026-08-31T08:00:00'));
    });
    (0, node_test_1.it)('holds Saturday evening until Monday 8am', () => {
        const now = at('2026-08-29T18:30:00');
        node_assert_1.strict.equal((0, sendHours_1.startOfNextWindow)(hours, now), at('2026-08-31T08:00:00'));
    });
    (0, node_test_1.it)('sends at 8am the same morning if approved before opening', () => {
        const now = at('2026-08-26T07:15:00');
        node_assert_1.strict.equal((0, sendHours_1.scheduleSendAfter)({ sendHours: hours }, now, 0, 0), at('2026-08-26T08:00:00'));
    });
    (0, node_test_1.it)('sends immediately when hours are disabled', () => {
        const now = at('2026-08-26T22:00:00');
        node_assert_1.strict.equal((0, sendHours_1.scheduleSendAfter)({ sendHours: { enabled: false } }, now, 5000, 99000), now + 5000);
    });
});
(0, node_test_1.describe)('formatSendAt', () => {
    (0, node_test_1.it)('names the weekday and time in London', () => {
        const label = (0, sendHours_1.formatSendAt)(at('2026-08-27T08:00:00'), tz);
        node_assert_1.strict.match(label, /Thu/i);
        node_assert_1.strict.match(label, /8:00/);
    });
});
//# sourceMappingURL=sendHours.test.js.map