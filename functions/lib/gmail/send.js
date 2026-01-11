"use strict";
/**
 * Gmail Send Email Function
 * Sends emails via Gmail API
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
exports.sendGmailEmail = exports.sendEmailViaGmail = void 0;
const functions = __importStar(require("firebase-functions"));
/**
 * Encode content to base64url for Gmail API
 */
const encodeBase64Url = (str) => {
    const base64 = Buffer.from(str).toString('base64');
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
/**
 * Build RFC 2822 formatted email
 */
const buildEmail = (params) => {
    const { to, from, subject, body, replyToMessageId } = params;
    const headers = [
        `To: ${to}`,
        `Subject: ${subject}`,
        'Content-Type: text/plain; charset=utf-8',
        'MIME-Version: 1.0'
    ];
    if (from) {
        headers.unshift(`From: ${from}`);
    }
    if (replyToMessageId) {
        headers.push(`In-Reply-To: ${replyToMessageId}`);
        headers.push(`References: ${replyToMessageId}`);
    }
    return `${headers.join('\r\n')}\r\n\r\n${body}`;
};
/**
 * Send email via Gmail API (internal function)
 */
const sendEmailViaGmail = async (params) => {
    const { accessToken, to, from, subject, body, replyToMessageId, threadId } = params;
    const { google } = await Promise.resolve().then(() => __importStar(require('googleapis')));
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: accessToken });
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    const email = buildEmail({ to, from, subject, body, replyToMessageId });
    const encodedEmail = encodeBase64Url(email);
    const requestBody = { raw: encodedEmail };
    if (threadId) {
        requestBody.threadId = threadId;
    }
    const response = await gmail.users.messages.send({
        userId: 'me',
        requestBody
    });
    return {
        id: response.data.id || '',
        threadId: response.data.threadId || ''
    };
};
exports.sendEmailViaGmail = sendEmailViaGmail;
/**
 * Callable function to send email from client
 */
exports.sendGmailEmail = functions.https.onCall(async (data, context) => {
    // Verify authenticated
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }
    const { accessToken, to, subject, body, from, replyToMessageId, threadId } = data;
    if (!accessToken || !to || !subject || !body) {
        throw new functions.https.HttpsError('invalid-argument', 'Missing required fields');
    }
    try {
        const result = await (0, exports.sendEmailViaGmail)({
            accessToken,
            to,
            from,
            subject,
            body,
            replyToMessageId,
            threadId
        });
        return result;
    }
    catch (error) {
        console.error('Error sending email:', error);
        throw new functions.https.HttpsError('internal', error.message || 'Failed to send email');
    }
});
//# sourceMappingURL=send.js.map