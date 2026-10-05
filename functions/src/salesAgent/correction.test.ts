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

import { brainCarUpdate } from './brain';
import { carFromCorrection, parseCorrectionInput, positivePartOfNote } from './correction';
import { homePinAllowed } from './router';
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

describe('what the car picker may send', () => {
    const rejects = (data: unknown): void => {
        assert.throws(() => parseCorrectionInput(data), (error: any) =>
            error?.code === 'invalid-argument' && error?.message === 'Pick a car, or choose No car.');
    };

    it('takes a stock car', () => {
        assert.deepEqual(parseCorrectionInput({ companyId: 'c', convId: 'x', stockId: ' 1919959 ' }), { note: '', stockId: '1919959' });
    });

    it('takes a ledger car, with the ledger it is on', () => {
        assert.deepEqual(
            parseCorrectionInput({ convId: 'x', ledgerVehicleId: '-Oabc', vehicleCompanyId: CHRIS }),
            { note: '', ledgerVehicleId: '-Oabc', vehicleCompanyId: CHRIS },
        );
    });

    it('takes "No car"', () => {
        assert.deepEqual(parseCorrectionInput({ convId: 'x', noCar: true }), { note: '', noCar: true });
    });

    it('takes a title typed in by hand', () => {
        assert.deepEqual(parseCorrectionInput({ convId: 'x', freeTitle: ' BMW S1000R ' }), { note: '', freeTitle: 'BMW S1000R' });
    });

    it('still takes a note on its own', () => {
        assert.deepEqual(parseCorrectionInput({ convId: 'x', note: "It's the black Boxster" }), { note: "It's the black Boxster" });
    });

    it('refuses nothing at all, blanks, and a noCar that is not true', () => {
        rejects({ companyId: 'c', convId: 'x' });
        rejects({ convId: 'x', note: '   ', stockId: '', freeTitle: ' ' });
        rejects({ convId: 'x', noCar: 'true' });
        rejects(null);
    });
});

describe('Steve\'s pick sticks (carSetByOwner)', () => {
    const OWNERS = car({ id: 'boxster-black', variant: '3.4 S', title: 'Porsche Boxster 3.4 S', reg: 'AB07BXT', ownerCompanyId: CHRIS });
    const OTHER = car({ id: 'cayman', model: 'Cayman', title: 'Porsche Cayman 2.9', reg: 'AB10CAY', ownerCompanyId: CHRIS });
    const locked = { vehicleInterest: { stockId: OWNERS.id, title: OWNERS.title }, carSetByOwner: 1_700_000_000_000 };
    const lockedNoCar = { vehicleInterest: undefined, carSetByOwner: 1_700_000_000_000 };

    it('the router does not pin a car over it, even on a new match', () => {
        assert.equal(homePinAllowed(lockedNoCar, true, OTHER, { stockId: OTHER.id }), false);
        assert.equal(homePinAllowed(lockedNoCar, false, OTHER, { reg: 'AB10CAY' }), false);
    });

    it('without the lock, a new thread is pinned and a later reply only on exact evidence', () => {
        const open = { vehicleInterest: undefined };
        assert.equal(homePinAllowed(open, true, OTHER, { text: 'the cayman' }), true);
        assert.equal(homePinAllowed(open, false, OTHER, { text: 'the leather on that cayman' }), false);
        assert.equal(homePinAllowed(open, false, OTHER, { text: 'is AB10 CAY still there?' }), true);
    });

    it('the brain does not change it', () => {
        assert.equal(brainCarUpdate(locked, { stockId: OTHER.id, title: OTHER.title }, undefined), undefined);
        assert.equal(brainCarUpdate(lockedNoCar, undefined, { stockId: OTHER.id, title: OTHER.title }), undefined);
    });

    it('without the lock the brain still moves the car, and carries the ledger and the reg', () => {
        const fromTool = { stockId: OTHER.id, title: OTHER.title, ownerCompanyId: CHRIS, reg: 'AB10CAY' };
        assert.deepEqual(brainCarUpdate({ vehicleInterest: locked.vehicleInterest }, { stockId: OTHER.id, title: OTHER.title }, fromTool), fromTool);
        // The same car again is no change, so ownerCompanyId is never dropped by a rewrite.
        assert.equal(brainCarUpdate({ vehicleInterest: fromTool }, { stockId: OTHER.id, title: OTHER.title }, undefined), undefined);
    });
});
