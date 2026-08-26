"use strict";
/**
 * Keeping a linked website in step with the stock list.
 *
 * This is a database trigger rather than a change to the app's write paths on
 * purpose. Adding a vehicle, editing one, raising a deposit slip, raising a
 * sales invoice, undoing a sale — every one of those already writes to
 * companies/{id}/vehicles/{vid}, so watching that one node picks all of them
 * up and not a single existing line of the app had to change to get it.
 *
 * The people using this app are using it right now. The trigger's first act on
 * an unlinked company is to stop.
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
exports.companyIdForUser = exports.syncVehicleToWebsite = void 0;
const functions = __importStar(require("firebase-functions/v1"));
const admin = __importStar(require("firebase-admin"));
const payload_1 = require("./payload");
const push_1 = require("./push");
exports.syncVehicleToWebsite = functions
    .runWith({ timeoutSeconds: 60, memory: '256MB' })
    .database.ref('/companies/{companyId}/vehicles/{vehicleId}')
    .onWrite(async (change, context) => {
    const { companyId, vehicleId } = context.params;
    const before = change.before.exists() ? change.before.val() : null;
    const after = change.after.exists() ? change.after.val() : null;
    // A vehicle deleted from the ledger is left alone on the website. Taking
    // a live advert down is a decision with a customer on the other end of
    // it, and it belongs to whoever is looking at the advert — not to a
    // tidy-up in the back office here.
    if (!after)
        return null;
    if (!(0, payload_1.isWorthPushing)(before, after))
        return null;
    const connector = await (0, push_1.readConnector)(companyId);
    if (!connector || !connector.enabled || connector.mode !== 'live')
        return null;
    const payload = (0, payload_1.buildVehiclePayload)({ ...after, id: vehicleId });
    if (!payload)
        return null;
    // Selling a car the website never had is not news to it. Checking here
    // rather than letting the endpoint answer "never advertised" saves a
    // round trip on every sale of a car that was never online.
    if (payload.status === 'Sold' && !connector.known?.[payload.reg])
        return null;
    try {
        const summary = await (0, push_1.pushVehicles)(companyId, [payload], 'live', 'vehicle');
        if (summary.error) {
            // Logged, not thrown: the vehicle write itself has already
            // succeeded and must never be undone by a website being down.
            console.warn(`Company ${companyId}: website push for ${payload.reg} did not land — ${summary.error}`);
        }
    }
    catch (error) {
        console.error(`Company ${companyId}: website push for ${payload.reg} failed`, error);
    }
    return null;
});
/** Exported for the callables, which need the same company lookup. */
const companyIdForUser = async (uid) => {
    const snap = await admin.database().ref(`users/${uid}/companyId`).once('value');
    const companyId = snap.val();
    if (!companyId) {
        throw new functions.https.HttpsError('failed-precondition', 'No company is linked to this account');
    }
    // The pointer alone used to say whose data to touch. The database rules
    // only grant a client write on companies/{id} when it is a member, so the
    // functions must not act on a pointer the client could have repointed at
    // somebody else's company.
    const member = await admin.database().ref(`companies/${companyId}/users/${uid}`).once('value');
    if (!member.exists()) {
        throw new functions.https.HttpsError('permission-denied', 'You do not have access to this company');
    }
    return companyId;
};
exports.companyIdForUser = companyIdForUser;
//# sourceMappingURL=sync.js.map