/**
 * Daily MOT refresh for stock.
 *
 * The work happens in the `refreshStockMotStatus` scheduled function; this module
 * only reads the summary it leaves behind and exposes the manual "check now" button.
 */

import firebase from 'firebase/compat/app';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db } from './firebase';
import { MotSweepSummary } from '../types';

/**
 * Realtime Database drops empty arrays rather than storing them, so a sweep that
 * found nothing comes back with no `expired`, `expiringSoon` or `errors` key at all.
 * Put them back before anything downstream reads `.length`.
 */
const withEmptyLists = (raw: Partial<MotSweepSummary>): MotSweepSummary => ({
    ...raw,
    expired: raw.expired || [],
    expiringSoon: raw.expiringSoon || [],
    errors: raw.errors || [],
} as MotSweepSummary);

/** Live view of the last sweep, scheduled or manual. */
export const subscribeToMotSweep = (
    companyId: string,
    cb: (summary: MotSweepSummary | null) => void
) => {
    const sweepRef = db.ref(`companies/${companyId}/motSweep/latest`);
    const listener = (snap: firebase.database.DataSnapshot) =>
        cb(snap.exists() ? withEmptyLists(snap.val()) : null);
    sweepRef.on('value', listener);
    return () => sweepRef.off('value', listener);
};

/**
 * Run the sweep for the signed-in user's company right now.
 *
 * Takes as long as the lookups take — roughly a second per vehicle in stock — so the
 * caller should show a spinner rather than assume this returns quickly.
 */
export const runMotSweepNow = async (): Promise<MotSweepSummary> => {
    // The callable client gives up after 70s by default, well short of a sweep over a
    // full forecourt. Match the function's own timeout instead.
    const callable = httpsCallable<void, MotSweepSummary>(getFunctions(firebase.app()), 'runMotSweepNow', {
        timeout: 540_000,
    });

    try {
        const { data } = await callable();
        return data;
    } catch (error: any) {
        const message: string = error?.message || 'MOT check failed.';
        if (error?.code === 'functions/unauthenticated') {
            throw new Error('You need to be signed in to run the MOT check.');
        }
        if (error?.code === 'functions/deadline-exceeded') {
            throw new Error('The MOT check is taking longer than expected. It may still finish in the background — reopen this page in a minute.');
        }
        throw new Error(message);
    }
};

/** Vehicles are listed soonest-first, so this reads as "the most urgent one". */
export const describeUrgency = (daysRemaining?: number): string => {
    if (daysRemaining === undefined) return 'No MOT date on record';
    if (daysRemaining < 0) return `Expired ${Math.abs(daysRemaining)} day${Math.abs(daysRemaining) === 1 ? '' : 's'} ago`;
    if (daysRemaining === 0) return 'Expires today';
    return `${daysRemaining} day${daysRemaining === 1 ? '' : 's'} left`;
};
