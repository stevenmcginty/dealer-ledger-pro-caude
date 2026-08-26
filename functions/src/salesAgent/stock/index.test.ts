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

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { LedgerVehicle, matchToLedger } from './index';
import type { ScrapedStockItem } from './scrape';

const US = 'company-steve';
const THEM = 'company-chris';

const vehicle = (over: Partial<LedgerVehicle> & { id: string; companyId: string }): LedgerVehicle => ({
    make: 'Ford',
    model: 'Focus',
    year: 2017,
    ...over,
});

const advert = (over: Partial<ScrapedStockItem> & { id: string }): ScrapedStockItem => ({
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
const sharing = (over: Record<string, boolean> = {}) =>
    new Map<string, boolean>(Object.entries({ [US]: true, [THEM]: true, ...over }));

const run = (
    items: ScrapedStockItem[],
    vehicles: LedgerVehicle[],
    over: Partial<Parameters<typeof matchToLedger>[2]> = {}
) => matchToLedger(items, vehicles, {
    companyId: US,
    sharesStock: sharing(),
    unmatchedStockPolicy: 'include',
    ...over,
});

describe('ownership across the shared website', () => {
    it('matches a reg held by another company and records whose car it is', () => {
        const [item] = run(
            [advert({ id: '1', reg: 'YE17 ABC' })],
            [vehicle({ id: 'v-chris', companyId: THEM, reg: 'ye17abc' })]
        );

        assert.equal(item.ledgerVehicleId, 'v-chris');
        assert.equal(item.ownerCompanyId, THEM);
        assert.equal(item.hiddenReason, undefined);
    });

    it('gives a reg both companies hold to the company being indexed', () => {
        const [item] = run(
            [advert({ id: '1', reg: 'YE17ABC' })],
            [
                vehicle({ id: 'v-chris', companyId: THEM, reg: 'YE17ABC' }),
                vehicle({ id: 'v-steve', companyId: US, reg: 'YE17ABC' }),
            ]
        );

        assert.equal(item.ledgerVehicleId, 'v-steve');
        assert.equal(item.ownerCompanyId, US);
    });

    it('takes the status from whichever account owns the car', () => {
        const [item] = run(
            [advert({ id: '1', reg: 'YE17ABC', status: 'available' })],
            [vehicle({ id: 'v-chris', companyId: THEM, reg: 'YE17ABC', status: 'Deposit Paid' })]
        );

        assert.equal(item.status, 'reserved');
    });

    it('prefers our own car when the fallback match is ambiguous', () => {
        const [item] = run(
            [advert({ id: '1', mileage: 48000 })],
            [
                vehicle({ id: 'v-chris', companyId: THEM, mileage: 48200 }),
                vehicle({ id: 'v-steve', companyId: US, mileage: 48200 }),
            ]
        );

        assert.equal(item.ownerCompanyId, US);
    });

    it('claims each ledger vehicle once, even with the same id in two accounts', () => {
        const items = run(
            [advert({ id: '1', mileage: 48000 }), advert({ id: '2', mileage: 48000 })],
            [
                vehicle({ id: 'same-id', companyId: US, mileage: 48200 }),
                vehicle({ id: 'same-id', companyId: THEM, mileage: 48200 }),
            ]
        );

        assert.deepEqual(items.map(item => item.ownerCompanyId), [US, THEM]);
    });
});

describe('cars the agent must not discuss', () => {
    it("hides another dealer's car when that dealer has opted out", () => {
        const [item] = run(
            [advert({ id: '1', reg: 'YE17ABC' })],
            [vehicle({ id: 'v-chris', companyId: THEM, reg: 'YE17ABC' })],
            { sharesStock: sharing({ [THEM]: false }) }
        );

        assert.equal(item.ownerCompanyId, THEM);
        assert.equal(item.hiddenReason, 'owner_opted_out');
    });

    it('hides our own cars too when we have opted out', () => {
        const [item] = run(
            [advert({ id: '1', reg: 'YE17ABC' })],
            [vehicle({ id: 'v-steve', companyId: US, reg: 'YE17ABC' })],
            { sharesStock: sharing({ [US]: false }) }
        );

        assert.equal(item.hiddenReason, 'owner_opted_out');
    });

    it('treats a company with no answer as sharing', () => {
        const [item] = run(
            [advert({ id: '1', reg: 'YE17ABC' })],
            [vehicle({ id: 'v-chris', companyId: THEM, reg: 'YE17ABC' })],
            { sharesStock: new Map() }
        );

        assert.equal(item.hiddenReason, undefined);
    });

    it('keeps a car no account claims when the policy is include', () => {
        const [item] = run([advert({ id: '1', reg: 'AB12CDE' })], []);

        assert.equal(item.ledgerVehicleId, undefined);
        assert.equal(item.ownerCompanyId, undefined);
        assert.equal(item.hiddenReason, undefined);
    });

    it('hides a car no account claims when the policy is exclude', () => {
        const [item] = run([advert({ id: '1', reg: 'AB12CDE' })], [], {
            unmatchedStockPolicy: 'exclude',
        });

        assert.equal(item.hiddenReason, 'unmatched_excluded');
    });

    it('does not hide a matched car just because the policy excludes strays', () => {
        const items = run(
            [advert({ id: '1', reg: 'YE17ABC' }), advert({ id: '2', reg: 'AB12CDE', make: 'Kia', model: 'Sportage' })],
            [vehicle({ id: 'v-chris', companyId: THEM, reg: 'YE17ABC' })],
            { unmatchedStockPolicy: 'exclude' }
        );

        assert.deepEqual(items.map(item => item.hiddenReason), [undefined, 'unmatched_excluded']);
    });
});
