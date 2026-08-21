/**
 * Government vehicle data lookup.
 *
 * Calls the `lookupVehicleByReg` Cloud Function, which merges the DVSA MOT History
 * API with the DVLA Vehicle Enquiry Service. The API credentials live only on the
 * server — nothing sensitive is bundled into the client.
 */

import firebase from 'firebase/compat/app';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { Vehicle, VehicleLookupResult } from '../types';
import './firebase';

/** Registrations are compared and sent without spaces, upper case. */
export const normaliseReg = (input: string): string =>
    String(input || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

/**
 * Cheap sanity check before spending an API call. Deliberately loose — it only
 * rules out obvious non-registrations, since UK plates span several formats
 * (current, prefix, suffix, dateless and Northern Irish).
 */
export const isPlausibleUkReg = (input: string): boolean => {
    const reg = normaliseReg(input);
    return reg.length >= 2 && reg.length <= 8 && /[0-9]/.test(reg) && /[A-Z]/.test(reg);
};

// Repeated lookups of the same reg within a session (scan, then edit, then save)
// shouldn't each hit the API. The server caches for 24h too; this just avoids the
// round trip.
const sessionCache = new Map<string, VehicleLookupResult>();

/**
 * Turn a Firebase callable failure into a sentence the form can show.
 *
 * `functions/not-found` means the Cloud Function itself is missing (wrong name
 * or region), not that DVLA has no record for the plate. A blocked or dropped
 * request (CSP, offline) surfaces as `unavailable` / "Failed to fetch".
 */
export const describeLookupError = (error: any, reg?: string): string => {
    const code: string = error?.code || '';
    const message: string = error?.message || 'Vehicle lookup failed.';

    if (code === 'functions/unauthenticated') {
        return 'You need to be signed in to look up a registration.';
    }
    if (code === 'functions/not-found') {
        return 'The vehicle lookup service is not available. Try again later.';
    }
    if (
        code === 'functions/unavailable' ||
        (code === 'functions/internal' && /^internal$/i.test(message)) ||
        /failed to fetch|network error|load failed/i.test(message)
    ) {
        return 'Could not reach the vehicle lookup service. Check your connection and try again.';
    }
    if (reg && /not found/i.test(message)) {
        return `No DVLA or MOT record found for ${normaliseReg(reg)}.`;
    }
    return message;
};

export const lookupVehicle = async (reg: string, force = false): Promise<VehicleLookupResult> => {
    const normalised = normaliseReg(reg);

    if (!isPlausibleUkReg(normalised)) {
        throw new Error(`"${reg}" doesn't look like a UK registration.`);
    }

    if (!force && sessionCache.has(normalised)) {
        return sessionCache.get(normalised)!;
    }

    // Use the already-initialised compat app so the callable sends the signed-in
    // user's ID token. A bare getFunctions() can miss that app when compat and
    // modular SDKs are both in the bundle.
    const callable = httpsCallable<{ reg: string; force?: boolean }, VehicleLookupResult>(
        getFunctions(firebase.app()),
        'lookupVehicleByReg'
    );

    try {
        const { data } = await callable({ reg: normalised, force });
        sessionCache.set(normalised, data);
        return data;
    } catch (error: any) {
        throw new Error(describeLookupError(error, normalised));
    }
};

/** Human labels for the fields the lookup can fill, used in the "what changed" summary. */
const FIELD_LABELS: Record<string, string> = {
    make: 'Make',
    model: 'Model',
    color: 'Colour',
    fuelType: 'Fuel',
    engineSize: 'Engine size',
    year: 'Year',
    firstRegistered: 'First registered',
    motDueDate: 'MOT due',
    motStatus: 'MOT status',
    mileage: 'Mileage',
    taxStatus: 'Tax status',
    taxDueDate: 'Tax due',
    co2Emissions: 'CO2',
    annualRoadTax: 'Road tax',
    estimatedMpg: 'MPG',
    estimatedAnnualFuelCost: 'Fuel cost',
    ulezCompliant: 'ULEZ',
};

export interface AppliedLookup {
    patch: Partial<Vehicle>;
    /** Labels of the fields that actually changed, for the confirmation message. */
    changed: string[];
    /**
     * Set when the mileage on record is higher than the mileage already entered —
     * worth a second look before the car goes into stock.
     */
    mileageWarning?: string;
}

/**
 * Build the patch to apply to a vehicle form from a lookup result.
 *
 * DVLA and DVSA are treated as authoritative for what the vehicle *is* — make,
 * model, colour, engine, dates — so those overwrite whatever an invoice scan or
 * earlier typing produced. Mileage is left alone: the invoice records the reading
 * at purchase, which is normally more current than the last MOT.
 */
export const buildVehiclePatch = (
    lookup: VehicleLookupResult,
    current: Partial<Vehicle>
): AppliedLookup => {
    const patch: Partial<Vehicle> = {};
    const changed: string[] = [];

    const set = <K extends keyof Vehicle>(key: K, value: Vehicle[K] | undefined) => {
        if (value === undefined || value === null || value === '') return;
        if (current[key] === value) return;
        patch[key] = value;
        if (FIELD_LABELS[key as string]) changed.push(FIELD_LABELS[key as string]);
    };

    // Authoritative vehicle identity.
    set('make', lookup.make);
    set('model', lookup.model);
    set('color', lookup.color);
    set('fuelType', lookup.fuelType);
    set('engineSize', lookup.engineSize);
    set('year', lookup.year);
    set('firstRegistered', lookup.firstRegistered);
    set('motDueDate', lookup.motDueDate);
    set('motStatus', lookup.motStatus);

    // DVLA-only fields; undefined until a VES key is configured.
    set('taxStatus', lookup.taxStatus);
    set('taxDueDate', lookup.taxDueDate);
    set('co2Emissions', lookup.co2Emissions);

    // Derived rather than fetched, but no less authoritative — the VED tables
    // are published, and the alternative is a blank box on every advert. Null
    // means the rules could not reach an answer, which `set` already skips.
    set('annualRoadTax', lookup.annualRoadTax ?? undefined);
    set('estimatedMpg', lookup.runningCosts?.mpg);
    set('estimatedAnnualFuelCost', lookup.runningCosts?.annualFuelCost);
    set('ulezCompliant', lookup.zones?.ulez?.compliant);

    // Mileage only fills a blank — never overwrites a reading from the invoice.
    const existingMileage = Number(current.mileage) || 0;
    const lastRead = lookup.lastMotOdometer;
    if (lastRead && lastRead.unit === 'MI') {
        if (!existingMileage) {
            set('mileage', lastRead.value);
        }
    }

    let mileageWarning: string | undefined;
    if (lastRead && lastRead.unit === 'MI' && existingMileage && lastRead.value > existingMileage) {
        mileageWarning =
            `Last MOT (${lastRead.date}) recorded ${lastRead.value.toLocaleString()} miles, ` +
            `which is higher than the ${existingMileage.toLocaleString()} entered. Worth checking.`;
    }

    if (changed.length) {
        patch.dvlaLookedUpAt = Date.now();
    }

    return { patch, changed, mileageWarning };
};

/** Clears the in-session cache. Mainly useful in tests and after a forced refresh. */
export const clearLookupCache = () => sessionCache.clear();
