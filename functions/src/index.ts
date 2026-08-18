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
