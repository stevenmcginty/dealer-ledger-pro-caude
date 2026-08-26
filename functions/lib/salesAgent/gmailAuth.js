"use strict";
/**
 * Getting into radlettcars@gmail.com, and staying in.
 *
 * Steve signs in once through a normal Google consent screen; what we keep is a refresh
 * token, which is the only credential here that lasts. The client id and secret are
 * functions secrets rather than database rows — they belong to the Google Cloud project,
 * not to a company — and they are only mounted on the four functions that need them.
 *
 * The mailbox is watched, not polled. `users.watch` tells Gmail to publish to the
 * gmail-sales-agent Pub/Sub topic whenever the inbox changes, and that subscription
 * expires after seven days, which is what the daily renewal exists to prevent.
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
exports.salesAgentGmailRenewWatch = exports.salesAgentGmailOAuthCallback = exports.salesAgentGmailAuthUrl = exports.registerGmailRouting = exports.startGmailWatch = exports.gmailClientFor = exports.oauthRedirectUri = exports.gmailPushTopic = exports.GMAIL_PUSH_TOPIC_NAME = exports.GMAIL_SCOPES = exports.GMAIL_SECRETS = void 0;
const functions = __importStar(require("firebase-functions/v1"));
const googleapis_1 = require("googleapis");
const conversations_1 = require("./conversations");
const inboxRouting_1 = require("./inboxRouting");
exports.GMAIL_SECRETS = ['GMAIL_CLIENT_ID', 'GMAIL_CLIENT_SECRET'];
exports.GMAIL_SCOPES = [
    'https://www.googleapis.com/auth/gmail.modify',
    'https://www.googleapis.com/auth/gmail.send',
];
/** The topic Gmail publishes inbox changes to. Must already exist, with
 *  gmail-api-push@system.gserviceaccount.com granted Pub/Sub Publisher on it. */
exports.GMAIL_PUSH_TOPIC_NAME = 'gmail-sales-agent';
const projectId = () => process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || 'motor-ledger-pro';
const gmailPushTopic = () => `projects/${projectId()}/topics/${exports.GMAIL_PUSH_TOPIC_NAME}`;
exports.gmailPushTopic = gmailPushTopic;
/**
 * Must match a redirect URI registered on the OAuth client exactly, including the
 * region. Overridable so a non-default region or a hosting rewrite does not need a
 * code change.
 */
const oauthRedirectUri = () => process.env.GMAIL_REDIRECT_URI ||
    `https://us-central1-${projectId()}.cloudfunctions.net/salesAgentGmailOAuthCallback`;
exports.oauthRedirectUri = oauthRedirectUri;
/** Where the browser lands once consent is done. */
const appReturnUrl = (result) => `${process.env.SALES_AGENT_APP_URL || 'https://motor-ledger-pro.web.app'}/app/settings?gmail=${result}`;
const oauthClient = () => {
    const clientId = process.env.GMAIL_CLIENT_ID;
    const clientSecret = process.env.GMAIL_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
        throw new Error('GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET are not set');
    }
    return new googleapis_1.google.auth.OAuth2(clientId, clientSecret, (0, exports.oauthRedirectUri)());
};
/**
 * An authenticated Gmail client for one company.
 *
 * Only the refresh token is stored; the library exchanges it for a short-lived access
 * token on the first call, so nothing long-lived ever sits in an Authorization header
 * we wrote ourselves.
 */
const gmailClientFor = async (companyId) => {
    const priv = await (0, conversations_1.readPrivate)(companyId);
    const refreshToken = priv.gmail?.refreshToken;
    if (!refreshToken) {
        throw new Error(`Gmail is not connected for company ${companyId}`);
    }
    const auth = oauthClient();
    auth.setCredentials({ refresh_token: refreshToken });
    return googleapis_1.google.gmail({ version: 'v1', auth });
};
exports.gmailClientFor = gmailClientFor;
/**
 * Start or refresh the inbox watch, and record where the history now starts.
 *
 * The returned historyId is the floor for the next push: everything before it has
 * already been seen, everything after it is new mail.
 */
const startGmailWatch = async (companyId) => {
    const gmail = await (0, exports.gmailClientFor)(companyId);
    const result = await gmail.users.watch({
        userId: 'me',
        requestBody: {
            topicName: (0, exports.gmailPushTopic)(),
            labelIds: ['INBOX'],
            labelFilterBehavior: 'INCLUDE',
        },
    });
    const historyId = result.data.historyId ? String(result.data.historyId) : undefined;
    const expiration = result.data.expiration ? Number(result.data.expiration) : undefined;
    const patch = {};
    if (historyId)
        patch.historyId = historyId;
    if (expiration)
        patch.watchExpiration = expiration;
    if (Object.keys(patch).length)
        await (0, conversations_1.db)().ref((0, conversations_1.privatePath)(companyId, 'gmail')).update(patch);
    return historyId;
};
exports.startGmailWatch = startGmailWatch;
/** The push arrives naming a mailbox, so the mailbox has to point back at a company. */
const registerGmailRouting = async (email, companyId) => {
    if (!email)
        return;
    await (0, conversations_1.db)().ref((0, conversations_1.routingPath)(`gmailAddresses/${email.trim().toLowerCase().replace(/[.#$[\]/]/g, '_')}`)).set(companyId);
};
exports.registerGmailRouting = registerGmailRouting;
// --- Callables and endpoints ------------------------------------------------
/** Step one: hand the app a consent URL to open. */
exports.salesAgentGmailAuthUrl = functions
    .runWith({ secrets: exports.GMAIL_SECRETS })
    .https.onCall(async (data, context) => {
    const companyId = await (0, conversations_1.requireMember)(context, data?.companyId);
    const url = oauthClient().generateAuthUrl({
        access_type: 'offline',
        // Without this Google withholds the refresh token on every consent after the
        // first, and the connection silently dies when the access token expires.
        prompt: 'consent',
        scope: exports.GMAIL_SCOPES,
        state: companyId,
        include_granted_scopes: true,
    });
    return { url, redirectUri: (0, exports.oauthRedirectUri)() };
});
/**
 * Step two: Google sends the browser back here with a code. Exchange it, store the
 * refresh token, start the watch, and bounce the user back into the app.
 */
exports.salesAgentGmailOAuthCallback = functions
    .runWith({ secrets: exports.GMAIL_SECRETS, timeoutSeconds: 120 })
    .https.onRequest(async (req, res) => {
    const code = String(req.query.code || '');
    const companyId = String(req.query.state || '');
    if (!code || !companyId) {
        res.redirect(appReturnUrl('failed'));
        return;
    }
    try {
        const auth = oauthClient();
        const { tokens } = await auth.getToken(code);
        if (!tokens.refresh_token) {
            // Happens when the account was already connected and consent was skipped.
            throw new Error('Google did not return a refresh token; revoke the app at myaccount.google.com and try again');
        }
        auth.setCredentials(tokens);
        const gmail = googleapis_1.google.gmail({ version: 'v1', auth });
        const profile = await gmail.users.getProfile({ userId: 'me' });
        const email = (profile.data.emailAddress || '').toLowerCase();
        await (0, conversations_1.db)().ref((0, conversations_1.privatePath)(companyId, 'gmail')).update({
            refreshToken: tokens.refresh_token,
            email,
        });
        await (0, exports.registerGmailRouting)(email, companyId);
        await (0, inboxRouting_1.bindInboxChannelsFromPrivate)(companyId);
        await (0, exports.startGmailWatch)(companyId);
        res.redirect(appReturnUrl('connected'));
    }
    catch (error) {
        console.error(`Gmail OAuth callback failed for company ${companyId}`, error);
        res.redirect(appReturnUrl('failed'));
    }
});
/**
 * A watch lasts seven days. Renewing daily means a failed run has six more chances
 * before the mailbox goes quiet, which is the difference between a warning in the logs
 * and a week of missed enquiries.
 */
exports.salesAgentGmailRenewWatch = functions
    .runWith({ secrets: exports.GMAIL_SECRETS, timeoutSeconds: 300 })
    .pubsub.schedule('0 4 * * *')
    .timeZone('Europe/London')
    .onRun(async () => {
    const snap = await (0, conversations_1.db)().ref((0, conversations_1.routingPath)('gmailAddresses')).once('value');
    const companies = Array.from(new Set(Object.values((snap.val() || {}))));
    for (const companyId of companies) {
        try {
            await (0, exports.startGmailWatch)(companyId);
            console.log(`Gmail watch renewed for company ${companyId}`);
        }
        catch (error) {
            console.error(`Gmail watch renewal failed for company ${companyId}`, error);
        }
    }
    return null;
});
//# sourceMappingURL=gmailAuth.js.map