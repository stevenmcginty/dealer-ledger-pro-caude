/**
 * Shared-inbox placement: whose Dealer Ledger Pro a lead belongs in when Steve
 * and Chris share a website, a Gmail, and a WhatsApp number, but not the cars.
 *
 *   cd functions && npx tsc && node --test lib/salesAgent/inboxRouting.test.js
 *
 * No Firebase. pickHomeCompany is the pure rule; matchEnquiryStock is tested in
 * stock/search.test.ts.
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { pickHomeCompany } from './inboxRouting';
import type { SharedInbox, StockItem } from './types';

const STEVE = 'company-steve';
const CHRIS = 'company-chris';

const inbox = (over: Partial<SharedInbox> = {}): SharedInbox => ({
    id: 'radlett',
    credentialCompanyId: STEVE,
    memberCompanyIds: [STEVE, CHRIS],
    fallbackCompanyId: STEVE,
    whatsappLive: false,
    createdAt: 0,
    updatedAt: 0,
    ...over,
});

const car = (ownerCompanyId: string): StockItem => ({
    id: 'focus-17',
    url: 'https://radlettcarsales.com/used/cars/focus-17/',
    make: 'Ford',
    model: 'Focus',
    variant: 'ST-3',
    title: 'Ford Focus ST-3',
    price: 12995,
    status: 'available',
    indexedAt: 0,
    ownerCompanyId,
});

describe('pickHomeCompany', () => {
    it('stays on the webhook company when there is no shared inbox', () => {
        const home = pickHomeCompany({
            inbox: null,
            credentialCompanyId: STEVE,
            existing: null,
            stockItem: car(CHRIS),
        });

        assert.equal(home.companyId, STEVE);
        assert.equal(home.reason, 'single');
    });

    it('puts a new enquiry on the ledger that owns the car', () => {
        const home = pickHomeCompany({
            inbox: inbox(),
            credentialCompanyId: STEVE,
            existing: null,
            stockItem: car(CHRIS),
        });

        assert.equal(home.companyId, CHRIS);
        assert.equal(home.reason, 'owner');
        assert.equal(home.ownerCompanyId, CHRIS);
    });

    it('keeps Steve\'s car in Steve\'s inbox', () => {
        const home = pickHomeCompany({
            inbox: inbox(),
            credentialCompanyId: STEVE,
            existing: null,
            stockItem: car(STEVE),
        });

        assert.equal(home.companyId, STEVE);
        assert.equal(home.reason, 'owner');
    });

    it('parks an unmatched enquiry in the fallback inbox, not a guess', () => {
        const home = pickHomeCompany({
            inbox: inbox(),
            credentialCompanyId: STEVE,
            existing: null,
            stockItem: null,
        });

        assert.equal(home.companyId, STEVE);
        assert.equal(home.reason, 'fallback');
    });

    it('does not move a thread that already has a home, even if they then name the other dealer\'s car', () => {
        const home = pickHomeCompany({
            inbox: inbox(),
            credentialCompanyId: STEVE,
            existing: { companyId: STEVE, convId: 'conv-1' },
            stockItem: car(CHRIS),
        });

        assert.equal(home.companyId, STEVE);
        assert.equal(home.convId, 'conv-1');
        assert.equal(home.reason, 'existing');
    });

    it('falls back when the owner is not a member of this inbox', () => {
        const home = pickHomeCompany({
            inbox: inbox(),
            credentialCompanyId: STEVE,
            existing: null,
            stockItem: car('someone-else'),
        });

        assert.equal(home.companyId, STEVE);
        assert.equal(home.reason, 'fallback');
        assert.equal(home.ownerCompanyId, 'someone-else');
    });
});
