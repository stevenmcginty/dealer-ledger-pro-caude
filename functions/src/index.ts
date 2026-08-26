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

import * as functions from 'firebase-functions/v1';
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

// AI Sales Agent (see docs/sales-agent/SPEC.md) — deploy by name only
export { refreshSalesAgentStock, runSalesAgentStockIndexNow } from './salesAgent/stock';
export { salesAgentWhatsAppWebhook } from './salesAgent/channels/whatsapp';
export { salesAgentSmsWebhook } from './salesAgent/channels/twilio';
export { salesAgentGmailPush, salesAgentBackfillLeads } from './salesAgent/channels/gmail';
export { salesAgentGmailAuthUrl, salesAgentGmailOAuthCallback, salesAgentGmailRenewWatch } from './salesAgent/gmailAuth';
export { salesAgentOutboxTick } from './salesAgent/outbox';
export { salesAgentSetMode, salesAgentSendReply, salesAgentAnswerQuestion, salesAgentInstruct, salesAgentApproveDraft, salesAgentDiscardDraft, salesAgentSavePrivate, salesAgentSaveSharedInbox, salesAgentStartWhatsApp, salesAgentSimulate } from './salesAgent/router';
export { salesAgentRegisterPush, salesAgentUnregisterPush, salesAgentTestPush, salesAgentPushDebug } from './salesAgent/push';

// Health check function
export const healthCheck = functions.https.onRequest((req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        service: 'Dealer Ledger Pro Functions'
    });
});
