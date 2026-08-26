"use strict";
/**
 * Daily stock indexer for the AI sales agent.
 *
 * Scrapes the dealership's public website once a day, matches each advert back to
 * the ledger's own vehicle record where it can, and stores the result under
 * `companies/{companyId}/salesAgent/stock`. The agent answers stock questions
 * from that copy, so it never has to hit the website mid-conversation.
 *
 * One website can be shared by several ledger accounts (radlettcarsales.com is
 * Steve's and Chris/Tommy's), so every advert is matched against EVERY company's
 * vehicles and stamped with the account that owns it. A car whose owner has
 * switched `shareStockWithAgent` off, and — when this company's
 * `unmatchedStockPolicy` is 'exclude' — a car no account claims at all, is stored
 * with a `hiddenReason` and never handed to the agent.
 *
 * Two rules govern the write:
 *   - the stock branch is replaced wholesale, so a car that has left the site
 *     leaves the index too;
 *   - a scrape that yields nothing is treated as a failure, not as an empty
 *     forecourt: the previous index is left alone and the reason is recorded in
 *     stockMeta.errors.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.runSalesAgentStockIndexNow = exports.refreshSalesAgentStock = exports.indexStock = exports.matchToLedger = void 0;
const functions = __importStar(require("firebase-functions/v1"));
const admin = __importStar(require("firebase-admin"));
const lookup_1 = require("../../vehicle/lookup");
const companyIds_1 = require("../../utils/companyIds");
const scrape_1 = require("./scrape");
const db = () => admin.database();
/** Used when a company has no stockListUrl of its own yet. */
const DEFAULT_STOCK_LIST_URL = 'https://radlettcarsales.com/used/cars/radlett/';
/**
 * The function is allowed 540s; the scrape stops starting requests well before
 * that so there is always room to match against the ledger and write the result.
 */
const SCRAPE_BUDGET_MS = 270000;
/** Two vehicles of the same make/model/year are only the same car if the odometer agrees. */
const MILEAGE_TOLERANCE = 2000;
const errorMessage = (error) => error instanceof Error ? error.message : String(error);
/** RTDB rejects undefined outright, so optional fields have to be dropped, not written empty. */
const stripUndefined = (value) => Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined));
const readSettings = async (companyId) => {
    const snap = await db().ref(`companies/${companyId}/salesAgent/settings`).once('value');
    return snap.val() || {};
};
/**
 * Every company's vehicles, tagged with the account that owns them, and each
 * account's answer to "may the agent talk about my cars".
 *
 * Only the six fields the matcher and the status override actually use are kept:
 * a vehicle record carries costs, documents and photos that have no business
 * anywhere near the agent, and there can be thousands of them.
 *
 * The company being indexed is always in the list, even if the shallow read of
 * /companies came back empty — losing everyone else's cars degrades to the old
 * single-company behaviour, losing our own would empty the forecourt.
 */
const readLedgerSnapshot = async (indexingCompanyId) => {
    const companyIds = Array.from(new Set([indexingCompanyId, ...(await (0, companyIds_1.getCompanyIds)())]));
    const vehicles = [];
    const sharesStock = new Map();
    await Promise.all(companyIds.map(async (companyId) => {
        const [vehicleSnap, shareSnap, enabledSnap] = await Promise.all([
            db().ref(`companies/${companyId}/vehicles`).once('value'),
            db().ref(`companies/${companyId}/salesAgent/settings/shareStockWithAgent`).once('value'),
            db().ref(`companies/${companyId}/salesAgent/settings/enabled`).once('value'),
        ]);
        // Opt-in (Steve, 26 Aug): a company's cars are only usable by the agent when that
        // company has switched the assistant on AND has not turned sharing off.
        sharesStock.set(companyId, enabledSnap.val() === true && shareSnap.val() !== false);
        const raw = vehicleSnap.val();
        if (!raw)
            return;
        for (const [id, vehicle] of Object.entries(raw)) {
            vehicles.push({
                id,
                companyId,
                reg: vehicle.reg,
                make: vehicle.make,
                model: vehicle.model,
                year: vehicle.year,
                mileage: vehicle.mileage,
                status: vehicle.status,
            });
        }
    }));
    return { vehicles, sharesStock };
};
const modelKey = (make, model, year) => `${String(make || '').toLowerCase().trim()}|${String(model || '').toLowerCase().trim()}|${year ?? ''}`;
/** How the ledger's own view of a car overrides whatever the website is showing. */
const statusFromLedger = (status) => {
    if (status === 'Sold')
        return 'sold';
    if (status === 'Deposit Paid')
        return 'reserved';
    if (status === 'Available')
        return 'available';
    return undefined;
};
/** Vehicle ids are per-account, so a claim has to name the account too. */
const vehicleKey = (vehicle) => `${vehicle.companyId}/${vehicle.id}`;
/**
 * Attach the ledger vehicle each advert belongs to, across every account sharing
 * the website, and work out whether the agent is allowed to discuss it.
 *
 * Registration is the only identifier both sides really share, but the website
 * only prints it for some cars, so make + model + year is the fallback — with the
 * mileage as a tie-break, because a dealer can easily have two of the same car.
 * Either way the account being indexed is tried first: a plate that appears in
 * two ledgers is far more likely to be our own car than the other dealer's.
 */
const matchToLedger = (items, vehicles, options) => {
    const isOurs = (vehicle) => vehicle.companyId === options.companyId;
    const shared = (companyId) => options.sharesStock.get(companyId) !== false;
    const byReg = new Map();
    const byModel = new Map();
    for (const vehicle of vehicles) {
        const reg = (0, lookup_1.normaliseReg)(vehicle.reg || '');
        if (reg) {
            const held = byReg.get(reg);
            if (!held || (isOurs(vehicle) && !isOurs(held)))
                byReg.set(reg, vehicle);
        }
        const key = modelKey(vehicle.make, vehicle.model, vehicle.year);
        const bucket = byModel.get(key);
        if (bucket)
            bucket.push(vehicle);
        else
            byModel.set(key, [vehicle]);
    }
    // Same preference for the fuzzy fallback: our own cars ahead of the neighbours'.
    for (const bucket of byModel.values())
        bucket.sort((a, b) => Number(isOurs(b)) - Number(isOurs(a)));
    const claimed = new Set();
    const indexedAt = Date.now();
    return items.map(item => {
        const reg = (0, lookup_1.normaliseReg)(item.reg || '');
        let match = reg ? byReg.get(reg) : undefined;
        if (!match) {
            const candidates = (byModel.get(modelKey(item.make, item.model, item.year)) || [])
                .filter(vehicle => !claimed.has(vehicleKey(vehicle)));
            match = candidates.find(vehicle => item.mileage === undefined ||
                vehicle.mileage === undefined ||
                Math.abs(vehicle.mileage - item.mileage) <= MILEAGE_TOLERANCE);
        }
        if (!match) {
            // No account claims this one. It is either a car nobody has booked into a
            // ledger yet or a plate the site never printed, so it is the indexing
            // company's call whether the agent may sell it.
            return options.unmatchedStockPolicy === 'exclude'
                ? { ...item, hiddenReason: 'unmatched_excluded', indexedAt }
                : { ...item, indexedAt };
        }
        claimed.add(vehicleKey(match));
        const hiddenReason = shared(match.companyId) ? undefined : 'owner_opted_out';
        return {
            ...item,
            ledgerVehicleId: match.id,
            ownerCompanyId: match.companyId,
            ...(hiddenReason ? { hiddenReason } : {}),
            status: statusFromLedger(match.status) ?? item.status,
            indexedAt,
        };
    });
};
exports.matchToLedger = matchToLedger;
/**
 * Re-index one company's stock. Returns the meta record that was written, so the
 * manual "index now" button can show the outcome without a second read.
 */
const indexStock = async (companyId) => {
    const startedAt = Date.now();
    const settings = await readSettings(companyId);
    const sourceUrl = settings.stockListUrl || DEFAULT_STOCK_LIST_URL;
    const errors = [];
    let items = [];
    try {
        const scraped = await (0, scrape_1.scrapeStock)({ stockListUrl: sourceUrl, deadline: startedAt + SCRAPE_BUDGET_MS });
        errors.push(...scraped.errors);
        const { vehicles, sharesStock } = await readLedgerSnapshot(companyId);
        items = (0, exports.matchToLedger)(scraped.items, vehicles, {
            companyId,
            sharesStock,
            unmatchedStockPolicy: settings.unmatchedStockPolicy === 'exclude' ? 'exclude' : 'include',
        });
        console.log(`Company ${companyId}: scraped ${scraped.items.length} vehicles from ${scraped.pagesFetched} pages, ` +
            `${items.filter(item => item.ledgerVehicleId).length} matched to a ledger account across ` +
            `${sharesStock.size} companies, ${items.filter(item => item.hiddenReason).length} hidden from the agent`);
    }
    catch (error) {
        errors.push(`Stock scrape failed: ${errorMessage(error)}`);
        console.error(`Company ${companyId}: stock scrape failed`, error);
    }
    const meta = {
        lastIndexedAt: Date.now(),
        count: items.length,
        availableCount: items.filter(item => item.status === 'available').length,
        sourceUrl,
        errors,
        durationMs: Date.now() - startedAt,
    };
    if (!items.length) {
        // Never let a bad scrape empty the forecourt — the agent would start telling
        // customers we have nothing. Keep yesterday's index and say why it's stale.
        const previous = await db().ref(`companies/${companyId}/salesAgent/stockMeta`).once('value');
        const previousCount = previous.val()?.count ?? 0;
        meta.errors = [...errors, 'Scrape returned no vehicles; the previous index was kept'];
        meta.count = previousCount;
        meta.availableCount = previous.val()?.availableCount ?? 0;
        await db().ref(`companies/${companyId}/salesAgent/stockMeta`).set(meta);
        console.error(`Company ${companyId}: stock scrape returned nothing, kept the previous ${previousCount} vehicles`);
        return meta;
    }
    const stock = {};
    for (const item of items)
        stock[item.id] = stripUndefined(item);
    await db().ref(`companies/${companyId}/salesAgent`).update({ stock, stockMeta: meta });
    console.log(`Company ${companyId}: indexed ${meta.count} vehicles (${meta.availableCount} available) ` +
        `in ${Math.round(meta.durationMs / 1000)}s, ${meta.errors.length} problems`);
    return meta;
};
exports.indexStock = indexStock;
/** Companies that have actually switched the sales agent on. */
const enabledCompanyIds = async () => {
    const companyIds = await (0, companyIds_1.getCompanyIds)();
    const enabled = [];
    for (const companyId of companyIds) {
        const snap = await db().ref(`companies/${companyId}/salesAgent/settings/enabled`).once('value');
        if (snap.val() === true)
            enabled.push(companyId);
    }
    return enabled;
};
/**
 * Scheduled re-index — 06:00 UK, so the day's stock is current before the first
 * enquiry of the morning.
 */
exports.refreshSalesAgentStock = functions
    .runWith({ timeoutSeconds: 540, memory: '512MB' })
    .pubsub.schedule('0 6 * * *')
    .timeZone('Europe/London')
    .onRun(async () => {
    const companyIds = await enabledCompanyIds();
    console.log(`Starting sales agent stock index for ${companyIds.length} companies`);
    for (const companyId of companyIds) {
        try {
            await (0, exports.indexStock)(companyId);
        }
        catch (error) {
            // One company's website being down shouldn't stop the rest.
            console.error(`Company ${companyId}: stock index failed`, error);
        }
    }
    return null;
});
/** Manual "index now" — from Settings, or from Steve texting STOCK on WhatsApp. */
exports.runSalesAgentStockIndexNow = functions
    .runWith({ timeoutSeconds: 540, memory: '512MB' })
    .https.onCall(async (_data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }
    const uid = context.auth.uid;
    const companySnap = await db().ref(`users/${uid}/companyId`).once('value');
    const companyId = companySnap.val();
    if (!companyId) {
        throw new functions.https.HttpsError('failed-precondition', 'No company is linked to this account');
    }
    // The pointer must be backed by membership, or a repointed users/{uid}/companyId
    // would re-index somebody else's stock.
    const member = await db().ref(`companies/${companyId}/users/${uid}`).once('value');
    if (!member.exists()) {
        throw new functions.https.HttpsError('permission-denied', 'You do not have access to this company');
    }
    try {
        return await (0, exports.indexStock)(companyId);
    }
    catch (error) {
        console.error(`Manual stock index failed for company ${companyId}:`, error);
        throw new functions.https.HttpsError('internal', 'Stock index failed');
    }
});
//# sourceMappingURL=index.js.map