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

import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';

const db = () => admin.database();

export interface CompanyClaims {
    companyId: string | null;
    /** Companies whose inbox this one shares, including itself. Absent when not shared. */
    peers?: string[];
}

const peersOf = async (companyId: string): Promise<string[] | undefined> => {
    const inboxIdSnap = await db().ref(`salesAgentRouting/inboxMembers/${companyId}`).once('value');
    const inboxId = inboxIdSnap.val() as string | null;
    if (!inboxId) return undefined;
    const inboxSnap = await db().ref(`salesAgentRouting/sharedInboxes/${inboxId}/memberCompanyIds`).once('value');
    const raw = inboxSnap.val();
    const ids = Array.isArray(raw) ? raw : raw && typeof raw === 'object' ? Object.values(raw) : [];
    const peers = Array.from(new Set([companyId, ...ids.filter((id): id is string => typeof id === 'string' && !!id)]));
    return peers.length > 1 ? peers : undefined;
};

export const claimsForCompany = async (companyId: string | null): Promise<CompanyClaims> => {
    if (!companyId) return { companyId: null };
    const peers = await peersOf(companyId);
    return peers ? { companyId, peers } : { companyId };
};

/** Write the claims for one user, keeping any unrelated claims they already have. */
export const syncClaimsForUser = async (uid: string, companyId: string | null): Promise<CompanyClaims> => {
    const next = await claimsForCompany(companyId);
    let existing: Record<string, unknown> = {};
    try {
        existing = (await admin.auth().getUser(uid)).customClaims || {};
    } catch (error) {
        console.warn(`claims: no auth user for ${uid}`, error);
        return next;
    }
    const merged: Record<string, unknown> = { ...existing, companyId: next.companyId };
    if (next.peers) merged.peers = next.peers;
    else delete merged.peers;
    if (JSON.stringify(merged) !== JSON.stringify(existing)) {
        await admin.auth().setCustomUserClaims(uid, merged);
    }
    return next;
};

const usersOfCompany = async (companyId: string): Promise<string[]> => {
    const snap = await db().ref(`companies/${companyId}/users`).once('value');
    return Object.keys(snap.val() || {});
};

/** users/{uid}/companyId changed (new user, or account joined a company). */
export const syncCompanyClaim = functions.database
    .ref('/users/{uid}/companyId')
    .onWrite(async (change, context) => {
        const uid = context.params.uid as string;
        const companyId = (change.after.val() as string | null) || null;
        await syncClaimsForUser(uid, companyId);
    });

/** A company joined or left a shared inbox: every member of every company on it gets fresh peers. */
export const syncInboxClaims = functions.database
    .ref('/salesAgentRouting/inboxMembers/{companyId}')
    .onWrite(async (change, context) => {
        const companyId = context.params.companyId as string;
        const touched = new Set<string>([companyId]);
        for (const snap of [change.before, change.after]) {
            const inboxId = snap.val() as string | null;
            if (!inboxId) continue;
            const members = await db().ref(`salesAgentRouting/sharedInboxes/${inboxId}/memberCompanyIds`).once('value');
            const raw = members.val();
            const ids = Array.isArray(raw) ? raw : raw && typeof raw === 'object' ? Object.values(raw) : [];
            ids.forEach(id => typeof id === 'string' && touched.add(id));
        }
        for (const id of touched) {
            for (const uid of await usersOfCompany(id)) await syncClaimsForUser(uid, id);
        }
    });

/**
 * Called by the app when a signed-in user's token has no companyId yet (everyone
 * who signed up before claims existed). Sets the claims from the database and
 * returns them; the client then forces a token refresh.
 */
export const refreshAuthClaims = functions.https.onCall(async (_data, context) => {
    const uid = context.auth?.uid;
    if (!uid) throw new functions.https.HttpsError('unauthenticated', 'Sign in first.');
    const snap = await db().ref(`users/${uid}/companyId`).once('value');
    return syncClaimsForUser(uid, (snap.val() as string | null) || null);
});
