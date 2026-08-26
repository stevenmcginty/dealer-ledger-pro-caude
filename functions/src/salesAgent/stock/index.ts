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

import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';

import { normaliseReg } from '../../vehicle/lookup';
import { getCompanyIds } from '../../utils/companyIds';
import { SalesAgentSettings, StockItem, StockMeta } from '../types';
import { ScrapedStockItem, scrapeStock } from './scrape';

const db = () => admin.database();

/** Used when a company has no stockListUrl of its own yet. */
const DEFAULT_STOCK_LIST_URL = 'https://radlettcarsales.com/used/cars/radlett/';

/**
 * The function is allowed 540s; the scrape stops starting requests well before
 * that so there is always room to match against the ledger and write the result.
 */
const SCRAPE_BUDGET_MS = 270_000;

/** Two vehicles of the same make/model/year are only the same car if the odometer agrees. */
const MILEAGE_TOLERANCE = 2000;

export interface LedgerVehicle {
    id: string;
    /** Which ledger account this vehicle belongs to. */
    companyId: string;
    reg?: string;
    make?: string;
    model?: string;
    year?: number;
    mileage?: number;
    status?: 'Available' | 'Deposit Paid' | 'Sold';
    /** Customer-safe facts from Motor Ledger Pro. Never purchasePrice. */
    color?: string;
    fuelType?: string;
    engineSize?: string;
    motDueDate?: string;
    motStatus?: string;
    taxStatus?: string;
    taxDueDate?: string;
    annualRoadTax?: number;
    estimatedMpg?: number;
    ulezCompliant?: boolean;
    advertisedPrice?: number | null;
}

/** Every account's vehicles in one list, plus who is willing to have theirs discussed. */
interface LedgerSnapshot {
    vehicles: LedgerVehicle[];
    /** companyId -> may the agent sell this company's cars (assistant enabled && sharing not off). */
    sharesStock: Map<string, boolean>;
}

const errorMessage = (error: unknown): string =>
    error instanceof Error ? error.message : String(error);

/** RTDB rejects undefined outright, so optional fields have to be dropped, not written empty. */
const stripUndefined = <T extends object>(value: T): T =>
    Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T;

const readSettings = async (companyId: string): Promise<Partial<SalesAgentSettings>> => {
    const snap = await db().ref(`companies/${companyId}/salesAgent/settings`).once('value');
    return (snap.val() as Partial<SalesAgentSettings> | null) || {};
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
const readLedgerSnapshot = async (indexingCompanyId: string): Promise<LedgerSnapshot> => {
    const companyIds = Array.from(new Set([indexingCompanyId, ...(await getCompanyIds())]));

    const vehicles: LedgerVehicle[] = [];
    const sharesStock = new Map<string, boolean>();

    await Promise.all(companyIds.map(async companyId => {
        const [vehicleSnap, shareSnap, enabledSnap] = await Promise.all([
            db().ref(`companies/${companyId}/vehicles`).once('value'),
            db().ref(`companies/${companyId}/salesAgent/settings/shareStockWithAgent`).once('value'),
            db().ref(`companies/${companyId}/salesAgent/settings/enabled`).once('value'),
        ]);

        // Opt-in (Steve, 26 Aug): a company's cars are only usable by the agent when that
        // company has switched the assistant on AND has not turned sharing off.
        sharesStock.set(companyId, enabledSnap.val() === true && shareSnap.val() !== false);

        const raw = vehicleSnap.val() as Record<string, Partial<LedgerVehicle>> | null;
        if (!raw) return;

        for (const [id, vehicle] of Object.entries(raw)) {
            const row = vehicle as Record<string, unknown>;
            const advertised = Number(row.advertisedPrice);
            vehicles.push({
                id,
                companyId,
                reg: vehicle.reg,
                make: vehicle.make,
                model: vehicle.model,
                year: vehicle.year,
                mileage: vehicle.mileage,
                status: vehicle.status,
                color: typeof row.color === 'string' ? row.color : undefined,
                fuelType: typeof row.fuelType === 'string' ? row.fuelType : undefined,
                engineSize: typeof row.engineSize === 'string' ? row.engineSize : undefined,
                motDueDate: typeof row.motDueDate === 'string' ? row.motDueDate : undefined,
                motStatus: typeof row.motStatus === 'string' ? row.motStatus : undefined,
                taxStatus: typeof row.taxStatus === 'string' ? row.taxStatus : undefined,
                taxDueDate: typeof row.taxDueDate === 'string' ? row.taxDueDate : undefined,
                annualRoadTax: Number.isFinite(Number(row.annualRoadTax)) ? Number(row.annualRoadTax) : undefined,
                estimatedMpg: Number.isFinite(Number(row.estimatedMpg)) ? Number(row.estimatedMpg) : undefined,
                ulezCompliant: typeof row.ulezCompliant === 'boolean' ? row.ulezCompliant : undefined,
                advertisedPrice: Number.isFinite(advertised) && advertised > 0 ? advertised : undefined,
            });
        }
    }));

    return { vehicles, sharesStock };
};

const modelKey = (make?: string, model?: string, year?: number): string =>
    `${String(make || '').toLowerCase().trim()}|${String(model || '').toLowerCase().trim()}|${year ?? ''}`;

/** How the ledger's own view of a car overrides whatever the website is showing. */
const statusFromLedger = (status?: LedgerVehicle['status']): StockItem['status'] | undefined => {
    if (status === 'Sold') return 'sold';
    if (status === 'Deposit Paid') return 'reserved';
    if (status === 'Available') return 'available';
    return undefined;
};

const firstString = (...values: Array<string | undefined>): string | undefined => {
    for (const value of values) {
        const trimmed = (value || '').trim();
        if (trimmed) return trimmed;
    }
    return undefined;
};

/** ISO `2027-03-15` or a UK date, as something Dave can say out loud. */
export const formatMotDate = (value?: string): string | undefined => {
    const trimmed = (value || '').trim();
    if (!trimmed) return undefined;
    const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(trimmed);
    if (iso) {
        const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
        const month = months[Number(iso[2]) - 1];
        return month ? `${Number(iso[3])} ${month} ${iso[1]}` : trimmed;
    }
    return trimmed;
};

/**
 * Fill gaps on a website advert from the Motor Ledger Pro record.
 *
 * The live advert wins on price, mileage and the blurb — that is what the customer
 * saw. MOT, tax, ULEZ and the DVLA facts live on the ledger and are the better
 * source. Purchase price never comes across.
 */
export const overlayLedgerFacts = (item: StockItem, match: LedgerVehicle): StockItem => {
    const motExpiry = firstString(formatMotDate(match.motDueDate), item.motExpiry);
    const price = item.price > 0 ? item.price : (match.advertisedPrice || 0);

    return {
        ...item,
        ledgerVehicleId: match.id,
        ownerCompanyId: match.companyId,
        status: statusFromLedger(match.status) ?? item.status,
        colour: firstString(item.colour, match.color),
        fuel: firstString(item.fuel, match.fuelType),
        engineSize: firstString(item.engineSize, match.engineSize),
        mileage: item.mileage && item.mileage > 0 ? item.mileage : match.mileage,
        year: item.year || match.year,
        make: firstString(item.make, match.make) || item.make,
        model: firstString(item.model, match.model) || item.model,
        reg: firstString(item.reg, match.reg),
        price,
        ...(motExpiry ? { motExpiry } : {}),
        ...(match.motStatus ? { motStatus: match.motStatus } : {}),
        ...(match.taxStatus ? { taxStatus: match.taxStatus } : {}),
        ...(match.taxDueDate ? { taxDueDate: match.taxDueDate } : {}),
        ...(typeof match.annualRoadTax === 'number' ? { annualRoadTax: match.annualRoadTax } : {}),
        ...(typeof match.estimatedMpg === 'number' ? { estimatedMpg: match.estimatedMpg } : {}),
        ...(typeof match.ulezCompliant === 'boolean' ? { ulezCompliant: match.ulezCompliant } : {}),
    };
};

/** A car on the ledger that is not on the website still has to be findable. */
export const stockItemFromLedger = (vehicle: LedgerVehicle, indexedAt: number): StockItem => {
    const year = vehicle.year;
    const title = [year, vehicle.make, vehicle.model].filter(Boolean).join(' ') || vehicle.reg || 'Vehicle';
    const price = vehicle.advertisedPrice && vehicle.advertisedPrice > 0 ? vehicle.advertisedPrice : 0;

    return overlayLedgerFacts({
        id: `ledger-${vehicle.id}`,
        url: '',
        make: vehicle.make || '',
        model: vehicle.model || '',
        variant: '',
        title,
        price,
        year,
        mileage: vehicle.mileage,
        fuel: vehicle.fuelType,
        colour: vehicle.color,
        engineSize: vehicle.engineSize,
        reg: vehicle.reg,
        status: 'available',
        indexedAt,
    }, vehicle);
};

export interface LedgerMatchOptions {
    /** The account being indexed: its own cars win a tie, and its policy governs the strays. */
    companyId: string;
    /** companyId -> shareStockWithAgent, from readLedgerSnapshot. Missing counts as yes. */
    sharesStock: Map<string, boolean>;
    /** What this account does with site cars no ledger account claims. */
    unmatchedStockPolicy: 'include' | 'exclude';
}

/** Vehicle ids are per-account, so a claim has to name the account too. */
const vehicleKey = (vehicle: LedgerVehicle): string => `${vehicle.companyId}/${vehicle.id}`;

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
export const matchToLedger = (
    items: ScrapedStockItem[],
    vehicles: LedgerVehicle[],
    options: LedgerMatchOptions
): StockItem[] => {
    const isOurs = (vehicle: LedgerVehicle): boolean => vehicle.companyId === options.companyId;
    const shared = (companyId: string): boolean => options.sharesStock.get(companyId) !== false;

    const byReg = new Map<string, LedgerVehicle>();
    const byModel = new Map<string, LedgerVehicle[]>();

    for (const vehicle of vehicles) {
        const reg = normaliseReg(vehicle.reg || '');
        if (reg) {
            const held = byReg.get(reg);
            if (!held || (isOurs(vehicle) && !isOurs(held))) byReg.set(reg, vehicle);
        }

        const key = modelKey(vehicle.make, vehicle.model, vehicle.year);
        const bucket = byModel.get(key);
        if (bucket) bucket.push(vehicle);
        else byModel.set(key, [vehicle]);
    }

    // Same preference for the fuzzy fallback: our own cars ahead of the neighbours'.
    for (const bucket of byModel.values()) bucket.sort((a, b) => Number(isOurs(b)) - Number(isOurs(a)));

    const claimed = new Set<string>();
    const indexedAt = Date.now();

    return items.map(item => {
        const reg = normaliseReg(item.reg || '');
        let match = reg ? byReg.get(reg) : undefined;

        if (!match) {
            const candidates = (byModel.get(modelKey(item.make, item.model, item.year)) || [])
                .filter(vehicle => !claimed.has(vehicleKey(vehicle)));

            match = candidates.find(vehicle =>
                item.mileage === undefined ||
                vehicle.mileage === undefined ||
                Math.abs(vehicle.mileage - item.mileage) <= MILEAGE_TOLERANCE
            );
        }

        if (!match) {
            // No account claims this one. It is either a car nobody has booked into a
            // ledger yet or a plate the site never printed, so it is the indexing
            // company's call whether the agent may sell it.
            return options.unmatchedStockPolicy === 'exclude'
                ? { ...item, hiddenReason: 'unmatched_excluded' as const, indexedAt }
                : { ...item, indexedAt };
        }

        claimed.add(vehicleKey(match));
        const hiddenReason = shared(match.companyId) ? undefined : ('owner_opted_out' as const);

        return overlayLedgerFacts({
            ...item,
            ...(hiddenReason ? { hiddenReason } : {}),
            indexedAt,
        }, match);
    });
};

/**
 * Website adverts plus this company's own ledger cars that never made it onto
 * the site. Dave answers from this combined list so a car booked into Motor
 * Ledger Pro is not invisible just because the advert is late.
 */
export const mergeLedgerIntoIndex = (
    items: ScrapedStockItem[],
    vehicles: LedgerVehicle[],
    options: LedgerMatchOptions
): StockItem[] => {
    const matched = matchToLedger(items, vehicles, options);
    const claimed = new Set(
        matched
            .filter(item => item.ledgerVehicleId && item.ownerCompanyId)
            .map(item => `${item.ownerCompanyId}/${item.ledgerVehicleId}`)
    );

    const indexedAt = Date.now();
    const extras: StockItem[] = [];

    for (const vehicle of vehicles) {
        if (vehicle.companyId !== options.companyId) continue;
        if (vehicle.status === 'Sold') continue;
        if (claimed.has(vehicleKey(vehicle))) continue;
        extras.push(stockItemFromLedger(vehicle, indexedAt));
    }

    return [...matched, ...extras];
};

/**
 * Re-index one company's stock. Returns the meta record that was written, so the
 * manual "index now" button can show the outcome without a second read.
 */
export const indexStock = async (companyId: string): Promise<StockMeta> => {
    const startedAt = Date.now();
    const settings = await readSettings(companyId);
    const sourceUrl = settings.stockListUrl || DEFAULT_STOCK_LIST_URL;

    const errors: string[] = [];
    let items: StockItem[] = [];

    try {
        const scraped = await scrapeStock({ stockListUrl: sourceUrl, deadline: startedAt + SCRAPE_BUDGET_MS });
        errors.push(...scraped.errors);

        const { vehicles, sharesStock } = await readLedgerSnapshot(companyId);
        items = mergeLedgerIntoIndex(scraped.items, vehicles, {
            companyId,
            sharesStock,
            unmatchedStockPolicy: settings.unmatchedStockPolicy === 'exclude' ? 'exclude' : 'include',
        });

        console.log(
            `Company ${companyId}: scraped ${scraped.items.length} vehicles from ${scraped.pagesFetched} pages, ` +
            `${items.filter(item => item.ledgerVehicleId).length} matched to a ledger account across ` +
            `${sharesStock.size} companies, ${items.filter(item => item.hiddenReason).length} hidden from the agent`
        );
    } catch (error) {
        errors.push(`Stock scrape failed: ${errorMessage(error)}`);
        console.error(`Company ${companyId}: stock scrape failed`, error);
    }

    const meta: StockMeta = {
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
        const previousCount = (previous.val() as StockMeta | null)?.count ?? 0;

        meta.errors = [...errors, 'Scrape returned no vehicles; the previous index was kept'];
        meta.count = previousCount;
        meta.availableCount = (previous.val() as StockMeta | null)?.availableCount ?? 0;

        await db().ref(`companies/${companyId}/salesAgent/stockMeta`).set(meta);
        console.error(`Company ${companyId}: stock scrape returned nothing, kept the previous ${previousCount} vehicles`);
        return meta;
    }

    const stock: Record<string, StockItem> = {};
    for (const item of items) stock[item.id] = stripUndefined(item);

    await db().ref(`companies/${companyId}/salesAgent`).update({ stock, stockMeta: meta });

    console.log(
        `Company ${companyId}: indexed ${meta.count} vehicles (${meta.availableCount} available) ` +
        `in ${Math.round(meta.durationMs / 1000)}s, ${meta.errors.length} problems`
    );

    return meta;
};

/** Companies that have actually switched the sales agent on. */
const enabledCompanyIds = async (): Promise<string[]> => {
    const companyIds = await getCompanyIds();
    const enabled: string[] = [];

    for (const companyId of companyIds) {
        const snap = await db().ref(`companies/${companyId}/salesAgent/settings/enabled`).once('value');
        if (snap.val() === true) enabled.push(companyId);
    }

    return enabled;
};

/**
 * Scheduled re-index — 06:00 UK, so the day's stock is current before the first
 * enquiry of the morning.
 */
export const refreshSalesAgentStock = functions
    .runWith({ timeoutSeconds: 540, memory: '512MB' })
    .pubsub.schedule('0 6 * * *')
    .timeZone('Europe/London')
    .onRun(async () => {
        const companyIds = await enabledCompanyIds();
        console.log(`Starting sales agent stock index for ${companyIds.length} companies`);

        for (const companyId of companyIds) {
            try {
                await indexStock(companyId);
            } catch (error) {
                // One company's website being down shouldn't stop the rest.
                console.error(`Company ${companyId}: stock index failed`, error);
            }
        }

        return null;
    });

/** Manual "index now" — from Settings, or from Steve texting STOCK on WhatsApp. */
export const runSalesAgentStockIndexNow = functions
    .runWith({ timeoutSeconds: 540, memory: '512MB' })
    .https.onCall(async (_data, context) => {
        if (!context.auth) {
            throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
        }

        const uid = context.auth.uid;
        const companySnap = await db().ref(`users/${uid}/companyId`).once('value');
        const companyId = companySnap.val() as string | null;

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
            return await indexStock(companyId);
        } catch (error: any) {
            console.error(`Manual stock index failed for company ${companyId}:`, error);
            throw new functions.https.HttpsError('internal', 'Stock index failed');
        }
    });
