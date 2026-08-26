"use strict";
/**
 * Shared-inbox placement: whose Dealer Ledger Pro a lead belongs in when Steve
 * and Chris share a website, a Gmail, and a WhatsApp number, but not the cars.
 *
 *   cd functions && npx tsc && node --test lib/salesAgent/inboxRouting.test.js
 *
 * No Firebase. pickHomeCompany is the pure rule; matchEnquiryStock is tested in
 * stock/search.test.ts.
 */
Object.defineProperty(exports, "__esModule", { value: true });
const node_assert_1 = require("node:assert");
const node_test_1 = require("node:test");
const inboxRouting_1 = require("./inboxRouting");
const STEVE = 'company-steve';
const CHRIS = 'company-chris';
const inbox = (over = {}) => ({
    id: 'radlett',
    credentialCompanyId: STEVE,
    memberCompanyIds: [STEVE, CHRIS],
    fallbackCompanyId: STEVE,
    whatsappLive: false,
    createdAt: 0,
    updatedAt: 0,
    ...over,
});
const car = (ownerCompanyId) => ({
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
(0, node_test_1.describe)('pickHomeCompany', () => {
    (0, node_test_1.it)('stays on the webhook company when there is no shared inbox', () => {
        const home = (0, inboxRouting_1.pickHomeCompany)({
            inbox: null,
            credentialCompanyId: STEVE,
            existing: null,
            stockItem: car(CHRIS),
        });
        node_assert_1.strict.equal(home.companyId, STEVE);
        node_assert_1.strict.equal(home.reason, 'single');
    });
    (0, node_test_1.it)('puts a new enquiry on the ledger that owns the car', () => {
        const home = (0, inboxRouting_1.pickHomeCompany)({
            inbox: inbox(),
            credentialCompanyId: STEVE,
            existing: null,
            stockItem: car(CHRIS),
        });
        node_assert_1.strict.equal(home.companyId, CHRIS);
        node_assert_1.strict.equal(home.reason, 'owner');
        node_assert_1.strict.equal(home.ownerCompanyId, CHRIS);
    });
    (0, node_test_1.it)('keeps Steve\'s car in Steve\'s inbox', () => {
        const home = (0, inboxRouting_1.pickHomeCompany)({
            inbox: inbox(),
            credentialCompanyId: STEVE,
            existing: null,
            stockItem: car(STEVE),
        });
        node_assert_1.strict.equal(home.companyId, STEVE);
        node_assert_1.strict.equal(home.reason, 'owner');
    });
    (0, node_test_1.it)('parks an unmatched enquiry in the fallback inbox, not a guess', () => {
        const home = (0, inboxRouting_1.pickHomeCompany)({
            inbox: inbox(),
            credentialCompanyId: STEVE,
            existing: null,
            stockItem: null,
        });
        node_assert_1.strict.equal(home.companyId, STEVE);
        node_assert_1.strict.equal(home.reason, 'fallback');
    });
    (0, node_test_1.it)('does not move a thread that already has a home, even if they then name the other dealer\'s car', () => {
        const home = (0, inboxRouting_1.pickHomeCompany)({
            inbox: inbox(),
            credentialCompanyId: STEVE,
            existing: { companyId: STEVE, convId: 'conv-1' },
            stockItem: car(CHRIS),
        });
        node_assert_1.strict.equal(home.companyId, STEVE);
        node_assert_1.strict.equal(home.convId, 'conv-1');
        node_assert_1.strict.equal(home.reason, 'existing');
    });
    (0, node_test_1.it)('falls back when the owner is not a member of this inbox', () => {
        const home = (0, inboxRouting_1.pickHomeCompany)({
            inbox: inbox(),
            credentialCompanyId: STEVE,
            existing: null,
            stockItem: car('someone-else'),
        });
        node_assert_1.strict.equal(home.companyId, STEVE);
        node_assert_1.strict.equal(home.reason, 'fallback');
        node_assert_1.strict.equal(home.ownerCompanyId, 'someone-else');
    });
});
//# sourceMappingURL=inboxRouting.test.js.map