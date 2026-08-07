"use strict";
/**
 * Sending stock to a linked website.
 *
 * Everything about this is deliberately inert until somebody pairs a site:
 * with no connector saved, every function here returns before it reaches the
 * network. That is what lets the trigger sit over a live, busy vehicle list
 * without changing anything for the people using it.
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
exports.pushVehicles = exports.callIngest = exports.readStockForWebsite = exports.readConnector = void 0;
const admin = __importStar(require("firebase-admin"));
const payload_1 = require("./payload");
const db = () => admin.database();
/** One push carries at most this many cars; the endpoint refuses more. */
const MAX_PER_PUSH = 400;
const connectorPath = (companyId) => `companies/${companyId}/connectors/website`;
const readConnector = async (companyId) => {
    const snap = await db().ref(connectorPath(companyId)).once('value');
    return snap.exists() ? snap.val() : null;
};
exports.readConnector = readConnector;
/** Unsold stock, oldest first. A car sold before it was ever advertised has
 *  nothing to say to a website, so the backfill leaves it out entirely. */
const readStockForWebsite = async (companyId) => {
    const snap = await db().ref(`companies/${companyId}/vehicles`).once('value');
    const raw = snap.val();
    if (!raw)
        return [];
    return Object.entries(raw)
        .filter(([, v]) => v && v.status !== 'Sold')
        .map(([id, v]) => (0, payload_1.buildVehiclePayload)({ ...v, id }))
        .filter((p) => p !== null)
        .slice(0, MAX_PER_PUSH);
};
exports.readStockForWebsite = readStockForWebsite;
/**
 * Talk to the site.
 *
 * A network failure is reported, never thrown past the caller — a website that
 * is down for ten minutes must not turn into a failed vehicle write in the
 * ledger, which is the one thing that would make this feature dangerous.
 */
const callIngest = async (connector, body) => {
    let response;
    try {
        response = await fetch(connector.endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${connector.token}`,
            },
            body: JSON.stringify(body),
        });
    }
    catch (error) {
        return { ok: false, message: `Could not reach ${hostOf(connector.endpoint)} — ${error?.message || 'no answer'}.` };
    }
    const text = await response.text();
    let data = null;
    try {
        data = text ? JSON.parse(text) : null;
    }
    catch (e) { /* not JSON */ }
    if (!response.ok) {
        // The site answers every refusal with a sentence meant to be read by a
        // person. Pass it through word for word rather than inventing one.
        return {
            ok: false,
            status: response.status,
            message: (data && data.message) || `The website answered ${response.status}.`,
        };
    }
    return { ok: true, data: data };
};
exports.callIngest = callIngest;
const hostOf = (endpoint) => {
    try {
        return new URL(endpoint).host;
    }
    catch (e) {
        return 'the website';
    }
};
/**
 * Push a set of vehicles and record what came back.
 *
 * `mode` is what this ledger is asking for. A link the website still has in
 * preview will answer 'preview' whatever is asked, and nothing is written
 * there — which is exactly how the dry run works.
 */
const pushVehicles = async (companyId, vehicles, mode, trigger) => {
    const connector = await (0, exports.readConnector)(companyId);
    if (!connector || !connector.enabled) {
        return { at: Date.now(), trigger, mode, error: 'No website is linked to this company.' };
    }
    const result = await (0, exports.callIngest)(connector, {
        mode,
        companyId,
        vehicles,
    });
    const summary = result.ok
        ? {
            at: Date.now(),
            trigger,
            mode: result.data.mode,
            counts: result.data.counts,
            results: result.data.results,
        }
        : { at: Date.now(), trigger, mode, error: result.message };
    await writeLog(companyId, summary);
    // The website is the authority on whether a link is still in preview, so a
    // reply is also how the ledger finds out it was moved on at the far end.
    if (result.ok && result.data.linkMode && result.data.linkMode !== connector.mode) {
        await db().ref(connectorPath(companyId)).update({
            mode: result.data.linkMode === 'live' ? 'live' : 'preview',
            enabled: result.data.linkMode !== 'revoked',
        });
    }
    return summary;
};
exports.pushVehicles = pushVehicles;
/**
 * The per-vehicle push kept out of the manual one's way.
 *
 * A car changing while somebody is halfway through a backfill would otherwise
 * overwrite the backfill's summary with a one-car one, and the Settings card
 * would look like it had only done a single vehicle.
 */
const writeLog = async (companyId, summary) => {
    const key = summary.trigger === 'vehicle' ? 'lastVehiclePush' : 'latest';
    await db().ref(`${connectorPath(companyId)}/log/${key}`).set(summary);
};
//# sourceMappingURL=push.js.map