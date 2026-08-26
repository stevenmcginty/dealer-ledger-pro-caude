/**
 * Web push to Steve's phone.
 *
 * WhatsApp is the alert channel that always worked, but it costs a template send
 * outside the 24-hour window and it is not where Steve is looking when he is in the
 * app. Firebase Cloud Messaging puts the same alert on the lock screen of every
 * device that has asked for it, and a tap lands on the conversation it is about.
 *
 * The token store is `companies/{cid}/salesAgent/pushTokens/{key}`. It is inside the
 * company tree on purpose: a registration token is not a credential — it addresses a
 * browser, it does not authorise anything — and members already read that subtree.
 * The key is the token run through `rtdbKey`, so the raw token is kept in the record
 * rather than recovered from the path.
 *
 * Nothing in here is allowed to take an alert down with it. A push is the second
 * channel; if it fails, the WhatsApp message and the Agent Inbox are still there.
 */

import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions/v1';

import { agentPath, db, requireMember } from './conversations';
import { OwnerAlert, SalesAgentSettings, rtdbKey } from './types';

/** One registered browser. `token` is the real thing; the RTDB key is a sanitised copy. */
export interface PushToken {
    token: string;
    uid: string;
    platform: string;
    updatedAt: number;
}

/** FCM refuses more than 500 tokens in one multicast. */
const MULTICAST_LIMIT = 500;

/** A notification body is a glance, not a read. The whole alert is in the app. */
const BODY_LIMIT = 200;

/**
 * Except for a draft. The point of that alert is that Steve reads the actual words the
 * agent wants to send and answers SEND without opening anything, so it gets room for the
 * 300 characters of draft the alert carries plus the line that explains how to approve it.
 */
const DRAFT_BODY_LIMIT = 450;

const pushTokensPath = (companyId: string) => agentPath(companyId, 'pushTokens');

/** The app is served from Hosting; the link has to be absolute for FCM to accept it. */
const appBaseUrl = (): string =>
    (process.env.SALES_AGENT_APP_URL || 'https://motor-ledger-pro.web.app').replace(/\/+$/, '');

/**
 * Where a tapped notification lands.
 *
 * Not a view change. `?dave=` is picked up by the notification bell so Steve can
 * approve or edit the draft on whatever page he is already on. Opening the Agent
 * Inbox (or Settings) on tap is how the previous link wasted the click.
 */
export const alertLink = (convId: string): string =>
    `${appBaseUrl()}/app${convId ? `?dave=${encodeURIComponent(convId)}` : ''}`;

const readTokens = async (companyId: string): Promise<Array<{ key: string; token: string }>> => {
    const snap = await db().ref(pushTokensPath(companyId)).once('value');
    const saved = (snap.val() || {}) as Record<string, Partial<PushToken>>;

    return Object.entries(saved)
        .map(([key, record]) => ({ key, token: String(record?.token || key) }))
        .filter(entry => !!entry.token);
};

const chunk = <T>(items: T[], size: number): T[][] => {
    const out: T[][] = [];
    for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
    return out;
};

/**
 * Send one alert to every device this company has registered.
 *
 * Returns the number of devices it reached, so the stored OwnerAlert can say that the
 * ping landed even when WhatsApp was the thing that failed. Tokens FCM reports as dead
 * are deleted: a browser that has cleared its site data never comes back, and left
 * alone they accumulate until every send is mostly failures.
 */
export const sendOwnerPush = async (
    companyId: string,
    settings: SalesAgentSettings | null,
    alert: OwnerAlert
): Promise<number> => {
    try {
        if (settings?.pushNotifications === false) return 0;

        const tokens = await readTokens(companyId);
        if (!tokens.length) return 0;

        const link = alertLink(alert.convId);
        const title = settings?.agentName || 'Dave';
        const body = alert.text.slice(0, alert.kind === 'draft' ? DRAFT_BODY_LIMIT : BODY_LIMIT);

        let delivered = 0;
        const dead: string[] = [];

        const isDraft = alert.kind === 'draft';
        const isQuestion = alert.kind === 'question';
        const actions = isDraft
            ? [
                { action: 'approve', title: 'Approve' },
                { action: 'review', title: 'Edit' },
            ]
            : isQuestion
                ? [{ action: 'review', title: 'Answer' }]
                : [{ action: 'review', title: 'Open' }];

        for (const batch of chunk(tokens, MULTICAST_LIMIT)) {
            const response = await admin.messaging().sendEachForMulticast({
                tokens: batch.map(entry => entry.token),
                notification: { title, body },
                data: {
                    convId: alert.convId,
                    kind: alert.kind,
                    shortId: String(alert.shortId),
                    url: link,
                },
                webpush: {
                    notification: {
                        title,
                        body,
                        icon: '/icons/icon-192.png',
                        badge: '/icons/badge-96.png',
                        // One conversation replaces its own previous alert rather than
                        // stacking three notifications for the same customer.
                        tag: alert.convId || alert.kind,
                        renotify: true,
                        requireInteraction: isDraft || isQuestion,
                        vibrate: [80, 40, 80],
                        actions,
                    },
                    fcmOptions: { link },
                },
            });

            response.responses.forEach((result, index) => {
                if (result.success) {
                    delivered += 1;
                    return;
                }
                console.warn(
                    `Push to company ${companyId} device ${batch[index].key.slice(0, 12)}… failed: ${result.error?.code || 'unknown'} ${result.error?.message || ''}`
                );
                if (result.error?.code === 'messaging/registration-token-not-registered') {
                    dead.push(batch[index].key);
                }
            });
        }

        if (dead.length) {
            console.warn(`Pruning ${dead.length} dead push token(s) for company ${companyId}`);
            const updates: Record<string, null> = {};
            dead.forEach(key => { updates[key] = null; });
            await db().ref(pushTokensPath(companyId)).update(updates);
        }

        return delivered;
    } catch (error) {
        console.error(`Push alert for company ${companyId} could not be sent`, error);
        return 0;
    }
};

// --- Callables for the app --------------------------------------------------

/** This device has been granted permission and wants the alerts. */
export const salesAgentRegisterPush = functions.https.onCall(async (data, context) => {
    const companyId = await requireMember(context, data?.companyId);
    const token = String(data?.token || '').trim();
    const platform = String(data?.platform || 'web').trim().slice(0, 40);

    if (!token) {
        throw new functions.https.HttpsError('invalid-argument', 'No push token was given.');
    }

    const record: PushToken = {
        token,
        uid: context.auth?.uid as string,
        platform: platform || 'web',
        updatedAt: Date.now(),
    };

    await db().ref(`${pushTokensPath(companyId)}/${rtdbKey(token)}`).set(record);
    return { ok: true };
});

/**
 * "Is my phone actually going to get these?" answered in one tap.
 *
 * Sends a real alert to every registered device and reports how many were
 * reached, plus whether the calling device's own token is on the list — the app
 * cannot see that, and a phone that thinks it is on can be quietly dead.
 */
export const salesAgentTestPush = functions.https.onCall(async (data, context) => {
    const companyId = await requireMember(context, data?.companyId);
    const token = String(data?.token || '').trim();

    const tokens = await readTokens(companyId);
    const thisDevice = !!token && tokens.some(entry => entry.token === token);

    const delivered = await sendOwnerPush(companyId, null, {
        id: 'test',
        kind: 'error',
        convId: '',
        shortId: 0,
        text: "Test alert from the sales desk. If you can read this, Dave's alerts are reaching this phone.",
        sentAt: Date.now(),
    });

    const remaining = await readTokens(companyId);
    return { devices: tokens.length, delivered, thisDevice, stillRegistered: remaining.length };
});

/** Turned off on this device, or signing out of it. */
export const salesAgentUnregisterPush = functions.https.onCall(async (data, context) => {
    const companyId = await requireMember(context, data?.companyId);
    const token = String(data?.token || '').trim();

    if (!token) {
        throw new functions.https.HttpsError('invalid-argument', 'No push token was given.');
    }

    await db().ref(`${pushTokensPath(companyId)}/${rtdbKey(token)}`).remove();
    return { ok: true };
});
