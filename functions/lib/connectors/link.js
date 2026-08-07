"use strict";
/**
 * Pairing this ledger with a website, and pushing stock on demand.
 *
 * The pairing code is made in the website's back office and pasted in here. It
 * is a base64 envelope holding the endpoint, the write token, the name the site
 * knows this ledger by, and the link's id. Nothing is saved until the token has
 * been proved against the live endpoint, so a mistyped code cannot leave a
 * connector behind that quietly fails every night.
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
exports.pushAllStockNow = exports.previewWebsiteSync = exports.unlinkWebsite = exports.linkWebsite = void 0;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
const push_1 = require("./push");
const sync_1 = require("./sync");
const db = () => admin.database();
const connectorPath = (companyId) => `companies/${companyId}/connectors/website`;
/** Reads the pasted code, or says in plain words what is wrong with it. */
const parsePairing = (raw) => {
    const text = String(raw || '').trim();
    if (!text) {
        throw new functions.https.HttpsError('invalid-argument', 'Paste the pairing code from the website first.');
    }
    let decoded;
    try {
        decoded = Buffer.from(text, 'base64').toString('utf8');
    }
    catch (e) {
        throw new functions.https.HttpsError('invalid-argument', "That does not look like a pairing code — copy the whole thing, including the end.");
    }
    let parsed;
    try {
        parsed = JSON.parse(decoded);
    }
    catch (e) {
        throw new functions.https.HttpsError('invalid-argument', "That does not look like a pairing code — copy the whole thing, including the end.");
    }
    const url = String(parsed?.url || '').trim();
    const token = String(parsed?.token || '').trim();
    if (!url || !token) {
        throw new functions.https.HttpsError('invalid-argument', 'That pairing code is missing the address or the token. Create a fresh one in the website back office.');
    }
    // The token is a write credential. Sending it over plain HTTP would put it
    // on the wire in clear for anyone on the same network to lift.
    if (!/^https:\/\//i.test(url)) {
        throw new functions.https.HttpsError('invalid-argument', 'The website address in that code is not https. Pairing has been stopped rather than send the token unencrypted.');
    }
    return {
        url,
        token,
        dealer: String(parsed?.dealer || '').trim() || 'This ledger',
        linkId: String(parsed?.linkId || '').trim(),
    };
};
const requireAuth = (context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'You need to be signed in to do that.');
    }
    return context.auth.uid;
};
const hostOf = (endpoint) => {
    try {
        return new URL(endpoint).host;
    }
    catch (e) {
        return endpoint;
    }
};
/**
 * Pair with a website.
 *
 * Saves nothing until the site has answered. A link always arrives in preview:
 * the first thing that happens after pairing is a dry run showing exactly what
 * would change, and the ledger writes to nobody's website until that has been
 * read and accepted.
 */
exports.linkWebsite = functions
    .runWith({ timeoutSeconds: 60 })
    .https.onCall(async (data, context) => {
    const uid = requireAuth(context);
    const companyId = await (0, sync_1.companyIdForUser)(uid);
    const pairing = parsePairing(data?.pairing);
    const probe = await (0, push_1.callIngest)({ endpoint: pairing.url, token: pairing.token }, { action: 'status' });
    if (!probe.ok) {
        throw new functions.https.HttpsError('failed-precondition', probe.message);
    }
    const site = probe.data;
    const connector = {
        endpoint: pairing.url,
        token: pairing.token,
        dealer: site.dealer || pairing.dealer,
        linkId: site.linkId || pairing.linkId,
        // The website is the authority on this, not the pasted code.
        mode: site.mode === 'live' ? 'live' : 'preview',
        enabled: true,
        connectedAt: Date.now(),
        connectedBy: uid,
        host: hostOf(pairing.url),
    };
    await db().ref(connectorPath(companyId)).set(connector);
    return { ...connector, token: undefined };
});
/** Forget the website. The cars already sent stay where they are — taking live
 *  adverts down is a decision for whoever is looking at them. */
exports.unlinkWebsite = functions.https.onCall(async (_data, context) => {
    const uid = requireAuth(context);
    const companyId = await (0, sync_1.companyIdForUser)(uid);
    await db().ref(connectorPath(companyId)).remove();
    return { ok: true };
});
/** The dry run. Sends the whole forecourt and writes nothing, whatever mode the
 *  link is in — this is the button that answers "what would this do?". */
exports.previewWebsiteSync = functions
    .runWith({ timeoutSeconds: 300, memory: '512MB' })
    .https.onCall(async (_data, context) => {
    const uid = requireAuth(context);
    const companyId = await (0, sync_1.companyIdForUser)(uid);
    const connector = await (0, push_1.readConnector)(companyId);
    if (!connector) {
        throw new functions.https.HttpsError('failed-precondition', 'No website is linked yet.');
    }
    const vehicles = await (0, push_1.readStockForWebsite)(companyId);
    const summary = await (0, push_1.pushVehicles)(companyId, vehicles, 'preview', 'preview');
    if (summary.error) {
        throw new functions.https.HttpsError('unavailable', summary.error);
    }
    return summary;
});
/**
 * Push everything in stock for real.
 *
 * `goLive` is the one-way step out of preview: it tells the website to take
 * this link off the leash, then sends the forecourt. Both halves are here so
 * the person reading the dry run can act on it without leaving the page.
 */
exports.pushAllStockNow = functions
    .runWith({ timeoutSeconds: 540, memory: '512MB' })
    .https.onCall(async (data, context) => {
    const uid = requireAuth(context);
    const companyId = await (0, sync_1.companyIdForUser)(uid);
    const connector = await (0, push_1.readConnector)(companyId);
    if (!connector) {
        throw new functions.https.HttpsError('failed-precondition', 'No website is linked yet.');
    }
    if (data?.goLive) {
        const promoted = await (0, push_1.callIngest)(connector, { action: 'go-live' });
        if (!promoted.ok) {
            throw new functions.https.HttpsError('unavailable', promoted.message);
        }
        await db().ref(connectorPath(companyId)).update({ mode: 'live' });
    }
    const vehicles = await (0, push_1.readStockForWebsite)(companyId);
    const summary = await (0, push_1.pushVehicles)(companyId, vehicles, 'live', 'manual');
    if (summary.error) {
        throw new functions.https.HttpsError('unavailable', summary.error);
    }
    return summary;
});
//# sourceMappingURL=link.js.map