/**
 * Vehicle lookup callable.
 *
 * Takes a registration and merges everything the government APIs know about it into
 * one flat result the client can drop straight into the vehicle form. Both sources
 * are queried in parallel and either one failing degrades to a warning rather than
 * an error, so a lookup still returns whatever could be gathered.
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

import { fetchMotHistory, summariseMotTests, toIsoDate, RawMotVehicle } from './motHistory';
import { fetchVesVehicle, isVesConfigured, RawVesVehicle } from './ves';
import { deriveVehicleData } from './ved';
import { VehicleLookupResult } from './types';

/** Registrations are stored and queried without spaces, upper case. */
export const normaliseReg = (input: string): string =>
    String(input || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

const CACHE_PATH = 'vehicleLookupCache';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const yearFromDate = (date?: string): number | undefined => {
    const iso = toIsoDate(date);
    if (!iso) return undefined;
    const year = parseInt(iso.slice(0, 4), 10);
    return Number.isFinite(year) ? year : undefined;
};

/**
 * The MOT that matters is the one that expires last. A vehicle can have several
 * tests on the same day (a fail then a pass), and fails carry a null expiry, so
 * taking the newest test outright would sometimes yield no date at all.
 */
const latestExpiry = (tests: Array<{ expiryDate?: string }>): string | undefined =>
    tests
        .map(t => t.expiryDate)
        .filter((d): d is string => !!d)
        .sort()
        .pop();

const deriveMotStatus = (expiry: string | undefined, firstMotDue: string | undefined, vesStatus?: string): string | undefined => {
    const today = new Date().toISOString().slice(0, 10);
    if (expiry) return expiry >= today ? 'Valid' : 'Expired';
    if (firstMotDue) return firstMotDue >= today ? 'Not due yet' : 'Expired';
    return vesStatus;
};

export const mergeSources = (
    reg: string,
    mot: RawMotVehicle | null,
    ves: RawVesVehicle | null,
    warnings: string[]
): VehicleLookupResult => {
    const tests = summariseMotTests(mot?.motTests);
    const motExpiry = latestExpiry(tests);
    const firstMotDue = toIsoDate(mot?.motTestDueDate);

    // Most recent test that actually recorded a reading — a fail still records one.
    const lastRead = tests.find(t => typeof t.odometerValue === 'number');

    const firstRegistered =
        toIsoDate(mot?.registrationDate) ||
        toIsoDate(mot?.firstUsedDate) ||
        (ves?.monthOfFirstRegistration ? `${ves.monthOfFirstRegistration}-01` : undefined);

    const engineSize =
        mot?.engineSize ||
        (typeof ves?.engineCapacity === 'number' ? String(ves.engineCapacity) : undefined);

    // Neither API publishes what the road tax costs, what the fuel costs, or
    // what the car does to a company car driver's tax bill — all of it falls
    // out of the fields above once the published rules are applied.
    const derived = deriveVehicleData({
        co2: ves?.co2Emissions,
        fuel: mot?.fuelType || ves?.fuelType,
        firstRegistered,
        engineCapacity: engineSize,
        euroStatus: ves?.euroStatus,
        // Only a reading in miles; a kilometre clock would make the
        // miles-a-year comparison quietly wrong.
        mileage: lastRead && (lastRead.odometerUnit || 'MI') === 'MI' ? lastRead.odometerValue : null,
    });

    const result: VehicleLookupResult = {
        reg,
        found: !!mot || !!ves,
        sources: { mot: !!mot, ves: !!ves },

        make: mot?.make || ves?.make,
        model: mot?.model,
        color: mot?.primaryColour || ves?.colour,
        fuelType: mot?.fuelType || ves?.fuelType,
        engineSize,
        year:
            ves?.yearOfManufacture ||
            yearFromDate(mot?.manufactureDate) ||
            yearFromDate(mot?.firstUsedDate) ||
            yearFromDate(firstRegistered),
        firstRegistered,

        motDueDate: motExpiry || firstMotDue || toIsoDate(ves?.motExpiryDate),
        motStatus: deriveMotStatus(motExpiry, firstMotDue, ves?.motStatus),
        lastMotOdometer:
            lastRead && typeof lastRead.odometerValue === 'number'
                ? {
                      value: lastRead.odometerValue,
                      unit: lastRead.odometerUnit || 'MI',
                      date: lastRead.completedDate,
                  }
                : undefined,
        motTestCount: tests.length,
        motHistory: tests,
        hasOutstandingRecall: mot?.hasOutstandingRecall,

        taxStatus: ves?.taxStatus,
        taxDueDate: toIsoDate(ves?.taxDueDate),
        co2Emissions: ves?.co2Emissions,
        euroStatus: ves?.euroStatus,
        wheelplan: ves?.wheelplan,
        typeApproval: ves?.typeApproval,
        revenueWeight: ves?.revenueWeight,
        dateOfLastV5CIssued: toIsoDate(ves?.dateOfLastV5CIssued),
        markedForExport: ves?.markedForExport,

        annualRoadTax: derived.ved.annual,
        ved: derived.ved,
        runningCosts: derived.running,
        annualCost: derived.annual,
        companyCarTax: derived.companyCar,
        zones: derived.zones,
        ageAndUse: derived.age,
    };

    if (warnings.length) result.warnings = warnings;

    // Firebase callables reject undefined values, and RTDB drops them silently.
    return JSON.parse(JSON.stringify(result)) as VehicleLookupResult;
};

const readCache = async (reg: string): Promise<VehicleLookupResult | null> => {
    try {
        const snap = await admin.database().ref(`${CACHE_PATH}/${reg}`).once('value');
        const entry = snap.val();
        if (!entry?.fetchedAt || Date.now() - entry.fetchedAt > CACHE_TTL_MS) return null;
        return { ...entry.result, cached: true } as VehicleLookupResult;
    } catch (error) {
        console.warn('Vehicle lookup cache read failed', error);
        return null;
    }
};

const writeCache = async (reg: string, result: VehicleLookupResult): Promise<void> => {
    try {
        await admin.database().ref(`${CACHE_PATH}/${reg}`).set({ fetchedAt: Date.now(), result });
    } catch (error) {
        console.warn('Vehicle lookup cache write failed', error);
    }
};

/** Shared by the callable and any future server-side caller. */
export const lookupVehicle = async (rawReg: string, force = false): Promise<VehicleLookupResult> => {
    const reg = normaliseReg(rawReg);

    if (!force) {
        const cached = await readCache(reg);
        if (cached) return cached;
    }

    const warnings: string[] = [];

    const [motOutcome, vesOutcome] = await Promise.allSettled([
        fetchMotHistory(reg),
        fetchVesVehicle(reg),
    ]);

    let mot: RawMotVehicle | null = null;
    if (motOutcome.status === 'fulfilled') {
        mot = motOutcome.value;
    } else {
        console.error(`MOT History lookup failed for ${reg}`, motOutcome.reason);
        warnings.push('MOT history could not be retrieved.');
    }

    let ves: RawVesVehicle | null = null;
    if (vesOutcome.status === 'fulfilled') {
        ves = vesOutcome.value;
    } else {
        console.error(`DVLA VES lookup failed for ${reg}`, vesOutcome.reason);
        warnings.push('DVLA tax and CO2 data could not be retrieved.');
    }

    if (!isVesConfigured()) {
        warnings.push('DVLA Vehicle Enquiry Service key not configured — tax status and CO2 unavailable.');
    }

    const result = mergeSources(reg, mot, ves, warnings);

    // Don't cache a miss; the reg may simply have been mistyped.
    if (result.found) await writeCache(reg, result);

    return result;
};

/**
 * Callable used by the vehicle form and the invoice scanner.
 * data: { reg: string }
 *
 * The 24h cache applies to every caller. A `force` flag from the client is
 * ignored: letting a client opt out of the cache is letting it spend the
 * government APIs' rate limit at will. Only server-side callers (the MOT
 * sweep, whose period matches the cache's) may bypass it.
 */
export const lookupVehicleByReg = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const reg = normaliseReg(data?.reg);
    if (reg.length < 2 || reg.length > 8) {
        throw new functions.https.HttpsError('invalid-argument', 'A valid UK registration is required');
    }

    try {
        return await lookupVehicle(reg);
    } catch (error: any) {
        console.error(`Vehicle lookup failed for ${reg}:`, error);
        throw new functions.https.HttpsError('internal', 'Vehicle lookup failed');
    }
});
