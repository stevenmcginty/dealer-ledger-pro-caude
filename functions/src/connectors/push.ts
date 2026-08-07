/**
 * Sending stock to a linked website.
 *
 * Everything about this is deliberately inert until somebody pairs a site:
 * with no connector saved, every function here returns before it reaches the
 * network. That is what lets the trigger sit over a live, busy vehicle list
 * without changing anything for the people using it.
 */

import * as admin from 'firebase-admin';

import { buildVehiclePayload } from './payload';
import {
    WebsiteConnector,
    WebsitePushResponse,
    WebsitePushSummary,
    WebsiteVehiclePayload,
} from './types';

const db = () => admin.database();

/** One push carries at most this many cars; the endpoint refuses more. */
const MAX_PER_PUSH = 400;

const connectorPath = (companyId: string) => `companies/${companyId}/connectors/website`;

export const readConnector = async (companyId: string): Promise<WebsiteConnector | null> => {
    const snap = await db().ref(connectorPath(companyId)).once('value');
    return snap.exists() ? (snap.val() as WebsiteConnector) : null;
};

/** Unsold stock, oldest first. A car sold before it was ever advertised has
 *  nothing to say to a website, so the backfill leaves it out entirely. */
export const readStockForWebsite = async (companyId: string): Promise<WebsiteVehiclePayload[]> => {
    const snap = await db().ref(`companies/${companyId}/vehicles`).once('value');
    const raw = snap.val() as Record<string, any> | null;
    if (!raw) return [];

    return Object.entries(raw)
        .filter(([, v]) => v && v.status !== 'Sold')
        .map(([id, v]) => buildVehiclePayload({ ...v, id }))
        .filter((p): p is WebsiteVehiclePayload => p !== null)
        .slice(0, MAX_PER_PUSH);
};

/**
 * Talk to the site.
 *
 * A network failure is reported, never thrown past the caller — a website that
 * is down for ten minutes must not turn into a failed vehicle write in the
 * ledger, which is the one thing that would make this feature dangerous.
 */
export const callIngest = async (
    connector: Pick<WebsiteConnector, 'endpoint' | 'token'>,
    body: Record<string, unknown>
): Promise<{ ok: true; data: WebsitePushResponse } | { ok: false; status?: number; message: string }> => {
    let response: Response;
    try {
        response = await fetch(connector.endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${connector.token}`,
            },
            body: JSON.stringify(body),
        });
    } catch (error: any) {
        return { ok: false, message: `Could not reach ${hostOf(connector.endpoint)} — ${error?.message || 'no answer'}.` };
    }

    const text = await response.text();
    let data: any = null;
    try { data = text ? JSON.parse(text) : null; } catch (e) { /* not JSON */ }

    if (!response.ok) {
        // The site answers every refusal with a sentence meant to be read by a
        // person. Pass it through word for word rather than inventing one.
        return {
            ok: false,
            status: response.status,
            message: (data && data.message) || `The website answered ${response.status}.`,
        };
    }

    return { ok: true, data: data as WebsitePushResponse };
};

const hostOf = (endpoint: string): string => {
    try { return new URL(endpoint).host; } catch (e) { return 'the website'; }
};

/**
 * Push a set of vehicles and record what came back.
 *
 * `mode` is what this ledger is asking for. A link the website still has in
 * preview will answer 'preview' whatever is asked, and nothing is written
 * there — which is exactly how the dry run works.
 */
export const pushVehicles = async (
    companyId: string,
    vehicles: WebsiteVehiclePayload[],
    mode: 'preview' | 'live',
    trigger: WebsitePushSummary['trigger']
): Promise<WebsitePushSummary> => {
    const connector = await readConnector(companyId);
    if (!connector || !connector.enabled) {
        return { at: Date.now(), trigger, mode, error: 'No website is linked to this company.' };
    }

    const result = await callIngest(connector, {
        mode,
        companyId,
        vehicles,
    });

    const summary: WebsitePushSummary = result.ok
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

/**
 * The per-vehicle push kept out of the manual one's way.
 *
 * A car changing while somebody is halfway through a backfill would otherwise
 * overwrite the backfill's summary with a one-car one, and the Settings card
 * would look like it had only done a single vehicle.
 */
const writeLog = async (companyId: string, summary: WebsitePushSummary) => {
    const key = summary.trigger === 'vehicle' ? 'lastVehiclePush' : 'latest';
    await db().ref(`${connectorPath(companyId)}/log/${key}`).set(summary);
};
