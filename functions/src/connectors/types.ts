/**
 * Shapes shared by the website connector.
 *
 * Mirrors types.ts in the app root — keep the two in step, the same way
 * VehicleLookupResult and MotSweepSummary already are.
 */

/**
 * The only keys the website will accept from a ledger.
 *
 * The receiving bucket is publicly readable, so this list is a security
 * boundary rather than a convenience: a purchase price, a seller's name or a
 * stock number cannot reach a customer's browser because there is no line here
 * that would carry it. The same list is enforced again at the far end in
 * site/api/ingest.js — neither side trusts the other to get it right.
 */
export interface WebsiteVehicleFields {
    make?: string;
    model?: string;
    year?: number;
    mileage?: number;
    colour?: string;
    vin?: string;
    fuel?: string;
    engine?: number;
    mot?: string;
    co2?: number;
    vat?: string;
    price?: number;
}

export interface WebsiteVehiclePayload {
    reg: string;
    vehicleId: string;
    /** The ledger's own status. The website decides what that means for a listing. */
    status: 'Available' | 'Deposit Paid' | 'Sold';
    fields: WebsiteVehicleFields;
}

/** What the website did with one car. */
export interface WebsiteVehicleResult {
    reg: string;
    action: 'created' | 'updated' | 'unchanged' | 'skipped' | 'failed';
    /** Set on a skip: 'other_dealer', 'bad_reg'. */
    reason?: string;
    message?: string;
    /** Fields the website took from this push. */
    changed: string[];
    /** Fields it declined because they had been edited in the back office. */
    kept: string[];
    status?: { from: string; to: string };
    name?: string;
}

export interface WebsitePushResponse {
    ok: boolean;
    /** What actually happened — a preview link can never answer 'live'. */
    mode: 'preview' | 'live';
    /** The link's own setting, which is what caps the above. */
    linkMode: 'preview' | 'live' | 'revoked';
    dealer: string;
    linkId: string;
    counts: { created: number; updated: number; unchanged: number; skipped: number; failed: number };
    results: WebsiteVehicleResult[];
}

/** Stored at companies/{companyId}/connectors/website. */
export interface WebsiteConnector {
    /** Full URL of the site's ingest endpoint. */
    endpoint: string;
    /** Write credential for this ledger. Held here, never shown after pairing. */
    token: string;
    /** What the site calls this ledger, e.g. "Steve — Motor Ledger Pro". */
    dealer: string;
    linkId: string;
    /** Nothing is written to the website until this says 'live'. */
    mode: 'preview' | 'live';
    /** The master switch. False leaves the trigger a single wasted read. */
    enabled: boolean;
    connectedAt: number;
    connectedBy?: string;
    host?: string;
}

export interface WebsitePushSummary {
    at: number;
    trigger: 'vehicle' | 'manual' | 'preview';
    mode: 'preview' | 'live';
    /** Set when the push never left the ledger. */
    error?: string;
    counts?: WebsitePushResponse['counts'];
    results?: WebsiteVehicleResult[];
}
