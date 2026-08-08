/**
 * Firebase Cloud Functions for Dealer Ledger Pro
 *
 * Vehicle Lookup
 * - Merges DVSA MOT History and DVLA VES data for a registration
 * - Refreshes MOT status for all vehicles in stock, daily and on demand
 *
 * Website Connector
 * - Pushes stock to a linked dealer website as it changes
 * - Inert until a site is paired; see connectors/sync.ts
 *
 * ---------------------------------------------------------------------------
 * DISCONTINUED: the Gmail auto-response system (8 Aug 2026)
 *
 * The pollers, the OAuth exchange and the scheduled sender are no longer
 * exported. They were never deployed to this project, and the exports were the
 * one thing standing between a plain `firebase deploy --only functions` and a
 * mailbox being polled every five minutes on Steve's behalf. Taking them out
 * makes "do not deploy these" a property of the code rather than something
 * somebody has to remember.
 *
 * Nothing in the app breaks. The client never reached these: services/
 * gmailService.ts posts to /api/gmail/exchange-code — a path Firebase Hosting
 * rewrites to index.html, so it was never a working call — and sends mail
 * straight to the Gmail REST API from the browser with the user's own token.
 *
 * The code is untouched under ./gmail and ./autoResponse, and the settings
 * screen still exists. Reviving it is putting these four lines back:
 *
 *   export { pollAllGmailInboxes } from './gmail/poll';
 *   export { processScheduledResponses, cancelScheduledResponse,
 *            sendScheduledResponseNow } from './autoResponse/schedule';
 *   export { exchangeGmailCode, refreshGmailToken } from './gmail/oauth';
 *   export { sendGmailEmail } from './gmail/send';
 * ---------------------------------------------------------------------------
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

// Initialize Firebase Admin
admin.initializeApp();

// Export scheduled functions
export { refreshStockMotStatus } from './vehicle/motSweep';

// Export database triggers
export { syncVehicleToWebsite } from './connectors/sync';

// Export callable functions for client-side use
export { lookupVehicleByReg } from './vehicle/lookup';
export { runMotSweepNow } from './vehicle/motSweep';
export { linkWebsite, unlinkWebsite, previewWebsiteSync, pushAllStockNow } from './connectors/link';

// Health check function
export const healthCheck = functions.https.onRequest((req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        service: 'Dealer Ledger Pro Functions'
    });
});
