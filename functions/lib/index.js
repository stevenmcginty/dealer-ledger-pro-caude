"use strict";
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
exports.healthCheck = exports.salesAgentPushDebug = exports.salesAgentTestPush = exports.salesAgentUnregisterPush = exports.salesAgentRegisterPush = exports.salesAgentSimulate = exports.salesAgentSavePrivate = exports.salesAgentDiscardDraft = exports.salesAgentApproveDraft = exports.salesAgentInstruct = exports.salesAgentAnswerQuestion = exports.salesAgentSendReply = exports.salesAgentSetMode = exports.salesAgentOutboxTick = exports.salesAgentGmailRenewWatch = exports.salesAgentGmailOAuthCallback = exports.salesAgentGmailAuthUrl = exports.salesAgentBackfillLeads = exports.salesAgentGmailPush = exports.salesAgentSmsWebhook = exports.salesAgentWhatsAppWebhook = exports.runSalesAgentStockIndexNow = exports.refreshSalesAgentStock = exports.pushAllStockNow = exports.previewWebsiteSync = exports.unlinkWebsite = exports.linkWebsite = exports.runMotSweepNow = exports.lookupVehicleByReg = exports.syncVehicleToWebsite = exports.refreshStockMotStatus = void 0;
const functions = __importStar(require("firebase-functions/v1"));
const admin = __importStar(require("firebase-admin"));
// Initialize Firebase Admin
admin.initializeApp();
// Export scheduled functions
var motSweep_1 = require("./vehicle/motSweep");
Object.defineProperty(exports, "refreshStockMotStatus", { enumerable: true, get: function () { return motSweep_1.refreshStockMotStatus; } });
// Export database triggers
var sync_1 = require("./connectors/sync");
Object.defineProperty(exports, "syncVehicleToWebsite", { enumerable: true, get: function () { return sync_1.syncVehicleToWebsite; } });
// Export callable functions for client-side use
var lookup_1 = require("./vehicle/lookup");
Object.defineProperty(exports, "lookupVehicleByReg", { enumerable: true, get: function () { return lookup_1.lookupVehicleByReg; } });
var motSweep_2 = require("./vehicle/motSweep");
Object.defineProperty(exports, "runMotSweepNow", { enumerable: true, get: function () { return motSweep_2.runMotSweepNow; } });
var link_1 = require("./connectors/link");
Object.defineProperty(exports, "linkWebsite", { enumerable: true, get: function () { return link_1.linkWebsite; } });
Object.defineProperty(exports, "unlinkWebsite", { enumerable: true, get: function () { return link_1.unlinkWebsite; } });
Object.defineProperty(exports, "previewWebsiteSync", { enumerable: true, get: function () { return link_1.previewWebsiteSync; } });
Object.defineProperty(exports, "pushAllStockNow", { enumerable: true, get: function () { return link_1.pushAllStockNow; } });
// AI Sales Agent (see docs/sales-agent/SPEC.md) — deploy by name only
var stock_1 = require("./salesAgent/stock");
Object.defineProperty(exports, "refreshSalesAgentStock", { enumerable: true, get: function () { return stock_1.refreshSalesAgentStock; } });
Object.defineProperty(exports, "runSalesAgentStockIndexNow", { enumerable: true, get: function () { return stock_1.runSalesAgentStockIndexNow; } });
var whatsapp_1 = require("./salesAgent/channels/whatsapp");
Object.defineProperty(exports, "salesAgentWhatsAppWebhook", { enumerable: true, get: function () { return whatsapp_1.salesAgentWhatsAppWebhook; } });
var twilio_1 = require("./salesAgent/channels/twilio");
Object.defineProperty(exports, "salesAgentSmsWebhook", { enumerable: true, get: function () { return twilio_1.salesAgentSmsWebhook; } });
var gmail_1 = require("./salesAgent/channels/gmail");
Object.defineProperty(exports, "salesAgentGmailPush", { enumerable: true, get: function () { return gmail_1.salesAgentGmailPush; } });
Object.defineProperty(exports, "salesAgentBackfillLeads", { enumerable: true, get: function () { return gmail_1.salesAgentBackfillLeads; } });
var gmailAuth_1 = require("./salesAgent/gmailAuth");
Object.defineProperty(exports, "salesAgentGmailAuthUrl", { enumerable: true, get: function () { return gmailAuth_1.salesAgentGmailAuthUrl; } });
Object.defineProperty(exports, "salesAgentGmailOAuthCallback", { enumerable: true, get: function () { return gmailAuth_1.salesAgentGmailOAuthCallback; } });
Object.defineProperty(exports, "salesAgentGmailRenewWatch", { enumerable: true, get: function () { return gmailAuth_1.salesAgentGmailRenewWatch; } });
var outbox_1 = require("./salesAgent/outbox");
Object.defineProperty(exports, "salesAgentOutboxTick", { enumerable: true, get: function () { return outbox_1.salesAgentOutboxTick; } });
var router_1 = require("./salesAgent/router");
Object.defineProperty(exports, "salesAgentSetMode", { enumerable: true, get: function () { return router_1.salesAgentSetMode; } });
Object.defineProperty(exports, "salesAgentSendReply", { enumerable: true, get: function () { return router_1.salesAgentSendReply; } });
Object.defineProperty(exports, "salesAgentAnswerQuestion", { enumerable: true, get: function () { return router_1.salesAgentAnswerQuestion; } });
Object.defineProperty(exports, "salesAgentInstruct", { enumerable: true, get: function () { return router_1.salesAgentInstruct; } });
Object.defineProperty(exports, "salesAgentApproveDraft", { enumerable: true, get: function () { return router_1.salesAgentApproveDraft; } });
Object.defineProperty(exports, "salesAgentDiscardDraft", { enumerable: true, get: function () { return router_1.salesAgentDiscardDraft; } });
Object.defineProperty(exports, "salesAgentSavePrivate", { enumerable: true, get: function () { return router_1.salesAgentSavePrivate; } });
Object.defineProperty(exports, "salesAgentSimulate", { enumerable: true, get: function () { return router_1.salesAgentSimulate; } });
var push_1 = require("./salesAgent/push");
Object.defineProperty(exports, "salesAgentRegisterPush", { enumerable: true, get: function () { return push_1.salesAgentRegisterPush; } });
Object.defineProperty(exports, "salesAgentUnregisterPush", { enumerable: true, get: function () { return push_1.salesAgentUnregisterPush; } });
Object.defineProperty(exports, "salesAgentTestPush", { enumerable: true, get: function () { return push_1.salesAgentTestPush; } });
Object.defineProperty(exports, "salesAgentPushDebug", { enumerable: true, get: function () { return push_1.salesAgentPushDebug; } });
// Health check function
exports.healthCheck = functions.https.onRequest((req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        service: 'Dealer Ledger Pro Functions'
    });
});
//# sourceMappingURL=index.js.map