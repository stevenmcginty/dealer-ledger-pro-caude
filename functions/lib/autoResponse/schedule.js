"use strict";
/**
 * Scheduled Response Processor
 * Runs every minute to send due auto-responses
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
exports.sendScheduledResponseNow = exports.cancelScheduledResponse = exports.processScheduledResponses = void 0;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
const oauth_1 = require("../gmail/oauth");
const send_1 = require("../gmail/send");
const companyIds_1 = require("../utils/companyIds");
const db = admin.database();
/**
 * Record that an email address has received an auto-reply
 */
const recordAutoReply = async (companyId, email, inboxEmailId, leadId) => {
    const normalized = email.toLowerCase().trim();
    const key = db.ref(`companies/${companyId}/autoRepliedEmails`).push().key;
    await db.ref(`companies/${companyId}/autoRepliedEmails/${key}`).set({
        email: normalized,
        firstAutoReplyAt: new Date().toISOString(),
        inboxEmailId,
        leadId: leadId || null
    });
};
/**
 * Add activity to lead history
 */
const addLeadActivity = async (companyId, leadId, content) => {
    await db.ref(`companies/${companyId}/leads/${leadId}/history`).push({
        id: Date.now().toString(),
        type: 'EMAIL_OUT',
        content,
        timestamp: new Date().toISOString()
    });
    await db.ref(`companies/${companyId}/leads/${leadId}`).update({
        hasReceivedAutoReply: true,
        updatedAt: new Date().toISOString()
    });
};
/**
 * Process a single scheduled response
 */
const processScheduledResponse = async (companyId, responseId, response) => {
    const responseRef = db.ref(`companies/${companyId}/scheduledResponses/${responseId}`);
    try {
        // Get valid access token
        const accessToken = await (0, oauth_1.getValidAccessToken)(companyId, db);
        if (!accessToken) {
            await responseRef.update({
                status: 'failed',
                errorMessage: 'No valid Gmail access token'
            });
            return { success: false, error: 'No access token' };
        }
        // Get the original email for thread ID
        let threadId;
        if (response.inboxEmailId) {
            const emailSnap = await db.ref(`companies/${companyId}/inboxEmails/${response.inboxEmailId}`).once('value');
            const email = emailSnap.val();
            threadId = email?.gmailThreadId;
        }
        // Send the email
        const result = await (0, send_1.sendEmailViaGmail)({
            accessToken,
            to: response.recipientEmail,
            subject: response.responseSubject,
            body: response.responseBody,
            threadId
        });
        // Update response status
        await responseRef.update({
            status: 'sent',
            sentAt: admin.database.ServerValue.TIMESTAMP,
            gmailMessageId: result.id,
            gmailThreadId: result.threadId
        });
        // Update inbox email status
        if (response.inboxEmailId) {
            await db.ref(`companies/${companyId}/inboxEmails/${response.inboxEmailId}`).update({
                status: 'REPLIED',
                autoResponseSentAt: new Date().toISOString()
            });
        }
        // Record that this email address received an auto-reply (HARD RULE enforcement)
        await recordAutoReply(companyId, response.recipientEmail, response.inboxEmailId, response.leadId);
        // Add activity to lead history
        if (response.leadId) {
            await addLeadActivity(companyId, response.leadId, `Auto-response sent: ${response.responseSubject}`);
        }
        console.log(`Successfully sent auto-response to ${response.recipientEmail}`);
        return { success: true };
    }
    catch (error) {
        console.error(`Failed to send auto-response ${responseId}:`, error);
        await responseRef.update({
            status: 'failed',
            errorMessage: error.message || 'Failed to send email'
        });
        return { success: false, error: error.message };
    }
};
/**
 * Main scheduled function - runs every minute
 * Processes all pending scheduled responses that are due
 */
exports.processScheduledResponses = functions
    .runWith({
    timeoutSeconds: 120,
    memory: '256MB'
})
    .pubsub.schedule('every 1 minutes')
    .onRun(async (context) => {
    console.log('Processing scheduled responses...');
    try {
        // Get company IDs via shallow read (avoids downloading entire DB)
        const companyIds = await (0, companyIds_1.getCompanyIds)();
        if (companyIds.length === 0) {
            return null;
        }
        const now = new Date().toISOString();
        let totalProcessed = 0;
        let totalSent = 0;
        let totalFailed = 0;
        // Iterate through companies — read only scheduledResponses per company
        const promises = [];
        for (const companyId of companyIds) {
            const scheduledResponsesSnap = await db.ref(`companies/${companyId}/scheduledResponses`).once('value');
            if (!scheduledResponsesSnap.exists()) {
                continue;
            }
            // Process each pending response
            scheduledResponsesSnap.forEach((responseSnap) => {
                const response = responseSnap.val();
                const responseId = responseSnap.key;
                // Check if pending and due
                if (response.status !== 'pending') {
                    return;
                }
                if (response.scheduledFor > now) {
                    return; // Not due yet
                }
                totalProcessed++;
                // Process this response
                const processPromise = processScheduledResponse(companyId, responseId, response)
                    .then(result => {
                    if (result.success) {
                        totalSent++;
                    }
                    else {
                        totalFailed++;
                    }
                });
                promises.push(processPromise);
            });
        }
        // Wait for all processing to complete
        await Promise.all(promises);
        console.log(`Scheduled responses: ${totalProcessed} processed, ${totalSent} sent, ${totalFailed} failed`);
    }
    catch (error) {
        console.error('Error processing scheduled responses:', error);
    }
    return null;
});
/**
 * Callable function to cancel a scheduled response
 */
exports.cancelScheduledResponse = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }
    const { companyId, responseId } = data;
    if (!companyId || !responseId) {
        throw new functions.https.HttpsError('invalid-argument', 'Missing companyId or responseId');
    }
    try {
        const responseRef = db.ref(`companies/${companyId}/scheduledResponses/${responseId}`);
        const snapshot = await responseRef.once('value');
        if (!snapshot.exists()) {
            throw new functions.https.HttpsError('not-found', 'Scheduled response not found');
        }
        const response = snapshot.val();
        if (response.status !== 'pending') {
            throw new functions.https.HttpsError('failed-precondition', 'Response is not pending');
        }
        await responseRef.update({
            status: 'cancelled',
            cancelledAt: admin.database.ServerValue.TIMESTAMP,
            cancelledBy: context.auth.uid
        });
        // Update inbox email status
        if (response.inboxEmailId) {
            await db.ref(`companies/${companyId}/inboxEmails/${response.inboxEmailId}`).update({
                status: 'UNREAD',
                autoResponseScheduledAt: null
            });
        }
        return { success: true };
    }
    catch (error) {
        if (error instanceof functions.https.HttpsError) {
            throw error;
        }
        console.error('Error cancelling scheduled response:', error);
        throw new functions.https.HttpsError('internal', error.message || 'Failed to cancel response');
    }
});
/**
 * Callable function to manually send a scheduled response now
 */
exports.sendScheduledResponseNow = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }
    const { companyId, responseId } = data;
    if (!companyId || !responseId) {
        throw new functions.https.HttpsError('invalid-argument', 'Missing companyId or responseId');
    }
    try {
        const responseRef = db.ref(`companies/${companyId}/scheduledResponses/${responseId}`);
        const snapshot = await responseRef.once('value');
        if (!snapshot.exists()) {
            throw new functions.https.HttpsError('not-found', 'Scheduled response not found');
        }
        const response = snapshot.val();
        if (response.status !== 'pending') {
            throw new functions.https.HttpsError('failed-precondition', 'Response is not pending');
        }
        // Process immediately
        const result = await processScheduledResponse(companyId, responseId, response);
        if (!result.success) {
            throw new functions.https.HttpsError('internal', result.error || 'Failed to send');
        }
        return { success: true };
    }
    catch (error) {
        if (error instanceof functions.https.HttpsError) {
            throw error;
        }
        console.error('Error sending scheduled response:', error);
        throw new functions.https.HttpsError('internal', error.message || 'Failed to send response');
    }
});
//# sourceMappingURL=schedule.js.map