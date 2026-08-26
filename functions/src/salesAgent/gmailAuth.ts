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

import * as functions from 'firebase-functions/v1';
import { google } from 'googleapis';
import type { gmail_v1 } from 'googleapis';

import { db, privatePath, readPrivate, requireMember, routingPath } from './conversations';

export const GMAIL_SECRETS = ['GMAIL_CLIENT_ID', 'GMAIL_CLIENT_SECRET'];

export const GMAIL_SCOPES = [
    'https://www.googleapis.com/auth/gmail.modify',
    'https://www.googleapis.com/auth/gmail.send',
];

/** The topic Gmail publishes inbox changes to. Must already exist, with
 *  gmail-api-push@system.gserviceaccount.com granted Pub/Sub Publisher on it. */
export const GMAIL_PUSH_TOPIC_NAME = 'gmail-sales-agent';

const projectId = (): string =>
    process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || 'motor-ledger-pro';

export const gmailPushTopic = (): string => `projects/${projectId()}/topics/${GMAIL_PUSH_TOPIC_NAME}`;

/**
 * Must match a redirect URI registered on the OAuth client exactly, including the
 * region. Overridable so a non-default region or a hosting rewrite does not need a
 * code change.
 */
export const oauthRedirectUri = (): string =>
    process.env.GMAIL_REDIRECT_URI ||
    `https://us-central1-${projectId()}.cloudfunctions.net/salesAgentGmailOAuthCallback`;

/** Where the browser lands once consent is done. */
const appReturnUrl = (result: 'connected' | 'failed'): string =>
    `${process.env.SALES_AGENT_APP_URL || 'https://motor-ledger-pro.web.app'}/app/settings?gmail=${result}`;

/** googleapis bundles its own copy of google-auth-library, so the client type is taken
 *  from the constructor we actually call rather than from the top-level package — the
 *  two copies are structurally identical but nominally different to TypeScript. */
type GoogleOAuth2Client = InstanceType<typeof google.auth.OAuth2>;

const oauthClient = (): GoogleOAuth2Client => {
    const clientId = process.env.GMAIL_CLIENT_ID;
    const clientSecret = process.env.GMAIL_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
        throw new Error('GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET are not set');
    }

    return new google.auth.OAuth2(clientId, clientSecret, oauthRedirectUri());
};

/**
 * An authenticated Gmail client for one company.
 *
 * Only the refresh token is stored; the library exchanges it for a short-lived access
 * token on the first call, so nothing long-lived ever sits in an Authorization header
 * we wrote ourselves.
 */
export const gmailClientFor = async (companyId: string): Promise<gmail_v1.Gmail> => {
    const priv = await readPrivate(companyId);
    const refreshToken = priv.gmail?.refreshToken;

    if (!refreshToken) {
        throw new Error(`Gmail is not connected for company ${companyId}`);
    }

    const auth = oauthClient();
    auth.setCredentials({ refresh_token: refreshToken });

    return google.gmail({ version: 'v1', auth });
};

/**
 * Start or refresh the inbox watch, and record where the history now starts.
 *
 * The returned historyId is the floor for the next push: everything before it has
 * already been seen, everything after it is new mail.
 */
export const startGmailWatch = async (companyId: string): Promise<string | undefined> => {
    const gmail = await gmailClientFor(companyId);

    const result = await gmail.users.watch({
        userId: 'me',
        requestBody: {
            topicName: gmailPushTopic(),
            labelIds: ['INBOX'],
            labelFilterBehavior: 'INCLUDE',
        },
    });

    const historyId = result.data.historyId ? String(result.data.historyId) : undefined;
    const expiration = result.data.expiration ? Number(result.data.expiration) : undefined;

    const patch: Record<string, unknown> = {};
    if (historyId) patch.historyId = historyId;
    if (expiration) patch.watchExpiration = expiration;
    if (Object.keys(patch).length) await db().ref(privatePath(companyId, 'gmail')).update(patch);

    return historyId;
};

/** The push arrives naming a mailbox, so the mailbox has to point back at a company. */
export const registerGmailRouting = async (email: string, companyId: string): Promise<void> => {
    if (!email) return;
    await db().ref(routingPath(`gmailAddresses/${email.trim().toLowerCase().replace(/[.#$[\]/]/g, '_')}`)).set(companyId);
};

// --- Callables and endpoints ------------------------------------------------

/** Step one: hand the app a consent URL to open. */
export const salesAgentGmailAuthUrl = functions
    .runWith({ secrets: GMAIL_SECRETS })
    .https.onCall(async (data, context) => {
        const companyId = await requireMember(context, data?.companyId);

        const url = oauthClient().generateAuthUrl({
            access_type: 'offline',
            // Without this Google withholds the refresh token on every consent after the
            // first, and the connection silently dies when the access token expires.
            prompt: 'consent',
            scope: GMAIL_SCOPES,
            state: companyId,
            include_granted_scopes: true,
        });

        return { url, redirectUri: oauthRedirectUri() };
    });

/**
 * Step two: Google sends the browser back here with a code. Exchange it, store the
 * refresh token, start the watch, and bounce the user back into the app.
 */
export const salesAgentGmailOAuthCallback = functions
    .runWith({ secrets: GMAIL_SECRETS, timeoutSeconds: 120 })
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
            const gmail = google.gmail({ version: 'v1', auth });
            const profile = await gmail.users.getProfile({ userId: 'me' });
            const email = (profile.data.emailAddress || '').toLowerCase();

            await db().ref(privatePath(companyId, 'gmail')).update({
                refreshToken: tokens.refresh_token,
                email,
            });

            await registerGmailRouting(email, companyId);
            await startGmailWatch(companyId);

            res.redirect(appReturnUrl('connected'));
        } catch (error) {
            console.error(`Gmail OAuth callback failed for company ${companyId}`, error);
            res.redirect(appReturnUrl('failed'));
        }
    });

/**
 * A watch lasts seven days. Renewing daily means a failed run has six more chances
 * before the mailbox goes quiet, which is the difference between a warning in the logs
 * and a week of missed enquiries.
 */
export const salesAgentGmailRenewWatch = functions
    .runWith({ secrets: GMAIL_SECRETS, timeoutSeconds: 300 })
    .pubsub.schedule('0 4 * * *')
    .timeZone('Europe/London')
    .onRun(async () => {
        const snap = await db().ref(routingPath('gmailAddresses')).once('value');
        const companies = Array.from(new Set(Object.values((snap.val() || {}) as Record<string, string>)));

        for (const companyId of companies) {
            try {
                await startGmailWatch(companyId);
                console.log(`Gmail watch renewed for company ${companyId}`);
            } catch (error) {
                console.error(`Gmail watch renewal failed for company ${companyId}`, error);
            }
        }

        return null;
    });
