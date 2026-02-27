/**
 * Gmail Inbox Polling Function
 * Runs every 5 minutes to check for new emails across all connected companies
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { getValidAccessToken } from './oauth';
import { processIncomingEmail } from '../autoResponse/process';
import { getCompanyIds } from '../utils/companyIds';

const db = admin.database();

interface GmailMessage {
    id: string;
    threadId: string;
    labelIds?: string[];
    snippet: string;
    payload: {
        headers: { name: string; value: string }[];
        body?: { data?: string };
        parts?: any[];
        mimeType?: string;
    };
    internalDate: string;
}

/**
 * Parse email content from Gmail message
 */
const parseGmailMessage = (message: GmailMessage) => {
    const headers = message.payload.headers;
    const getHeader = (name: string): string => {
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

    const extractBody = (payload: any): void => {
        if (payload.body?.data) {
            const decoded = Buffer.from(payload.body.data, 'base64').toString('utf-8');
            if (payload.mimeType === 'text/html') {
                bodyHtml = decoded;
            } else {
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
const fetchNewEmails = async (
    accessToken: string,
    lastSyncAt: number
): Promise<GmailMessage[]> => {
    const { google } = await import('googleapis');
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
        const messages: GmailMessage[] = [];
        for (const msg of listResponse.data.messages) {
            try {
                const detail = await gmail.users.messages.get({
                    userId: 'me',
                    id: msg.id!,
                    format: 'full'
                });
                messages.push(detail.data as GmailMessage);
            } catch (err) {
                console.error(`Failed to fetch message ${msg.id}:`, err);
            }
        }

        return messages;
    } catch (error) {
        console.error('Error fetching emails:', error);
        return [];
    }
};

/**
 * Check if email has already been processed
 */
const isEmailProcessed = async (companyId: string, gmailMessageId: string): Promise<boolean> => {
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
const pollCompanyInbox = async (companyId: string): Promise<{
    newEmails: number;
    processed: number;
    errors: number;
}> => {
    const result = { newEmails: 0, processed: 0, errors: 0 };

    try {
        // Get valid access token
        const accessToken = await getValidAccessToken(companyId, db);
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
                await processIncomingEmail(companyId, {
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
            } catch (err) {
                console.error(`Company ${companyId}: Error processing email ${gmailMessage.id}:`, err);
                result.errors++;
            }
        }

        // Update last sync time
        await db.ref(`companies/${companyId}/crmSettings`).update({
            gmailLastSyncAt: Date.now()
        });

    } catch (error) {
        console.error(`Company ${companyId}: Poll error:`, error);
        result.errors++;
    }

    return result;
};

/**
 * Main scheduled function - runs every 5 minutes
 * Polls Gmail for all companies with connected Gmail accounts
 */
export const pollAllGmailInboxes = functions
    .runWith({
        timeoutSeconds: 300,
        memory: '512MB'
    })
    .pubsub.schedule('every 5 minutes')
    .onRun(async (context) => {
        console.log('Starting Gmail inbox poll...');

        try {
            // Get company IDs via shallow read (avoids downloading entire DB)
            const companyIds = await getCompanyIds();

            if (companyIds.length === 0) {
                console.log('No companies found');
                return null;
            }

            // Check each company's crmSettings individually (not the whole tree)
            const companies: string[] = [];
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

        } catch (error) {
            console.error('Poll failed:', error);
        }

        return null;
    });
