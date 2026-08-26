/**
 * Pairing this ledger with a website, and pushing stock on demand.
 *
 * The pairing code is made in the website's back office and pasted in here. It
 * is a base64 envelope holding the endpoint, the write token, the name the site
 * knows this ledger by, and the link's id. Nothing is saved until the token has
 * been proved against the live endpoint, so a mistyped code cannot leave a
 * connector behind that quietly fails every night.
 */

import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';

import { callIngest, ingestFailed, pushVehicles, readConnector, readStockForWebsite } from './push';
import { companyIdForUser } from './sync';
import { WebsiteConnector } from './types';

const db = () => admin.database();

const connectorPath = (companyId: string) => `companies/${companyId}/connectors/website`;

interface Pairing {
    url: string;
    token: string;
    dealer: string;
    linkId: string;
}

/** Reads the pasted code, or says in plain words what is wrong with it. */
const parsePairing = (raw: unknown): Pairing => {
    const text = String(raw || '').trim();
    if (!text) {
        throw new functions.https.HttpsError('invalid-argument', 'Paste the pairing code from the website first.');
    }

    let decoded: string;
    try {
        decoded = Buffer.from(text, 'base64').toString('utf8');
    } catch (e) {
        throw new functions.https.HttpsError('invalid-argument', "That does not look like a pairing code — copy the whole thing, including the end.");
    }

    let parsed: any;
    try {
        parsed = JSON.parse(decoded);
    } catch (e) {
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

const requireAuth = (context: functions.https.CallableContext): string => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'You need to be signed in to do that.');
    }
    return context.auth.uid;
};

const hostOf = (endpoint: string): string => {
    try { return new URL(endpoint).host; } catch (e) { return endpoint; }
};

/**
 * Pair with a website.
 *
 * Saves nothing until the site has answered. A link always arrives in preview:
 * the first thing that happens after pairing is a dry run showing exactly what
 * would change, and the ledger writes to nobody's website until that has been
 * read and accepted.
 */
export const linkWebsite = functions
    .runWith({ timeoutSeconds: 60 })
    .https.onCall(async (data, context) => {
        const uid = requireAuth(context);
        const companyId = await companyIdForUser(uid);
        const pairing = parsePairing(data?.pairing);

        const probe = await callIngest(
            { endpoint: pairing.url, token: pairing.token },
            { action: 'status' }
        );

        if (ingestFailed(probe)) {
            throw new functions.https.HttpsError('failed-precondition', probe.message);
        }

        const site = probe.data as any;

        const connector: WebsiteConnector = {
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
export const unlinkWebsite = functions.https.onCall(async (_data, context) => {
    const uid = requireAuth(context);
    const companyId = await companyIdForUser(uid);
    await db().ref(connectorPath(companyId)).remove();
    return { ok: true };
});

/** The dry run. Sends the whole forecourt and writes nothing, whatever mode the
 *  link is in — this is the button that answers "what would this do?". */
export const previewWebsiteSync = functions
    .runWith({ timeoutSeconds: 300, memory: '512MB' })
    .https.onCall(async (_data, context) => {
        const uid = requireAuth(context);
        const companyId = await companyIdForUser(uid);

        const connector = await readConnector(companyId);
        if (!connector) {
            throw new functions.https.HttpsError('failed-precondition', 'No website is linked yet.');
        }

        const vehicles = await readStockForWebsite(companyId);
        const summary = await pushVehicles(companyId, vehicles, 'preview', 'preview');
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
export const pushAllStockNow = functions
    .runWith({ timeoutSeconds: 540, memory: '512MB' })
    .https.onCall(async (data, context) => {
        const uid = requireAuth(context);
        const companyId = await companyIdForUser(uid);

        const connector = await readConnector(companyId);
        if (!connector) {
            throw new functions.https.HttpsError('failed-precondition', 'No website is linked yet.');
        }

        if (data?.goLive) {
            const promoted = await callIngest(connector, { action: 'go-live' });
            if (ingestFailed(promoted)) {
                throw new functions.https.HttpsError('unavailable', promoted.message);
            }
            await db().ref(connectorPath(companyId)).update({ mode: 'live' });
        }

        const vehicles = await readStockForWebsite(companyId);
        const summary = await pushVehicles(companyId, vehicles, 'live', 'manual');
        if (summary.error) {
            throw new functions.https.HttpsError('unavailable', summary.error);
        }
        return summary;
    });
