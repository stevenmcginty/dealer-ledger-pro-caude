/**
 * Web push, from the browser's side.
 *
 * Firebase Cloud Messaging hands each browser a registration token. The token
 * addresses a browser on a device, not a person, so it is registered per device
 * — turning alerts on for a phone says nothing about the desktop — and it is
 * kept in localStorage so the same device can be taken back off the list later
 * without having to ask Google for the token again.
 *
 * The background half lives in public/sw.js, which loads the compat SDK and
 * lets it install its own push and notificationclick handlers. Everything here
 * is about the foreground: getting permission, getting the token to the
 * functions, and turning an alert that arrives while the app is open into a
 * toast rather than a notification the browser would suppress anyway.
 *
 * Nothing here throws for an unsupported browser. Push is an extra channel on
 * top of the WhatsApp alert and the Agent Inbox; a phone that cannot do it is
 * told so plainly rather than shown a broken button.
 */

import firebase from 'firebase/compat/app';
import { deleteToken, getMessaging, getToken, isSupported, onMessage, type MessagePayload } from 'firebase/messaging';
import { CONFIG } from '../config';
import { registerPushToken, unregisterPushToken } from './salesAgentService';

/**
 * - `enabled`     this device is on the list
 * - `available`   it could be, nobody has asked yet
 * - `blocked`     notifications were refused in the browser's own settings
 * - `needs-install` unused: shade alerts are Android-only, iOS is `unsupported`
 * - `unsupported` the browser has no push, or is a private window
 * - `unconfigured` this build has no Cloud Messaging keys (see config.ts)
 */
export type PushStatus =
    | 'enabled'
    | 'available'
    | 'blocked'
    | 'needs-install'
    | 'unsupported'
    | 'unconfigured';

/** What an owner alert looks like by the time it reaches the app. */
export interface PushAlert {
    title: string;
    body: string;
    convId: string;
    url: string;
    kind: string;
}

const TOKEN_KEY = 'dlp.pushToken';

const readStoredToken = (): string => {
    try {
        return window.localStorage.getItem(TOKEN_KEY) || '';
    } catch {
        // Private windows and locked-down embedded browsers throw on access.
        return '';
    }
};

const writeStoredToken = (token: string): void => {
    try {
        if (token) window.localStorage.setItem(TOKEN_KEY, token);
        else window.localStorage.removeItem(TOKEN_KEY);
    } catch {
        // Losing the token only means this device cannot unregister itself
        // cleanly; the function prunes it when Google reports it as dead.
    }
};

/** iPadOS reports itself as a Mac, so touch points are the giveaway. */
const isIos = (): boolean =>
    /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

const isInstalled = (): boolean => {
    if ((navigator as any).standalone === true) return true;
    try {
        return window.matchMedia('(display-mode: standalone)').matches;
    } catch {
        return false;
    }
};

/** Every key has to be present before a token can be asked for. */
export const isPushConfigured = (): boolean =>
    !!(CONFIG.FIREBASE_VAPID_KEY && CONFIG.FIREBASE_MESSAGING_SENDER_ID && CONFIG.FIREBASE_APP_ID);

/** A short label for the token record, so the function's list is readable. */
const describePlatform = (): string => {
    const ua = navigator.userAgent;
    const device = isIos() ? 'iOS' : /Android/.test(ua) ? 'Android' : /Mac/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : 'web';
    return isInstalled() ? `${device} (installed)` : device;
};

const messaging = async () => {
    if (!isPushConfigured()) return null;
    if (!(await isSupported())) return null;
    try {
        // The already-initialised compat app, for the same reason the callables
        // use it: a bare getMessaging() can miss it when compat and modular
        // SDKs are both in the bundle.
        return getMessaging(firebase.app());
    } catch {
        // Missing app config values, or a browser that passed isSupported()
        // but has no service worker (a private window in some Firefox builds).
        return null;
    }
};

/** What the settings card shows without asking the user for anything. */
export const readPushStatus = async (): Promise<PushStatus> => {
    if (!isPushConfigured()) return 'unconfigured';
    // Shade alerts (Approve / Edit on the notification) are Android Chrome only.
    // iOS web push cannot do those buttons, so we do not offer it. A token that
    // was already granted can still be turned off.
    if (isIos()) {
        if (Notification.permission === 'granted' && readStoredToken()) return 'enabled';
        return 'unsupported';
    }
    if (!(await isSupported())) return 'unsupported';
    if (Notification.permission === 'denied') return 'blocked';
    if (Notification.permission === 'granted' && readStoredToken()) return 'enabled';
    return 'available';
};

/**
 * Ask for permission, get a token, and put this device on the company's list.
 *
 * Returns the status to show afterwards, so the caller does not have to guess
 * why nothing happened when somebody dismissed the permission prompt.
 */
export const enablePush = async (companyId: string): Promise<PushStatus> => {
    const status = await readPushStatus();
    if (status !== 'available' && status !== 'enabled') return status;

    const permission = await Notification.requestPermission();
    if (permission === 'denied') return 'blocked';
    if (permission !== 'granted') return 'available';

    const instance = await messaging();
    if (!instance) return 'unsupported';

    // The alerts have to be shown by the worker that is already running the
    // app's caching, not by a second registration fighting it for the scope.
    const registration = await navigator.serviceWorker.ready;

    const token = await getToken(instance, {
        vapidKey: CONFIG.FIREBASE_VAPID_KEY,
        serviceWorkerRegistration: registration,
    });

    if (!token) return 'available';

    await registerPushToken(companyId, token, describePlatform());
    writeStoredToken(token);
    return 'enabled';
};

/**
 * Keep this device on the list.
 *
 * A registration token is not for life: Google rotates them, and the function
 * deletes any token FCM reports as dead. Until this existed nothing ever put a
 * fresh token back, so a phone that had been turned on once could quietly drop
 * off the list while its settings page still said "On for this device". Run on
 * every app start where permission has already been granted; the register call
 * is an idempotent set, so doing it too often costs nothing.
 */
export const syncPushToken = async (companyId: string): Promise<void> => {
    try {
        if (!isPushConfigured() || isIos()) return;
        if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
        if (!(await isSupported())) return;

        const instance = await messaging();
        if (!instance) return;

        const registration = await navigator.serviceWorker.ready;
        const token = await getToken(instance, {
            vapidKey: CONFIG.FIREBASE_VAPID_KEY,
            serviceWorkerRegistration: registration,
        });
        if (!token) return;

        await registerPushToken(companyId, token, describePlatform());
        writeStoredToken(token);
    } catch (err) {
        console.warn('[push] could not refresh the push token for this device', err);
    }
};

/**
 * Raise a real notification from the page.
 *
 * A push delivered to a visible tab is handed to onMessage and never shown by
 * the browser, so a draft that lands while the app is open would only ever be
 * a toast. Steve wants it in the shade with Approve / Edit regardless, and the
 * worker's click handler treats this exactly like one it showed itself.
 */
export const showAlertNotification = async (alert: PushAlert): Promise<void> => {
    try {
        if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
        if (!('serviceWorker' in navigator)) return;
        const registration = await navigator.serviceWorker.ready;
        const isDraft = alert.kind === 'draft';
        const isQuestion = alert.kind === 'question';
        const actions = isDraft
            ? [{ action: 'approve', title: 'Approve' }, { action: 'review', title: 'Edit' }]
            : isQuestion
                ? [{ action: 'review', title: 'Answer' }]
                : [{ action: 'review', title: 'Open' }];
        await registration.showNotification(alert.title || 'Dave', {
            body: alert.body,
            icon: '/icons/icon-192.png',
            badge: '/icons/favicon-32.png',
            tag: alert.convId || alert.kind || 'dave',
            renotify: true,
            requireInteraction: isDraft || isQuestion,
            vibrate: [80, 40, 80],
            data: { convId: alert.convId, kind: alert.kind, url: alert.url },
            actions,
        } as NotificationOptions);
    } catch (err) {
        console.warn('[push] could not show the notification', err);
    }
};

/** Take this device back off the list, and give the token back to Google. */
export const disablePush = async (companyId: string): Promise<PushStatus> => {
    const token = readStoredToken();
    if (token) {
        try {
            await unregisterPushToken(companyId, token);
        } catch {
            // Worth carrying on: a token that is no longer deleted below would
            // otherwise keep this device on the list with no way to get it off.
        }
    }

    const instance = await messaging();
    if (instance) {
        try {
            await deleteToken(instance);
        } catch {
            // Already gone, or the browser revoked it first.
        }
    }

    writeStoredToken('');
    return readPushStatus();
};

const toAlert = (payload: MessagePayload): PushAlert => ({
    title: payload.notification?.title || 'Dave',
    body: payload.notification?.body || '',
    convId: payload.data?.convId || '',
    url: payload.data?.url || payload.fcmOptions?.link || '',
    kind: payload.data?.kind || '',
});

/**
 * Alerts that arrive while the app is open.
 *
 * The browser will not raise a notification for a message it delivered to a
 * visible tab, so this is the only way Steve sees it without switching away.
 * Returns the unsubscribe; setting up is asynchronous, so it is safe to call
 * and tear down again before the SDK has finished loading.
 */
export const onPushAlert = (handler: (alert: PushAlert) => void): (() => void) => {
    let stop: (() => void) | null = null;
    let cancelled = false;

    void (async () => {
        const instance = await messaging();
        if (!instance || cancelled) return;
        stop = onMessage(instance, payload => handler(toAlert(payload)));
    })();

    return () => {
        cancelled = true;
        if (stop) stop();
    };
};
