/**
 * Firebase Cloud Functions for Dealer Ledger Pro
 *
 * Email Auto-Response System
 * - Polls Gmail for new emails every 5 minutes
 * - Processes scheduled auto-responses every 1 minute
 * - Handles OAuth token refresh
 *
 * Vehicle Lookup
 * - Merges DVSA MOT History and DVLA VES data for a registration
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

// Initialize Firebase Admin
admin.initializeApp();

// Export scheduled functions
export { pollAllGmailInboxes } from './gmail/poll';
export { processScheduledResponses, cancelScheduledResponse, sendScheduledResponseNow } from './autoResponse/schedule';

// Export callable functions for client-side use
export { exchangeGmailCode, refreshGmailToken } from './gmail/oauth';
export { sendGmailEmail } from './gmail/send';
export { lookupVehicleByReg } from './vehicle/lookup';

// Health check function
export const healthCheck = functions.https.onRequest((req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        service: 'Dealer Ledger Pro Email Functions'
    });
});
