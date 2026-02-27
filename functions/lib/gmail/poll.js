"use strict";
/**
 * Gmail Inbox Polling Function
 * Runs every 5 minutes to check for new emails across all connected companies
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
exports.pollAllGmailInboxes = void 0;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
const oauth_1 = require("./oauth");
const process_1 = require("../autoResponse/process");
const companyIds_1 = require("../utils/companyIds");
const db = admin.database();
/**
 * Parse email content from Gmail message
 */
const parseGmailMessage = (message) => {
    const headers = message.payload.headers;
    const getHeader = (name) => {
        const header = headers.find(h => h.name.toLowerCase() === name.toLowerCase());
        return header?.value || '';
    };
    // Parse from address
    const fromRaw = getHeader('From');
    const fromMatch = fromRaw.match(/^(?:"?([^"<]*)"?\s*)?<?([^>]+)>?$/);
    const from = {
        name: fromMatch?.[1]?.trim() || fromMatch?.[2] || fromRaw,
        email: fromMatch?.[2]?.trim().toLowerCase() || fromRaw.toLowerCase()
    };
    // Extract body
    let body = '';
    let bodyHtml = '';
    const extractBody = (payload) => {
        if (payload.body?.data) {
            const decoded = Buffer.from(payload.body.data, 'base64').toString('utf-8');
            if (payload.mimeType === 'text/html') {
                bodyHtml = decoded;
            }
            else {
                body = decoded;
            }
        }
        if (payload.parts) {
            for (const part of payload.parts) {
                extractBody(part);
            }
        }
    };
    extractBody(message.payload);
    // If we only have HTML, strip tags for text version
    if (!body && bodyHtml) {
        body = bodyHtml.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    }
    return {
        from,
        to: getHeader('To'),
        subject: getHeader('Subject'),
        body,
        bodyHtml: bodyHtml || undefined,
        date: new Date(parseInt(message.internalDate)),
        messageId: message.id,
        threadId: message.threadId
    };
};
/**
 * Fetch new emails from Gmail since last sync
 */
const fetchNewEmails = async (accessToken, lastSyncAt) => {
    const { google } = await Promise.resolve().then(() => __importStar(require('googleapis')));
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: accessToken });
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    // Build query for inbox emails since last sync
    const afterTimestamp = Math.floor(lastSyncAt / 1000);
    const query = `in:inbox after:${afterTimestamp}`;
    try {
        // List messages
        const listResponse = await gmail.users.messages.list({
            userId: 'me',
            q: query,
            maxResults: 50
        });
        if (!listResponse.data.messages || listResponse.data.messages.length === 0) {
            return [];
        }
        // Fetch full details for each message
        const messages = [];
        for (const msg of listResponse.data.messages) {
            try {
                const detail = await gmail.users.messages.get({
                    userId: 'me',
                    id: msg.id,
                    format: 'full'
                });
                messages.push(detail.data);
            }
            catch (err) {
                console.error(`Failed to fetch message ${msg.id}:`, err);
            }
        }
        return messages;
    }
    catch (error) {
        console.error('Error fetching emails:', error);
        return [];
    }
};
/**
 * Check if email has already been processed
 */
const isEmailProcessed = async (companyId, gmailMessageId) => {
    const snapshot = await db.ref(`companies/${companyId}/inboxEmails`)
        .orderByChild('gmailMessageId')
        .equalTo(gmailMessageId)
        .limitToFirst(1)
        .once('value');
    return snapshot.exists();
};
/**
 * Poll a single company's Gmail inbox
 */
const pollCompanyInbox = async (companyId) => {
    const result = { newEmails: 0, processed: 0, errors: 0 };
    try {
        // Get valid access token
        const accessToken = await (0, oauth_1.getValidAccessToken)(companyId, db);
        if (!accessToken) {
            console.log(`Company ${companyId}: No valid access token, skipping`);
            return result;
        }
        // Get CRM settings
        const settingsSnap = await db.ref(`companies/${companyId}/crmSettings`).once('value');
        const settings = settingsSnap.val();
        if (!settings?.gmailConnected) {
            return result;
        }
        // Get last sync time (default to 1 hour ago if never synced)
        const lastSyncAt = settings.gmailLastSyncAt || (Date.now() - 60 * 60 * 1000);
        // Fetch new emails
        const emails = await fetchNewEmails(accessToken, lastSyncAt);
        result.newEmails = emails.length;
        console.log(`Company ${companyId}: Found ${emails.length} new emails`);
        // Process each email
        for (const gmailMessage of emails) {
            try {
                // Check if already processed
                if (await isEmailProcessed(companyId, gmailMessage.id)) {
                    continue;
                }
                const parsed = parseGmailMessage(gmailMessage);
                // Process the email (creates inbox record, analyzes, schedules response if needed)
                await (0, process_1.processIncomingEmail)(companyId, {
                    gmailMessageId: gmailMessage.id,
                    gmailThreadId: gmailMessage.threadId,
                    senderEmail: parsed.from.email,
                    senderName: parsed.from.name,
                    subject: parsed.subject,
                    body: parsed.body,
                    bodyHtml: parsed.bodyHtml,
                    receivedAt: parsed.date.toISOString(),
                    source: 'Gmail'
                }, settings, db);
                result.processed++;
            }
            catch (err) {
                console.error(`Company ${companyId}: Error processing email ${gmailMessage.id}:`, err);
                result.errors++;
            }
        }
        // Update last sync time
        await db.ref(`companies/${companyId}/crmSettings`).update({
            gmailLastSyncAt: Date.now()
        });
    }
    catch (error) {
        console.error(`Company ${companyId}: Poll error:`, error);
        result.errors++;
    }
    return result;
};
/**
 * Main scheduled function - runs every 5 minutes
 * Polls Gmail for all companies with connected Gmail accounts
 */
exports.pollAllGmailInboxes = functions
    .runWith({
    timeoutSeconds: 300,
    memory: '512MB'
})
    .pubsub.schedule('every 5 minutes')
    .onRun(async (context) => {
    console.log('Starting Gmail inbox poll...');
    try {
        // Get company IDs via shallow read (avoids downloading entire DB)
        const companyIds = await (0, companyIds_1.getCompanyIds)();
        if (companyIds.length === 0) {
            console.log('No companies found');
            return null;
        }
        // Check each company's crmSettings individually (not the whole tree)
        const companies = [];
        for (const companyId of companyIds) {
            const settingsSnap = await db.ref(`companies/${companyId}/crmSettings/gmailConnected`).once('value');
            if (settingsSnap.val() === true) {
                companies.push(companyId);
            }
        }
        console.log(`Found ${companies.length} companies with Gmail connected`);
        // Poll each company (sequentially to avoid rate limits)
        let totalNew = 0;
        let totalProcessed = 0;
        let totalErrors = 0;
        for (const companyId of companies) {
            const result = await pollCompanyInbox(companyId);
            totalNew += result.newEmails;
            totalProcessed += result.processed;
            totalErrors += result.errors;
            // Small delay between companies to avoid rate limits
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        console.log(`Poll complete: ${totalNew} new emails, ${totalProcessed} processed, ${totalErrors} errors`);
    }
    catch (error) {
        console.error('Poll failed:', error);
    }
    return null;
});
//# sourceMappingURL=poll.js.map