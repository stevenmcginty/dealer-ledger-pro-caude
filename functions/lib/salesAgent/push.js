"use strict";
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
exports.salesAgentUnregisterPush = exports.salesAgentRegisterPush = exports.sendOwnerPush = exports.alertLink = void 0;
const admin = __importStar(require("firebase-admin"));
const functions = __importStar(require("firebase-functions/v1"));
const conversations_1 = require("./conversations");
const types_1 = require("./types");
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
const pushTokensPath = (companyId) => (0, conversations_1.agentPath)(companyId, 'pushTokens');
/** The app is served from Hosting; the link has to be absolute for FCM to accept it. */
const appBaseUrl = () => (process.env.SALES_AGENT_APP_URL || 'https://motor-ledger-pro.web.app').replace(/\/+$/, '');
/**
 * Where a tapped notification lands.
 *
 * The app routes on the path (`/app/<view>`, see contexts/UIContext.tsx), not on a
 * hash, and the Agent Inbox picks the conversation up out of `?conv=`.
 */
const alertLink = (convId) => `${appBaseUrl()}/app/agentInbox${convId ? `?conv=${encodeURIComponent(convId)}` : ''}`;
exports.alertLink = alertLink;
const readTokens = async (companyId) => {
    const snap = await (0, conversations_1.db)().ref(pushTokensPath(companyId)).once('value');
    const saved = (snap.val() || {});
    return Object.entries(saved)
        .map(([key, record]) => ({ key, token: String(record?.token || key) }))
        .filter(entry => !!entry.token);
};
const chunk = (items, size) => {
    const out = [];
    for (let i = 0; i < items.length; i += size)
        out.push(items.slice(i, i + size));
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
const sendOwnerPush = async (companyId, settings, alert) => {
    try {
        if (settings?.pushNotifications === false)
            return 0;
        const tokens = await readTokens(companyId);
        if (!tokens.length)
            return 0;
        const link = (0, exports.alertLink)(alert.convId);
        const title = settings?.agentName || 'Dave';
        const body = alert.text.slice(0, alert.kind === 'draft' ? DRAFT_BODY_LIMIT : BODY_LIMIT);
        let delivered = 0;
        const dead = [];
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
                        badge: '/icons/favicon-32.png',
                        // One conversation replaces its own previous alert rather than
                        // stacking three notifications for the same customer.
                        tag: alert.convId || alert.kind,
                    },
                    fcmOptions: { link },
                },
            });
            response.responses.forEach((result, index) => {
                if (result.success) {
                    delivered += 1;
                    return;
                }
                if (result.error?.code === 'messaging/registration-token-not-registered') {
                    dead.push(batch[index].key);
                }
            });
        }
        if (dead.length) {
            const updates = {};
            dead.forEach(key => { updates[key] = null; });
            await (0, conversations_1.db)().ref(pushTokensPath(companyId)).update(updates);
        }
        return delivered;
    }
    catch (error) {
        console.error(`Push alert for company ${companyId} could not be sent`, error);
        return 0;
    }
};
exports.sendOwnerPush = sendOwnerPush;
// --- Callables for the app --------------------------------------------------
/** This device has been granted permission and wants the alerts. */
exports.salesAgentRegisterPush = functions.https.onCall(async (data, context) => {
    const companyId = await (0, conversations_1.requireMember)(context, data?.companyId);
    const token = String(data?.token || '').trim();
    const platform = String(data?.platform || 'web').trim().slice(0, 40);
    if (!token) {
        throw new functions.https.HttpsError('invalid-argument', 'No push token was given.');
    }
    const record = {
        token,
        uid: context.auth?.uid,
        platform: platform || 'web',
        updatedAt: Date.now(),
    };
    await (0, conversations_1.db)().ref(`${pushTokensPath(companyId)}/${(0, types_1.rtdbKey)(token)}`).set(record);
    return { ok: true };
});
/** Turned off on this device, or signing out of it. */
exports.salesAgentUnregisterPush = functions.https.onCall(async (data, context) => {
    const companyId = await (0, conversations_1.requireMember)(context, data?.companyId);
    const token = String(data?.token || '').trim();
    if (!token) {
        throw new functions.https.HttpsError('invalid-argument', 'No push token was given.');
    }
    await (0, conversations_1.db)().ref(`${pushTokensPath(companyId)}/${(0, types_1.rtdbKey)(token)}`).remove();
    return { ok: true };
});
//# sourceMappingURL=push.js.map