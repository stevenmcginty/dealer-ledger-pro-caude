"use strict";
/**
 * Tests for the pure half of "Wrong car", run with the Node test runner:
 *
 *   cd functions && npx tsc && node --test lib/salesAgent/correction.test.js
 *
 * The move itself needs Firebase and is not covered here. What is covered is the
 * bit that decides which car Steve meant, because that is where a correction can
 * go just as wrong as the guess it is correcting.
 */
Object.defineProperty(exports, "__esModule", { value: true });
const node_assert_1 = require("node:assert");
const node_test_1 = require("node:test");
const brain_1 = require("./brain");
const correction_1 = require("./correction");
const router_1 = require("./router");
const car = (over) => ({
    url: `https://radlettcarsales.com/used/cars/${over.id}/`,
    make: 'Porsche',
    model: 'Boxster',
    variant: '',
    title: 'Porsche Boxster',
    price: 9995,
    status: 'available',
    indexedAt: 0,
    ...over,
});
const STEVE = 'company-steve';
const CHRIS = 'company-chris';
const SITE = [
    car({ id: 'taycan', model: 'Taycan', variant: '4S', title: 'Porsche Taycan Performance Plus 93.4kWh 4S', price: 41495, year: 2021, status: 'sold', ownerCompanyId: STEVE }),
    car({ id: 'boxster-black', variant: '3.4 S', title: 'Porsche Boxster 3.4 S', colour: 'Black', year: 2007, ownerCompanyId: CHRIS }),
    car({ id: 'cayman', model: 'Cayman', title: 'Porsche Cayman 2.9', price: 15995, year: 2010, ownerCompanyId: CHRIS }),
];
(0, node_test_1.describe)('reading what the desk actually said', () => {
    (0, node_test_1.it)('drops everything from the first negation, so the wrong car is not handed back', () => {
        node_assert_1.strict.equal((0, correction_1.positivePartOfNote)("It's the black Boxster, not the Taycan"), "It's the black Boxster,");
    });
    (0, node_test_1.it)('leaves a note with no negation in it alone', () => {
        node_assert_1.strict.equal((0, correction_1.positivePartOfNote)('This is the 2010 Cayman'), 'This is the 2010 Cayman');
    });
});
(0, node_test_1.describe)('which car the correction names', () => {
    (0, node_test_1.it)('finds the car described, and it is the other dealer\'s', () => {
        const item = (0, correction_1.carFromCorrection)(SITE, "It's the black Boxster, not the Taycan", undefined, 'taycan');
        node_assert_1.strict.equal(item?.id, 'boxster-black');
        node_assert_1.strict.equal(item?.ownerCompanyId, CHRIS);
    });
    (0, node_test_1.it)('takes a stock id as given', () => {
        node_assert_1.strict.equal((0, correction_1.carFromCorrection)(SITE, 'this one', 'cayman')?.id, 'cayman');
    });
    (0, node_test_1.it)('never resolves back to the car being complained about', () => {
        // "another Porsche" describes the Taycan just as well as anything else.
        const item = (0, correction_1.carFromCorrection)(SITE, "It's another Porsche", undefined, 'taycan');
        node_assert_1.strict.notEqual(item?.id, 'taycan');
    });
    (0, node_test_1.it)('returns nothing when the note names no car we hold', () => {
        node_assert_1.strict.equal((0, correction_1.carFromCorrection)(SITE, 'wrong one mate', undefined, 'taycan'), null);
    });
});
(0, node_test_1.describe)('what the car picker may send', () => {
    const rejects = (data) => {
        node_assert_1.strict.throws(() => (0, correction_1.parseCorrectionInput)(data), (error) => error?.code === 'invalid-argument' && error?.message === 'Pick a car, or choose No car.');
    };
    (0, node_test_1.it)('takes a stock car', () => {
        node_assert_1.strict.deepEqual((0, correction_1.parseCorrectionInput)({ companyId: 'c', convId: 'x', stockId: ' 1919959 ' }), { note: '', stockId: '1919959' });
    });
    (0, node_test_1.it)('takes a ledger car, with the ledger it is on', () => {
        node_assert_1.strict.deepEqual((0, correction_1.parseCorrectionInput)({ convId: 'x', ledgerVehicleId: '-Oabc', vehicleCompanyId: CHRIS }), { note: '', ledgerVehicleId: '-Oabc', vehicleCompanyId: CHRIS });
    });
    (0, node_test_1.it)('takes "No car"', () => {
        node_assert_1.strict.deepEqual((0, correction_1.parseCorrectionInput)({ convId: 'x', noCar: true }), { note: '', noCar: true });
    });
    (0, node_test_1.it)('takes a title typed in by hand', () => {
        node_assert_1.strict.deepEqual((0, correction_1.parseCorrectionInput)({ convId: 'x', freeTitle: ' BMW S1000R ' }), { note: '', freeTitle: 'BMW S1000R' });
    });
    (0, node_test_1.it)('still takes a note on its own', () => {
        node_assert_1.strict.deepEqual((0, correction_1.parseCorrectionInput)({ convId: 'x', note: "It's the black Boxster" }), { note: "It's the black Boxster" });
    });
    (0, node_test_1.it)('refuses nothing at all, blanks, and a noCar that is not true', () => {
        rejects({ companyId: 'c', convId: 'x' });
        rejects({ convId: 'x', note: '   ', stockId: '', freeTitle: ' ' });
        rejects({ convId: 'x', noCar: 'true' });
        rejects(null);
    });
});
(0, node_test_1.describe)('Steve\'s pick sticks (carSetByOwner)', () => {
    const OWNERS = car({ id: 'boxster-black', variant: '3.4 S', title: 'Porsche Boxster 3.4 S', reg: 'AB07BXT', ownerCompanyId: CHRIS });
    const OTHER = car({ id: 'cayman', model: 'Cayman', title: 'Porsche Cayman 2.9', reg: 'AB10CAY', ownerCompanyId: CHRIS });
    const locked = { vehicleInterest: { stockId: OWNERS.id, title: OWNERS.title }, carSetByOwner: 1700000000000 };
    const lockedNoCar = { vehicleInterest: undefined, carSetByOwner: 1700000000000 };
    (0, node_test_1.it)('the router does not pin a car over it, even on a new match', () => {
        node_assert_1.strict.equal((0, router_1.homePinAllowed)(lockedNoCar, true, OTHER, { stockId: OTHER.id }), false);
        node_assert_1.strict.equal((0, router_1.homePinAllowed)(lockedNoCar, false, OTHER, { reg: 'AB10CAY' }), false);
    });
    (0, node_test_1.it)('without the lock, a new thread is pinned and a later reply only on exact evidence', () => {
        const open = { vehicleInterest: undefined };
        node_assert_1.strict.equal((0, router_1.homePinAllowed)(open, true, OTHER, { text: 'the cayman' }), true);
        node_assert_1.strict.equal((0, router_1.homePinAllowed)(open, false, OTHER, { text: 'the leather on that cayman' }), false);
        node_assert_1.strict.equal((0, router_1.homePinAllowed)(open, false, OTHER, { text: 'is AB10 CAY still there?' }), true);
    });
    (0, node_test_1.it)('the brain does not change it', () => {
        node_assert_1.strict.equal((0, brain_1.brainCarUpdate)(locked, { stockId: OTHER.id, title: OTHER.title }, undefined), undefined);
        node_assert_1.strict.equal((0, brain_1.brainCarUpdate)(lockedNoCar, undefined, { stockId: OTHER.id, title: OTHER.title }), undefined);
    });
    (0, node_test_1.it)('without the lock the brain still moves the car, and carries the ledger and the reg', () => {
        const fromTool = { stockId: OTHER.id, title: OTHER.title, ownerCompanyId: CHRIS, reg: 'AB10CAY' };
        node_assert_1.strict.deepEqual((0, brain_1.brainCarUpdate)({ vehicleInterest: locked.vehicleInterest }, { stockId: OTHER.id, title: OTHER.title }, fromTool), fromTool);
        // The same car again is no change, so ownerCompanyId is never dropped by a rewrite.
        node_assert_1.strict.equal((0, brain_1.brainCarUpdate)({ vehicleInterest: fromTool }, { stockId: OTHER.id, title: OTHER.title }, undefined), undefined);
    });
});
//# sourceMappingURL=correction.test.js.map