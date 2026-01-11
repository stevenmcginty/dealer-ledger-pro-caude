"use strict";
/**
 * Firebase Cloud Functions for Dealer Ledger Pro
 *
 * Email Auto-Response System
 * - Polls Gmail for new emails every 5 minutes
 * - Processes scheduled auto-responses every 1 minute
 * - Handles OAuth token refresh
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
exports.healthCheck = exports.sendGmailEmail = exports.refreshGmailToken = exports.exchangeGmailCode = exports.sendScheduledResponseNow = exports.cancelScheduledResponse = exports.processScheduledResponses = exports.pollAllGmailInboxes = void 0;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
// Initialize Firebase Admin
admin.initializeApp();
// Export scheduled functions
var poll_1 = require("./gmail/poll");
Object.defineProperty(exports, "pollAllGmailInboxes", { enumerable: true, get: function () { return poll_1.pollAllGmailInboxes; } });
var schedule_1 = require("./autoResponse/schedule");
Object.defineProperty(exports, "processScheduledResponses", { enumerable: true, get: function () { return schedule_1.processScheduledResponses; } });
Object.defineProperty(exports, "cancelScheduledResponse", { enumerable: true, get: function () { return schedule_1.cancelScheduledResponse; } });
Object.defineProperty(exports, "sendScheduledResponseNow", { enumerable: true, get: function () { return schedule_1.sendScheduledResponseNow; } });
// Export callable functions for client-side use
var oauth_1 = require("./gmail/oauth");
Object.defineProperty(exports, "exchangeGmailCode", { enumerable: true, get: function () { return oauth_1.exchangeGmailCode; } });
Object.defineProperty(exports, "refreshGmailToken", { enumerable: true, get: function () { return oauth_1.refreshGmailToken; } });
var send_1 = require("./gmail/send");
Object.defineProperty(exports, "sendGmailEmail", { enumerable: true, get: function () { return send_1.sendGmailEmail; } });
// Health check function
exports.healthCheck = functions.https.onRequest((req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        service: 'Dealer Ledger Pro Email Functions'
    });
});
//# sourceMappingURL=index.js.map