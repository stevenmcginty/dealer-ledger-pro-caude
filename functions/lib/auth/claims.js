"use strict";
/**
 * Company membership as custom auth claims.
 *
 * Cloud Storage security rules cannot read the Realtime Database (get()/exists()
 * are Firestore-only there), so storage.rules checks `request.auth.token.companyId`
 * instead. These functions keep that claim in step with `users/{uid}/companyId`,
 * and add `peers` — the companies sharing this one's WhatsApp/Gmail inbox — so a
 * peer can read and delete the other ledger's WhatsApp media.
 *
 * Claims only reach the client on the next ID token refresh; the app calls
 * refreshAuthClaims on sign-in when the token has no companyId, then forces a
 * refresh (see services/authClaims.ts).
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
exports.refreshAuthClaims = exports.syncInboxClaims = exports.syncCompanyClaim = exports.syncClaimsForUser = exports.claimsForCompany = void 0;
const functions = __importStar(require("firebase-functions/v1"));
const admin = __importStar(require("firebase-admin"));
const db = () => admin.database();
const peersOf = async (companyId) => {
    const inboxIdSnap = await db().ref(`salesAgentRouting/inboxMembers/${companyId}`).once('value');
    const inboxId = inboxIdSnap.val();
    if (!inboxId)
        return undefined;
    const inboxSnap = await db().ref(`salesAgentRouting/sharedInboxes/${inboxId}/memberCompanyIds`).once('value');
    const raw = inboxSnap.val();
    const ids = Array.isArray(raw) ? raw : raw && typeof raw === 'object' ? Object.values(raw) : [];
    const peers = Array.from(new Set([companyId, ...ids.filter((id) => typeof id === 'string' && !!id)]));
    return peers.length > 1 ? peers : undefined;
};
const claimsForCompany = async (companyId) => {
    if (!companyId)
        return { companyId: null };
    const peers = await peersOf(companyId);
    return peers ? { companyId, peers } : { companyId };
};
exports.claimsForCompany = claimsForCompany;
/** Write the claims for one user, keeping any unrelated claims they already have. */
const syncClaimsForUser = async (uid, companyId) => {
    const next = await (0, exports.claimsForCompany)(companyId);
    let existing = {};
    try {
        existing = (await admin.auth().getUser(uid)).customClaims || {};
    }
    catch (error) {
        console.warn(`claims: no auth user for ${uid}`, error);
        return next;
    }
    const merged = { ...existing, companyId: next.companyId };
    if (next.peers)
        merged.peers = next.peers;
    else
        delete merged.peers;
    if (JSON.stringify(merged) !== JSON.stringify(existing)) {
        await admin.auth().setCustomUserClaims(uid, merged);
    }
    return next;
};
exports.syncClaimsForUser = syncClaimsForUser;
const usersOfCompany = async (companyId) => {
    const snap = await db().ref(`companies/${companyId}/users`).once('value');
    return Object.keys(snap.val() || {});
};
/** users/{uid}/companyId changed (new user, or account joined a company). */
exports.syncCompanyClaim = functions.database
    .ref('/users/{uid}/companyId')
    .onWrite(async (change, context) => {
    const uid = context.params.uid;
    const companyId = change.after.val() || null;
    await (0, exports.syncClaimsForUser)(uid, companyId);
});
/** A company joined or left a shared inbox: every member of every company on it gets fresh peers. */
exports.syncInboxClaims = functions.database
    .ref('/salesAgentRouting/inboxMembers/{companyId}')
    .onWrite(async (change, context) => {
    const companyId = context.params.companyId;
    const touched = new Set([companyId]);
    for (const snap of [change.before, change.after]) {
        const inboxId = snap.val();
        if (!inboxId)
            continue;
        const members = await db().ref(`salesAgentRouting/sharedInboxes/${inboxId}/memberCompanyIds`).once('value');
        const raw = members.val();
        const ids = Array.isArray(raw) ? raw : raw && typeof raw === 'object' ? Object.values(raw) : [];
        ids.forEach(id => typeof id === 'string' && touched.add(id));
    }
    for (const id of touched) {
        for (const uid of await usersOfCompany(id))
            await (0, exports.syncClaimsForUser)(uid, id);
    }
});
/**
 * Called by the app when a signed-in user's token has no companyId yet (everyone
 * who signed up before claims existed). Sets the claims from the database and
 * returns them; the client then forces a token refresh.
 */
exports.refreshAuthClaims = functions.https.onCall(async (_data, context) => {
    const uid = context.auth?.uid;
    if (!uid)
        throw new functions.https.HttpsError('unauthenticated', 'Sign in first.');
    const snap = await db().ref(`users/${uid}/companyId`).once('value');
    return (0, exports.syncClaimsForUser)(uid, snap.val() || null);
});
//# sourceMappingURL=claims.js.map