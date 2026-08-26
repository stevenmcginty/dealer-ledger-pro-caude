"use strict";
/**
 * Credential loading for the government vehicle APIs.
 *
 * Loads DVSA/DVLA credentials from environment config: prefer process.env
 * (populated from functions/.env at deploy time), fall back to the legacy
 * functions.config().
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
exports.getVesEndpoint = exports.getVesApiKey = exports.getMotCredentials = void 0;
const functions = __importStar(require("firebase-functions/v1"));
const runtimeConfig = () => {
    try {
        return functions.config() || {};
    }
    catch {
        return {};
    }
};
/** DVSA MOT History API. Throws if not configured — this source is required. */
const getMotCredentials = () => {
    const cfg = runtimeConfig().mot || {};
    const clientId = process.env.MOT_CLIENT_ID || cfg.client_id;
    const clientSecret = process.env.MOT_CLIENT_SECRET || cfg.client_secret;
    const apiKey = process.env.MOT_API_KEY || cfg.api_key;
    const tokenUrl = process.env.MOT_TOKEN_URL || cfg.token_url;
    const scopeUrl = process.env.MOT_SCOPE_URL || cfg.scope_url || 'https://tapi.dvsa.gov.uk/.default';
    if (!clientId || !clientSecret || !apiKey || !tokenUrl) {
        throw new Error('DVSA MOT History API is not configured. Set MOT_CLIENT_ID, MOT_CLIENT_SECRET, ' +
            'MOT_API_KEY and MOT_TOKEN_URL in functions/.env');
    }
    return { clientId, clientSecret, apiKey, tokenUrl, scopeUrl };
};
exports.getMotCredentials = getMotCredentials;
/**
 * DVLA Vehicle Enquiry Service. Optional — returns null when no key is set, and the
 * lookup simply runs without tax/CO2 data rather than failing.
 */
const getVesApiKey = () => {
    const cfg = runtimeConfig().dvla || {};
    return process.env.DVLA_VES_API_KEY || cfg.ves_api_key || null;
};
exports.getVesApiKey = getVesApiKey;
const getVesEndpoint = () => process.env.DVLA_VES_URL ||
    runtimeConfig().dvla?.ves_url ||
    'https://driver-vehicle-licensing.api.gov.uk/vehicle-enquiry/v1/vehicles';
exports.getVesEndpoint = getVesEndpoint;
//# sourceMappingURL=credentials.js.map