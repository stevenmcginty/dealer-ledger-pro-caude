/**
 * Normalised shape returned by the vehicle lookup callable.
 *
 * Two government sources feed this:
 *  - DVSA MOT History API (make, model, colour, engine, MOT expiry, odometer history)
 *  - DVLA Vehicle Enquiry Service (tax status, CO2, V5C dates) — only when a VES key
 *    is configured; the fields stay undefined otherwise.
 */

export interface MotTestSummary {
    completedDate: string;
    expiryDate?: string;
    testResult: string;
    odometerValue?: number;
    odometerUnit?: string;
    /** Advisory/minor notes recorded at the test, in DVSA's own wording. */
    advisories: string[];
    /** Failure items — only present on a failed test. */
    failures: string[];
}

export interface VehicleLookupResult {
    reg: string;
    found: boolean;
    /** Which of the two APIs actually returned data for this reg. */
    sources: { mot: boolean; ves: boolean };

    // --- Vehicle identity ---
    make?: string;
    model?: string;
    color?: string;
    fuelType?: string;
    /** Engine capacity in cc, as a string to match the Vehicle.engineSize field. */
    engineSize?: string;
    year?: number;
    /** ISO yyyy-mm-dd. */
    firstRegistered?: string;

    // --- MOT ---
    /** Expiry of the current MOT, or the date the first MOT falls due on a new car. */
    motDueDate?: string;
    /** 'Valid' | 'Expired' | 'Not due yet' | 'No details held' */
    motStatus?: string;
    lastMotOdometer?: { value: number; unit: string; date: string };
    motTestCount?: number;
    motHistory?: MotTestSummary[];
    hasOutstandingRecall?: string;

    // --- DVLA VES only ---
    taxStatus?: string;
    taxDueDate?: string;
    co2Emissions?: number;
    euroStatus?: string;
    wheelplan?: string;
    typeApproval?: string;
    revenueWeight?: number;
    dateOfLastV5CIssued?: string;
    markedForExport?: boolean;

    /** Non-fatal problems (e.g. one source down) so the UI can say what's missing. */
    warnings?: string[];
    /** True when served from the cache rather than a live call. */
    cached?: boolean;
}
