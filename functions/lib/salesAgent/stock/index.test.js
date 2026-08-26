"use strict";
/**
 * Matcher tests, run with the Node test runner that ships with Node 20:
 *
 *   cd functions && npx tsc && node --test lib/salesAgent/stock/index.test.js
 *
 * These cover the shared-website rules in docs/sales-agent/SPEC.md ("Shared
 * website, several ledger accounts"): who a scraped car belongs to when two
 * dealers advertise on one site, and when the agent is not allowed to discuss it.
 * No Firebase and no network — matchToLedger is handed a stub of two companies.
 */
Object.defineProperty(exports, "__esModule", { value: true });
const node_assert_1 = require("node:assert");
const node_test_1 = require("node:test");
const index_1 = require("./index");
const US = 'company-steve';
const THEM = 'company-chris';
const vehicle = (over) => ({
    make: 'Ford',
    model: 'Focus',
    year: 2017,
    ...over,
});
const advert = (over) => ({
    url: `https://radlettcarsales.com/used/cars/${over.id}/`,
    make: 'Ford',
    model: 'Focus',
    variant: '2.0T EcoBoost ST-3',
    title: 'Ford Focus 2.0T EcoBoost ST-3',
    price: 12995,
    year: 2017,
    status: 'available',
    ...over,
});
/** Both accounts happy to be sold by either agent, unless a test says otherwise. */
const sharing = (over = {}) => new Map(Object.entries({ [US]: true, [THEM]: true, ...over }));
const run = (items, vehicles, over = {}) => (0, index_1.matchToLedger)(items, vehicles, {
    companyId: US,
    sharesStock: sharing(),
    unmatchedStockPolicy: 'include',
    ...over,
});
(0, node_test_1.describe)('ownership across the shared website', () => {
    (0, node_test_1.it)('matches a reg held by another company and records whose car it is', () => {
        const [item] = run([advert({ id: '1', reg: 'YE17 ABC' })], [vehicle({ id: 'v-chris', companyId: THEM, reg: 'ye17abc' })]);
        node_assert_1.strict.equal(item.ledgerVehicleId, 'v-chris');
        node_assert_1.strict.equal(item.ownerCompanyId, THEM);
        node_assert_1.strict.equal(item.hiddenReason, undefined);
    });
    (0, node_test_1.it)('gives a reg both companies hold to the company being indexed', () => {
        const [item] = run([advert({ id: '1', reg: 'YE17ABC' })], [
            vehicle({ id: 'v-chris', companyId: THEM, reg: 'YE17ABC' }),
            vehicle({ id: 'v-steve', companyId: US, reg: 'YE17ABC' }),
        ]);
        node_assert_1.strict.equal(item.ledgerVehicleId, 'v-steve');
        node_assert_1.strict.equal(item.ownerCompanyId, US);
    });
    (0, node_test_1.it)('takes the status from whichever account owns the car', () => {
        const [item] = run([advert({ id: '1', reg: 'YE17ABC', status: 'available' })], [vehicle({ id: 'v-chris', companyId: THEM, reg: 'YE17ABC', status: 'Deposit Paid' })]);
        node_assert_1.strict.equal(item.status, 'reserved');
    });
    (0, node_test_1.it)('prefers our own car when the fallback match is ambiguous', () => {
        const [item] = run([advert({ id: '1', mileage: 48000 })], [
            vehicle({ id: 'v-chris', companyId: THEM, mileage: 48200 }),
            vehicle({ id: 'v-steve', companyId: US, mileage: 48200 }),
        ]);
        node_assert_1.strict.equal(item.ownerCompanyId, US);
    });
    (0, node_test_1.it)('claims each ledger vehicle once, even with the same id in two accounts', () => {
        const items = run([advert({ id: '1', mileage: 48000 }), advert({ id: '2', mileage: 48000 })], [
            vehicle({ id: 'same-id', companyId: US, mileage: 48200 }),
            vehicle({ id: 'same-id', companyId: THEM, mileage: 48200 }),
        ]);
        node_assert_1.strict.deepEqual(items.map(item => item.ownerCompanyId), [US, THEM]);
    });
});
(0, node_test_1.describe)('cars the agent must not discuss', () => {
    (0, node_test_1.it)("hides another dealer's car when that dealer has opted out", () => {
        const [item] = run([advert({ id: '1', reg: 'YE17ABC' })], [vehicle({ id: 'v-chris', companyId: THEM, reg: 'YE17ABC' })], { sharesStock: sharing({ [THEM]: false }) });
        node_assert_1.strict.equal(item.ownerCompanyId, THEM);
        node_assert_1.strict.equal(item.hiddenReason, 'owner_opted_out');
    });
    (0, node_test_1.it)('hides our own cars too when we have opted out', () => {
        const [item] = run([advert({ id: '1', reg: 'YE17ABC' })], [vehicle({ id: 'v-steve', companyId: US, reg: 'YE17ABC' })], { sharesStock: sharing({ [US]: false }) });
        node_assert_1.strict.equal(item.hiddenReason, 'owner_opted_out');
    });
    (0, node_test_1.it)('treats a company with no answer as sharing', () => {
        const [item] = run([advert({ id: '1', reg: 'YE17ABC' })], [vehicle({ id: 'v-chris', companyId: THEM, reg: 'YE17ABC' })], { sharesStock: new Map() });
        node_assert_1.strict.equal(item.hiddenReason, undefined);
    });
    (0, node_test_1.it)('keeps a car no account claims when the policy is include', () => {
        const [item] = run([advert({ id: '1', reg: 'AB12CDE' })], []);
        node_assert_1.strict.equal(item.ledgerVehicleId, undefined);
        node_assert_1.strict.equal(item.ownerCompanyId, undefined);
        node_assert_1.strict.equal(item.hiddenReason, undefined);
    });
    (0, node_test_1.it)('hides a car no account claims when the policy is exclude', () => {
        const [item] = run([advert({ id: '1', reg: 'AB12CDE' })], [], {
            unmatchedStockPolicy: 'exclude',
        });
        node_assert_1.strict.equal(item.hiddenReason, 'unmatched_excluded');
    });
    (0, node_test_1.it)('does not hide a matched car just because the policy excludes strays', () => {
        const items = run([advert({ id: '1', reg: 'YE17ABC' }), advert({ id: '2', reg: 'AB12CDE', make: 'Kia', model: 'Sportage' })], [vehicle({ id: 'v-chris', companyId: THEM, reg: 'YE17ABC' })], { unmatchedStockPolicy: 'exclude' });
        node_assert_1.strict.deepEqual(items.map(item => item.hiddenReason), [undefined, 'unmatched_excluded']);
    });
});
(0, node_test_1.describe)('ledger facts on the stock record', () => {
    (0, node_test_1.it)('formats an ISO MOT date the way Dave should say it', () => {
        node_assert_1.strict.equal((0, index_1.formatMotDate)('2027-03-15'), '15 March 2027');
    });
    (0, node_test_1.it)('fills MOT, ULEZ and colour from Motor Ledger Pro when the advert is thin', () => {
        const [item] = run([advert({ id: '1', reg: 'YE17ABC' })], [vehicle({
                id: 'v-steve',
                companyId: US,
                reg: 'YE17ABC',
                color: 'Race Red',
                motDueDate: '2027-03-15',
                ulezCompliant: true,
                advertisedPrice: 11995,
            })]);
        node_assert_1.strict.equal(item.colour, 'Race Red');
        node_assert_1.strict.equal(item.motExpiry, '15 March 2027');
        node_assert_1.strict.equal(item.ulezCompliant, true);
        node_assert_1.strict.equal(item.price, 12995);
    });
    (0, node_test_1.it)('does not let the ledger overwrite a live advert price', () => {
        const overlaid = (0, index_1.overlayLedgerFacts)({ ...advert({ id: '1', price: 12995, status: 'available' }), indexedAt: 0 }, vehicle({ id: 'v', companyId: US, advertisedPrice: 9999 }));
        node_assert_1.strict.equal(overlaid.price, 12995);
    });
    (0, node_test_1.it)('adds a ledger car that is not on the website', () => {
        const items = (0, index_1.mergeLedgerIntoIndex)([advert({ id: '1', reg: 'YE17ABC' })], [
            vehicle({ id: 'v-on-site', companyId: US, reg: 'YE17ABC' }),
            vehicle({ id: 'v-forecourt', companyId: US, make: 'Kia', model: 'Sportage', year: 2019, advertisedPrice: 14995, status: 'Available' }),
        ], { companyId: US, sharesStock: sharing(), unmatchedStockPolicy: 'include' });
        const extra = items.find(item => item.id === 'ledger-v-forecourt');
        node_assert_1.strict.ok(extra);
        node_assert_1.strict.equal(extra?.make, 'Kia');
        node_assert_1.strict.equal(extra?.price, 14995);
        node_assert_1.strict.equal(extra?.ledgerVehicleId, 'v-forecourt');
    });
    (0, node_test_1.it)('does not add a sold ledger car that is off the website', () => {
        const items = (0, index_1.mergeLedgerIntoIndex)([], [vehicle({ id: 'v-sold', companyId: US, status: 'Sold', make: 'Ford', model: 'Fiesta' })], { companyId: US, sharesStock: sharing(), unmatchedStockPolicy: 'include' });
        node_assert_1.strict.equal(items.length, 0);
    });
});
//# sourceMappingURL=index.test.js.map