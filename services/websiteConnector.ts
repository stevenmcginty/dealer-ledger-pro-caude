/**
 * The link between this ledger and a dealer website.
 *
 * The work happens in the `connectors/*` Cloud Functions; this module only
 * reads the connector they keep and exposes the buttons in Settings. It follows
 * services/motSweep.ts, which does the same job for the nightly MOT check.
 */

import { getFunctions, httpsCallable } from 'firebase/functions';
import firebase from 'firebase/compat/app';
import { db } from './firebase';
import { WebsiteConnector, WebsitePushSummary } from '../types';

/**
 * Realtime Database drops empty arrays rather than storing them, so a push
 * where nothing was skipped comes back with no `results` key at all. Put the
 * lists back before anything downstream reads `.length`.
 */
const withEmptyLists = (raw: any): WebsitePushSummary | undefined => {
    if (!raw) return undefined;
    return { ...raw, results: raw.results || [] } as WebsitePushSummary;
};

/**
 * Live view of the connector, including the last push it made.
 *
 * The write token is dropped on the way through. Only the Cloud Functions ever
 * need it, and a credential that never enters the page cannot leave in a screen
 * share, a screenshot or a stray console.log.
 */
export const subscribeToWebsiteConnector = (
    companyId: string,
    cb: (connector: WebsiteConnector | null) => void
) => {
    const ref = db.ref(`companies/${companyId}/connectors/website`);
    const listener = (snap: firebase.database.DataSnapshot) => {
        if (!snap.exists()) return cb(null);
        const { token, ...raw } = snap.val() || {};
        cb({
            ...raw,
            log: {
                latest: withEmptyLists(raw?.log?.latest),
                lastVehiclePush: withEmptyLists(raw?.log?.lastVehiclePush),
            },
        } as WebsiteConnector);
    };
    ref.on('value', listener);
    return () => ref.off('value', listener);
};

/**
 * Turns whatever came back from a callable into a sentence worth showing.
 *
 * The website answers every refusal with wording meant to be read by a person —
 * "the DVLA key has not been set", "that link was revoked" — so the job here is
 * to pass it through rather than replace it with something vaguer.
 */
const readableError = (error: any, fallback: string): Error => {
    if (error?.code === 'functions/unauthenticated') {
        return new Error('You need to be signed in to do that.');
    }
    if (error?.code === 'functions/deadline-exceeded') {
        return new Error('The website is taking longer than expected to answer. It may still finish — reopen this page in a minute.');
    }
    return new Error(error?.message || fallback);
};

const call = async <TReq, TRes>(name: string, payload: TReq, timeout: number, fallback: string): Promise<TRes> => {
    const callable = httpsCallable<TReq, TRes>(getFunctions(firebase.app()), name, { timeout });
    try {
        const { data } = await callable(payload);
        return data;
    } catch (error: any) {
        throw readableError(error, fallback);
    }
};

/** Pair with a website using the code from its back office. */
export const linkWebsite = (pairing: string) =>
    call<{ pairing: string }, WebsiteConnector>(
        'linkWebsite', { pairing }, 60_000,
        'Could not connect to that website.');

export const unlinkWebsite = () =>
    call<void, { ok: boolean }>('unlinkWebsite', undefined as any, 60_000, 'Could not disconnect.');

/**
 * The dry run. Sends every car in stock and writes nothing at either end, so
 * the answer is a complete account of what a real push would do.
 */
export const previewWebsiteSync = () =>
    call<void, WebsitePushSummary>(
        'previewWebsiteSync', undefined as any, 300_000,
        'The dry run did not finish.');

/**
 * Push the whole forecourt for real. `goLive` is the one-way step out of
 * preview — after it, changes in the ledger reach the website on their own.
 */
export const pushAllStockNow = (goLive = false) =>
    call<{ goLive: boolean }, WebsitePushSummary>(
        'pushAllStockNow', { goLive }, 540_000,
        'The push did not finish.');

/** Plain English for what the website did with one car. */
export const describeAction = (action: string): string => {
    switch (action) {
        case 'created': return 'Added to the website as Not published';
        case 'updated': return 'Details updated';
        case 'unchanged': return 'Already up to date';
        case 'skipped': return 'Left alone';
        case 'failed': return 'Failed';
        default: return action;
    }
};

/** Plain English for where the website is showing a car. */
export const describeSiteState = (state?: string): string => {
    switch (state) {
        case 'available': return 'For sale';
        case 'reserved': return 'Reserved';
        case 'sold': return 'Sold';
        case 'draft': return 'Not published';
        case 'new': return 'Not there yet';
        default: return '—';
    }
};

export const formatPushTime = (timestamp?: number): string =>
    timestamp
        ? new Date(timestamp).toLocaleString('en-GB', {
            day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
        })
        : '';
