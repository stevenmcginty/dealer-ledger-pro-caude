/**
 * Credential loading for the government vehicle APIs.
 *
 * Loads DVSA/DVLA credentials from environment config: prefer process.env
 * (populated from functions/.env at deploy time), fall back to the legacy
 * functions.config().
 */

import * as functions from 'firebase-functions/v1';

const runtimeConfig = (): any => {
    try {
        return functions.config() || {};
    } catch {
        return {};
    }
};

export interface MotCredentials {
    clientId: string;
    clientSecret: string;
    apiKey: string;
    tokenUrl: string;
    scopeUrl: string;
}

/** DVSA MOT History API. Throws if not configured — this source is required. */
export const getMotCredentials = (): MotCredentials => {
    const cfg = runtimeConfig().mot || {};

    const clientId = process.env.MOT_CLIENT_ID || cfg.client_id;
    const clientSecret = process.env.MOT_CLIENT_SECRET || cfg.client_secret;
    const apiKey = process.env.MOT_API_KEY || cfg.api_key;
    const tokenUrl = process.env.MOT_TOKEN_URL || cfg.token_url;
    const scopeUrl = process.env.MOT_SCOPE_URL || cfg.scope_url || 'https://tapi.dvsa.gov.uk/.default';

    if (!clientId || !clientSecret || !apiKey || !tokenUrl) {
        throw new Error(
            'DVSA MOT History API is not configured. Set MOT_CLIENT_ID, MOT_CLIENT_SECRET, ' +
            'MOT_API_KEY and MOT_TOKEN_URL in functions/.env'
        );
    }

    return { clientId, clientSecret, apiKey, tokenUrl, scopeUrl };
};

/**
 * DVLA Vehicle Enquiry Service. Optional — returns null when no key is set, and the
 * lookup simply runs without tax/CO2 data rather than failing.
 */
export const getVesApiKey = (): string | null => {
    const cfg = runtimeConfig().dvla || {};
    return process.env.DVLA_VES_API_KEY || cfg.ves_api_key || null;
};

export const getVesEndpoint = (): string =>
    process.env.DVLA_VES_URL ||
    runtimeConfig().dvla?.ves_url ||
    'https://driver-vehicle-licensing.api.gov.uk/vehicle-enquiry/v1/vehicles';
