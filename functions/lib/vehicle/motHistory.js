"use strict";
/**
 * DVSA MOT History API client.
 *
 * Auth is OAuth2 client-credentials against Microsoft Entra; the resulting bearer
 * token is sent alongside the issued X-API-Key on every call. DVSA ask that tokens
 * be cached rather than re-requested per lookup, so we hold one in module scope for
 * the life of the warm instance and renew a minute before it expires.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.toNumber = exports.toIsoDate = exports.summariseMotTests = exports.fetchMotHistory = exports.getAccessToken = void 0;
const credentials_1 = require("./credentials");
const MOT_API_BASE = process.env.MOT_API_BASE || 'https://history.mot.api.gov.uk/v1/trade/vehicles/registration';
let cachedToken = null;
let tokenRequest = null;
const requestToken = async () => {
    const { clientId, clientSecret, tokenUrl, scopeUrl } = (0, credentials_1.getMotCredentials)();
    const body = new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
        scope: scopeUrl,
    });
    const res = await fetch(tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
    });
    if (!res.ok) {
        const detail = await res.text().catch(() => '');
        throw new Error(`DVSA token request failed (${res.status}): ${detail.slice(0, 300)}`);
    }
    const json = (await res.json());
    if (!json.access_token) {
        throw new Error('DVSA token response did not contain an access_token');
    }
    // Renew a minute early so an in-flight call never uses an expiring token.
    const ttlSeconds = json.expires_in || 3600;
    cachedToken = {
        accessToken: json.access_token,
        expiresAt: Date.now() + (ttlSeconds - 60) * 1000,
    };
    return json.access_token;
};
const getAccessToken = async () => {
    if (cachedToken && cachedToken.expiresAt > Date.now()) {
        return cachedToken.accessToken;
    }
    // Collapse concurrent misses onto a single token request.
    if (!tokenRequest) {
        tokenRequest = requestToken().finally(() => {
            tokenRequest = null;
        });
    }
    return tokenRequest;
};
exports.getAccessToken = getAccessToken;
/**
 * Fetch a vehicle's record. Returns null when DVSA has no record for the reg —
 * which includes vehicles too new to have an MOT history.
 */
const fetchMotHistory = async (reg) => {
    const { apiKey } = (0, credentials_1.getMotCredentials)();
    const token = await (0, exports.getAccessToken)();
    const call = (bearer) => fetch(`${MOT_API_BASE}/${encodeURIComponent(reg)}`, {
        headers: {
            Authorization: `Bearer ${bearer}`,
            'X-API-Key': apiKey,
            Accept: 'application/json',
        },
    });
    let res = await call(token);
    // A cached token can still be rejected (e.g. credentials rotated). Retry once clean.
    if (res.status === 401) {
        cachedToken = null;
        res = await call(await (0, exports.getAccessToken)());
    }
    if (res.status === 404)
        return null;
    if (!res.ok) {
        const detail = await res.text().catch(() => '');
        throw new Error(`DVSA MOT History lookup failed (${res.status}): ${detail.slice(0, 300)}`);
    }
    return (await res.json());
};
exports.fetchMotHistory = fetchMotHistory;
const toNumber = (value) => {
    if (!value)
        return undefined;
    const n = parseInt(String(value).replace(/[^0-9]/g, ''), 10);
    return Number.isFinite(n) ? n : undefined;
};
exports.toNumber = toNumber;
/** DVSA return completedDate as a full timestamp; the app works in yyyy-mm-dd. */
const toIsoDate = (value) => {
    if (!value)
        return undefined;
    const match = String(value).match(/^(\d{4}-\d{2}-\d{2})/);
    return match ? match[1] : undefined;
};
exports.toIsoDate = toIsoDate;
const summariseMotTests = (tests = []) => tests
    .map(test => {
    const defects = test.defects || [];
    return {
        completedDate: toIsoDate(test.completedDate) || '',
        expiryDate: toIsoDate(test.expiryDate),
        testResult: test.testResult || 'UNKNOWN',
        odometerValue: toNumber(test.odometerValue),
        odometerUnit: test.odometerUnit,
        advisories: defects
            .filter(d => d.type === 'ADVISORY' || d.type === 'MINOR')
            .map(d => d.text || '')
            .filter(Boolean),
        failures: defects
            .filter(d => d.type === 'MAJOR' || d.type === 'DANGEROUS' || d.type === 'FAIL')
            .map(d => d.text || '')
            .filter(Boolean),
    };
})
    // Newest first — DVSA usually return them this way already, but don't rely on it.
    .sort((a, b) => (b.completedDate || '').localeCompare(a.completedDate || ''));
exports.summariseMotTests = summariseMotTests;
//# sourceMappingURL=motHistory.js.map