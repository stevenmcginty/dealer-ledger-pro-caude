/**
 * Matcher tests for how customers actually describe a car, run with the Node test
 * runner:
 *
 *   cd functions && npx tsc && node --test lib/salesAgent/stock/search.test.js
 *
 * The failure these exist to stop: a real customer wrote "I've noticed you've still
 * got the black 2007 boxster available" and the agent replied that it could not see
 * a black 2007 Boxster in the stock list. It was there. Almost nobody quotes a
 * registration, so a colour, a year and a half-remembered model name have to be
 * enough to land on the right advert.
 *
 * No Firebase and no network: rankStock is the pure half of searchStock and is
 * handed a list of adverts directly.
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { describeStockItem, rankStock } from './search';
import type { StockItem } from '../types';

const car = (over: Partial<StockItem> & { id: string }): StockItem => ({
    url: `https://radlettcarsales.com/used/cars/${over.id}/`,
    make: 'Ford',
    model: 'Focus',
    variant: '1.0 Zetec',
    title: 'Ford Focus 1.0 Zetec',
    price: 6995,
    status: 'available',
    indexedAt: 0,
    ...over,
});

const BOXSTER_07 = car({
    id: 'boxster-07',
    make: 'Porsche',
    model: 'Boxster',
    variant: '3.4 S Tiptronic',
    title: 'Porsche Boxster 3.4 S Tiptronic',
    price: 10995,
    year: 2007,
    mileage: 62000,
    fuel: 'Petrol',
    transmission: 'Automatic',
    bodyType: 'Convertible',
    colour: 'Black',
    owners: 3,
    reg: 'BC02YDG',
    description: 'Gen 2 Boxster S in black over black leather, heated seats and the sports exhaust.',
});

const BOXSTER_01 = car({
    id: 'boxster-01',
    make: 'Porsche',
    model: 'Boxster',
    variant: '2.7',
    title: 'Porsche Boxster 2.7',
    price: 5995,
    year: 2001,
    mileage: 96400,
    fuel: 'Petrol',
    transmission: 'Manual',
    bodyType: 'Convertible',
    colour: 'Black',
    owners: 5,
    reg: 'Y421HTM',
    description: 'Early 986 Boxster with the blue hood. Recent clutch and a fresh set of tyres.',
});

/** Eight adverts, close enough to the real forecourt to be worth arguing with. */
const STOCK: StockItem[] = [
    BOXSTER_07,
    BOXSTER_01,
    car({
        id: 'mini-13',
        make: 'MINI',
        model: 'Cooper',
        variant: '1.6 Cooper D',
        title: 'MINI Cooper 1.6 Cooper D',
        price: 6495,
        year: 2013,
        mileage: 54000,
        fuel: 'Diesel',
        transmission: 'Manual',
        bodyType: 'Hatchback',
        colour: 'Pepper White',
        reg: 'KX13ZZZ',
        description: 'Cooper D with the Chili pack, cheap tax and a long MOT.',
    }),
    car({
        id: 'astra-17',
        make: 'Vauxhall',
        model: 'Astra',
        variant: '1.4T GTC SRi',
        title: 'Vauxhall Astra 1.4T GTC SRi',
        price: 7995,
        year: 2017,
        mileage: 41000,
        fuel: 'Petrol',
        transmission: 'Manual',
        bodyType: 'Coupe',
        colour: 'Silver',
        reg: 'YE17AGT',
        description: 'Three door GTC on the 20 inch wheels, one owner and a full history.',
    }),
    car({
        id: 'focus-17',
        variant: '2.0T EcoBoost ST-3',
        title: 'Ford Focus 2.0T EcoBoost ST-3',
        price: 12995,
        year: 2017,
        mileage: 48200,
        fuel: 'Petrol',
        transmission: 'Manual',
        bodyType: 'Hatchback',
        colour: 'Race Red',
        reg: 'YE17ABC',
        description: 'Well looked after ST-3 with the full leather Recaro interior and the winter pack.',
        features: ['Heated Recaro seats', 'Cruise control'],
    }),
    car({
        id: 'golf-18',
        make: 'Volkswagen',
        model: 'Golf',
        variant: '2.0 TSI GTI Performance DSG',
        title: 'Volkswagen Golf 2.0 TSI GTI Performance DSG',
        price: 15750,
        year: 2018,
        mileage: 39800,
        fuel: 'Petrol',
        transmission: 'Automatic',
        bodyType: 'Hatchback',
        colour: 'Tornado Red',
        reg: 'YD18DEF',
        description: 'One owner GTI Performance with the bigger brakes and the limited slip diff.',
    }),
    car({
        id: 'evoque-15',
        make: 'Land Rover',
        model: 'Range Rover Evoque',
        variant: '2.2 SD4 Dynamic',
        title: 'Land Rover Range Rover Evoque 2.2 SD4 Dynamic',
        price: 16450,
        year: 2015,
        mileage: 62500,
        fuel: 'Diesel',
        transmission: 'Automatic',
        bodyType: 'SUV',
        colour: 'Corris Grey',
        reg: 'LR15EVO',
        description: 'Dynamic spec with the panoramic roof and the upgraded stereo.',
    }),
    car({
        id: 'mx5-14',
        make: 'Mazda',
        model: 'MX-5',
        variant: '1.8 SE',
        title: 'Mazda MX-5 1.8 SE',
        price: 6250,
        year: 2014,
        mileage: 33000,
        fuel: 'Petrol',
        transmission: 'Manual',
        bodyType: 'Convertible',
        colour: 'Blue',
        reg: 'MX14ZDA',
        description: 'Two owner SE with the folding hard top and a fresh MOT.',
    }),
];

const ids = (items: Array<{ id: string }>): string[] => items.map(item => item.id);

describe('the description a customer actually sends', () => {
    it('lands on the one car when they give the colour and the year', () => {
        const hits = rankStock(STOCK, { text: 'black 2007 boxster' });

        assert.deepEqual(ids(hits), ['boxster-07']);
        assert.equal(hits[0].matchQuality, 'exact');
    });

    it('forgives the spelling of the model', () => {
        const hits = rankStock(STOCK, { text: 'boxter' });

        assert.deepEqual(ids(hits).sort(), ['boxster-01', 'boxster-07']);
    });

    it('reads a plate year: "13 plate mini"', () => {
        const hits = rankStock(STOCK, { text: '13 plate mini' });

        assert.deepEqual(ids(hits), ['mini-13']);
        assert.equal(hits[0].matchQuality, 'exact');
    });

    it('reads a second-half plate year: "the 07 plate porsche"', () => {
        const hits = rankStock(STOCK, { text: 'the 07 plate porsche' });

        assert.deepEqual(ids(hits), ['boxster-07']);
        assert.equal(hits[0].matchQuality, 'exact');
    });

    it('answers the whole sentence they sent, not just the car words', () => {
        const hits = rankStock(STOCK, {
            text: "I've noticed you've still got the black 2007 boxster available. Can you tell me how many owners it's had",
        });

        assert.deepEqual(ids(hits), ['boxster-07']);
        assert.equal(hits[0].owners, 3);
    });

    it('returns nothing rather than the wrong car for "red convertible"', () => {
        const hits = rankStock(STOCK, { text: 'red convertible' });

        assert.deepEqual(ids(hits), []);
    });

    it('offers both when they name the model and no year', () => {
        const hits = rankStock(STOCK, { text: 'boxster' });

        assert.deepEqual(ids(hits).sort(), ['boxster-01', 'boxster-07']);
        assert.deepEqual(hits.map(hit => hit.matchQuality), ['close', 'close']);
    });

    it('tries a year either side before giving up', () => {
        const hits = rankStock(STOCK, { text: '2006 boxster' });

        assert.deepEqual(ids(hits), ['boxster-07']);
        assert.equal(hits[0].matchQuality, 'close');
    });
});

describe('how sure the match is', () => {
    it('calls a blurb-only hit weak', () => {
        const hits = rankStock(STOCK, { text: 'recaro' });

        assert.deepEqual(ids(hits), ['focus-17']);
        assert.equal(hits[0].matchQuality, 'weak');
    });

    it('drops the guesses once there is a real match', () => {
        const hits = rankStock(STOCK, { text: 'boxster recaro' });

        assert.deepEqual(ids(hits).sort(), ['boxster-01', 'boxster-07']);
    });
});

describe("cars the agent is not allowed to sell", () => {
    /** The 2007 Boxster is on the shared website, but it is Chris's and he is not signed up. */
    const SHARED: StockItem[] = STOCK.map(item =>
        item.id === BOXSTER_07.id ? { ...item, hiddenReason: 'owner_opted_out' as const } : item,
    );

    it('never returns another dealer\'s car to a normal search', () => {
        assert.deepEqual(ids(rankStock(SHARED, { text: 'black 2007 boxster' })), []);
    });

    it('finds it under includeHidden, so the agent can hand over instead of denying it', () => {
        const hits = rankStock(SHARED, { text: 'black 2007 boxster', includeHidden: true });

        assert.deepEqual(ids(hits), ['boxster-07']);
        assert.equal(hits[0].matchQuality, 'exact');
        assert.equal(hits[0].hiddenReason, 'owner_opted_out');
    });
});

describe('a car that has already gone', () => {
    /** The Boxsters as they really are on the site: the 2007 is reserved. */
    const BOXSTERS: StockItem[] = [
        car({ id: 'boxster-09', make: 'Porsche', model: 'Boxster', variant: '2.9', title: 'Porsche Boxster 2.9', price: 12995, year: 2009, colour: 'Blue', bodyType: 'Convertible', status: 'sold' }),
        car({ id: 'boxster-07-blue', make: 'Porsche', model: 'Boxster', variant: '2.7', title: 'Porsche Boxster 2.7', price: 9995, year: 2007, colour: 'Blue', bodyType: 'Convertible', status: 'reserved' }),
        car({ id: 'boxster-03', make: 'Porsche', model: 'Boxster', variant: '2.7', title: 'Porsche Boxster 2.7', price: 8995, year: 2003, colour: 'Red', bodyType: 'Convertible' }),
        car({ id: 'boxster-02', make: 'Porsche', model: 'Boxster', variant: '3.2 S', title: 'Porsche Boxster 3.2 S', price: 10995, year: 2002, colour: 'Black', bodyType: 'Convertible' }),
    ];

    it('hides it from the everyday search', () => {
        assert.deepEqual(ids(rankStock(BOXSTERS, { text: 'blue 2007 boxster' })), []);
    });

    it('gives it up under includeReserved, so it can be said out loud', () => {
        const hits = rankStock(BOXSTERS, { text: 'blue 2007 boxster', includeReserved: true });

        assert.deepEqual(ids(hits), ['boxster-07-blue']);
        assert.equal(hits[0].matchQuality, 'exact');
        assert.equal(hits[0].status, 'reserved');
    });

    it('leaves two available Boxsters to offer beside it', () => {
        const alternatives = rankStock(BOXSTERS, { text: 'boxster' });

        assert.deepEqual(ids(alternatives).sort(), ['boxster-02', 'boxster-03']);
    });
});

describe('describeStockItem', () => {
    it('writes the line the agent reads back to the customer', () => {
        assert.equal(
            describeStockItem(BOXSTER_07),
            '2007 Porsche Boxster 3.4 S Tiptronic, Black, 62,000 miles, £10,995 (reg BC02YDG)',
        );
    });

    it('says when the car is no longer available', () => {
        assert.equal(
            describeStockItem({ ...BOXSTER_01, status: 'reserved' }),
            '2001 Porsche Boxster 2.7, Black, 96,400 miles, £5,995 (reg Y421HTM), currently reserved',
        );
    });
});
