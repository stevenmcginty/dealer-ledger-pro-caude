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

/**
 * What a manual push should carry.
 *
 * Everything still in stock, plus any car the website already knows about even
 * once it is sold. That second half is what makes "push all stock now" able to
 * put things right: if the site was down at the moment a sales invoice was
 * raised, the trigger's one attempt is gone, and without this the sold car
 * would sit on the website as for sale forever with no way to correct it.
 *
 * A car sold before it was ever advertised is still left out — the website has
 * never heard of it and has nothing to publish.
 */
export const readStockForWebsite = async (companyId: string): Promise<WebsiteVehiclePayload[]> => {
    const [vehiclesSnap, knownSnap] = await Promise.all([
        db().ref(`companies/${companyId}/vehicles`).once('value'),
        db().ref(`${connectorPath(companyId)}/known`).once('value'),
    ]);

    const raw = vehiclesSnap.val() as Record<string, any> | null;
    if (!raw) return [];
    const known = (knownSnap.val() as Record<string, true> | null) || {};

    return Object.entries(raw)
        .map(([id, v]) => buildVehiclePayload({ ...v, id }))
        .filter((p): p is WebsiteVehiclePayload => p !== null)
        .filter(p => p.status !== 'Sold' || known[p.reg] === true)
        .slice(0, MAX_PER_PUSH);
};

/**
 * Remember which registrations the website is actually holding.
 *
 * Kept here on the connector rather than as a flag on the vehicle record: the
 * vehicle list is the ledger's own live data and this feature does not write to
 * it. Storage keys cannot contain a full stop, and a UK registration never
 * does, so the reg is safe to use directly.
 */
const rememberRegs = async (companyId: string, results: WebsitePushResponse['results']) => {
    const updates: Record<string, true> = {};
    results.forEach(r => {
        if (r.action === 'created' || r.action === 'updated' || r.action === 'unchanged') {
            updates[r.reg] = true;
        }
    });
    if (!Object.keys(updates).length) return;
    await db().ref(`${connectorPath(companyId)}/known`).update(updates);
};

interface IngestOk { ok: true; data: WebsitePushResponse; }
interface IngestFail { ok: false; status?: number; message: string; }
export type IngestResult = IngestOk | IngestFail;

/**
 * Written as a type guard rather than leaning on `if (result.ok)`. This package
 * is compiled twice — once by its own strict tsconfig for deployment, and once
 * by the app's non-strict one, which sweeps the whole repo. Narrowing on the
 * boolean is only reliable under the first of those; a guard holds under both.
 */
export const ingestFailed = (result: IngestResult): result is IngestFail => !result.ok;

/**
 * Talk to the site.
 *
 * A network failure is reported, never thrown past the caller — a website that
 * is down for ten minutes must not turn into a failed vehicle write in the
 * ledger, which is the one thing that would make this feature dangerous.
 */
export const callIngest = async (
    connector: Pick<WebsiteConnector, 'endpoint' | 'token'>,
    body: Record<string, unknown>,
    timeoutMs = 30_000
): Promise<IngestResult> => {
    let response: Response;
    try {
        response = await fetch(connector.endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${connector.token}`,
            },
            body: JSON.stringify(body),
            // Without this a website that accepts the connection and then never
            // answers would hold the function open until its own timeout kills
            // it, and the log would say nothing about why.
            signal: AbortSignal.timeout(timeoutMs),
        });
    } catch (error: any) {
        const timedOut = error?.name === 'TimeoutError' || error?.name === 'AbortError';
        return {
            ok: false,
            message: timedOut
                ? `${hostOf(connector.endpoint)} did not answer in time.`
                : `Could not reach ${hostOf(connector.endpoint)} — ${error?.message || 'no answer'}.`,
        };
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
 * How many cars go in one request.
 *
 * The far end reads two files and writes two files per car, and it is a
 * serverless function with a hard ceiling on how long it may run — a whole
 * forecourt in a single request would be cut off partway through, with no way
 * to tell which cars made it. Fifteen keeps every request comfortably inside
 * even the shortest of those ceilings, and a backfill is a handful of requests
 * rather than one that cannot finish.
 */
const CHUNK = 15;

const chunk = <T>(items: T[], size: number): T[][] => {
    const out: T[][] = [];
    for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
    return out;
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

    const counts = { created: 0, updated: 0, unchanged: 0, skipped: 0, failed: 0 };
    const results: WebsitePushResponse['results'] = [];
    let answeredMode: 'preview' | 'live' = mode;
    let linkMode: WebsitePushResponse['linkMode'] | undefined;

    const batches = chunk(vehicles, CHUNK);
    // An empty push still goes once: it is how a link proves it works.
    if (!batches.length) batches.push([]);

    for (const batch of batches) {
        const result = await callIngest(
            connector,
            { mode, companyId, vehicles: batch },
            30_000 + batch.length * 2_000
        );

        if (ingestFailed(result)) {
            // Report where it stopped rather than pretending the whole push
            // failed — the cars already sent are on the website and saying
            // otherwise would send somebody looking for a problem that is not
            // there. Running it again picks up where this left off.
            const done = results.length;
            const summary: WebsitePushSummary = {
                at: Date.now(),
                trigger,
                mode,
                error: done
                    ? `${result.message} ${done} of ${vehicles.length} cars had already been sent — run it again to finish.`
                    : result.message,
                counts,
                results,
            };
            await writeLog(companyId, summary);
            return summary;
        }

        answeredMode = result.data.mode;
        linkMode = result.data.linkMode;
        results.push(...(result.data.results || []));
        Object.keys(counts).forEach(key => {
            counts[key as keyof typeof counts] += (result.data.counts as any)?.[key] || 0;
        });

        // Only a real push proves the website is holding these cars; a dry run
        // wrote nothing, so it must not leave the ledger believing otherwise.
        if (result.data.mode === 'live') {
            await rememberRegs(companyId, result.data.results || []);
        }
    }

    const summary: WebsitePushSummary = {
        at: Date.now(),
        trigger,
        mode: answeredMode,
        counts,
        results,
    };

    await writeLog(companyId, summary);

    // The website is the authority on whether a link is still in preview, so a
    // reply is also how the ledger finds out it was moved on at the far end.
    if (linkMode && linkMode !== connector.mode) {
        await db().ref(connectorPath(companyId)).update({
            mode: linkMode === 'live' ? 'live' : 'preview',
            enabled: linkMode !== 'revoked',
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
