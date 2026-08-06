"use strict";
/**
 * Daily MOT refresh for vehicles in stock.
 *
 * Re-runs the DVSA/DVLA lookup for every vehicle that hasn't been sold, writes back
 * anything the government records now disagree with, and leaves a summary the app
 * can show without paying for the lookups again.
 *
 * Both APIs are free, so the only real cost here is staying inside DVSA's rate limit
 * — hence the small concurrency and the pause between batches.
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
exports.runMotSweepNow = exports.refreshStockMotStatus = exports.sweepCompanyMots = void 0;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
const lookup_1 = require("./lookup");
const companyIds_1 = require("../utils/companyIds");
const db = () => admin.database();
/** DVSA publish a per-second limit; three at a time with a breather stays well under it. */
const CONCURRENCY = 3;
const BATCH_PAUSE_MS = 250;
/** A vehicle whose MOT runs out inside this window is worth flagging. */
const EXPIRING_SOON_DAYS = 30;
/**
 * Backstop so one company with a runaway vehicle list can't run the function past its
 * timeout. Anything skipped is reported rather than silently dropped.
 */
const MAX_VEHICLES_PER_SWEEP = 400;
const todayIso = () => new Date().toISOString().slice(0, 10);
const daysBetween = (fromIso, toIso) => Math.round((Date.parse(toIso) - Date.parse(fromIso)) / 86400000);
/** Same loose test the client uses — rules out obvious non-registrations only. */
const isPlausibleReg = (reg) => reg.length >= 2 && reg.length <= 8 && /[0-9]/.test(reg) && /[A-Z]/.test(reg);
const readStockVehicles = async (companyId) => {
    const snap = await db().ref(`companies/${companyId}/vehicles`).once('value');
    const raw = snap.val();
    if (!raw)
        return [];
    return Object.entries(raw)
        // Sold cars are someone else's problem; everything still on the forecourt counts.
        .filter(([, v]) => v?.status !== 'Sold')
        .map(([id, v]) => ({ id, ...v }));
};
/**
 * Refresh one vehicle. Returns the fields that actually changed so the caller can
 * report a meaningful "updated" count rather than one write per vehicle.
 */
const refreshVehicle = async (companyId, vehicle) => {
    const reg = (0, lookup_1.normaliseReg)(vehicle.reg || '');
    if (!isPlausibleReg(reg))
        return { changed: [] };
    // force: true — the lookup cache holds for 24h, which is exactly this job's period,
    // so a cached read here would return the same data the previous run already saw.
    const result = await (0, lookup_1.lookupVehicle)(reg, true);
    if (!result.found)
        return { changed: [] };
    const updates = {};
    const changed = [];
    const set = (field, value) => {
        if (!value || vehicle[field] === value)
            return;
        updates[field] = value;
        changed.push(field);
    };
    set('motDueDate', result.motDueDate);
    set('motStatus', result.motStatus);
    set('taxStatus', result.taxStatus);
    set('taxDueDate', result.taxDueDate);
    if (changed.length) {
        updates.dvlaLookedUpAt = Date.now();
        await db().ref(`companies/${companyId}/vehicles/${vehicle.id}`).update(updates);
    }
    const motDueDate = result.motDueDate || vehicle.motDueDate;
    const motStatus = result.motStatus || vehicle.motStatus;
    // 'Not due yet' covers cars too new to be tested — not something to chase.
    const needsAttention = !!motDueDate &&
        motStatus !== 'Not due yet' &&
        daysBetween(todayIso(), motDueDate) <= EXPIRING_SOON_DAYS;
    if (!needsAttention)
        return { changed };
    return {
        changed,
        alert: {
            vehicleId: vehicle.id,
            reg,
            make: vehicle.make,
            model: vehicle.model,
            stockNumber: vehicle.stockNumber,
            motDueDate,
            motStatus,
            daysRemaining: daysBetween(todayIso(), motDueDate),
        },
    };
};
/** Refresh every unsold vehicle for one company and store the summary. */
const sweepCompanyMots = async (companyId, trigger, triggeredBy) => {
    const startedAt = Date.now();
    const all = await readStockVehicles(companyId);
    const vehicles = all.slice(0, MAX_VEHICLES_PER_SWEEP);
    const skipped = all.length - vehicles.length;
    if (skipped > 0) {
        console.warn(`Company ${companyId}: ${all.length} vehicles in stock, only the first ${MAX_VEHICLES_PER_SWEEP} were checked`);
    }
    const expired = [];
    const expiringSoon = [];
    const errors = [];
    let updated = 0;
    for (let i = 0; i < vehicles.length; i += CONCURRENCY) {
        const batch = vehicles.slice(i, i + CONCURRENCY);
        const outcomes = await Promise.allSettled(batch.map(vehicle => refreshVehicle(companyId, vehicle)));
        outcomes.forEach((outcome, index) => {
            const vehicle = batch[index];
            if (outcome.status === 'rejected') {
                const message = outcome.reason?.message || String(outcome.reason);
                console.error(`Company ${companyId}: MOT refresh failed for ${vehicle.reg}`, outcome.reason);
                errors.push({ reg: vehicle.reg || vehicle.id, message });
                return;
            }
            if (outcome.value.changed.length)
                updated++;
            const alert = outcome.value.alert;
            if (!alert)
                return;
            if ((alert.daysRemaining ?? 0) < 0)
                expired.push(alert);
            else
                expiringSoon.push(alert);
        });
        if (i + CONCURRENCY < vehicles.length) {
            await new Promise(resolve => setTimeout(resolve, BATCH_PAUSE_MS));
        }
    }
    const soonestFirst = (a, b) => (a.daysRemaining ?? 0) - (b.daysRemaining ?? 0);
    const summary = {
        startedAt,
        finishedAt: Date.now(),
        trigger,
        checked: vehicles.length,
        updated,
        failed: errors.length,
        expired: expired.sort(soonestFirst),
        expiringSoon: expiringSoon.sort(soonestFirst),
        errors,
    };
    if (triggeredBy)
        summary.triggeredBy = triggeredBy;
    if (skipped > 0)
        summary.skipped = skipped;
    await db().ref(`companies/${companyId}/motSweep/latest`).set(summary);
    console.log(`Company ${companyId}: checked ${summary.checked}, updated ${summary.updated}, ` +
        `${summary.expired.length} expired, ${summary.expiringSoon.length} due soon, ${summary.failed} failed`);
    return summary;
};
exports.sweepCompanyMots = sweepCompanyMots;
/**
 * Scheduled sweep — every company, once a day.
 *
 * Runs at 06:00 UK time so the day's list is ready before anyone opens the app.
 */
exports.refreshStockMotStatus = functions
    .runWith({ timeoutSeconds: 540, memory: '512MB' })
    .pubsub.schedule('0 6 * * *')
    .timeZone('Europe/London')
    .onRun(async () => {
    const companyIds = await (0, companyIds_1.getCompanyIds)();
    console.log(`Starting MOT sweep for ${companyIds.length} companies`);
    for (const companyId of companyIds) {
        try {
            await (0, exports.sweepCompanyMots)(companyId, 'scheduled');
        }
        catch (error) {
            // One company's failure shouldn't stop the rest.
            console.error(`Company ${companyId}: MOT sweep failed`, error);
        }
    }
    return null;
});
/** Manual "check now" button in Settings. Sweeps only the caller's own company. */
exports.runMotSweepNow = functions
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
    try {
        return await (0, exports.sweepCompanyMots)(companyId, 'manual', uid);
    }
    catch (error) {
        console.error(`Manual MOT sweep failed for company ${companyId}:`, error);
        throw new functions.https.HttpsError('internal', error?.message || 'MOT sweep failed');
    }
});
//# sourceMappingURL=motSweep.js.map