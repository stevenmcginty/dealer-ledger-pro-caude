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
exports.healthCheck = exports.pushAllStockNow = exports.previewWebsiteSync = exports.unlinkWebsite = exports.linkWebsite = exports.runMotSweepNow = exports.lookupVehicleByReg = exports.syncVehicleToWebsite = exports.refreshStockMotStatus = void 0;
const functions = __importStar(require("firebase-functions"));
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
// Health check function
exports.healthCheck = functions.https.onRequest((req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        service: 'Dealer Ledger Pro Functions'
    });
});
//# sourceMappingURL=index.js.map