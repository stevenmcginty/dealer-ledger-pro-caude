/**
 * Gmail Send Email Function
 * Sends emails via Gmail API
 */

import * as functions from 'firebase-functions';

/**
 * Encode content to base64url for Gmail API
 */
const encodeBase64Url = (str: string): string => {
    const base64 = Buffer.from(str).toString('base64');
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

/**
 * Build RFC 2822 formatted email
 */
const buildEmail = (params: {
    to: string;
    from?: string;
    subject: string;
    body: string;
    replyToMessageId?: string;
}): string => {
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
export const sendEmailViaGmail = async (params: {
    accessToken: string;
    to: string;
    from?: string;
    subject: string;
    body: string;
    replyToMessageId?: string;
    threadId?: string;
}): Promise<{ id: string; threadId: string }> => {
    const { accessToken, to, from, subject, body, replyToMessageId, threadId } = params;

    const { google } = await import('googleapis');
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: accessToken });

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    const email = buildEmail({ to, from, subject, body, replyToMessageId });
    const encodedEmail = encodeBase64Url(email);

    const requestBody: { raw: string; threadId?: string } = { raw: encodedEmail };
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

/**
 * Callable function to send email from client
 */
export const sendGmailEmail = functions.https.onCall(async (data, context) => {
    // Verify authenticated
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { accessToken, to, subject, body, from, replyToMessageId, threadId } = data;

    if (!accessToken || !to || !subject || !body) {
        throw new functions.https.HttpsError('invalid-argument', 'Missing required fields');
    }

    try {
        const result = await sendEmailViaGmail({
            accessToken,
            to,
            from,
            subject,
            body,
            replyToMessageId,
            threadId
        });

        return result;
    } catch (error: any) {
        console.error('Error sending email:', error);
        throw new functions.https.HttpsError('internal', error.message || 'Failed to send email');
    }
});
