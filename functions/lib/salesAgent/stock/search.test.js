"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
const node_assert_1 = require("node:assert");
const node_test_1 = require("node:test");
const search_1 = require("./search");
const car = (over) => ({
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
const STOCK = [
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
const ids = (items) => items.map(item => item.id);
(0, node_test_1.describe)('the description a customer actually sends', () => {
    (0, node_test_1.it)('lands on the one car when they give the colour and the year', () => {
        const hits = (0, search_1.rankStock)(STOCK, { text: 'black 2007 boxster' });
        node_assert_1.strict.deepEqual(ids(hits), ['boxster-07']);
        node_assert_1.strict.equal(hits[0].matchQuality, 'exact');
    });
    (0, node_test_1.it)('forgives the spelling of the model', () => {
        const hits = (0, search_1.rankStock)(STOCK, { text: 'boxter' });
        node_assert_1.strict.deepEqual(ids(hits).sort(), ['boxster-01', 'boxster-07']);
    });
    (0, node_test_1.it)('reads a plate year: "13 plate mini"', () => {
        const hits = (0, search_1.rankStock)(STOCK, { text: '13 plate mini' });
        node_assert_1.strict.deepEqual(ids(hits), ['mini-13']);
        node_assert_1.strict.equal(hits[0].matchQuality, 'exact');
    });
    (0, node_test_1.it)('reads a second-half plate year: "the 07 plate porsche"', () => {
        const hits = (0, search_1.rankStock)(STOCK, { text: 'the 07 plate porsche' });
        node_assert_1.strict.deepEqual(ids(hits), ['boxster-07']);
        node_assert_1.strict.equal(hits[0].matchQuality, 'exact');
    });
    (0, node_test_1.it)('answers the whole sentence they sent, not just the car words', () => {
        const hits = (0, search_1.rankStock)(STOCK, {
            text: "I've noticed you've still got the black 2007 boxster available. Can you tell me how many owners it's had",
        });
        node_assert_1.strict.deepEqual(ids(hits), ['boxster-07']);
        node_assert_1.strict.equal(hits[0].owners, 3);
    });
    (0, node_test_1.it)('returns nothing rather than the wrong car for "red convertible"', () => {
        const hits = (0, search_1.rankStock)(STOCK, { text: 'red convertible' });
        node_assert_1.strict.deepEqual(ids(hits), []);
    });
    (0, node_test_1.it)('offers both when they name the model and no year', () => {
        const hits = (0, search_1.rankStock)(STOCK, { text: 'boxster' });
        node_assert_1.strict.deepEqual(ids(hits).sort(), ['boxster-01', 'boxster-07']);
        node_assert_1.strict.deepEqual(hits.map(hit => hit.matchQuality), ['close', 'close']);
    });
    (0, node_test_1.it)('tries a year either side before giving up', () => {
        const hits = (0, search_1.rankStock)(STOCK, { text: '2006 boxster' });
        node_assert_1.strict.deepEqual(ids(hits), ['boxster-07']);
        node_assert_1.strict.equal(hits[0].matchQuality, 'close');
    });
});
(0, node_test_1.describe)('how sure the match is', () => {
    (0, node_test_1.it)('calls a blurb-only hit weak', () => {
        const hits = (0, search_1.rankStock)(STOCK, { text: 'recaro' });
        node_assert_1.strict.deepEqual(ids(hits), ['focus-17']);
        node_assert_1.strict.equal(hits[0].matchQuality, 'weak');
    });
    (0, node_test_1.it)('drops the guesses once there is a real match', () => {
        const hits = (0, search_1.rankStock)(STOCK, { text: 'boxster recaro' });
        node_assert_1.strict.deepEqual(ids(hits).sort(), ['boxster-01', 'boxster-07']);
    });
});
(0, node_test_1.describe)("cars the agent is not allowed to sell", () => {
    /** The 2007 Boxster is on the shared website, but it is Chris's and he is not signed up. */
    const SHARED = STOCK.map(item => item.id === BOXSTER_07.id ? { ...item, hiddenReason: 'owner_opted_out' } : item);
    (0, node_test_1.it)('never returns another dealer\'s car to a normal search', () => {
        node_assert_1.strict.deepEqual(ids((0, search_1.rankStock)(SHARED, { text: 'black 2007 boxster' })), []);
    });
    (0, node_test_1.it)('finds it under includeHidden, so the agent can hand over instead of denying it', () => {
        const hits = (0, search_1.rankStock)(SHARED, { text: 'black 2007 boxster', includeHidden: true });
        node_assert_1.strict.deepEqual(ids(hits), ['boxster-07']);
        node_assert_1.strict.equal(hits[0].matchQuality, 'exact');
        node_assert_1.strict.equal(hits[0].hiddenReason, 'owner_opted_out');
    });
});
(0, node_test_1.describe)('which ledger owns the enquiry', () => {
    const STEVE = 'company-steve';
    const CHRIS = 'company-chris';
    const OWNED = STOCK.map(item => {
        if (item.id === BOXSTER_07.id) {
            return { ...item, ownerCompanyId: CHRIS, hiddenReason: 'owner_opted_out' };
        }
        if (item.id === 'focus-17')
            return { ...item, ownerCompanyId: STEVE };
        return item;
    });
    (0, node_test_1.it)('routes a registration to the company that holds that car, even when it is hidden from Dave', () => {
        const item = (0, search_1.matchEnquiryStock)(OWNED, { reg: 'BC02 YDG' });
        node_assert_1.strict.equal(item?.id, BOXSTER_07.id);
        node_assert_1.strict.equal(item?.ownerCompanyId, CHRIS);
    });
    (0, node_test_1.it)('routes a stock id the same way', () => {
        const item = (0, search_1.matchEnquiryStock)(OWNED, { stockId: BOXSTER_07.id });
        node_assert_1.strict.equal(item?.ownerCompanyId, CHRIS);
    });
    (0, node_test_1.it)('routes a clear description to the owner', () => {
        const item = (0, search_1.matchEnquiryStock)(OWNED, { title: 'black 2007 boxster' });
        node_assert_1.strict.equal(item?.id, BOXSTER_07.id);
        node_assert_1.strict.equal(item?.ownerCompanyId, CHRIS);
    });
    (0, node_test_1.it)('refuses a weak guess so the thread is not pinned to the wrong dealer', () => {
        node_assert_1.strict.equal((0, search_1.matchEnquiryStock)(OWNED, { text: 'recaro' }), null);
    });
    (0, node_test_1.it)('refuses when two close hits belong to different dealers', () => {
        const clash = [
            { ...BOXSTER_07, ownerCompanyId: CHRIS },
            { ...BOXSTER_01, ownerCompanyId: STEVE },
        ];
        node_assert_1.strict.equal((0, search_1.matchEnquiryStock)(clash, { title: 'porsche boxster' }), null);
    });
});
(0, node_test_1.describe)('the sold Porsche problem', () => {
    /**
     * 28 Aug: a bare "is this still available" landed on a Taycan that had sold off
     * Steve's ledger, so the thread stayed with Steve and Dave talked about a car
     * that was gone. The three Porsches actually for sale that day were all Chris's.
     */
    const STEVE = 'company-steve';
    const CHRIS = 'company-chris';
    const SITE = [
        car({ id: 'taycan-sold', make: 'Porsche', model: 'Taycan', variant: '4S', title: 'Porsche Taycan Performance Plus 93.4kWh 4S', price: 41495, year: 2021, status: 'sold', ownerCompanyId: STEVE }),
        car({ id: 'boxster-chris', make: 'Porsche', model: 'Boxster', variant: '2.7', title: 'Porsche Boxster 2.7', price: 9995, year: 2007, ownerCompanyId: CHRIS }),
        car({ id: 'cayman-chris', make: 'Porsche', model: 'Cayman', variant: '2.9', title: 'Porsche Cayman 2.9', price: 15995, year: 2010, ownerCompanyId: CHRIS }),
    ];
    (0, node_test_1.it)('gives a vague enquiry to the dealer whose car is still for sale', () => {
        const item = (0, search_1.matchEnquiryStock)(SITE, { text: 'porsche' });
        node_assert_1.strict.equal(item?.ownerCompanyId, CHRIS);
        node_assert_1.strict.equal(item?.status, 'available');
    });
    (0, node_test_1.it)('still picks the sold car when the customer names it outright', () => {
        // All one dealer's, so the answer turns on the car and not on the ambiguity
        // guard: somebody chasing the Taycan by name is asking about the Taycan.
        const mine = SITE.map(item => ({ ...item, ownerCompanyId: STEVE }));
        node_assert_1.strict.equal((0, search_1.matchEnquiryStock)(mine, { title: 'porsche taycan 4s' })?.id, 'taycan-sold');
    });
    (0, node_test_1.it)('prefers the car still for sale when the description fits both', () => {
        const mine = SITE.map(item => ({ ...item, ownerCompanyId: STEVE }));
        const item = (0, search_1.matchEnquiryStock)(mine, { text: 'porsche' });
        node_assert_1.strict.equal(item?.status, 'available');
    });
    (0, node_test_1.it)('keeps refusing when the live cars belong to different dealers', () => {
        const split = [
            { ...SITE[1] },
            { ...SITE[2], ownerCompanyId: STEVE },
        ];
        node_assert_1.strict.equal((0, search_1.matchEnquiryStock)(split, { text: 'porsche' }), null);
    });
});
(0, node_test_1.describe)('a car that has already gone', () => {
    /** The Boxsters as they really are on the site: the 2007 is reserved. */
    const BOXSTERS = [
        car({ id: 'boxster-09', make: 'Porsche', model: 'Boxster', variant: '2.9', title: 'Porsche Boxster 2.9', price: 12995, year: 2009, colour: 'Blue', bodyType: 'Convertible', status: 'sold' }),
        car({ id: 'boxster-07-blue', make: 'Porsche', model: 'Boxster', variant: '2.7', title: 'Porsche Boxster 2.7', price: 9995, year: 2007, colour: 'Blue', bodyType: 'Convertible', status: 'reserved' }),
        car({ id: 'boxster-03', make: 'Porsche', model: 'Boxster', variant: '2.7', title: 'Porsche Boxster 2.7', price: 8995, year: 2003, colour: 'Red', bodyType: 'Convertible' }),
        car({ id: 'boxster-02', make: 'Porsche', model: 'Boxster', variant: '3.2 S', title: 'Porsche Boxster 3.2 S', price: 10995, year: 2002, colour: 'Black', bodyType: 'Convertible' }),
    ];
    (0, node_test_1.it)('hides it from the everyday search', () => {
        node_assert_1.strict.deepEqual(ids((0, search_1.rankStock)(BOXSTERS, { text: 'blue 2007 boxster' })), []);
    });
    (0, node_test_1.it)('gives it up under includeReserved, so it can be said out loud', () => {
        const hits = (0, search_1.rankStock)(BOXSTERS, { text: 'blue 2007 boxster', includeReserved: true });
        node_assert_1.strict.deepEqual(ids(hits), ['boxster-07-blue']);
        node_assert_1.strict.equal(hits[0].matchQuality, 'exact');
        node_assert_1.strict.equal(hits[0].status, 'reserved');
    });
    (0, node_test_1.it)('leaves two available Boxsters to offer beside it', () => {
        const alternatives = (0, search_1.rankStock)(BOXSTERS, { text: 'boxster' });
        node_assert_1.strict.deepEqual(ids(alternatives).sort(), ['boxster-02', 'boxster-03']);
    });
});
(0, node_test_1.describe)('describeStockItem', () => {
    (0, node_test_1.it)('writes the line the agent reads back to the customer', () => {
        node_assert_1.strict.equal((0, search_1.describeStockItem)(BOXSTER_07), '2007 Porsche Boxster 3.4 S Tiptronic, Black, 62,000 miles, £10,995 (reg BC02YDG), 3 previous owners');
    });
    (0, node_test_1.it)('says when the car is no longer available', () => {
        node_assert_1.strict.equal((0, search_1.describeStockItem)({ ...BOXSTER_01, status: 'reserved' }), '2001 Porsche Boxster 2.7, Black, 96,400 miles, £5,995 (reg Y421HTM), 5 previous owners, currently reserved');
    });
});
(0, node_test_1.describe)('model names the site prints with a space', () => {
    (0, node_test_1.it)('finds the 370 Z when the customer writes 370Z', () => {
        const items = [
            { id: 'z', title: 'Nissan 370 Z 3.7 V6 Nismo', make: 'Nissan', model: '370 Z', variant: '3.7 V6 Nismo', price: 20000, status: 'available' },
            { id: 'a', title: 'Vauxhall Astra GTC 1.4', make: 'Vauxhall', model: 'Astra GTC', variant: '1.4', price: 5000, status: 'available', description: 'Cat S repaired' },
        ];
        const hits = (0, search_1.rankStock)(items, { text: 'your Nissan 370Z, what does category S mean' });
        node_assert_1.strict.equal(hits[0]?.id, 'z');
        node_assert_1.strict.notEqual(hits[0]?.matchQuality, 'weak');
        node_assert_1.strict.ok(!hits.some(h => h.id === 'a'));
    });
});
(0, node_test_1.describe)('a follow-up that names a different car', () => {
    const ASTRA = car({ id: 'astra', make: 'Vauxhall', model: 'Astra GTC', variant: '1.4 i Turbo', title: 'Vauxhall Astra GTC 1.4 i Turbo', reg: 'BV17OSY', description: 'Hope you like it. Chris and Steve will be happy to help.' });
    const TAYCAN = car({ id: 'taycan', make: 'Porsche', model: 'Taycan', variant: '4S', title: 'Porsche Taycan 4S', status: 'sold' });
    const MX5_LIVE = car({ id: 'mx5-live', make: 'Mazda', model: 'MX-5', variant: 'Convertible', title: 'Mazda MX-5 Convertible', ownerCompanyId: 'steve' });
    const MX5_GONE = car({ id: 'mx5-gone', make: 'Mazda', model: 'MX-5', variant: '1.5 SKYACTIV-G Sport Nav', title: 'Mazda MX-5 1.5 SKYACTIV-G Sport Nav', status: 'sold', ownerCompanyId: 'chris', description: 'Hope all is well with this lovely car, would suit anyone, possible to view today.' });
    const STOCK = [ASTRA, TAYCAN, MX5_LIVE, MX5_GONE];
    (0, node_test_1.it)('"would it be possible to view the MX5 today" is the MX-5 for sale, not the Astra', () => {
        const text = 'Hi Chris / Steve, Hope all is well! Would it be possible to view the MX5 today? Thanks';
        node_assert_1.strict.equal((0, search_1.matchEnquiryStock)(STOCK, { text })?.id, 'mx5-live');
        node_assert_1.strict.deepEqual((0, search_1.rankStock)(STOCK, { text, includeHidden: true, limit: 5 }).filter(h => h.matchQuality !== 'weak').map(h => h.id), ['mx5-live']);
    });
    (0, node_test_1.it)('a chatty message with no car in it names nothing', () => {
        for (const text of ['Can I come and see it tomorrow?', 'Is the roof operating ok?', 'Hope all is well!']) {
            node_assert_1.strict.equal((0, search_1.matchEnquiryStock)(STOCK, { text }), null, text);
        }
    });
});
//# sourceMappingURL=search.test.js.map