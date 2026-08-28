/**
 * Tests for the pure half of "Wrong car", run with the Node test runner:
 *
 *   cd functions && npx tsc && node --test lib/salesAgent/correction.test.js
 *
 * The move itself needs Firebase and is not covered here. What is covered is the
 * bit that decides which car Steve meant, because that is where a correction can
 * go just as wrong as the guess it is correcting.
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { carFromCorrection, positivePartOfNote } from './correction';
import type { StockItem } from './types';

const car = (over: Partial<StockItem> & { id: string }): StockItem => ({
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

const SITE: StockItem[] = [
    car({ id: 'taycan', model: 'Taycan', variant: '4S', title: 'Porsche Taycan Performance Plus 93.4kWh 4S', price: 41495, year: 2021, status: 'sold', ownerCompanyId: STEVE }),
    car({ id: 'boxster-black', variant: '3.4 S', title: 'Porsche Boxster 3.4 S', colour: 'Black', year: 2007, ownerCompanyId: CHRIS }),
    car({ id: 'cayman', model: 'Cayman', title: 'Porsche Cayman 2.9', price: 15995, year: 2010, ownerCompanyId: CHRIS }),
];

describe('reading what the desk actually said', () => {
    it('drops everything from the first negation, so the wrong car is not handed back', () => {
        assert.equal(
            positivePartOfNote("It's the black Boxster, not the Taycan"),
            "It's the black Boxster,",
        );
    });

    it('leaves a note with no negation in it alone', () => {
        assert.equal(positivePartOfNote('This is the 2010 Cayman'), 'This is the 2010 Cayman');
    });
});

describe('which car the correction names', () => {
    it('finds the car described, and it is the other dealer\'s', () => {
        const item = carFromCorrection(SITE, "It's the black Boxster, not the Taycan", undefined, 'taycan');

        assert.equal(item?.id, 'boxster-black');
        assert.equal(item?.ownerCompanyId, CHRIS);
    });

    it('takes a stock id as given', () => {
        assert.equal(carFromCorrection(SITE, 'this one', 'cayman')?.id, 'cayman');
    });

    it('never resolves back to the car being complained about', () => {
        // "another Porsche" describes the Taycan just as well as anything else.
        const item = carFromCorrection(SITE, "It's another Porsche", undefined, 'taycan');

        assert.notEqual(item?.id, 'taycan');
    });

    it('returns nothing when the note names no car we hold', () => {
        assert.equal(carFromCorrection(SITE, 'wrong one mate', undefined, 'taycan'), null);
    });
});
