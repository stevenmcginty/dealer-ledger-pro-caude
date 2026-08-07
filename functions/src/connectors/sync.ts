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

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

import { buildVehiclePayload, isWorthPushing } from './payload';
import { pushVehicles, readConnector } from './push';

export const syncVehicleToWebsite = functions
    .runWith({ timeoutSeconds: 60, memory: '256MB' })
    .database.ref('/companies/{companyId}/vehicles/{vehicleId}')
    .onWrite(async (change, context) => {
        const { companyId, vehicleId } = context.params as { companyId: string; vehicleId: string };

        const before = change.before.exists() ? change.before.val() : null;
        const after = change.after.exists() ? change.after.val() : null;

        // A vehicle deleted from the ledger is left alone on the website. Taking
        // a live advert down is a decision with a customer on the other end of
        // it, and it belongs to whoever is looking at the advert — not to a
        // tidy-up in the back office here.
        if (!after) return null;

        if (!isWorthPushing(before, after)) return null;

        const connector = await readConnector(companyId);
        if (!connector || !connector.enabled || connector.mode !== 'live') return null;

        const payload = buildVehiclePayload({ ...after, id: vehicleId });
        if (!payload) return null;

        try {
            const summary = await pushVehicles(companyId, [payload], 'live', 'vehicle');
            if (summary.error) {
                // Logged, not thrown: the vehicle write itself has already
                // succeeded and must never be undone by a website being down.
                console.warn(`Company ${companyId}: website push for ${payload.reg} did not land — ${summary.error}`);
            }
        } catch (error) {
            console.error(`Company ${companyId}: website push for ${payload.reg} failed`, error);
        }

        return null;
    });

/** Exported for the callables, which need the same company lookup. */
export const companyIdForUser = async (uid: string): Promise<string> => {
    const snap = await admin.database().ref(`users/${uid}/companyId`).once('value');
    const companyId = snap.val() as string | null;
    if (!companyId) {
        throw new functions.https.HttpsError('failed-precondition', 'No company is linked to this account');
    }
    return companyId;
};
