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
const correction_1 = require("./correction");
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
//# sourceMappingURL=correction.test.js.map