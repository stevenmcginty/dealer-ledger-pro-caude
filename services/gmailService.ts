// services/gmailService.ts
// Gmail API integration for email sync and sending

import { CONFIG } from '../config';

const GMAIL_CLIENT_ID = CONFIG.GOOGLE_CLIENT_ID;
const GMAIL_SCOPES = [
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/gmail.modify'
].join(' ');

// Gmail message structure
export interface GmailMessage {
    id: string;
    threadId: string;
    labelIds?: string[];
    snippet: string;
    payload: {
        headers: { name: string; value: string }[];
        body?: { data?: string; size?: number };
        parts?: GmailMessagePart[];
        mimeType?: string;
    };
    internalDate: string;
}

interface GmailMessagePart {
    mimeType: string;
    body?: { data?: string; size?: number };
    parts?: GmailMessagePart[];
}

export interface ParsedEmail {
    from: { name: string; email: string };
    to: string;
    subject: string;
    body: string;
    bodyHtml?: string;
    date: Date;
    messageId: string;
    threadId: string;
}

// Build OAuth URL for Gmail authorization
export const getGmailAuthUrl = (redirectUri: string, state?: string): string => {
    const params = new URLSearchParams({
        client_id: GMAIL_CLIENT_ID,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: GMAIL_SCOPES,
        access_type: 'offline',
        prompt: 'consent',
        ...(state && { state })
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
};

// Exchange authorization code for tokens (requires backend/Cloud Function)
// This is a placeholder - actual implementation will be in Cloud Functions
export const exchangeGmailCode = async (
    code: string,
    redirectUri: string
): Promise<{ accessToken: string; refreshToken: string; expiresIn: number; email: string }> => {
    // This would typically call a Cloud Function that securely handles the client secret
    const response = await fetch('/api/gmail/exchange-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, redirectUri })
    });

    if (!response.ok) {
        throw new Error('Failed to exchange authorization code');
    }

    return response.json();
};

// Refresh access token using refresh token
export const refreshGmailToken = async (
    refreshToken: string
): Promise<{ accessToken: string; expiresIn: number }> => {
    // This would typically call a Cloud Function
    const response = await fetch('/api/gmail/refresh-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken })
    });

    if (!response.ok) {
        throw new Error('Failed to refresh Gmail token');
    }

    return response.json();
};

// Check if token needs refresh (with 5-minute buffer)
export const isTokenExpired = (expiryTimestamp: number): boolean => {
    const bufferMs = 5 * 60 * 1000; // 5 minutes
    return Date.now() >= (expiryTimestamp - bufferMs);
};

// Fetch emails from inbox
export const fetchInboxEmails = async (
    accessToken: string,
    options: {
        maxResults?: number;
        pageToken?: string;
        query?: string;
        after?: Date;
    } = {}
): Promise<{ messages: GmailMessage[]; nextPageToken?: string }> => {
    const { maxResults = 20, pageToken, query, after } = options;

    // Build Gmail search query
    let searchQuery = query || 'in:inbox';
    if (after) {
        const afterTimestamp = Math.floor(after.getTime() / 1000);
        searchQuery += ` after:${afterTimestamp}`;
    }

    const params = new URLSearchParams({
        maxResults: maxResults.toString(),
        q: searchQuery,
        ...(pageToken && { pageToken })
    });

    // First, get message IDs
    const listResponse = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages?${params}`,
        {
            headers: { Authorization: `Bearer ${accessToken}` }
        }
    );

    if (!listResponse.ok) {
        const error = await listResponse.json();
        throw new Error(error.error?.message || 'Failed to fetch emails');
    }

    const listData = await listResponse.json();

    if (!listData.messages || listData.messages.length === 0) {
        return { messages: [], nextPageToken: listData.nextPageToken };
    }

    // Fetch full message details for each
    const messages = await Promise.all(
        listData.messages.map((msg: { id: string }) => getEmailDetails(accessToken, msg.id))
    );

    return {
        messages: messages.filter((m): m is GmailMessage => m !== null),
        nextPageToken: listData.nextPageToken
    };
};

// Get single email details
export const getEmailDetails = async (
    accessToken: string,
    messageId: string
): Promise<GmailMessage | null> => {
    const response = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`,
        {
            headers: { Authorization: `Bearer ${accessToken}` }
        }
    );

    if (!response.ok) {
        console.error(`Failed to fetch email ${messageId}`);
        return null;
    }

    return response.json();
};

// Parse Gmail message into a cleaner format
export const parseGmailMessage = (message: GmailMessage): ParsedEmail => {
    const headers = message.payload.headers;

    // Extract headers
    const getHeader = (name: string): string => {
        const header = headers.find(h => h.name.toLowerCase() === name.toLowerCase());
        return header?.value || '';
    };

    // Parse from address
    const fromRaw = getHeader('From');
    const fromMatch = fromRaw.match(/^(?:"?([^"<]*)"?\s*)?<?([^>]+)>?$/);
    const from = {
        name: fromMatch?.[1]?.trim() || fromMatch?.[2] || fromRaw,
        email: fromMatch?.[2]?.trim() || fromRaw
    };

    // Extract body content
    const { text, html } = extractBodyContent(message.payload);

    return {
        from,
        to: getHeader('To'),
        subject: getHeader('Subject'),
        body: text || '',
        bodyHtml: html,
        date: new Date(parseInt(message.internalDate)),
        messageId: message.id,
        threadId: message.threadId
    };
};

// Recursively extract body content from message parts
const extractBodyContent = (
    payload: GmailMessage['payload']
): { text: string; html?: string } => {
    let text = '';
    let html = '';

    // If payload has direct body data
    if (payload.body?.data) {
        const decoded = decodeBase64Url(payload.body.data);
        if (payload.mimeType === 'text/html') {
            html = decoded;
        } else {
            text = decoded;
        }
    }

    // If payload has parts, process them recursively
    if (payload.parts) {
        for (const part of payload.parts) {
            if (part.mimeType === 'text/plain' && part.body?.data) {
                text = decodeBase64Url(part.body.data);
            } else if (part.mimeType === 'text/html' && part.body?.data) {
                html = decodeBase64Url(part.body.data);
            } else if (part.parts) {
                // Nested multipart
                const nested = extractBodyContent({ ...payload, parts: part.parts, body: undefined });
                if (nested.text) text = nested.text;
                if (nested.html) html = nested.html;
            }
        }
    }

    // If we only have HTML, create text version by stripping tags
    if (!text && html) {
        text = html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    }

    return { text, html: html || undefined };
};

// Decode base64url encoded content
const decodeBase64Url = (data: string): string => {
    // Replace URL-safe characters
    const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
    try {
        return decodeURIComponent(
            atob(base64)
                .split('')
                .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
                .join('')
        );
    } catch {
        return atob(base64);
    }
};

// Encode content to base64url for sending
const encodeBase64Url = (str: string): string => {
    const base64 = btoa(unescape(encodeURIComponent(str)));
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

// Send email via Gmail API
export const sendGmailEmail = async (
    accessToken: string,
    to: string,
    subject: string,
    body: string,
    options: {
        replyToMessageId?: string;
        threadId?: string;
        from?: string;
    } = {}
): Promise<{ id: string; threadId: string }> => {
    const { replyToMessageId, threadId, from } = options;

    // Build RFC 2822 formatted email
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

    const email = `${headers.join('\r\n')}\r\n\r\n${body}`;
    const encodedEmail = encodeBase64Url(email);

    const requestBody: { raw: string; threadId?: string } = { raw: encodedEmail };
    if (threadId) {
        requestBody.threadId = threadId;
    }

    const response = await fetch(
        'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
        {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        }
    );

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Failed to send email');
    }

    return response.json();
};

// Mark email as read
export const markEmailAsRead = async (
    accessToken: string,
    messageId: string
): Promise<void> => {
    await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/modify`,
        {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                removeLabelIds: ['UNREAD']
            })
        }
    );
};

// Extract vehicle registration from email content
export const extractVehicleRegFromEmail = (
    subject: string,
    body: string
): string | null => {
    // UK vehicle registration patterns
    const regPatterns = [
        // Current format: AB12 CDE or AB12CDE
        /\b([A-Z]{2}[0-9]{2}\s?[A-Z]{3})\b/gi,
        // Older formats
        /\b([A-Z][0-9]{1,3}\s?[A-Z]{3})\b/gi,
        /\b([A-Z]{3}\s?[0-9]{1,3}[A-Z])\b/gi,
        // Dateless plates
        /\b([0-9]{1,4}\s?[A-Z]{1,3})\b/gi,
        /\b([A-Z]{1,3}\s?[0-9]{1,4})\b/gi
    ];

    const text = `${subject} ${body}`.toUpperCase();

    for (const pattern of regPatterns) {
        const match = text.match(pattern);
        if (match) {
            // Clean up and normalize the registration
            const reg = match[0].replace(/\s+/g, '').toUpperCase();
            // Validate it looks like a real reg (not just random letters/numbers)
            if (reg.length >= 4 && reg.length <= 8) {
                return reg;
            }
        }
    }

    return null;
};

// Extract vehicle description from email content
export const extractVehicleDescriptionFromEmail = (
    subject: string,
    body: string
): { make?: string; model?: string; year?: number } | null => {
    const text = `${subject} ${body}`;

    // Common car makes
    const makes = [
        'Audi', 'BMW', 'Mercedes', 'Ford', 'Vauxhall', 'Volkswagen', 'VW',
        'Toyota', 'Honda', 'Nissan', 'Hyundai', 'Kia', 'Mazda', 'Peugeot',
        'Renault', 'Citroen', 'Fiat', 'Seat', 'Skoda', 'Mini', 'Land Rover',
        'Range Rover', 'Jaguar', 'Volvo', 'Porsche', 'Lexus', 'Mitsubishi',
        'Suzuki', 'Dacia', 'MG', 'Tesla', 'Jeep', 'Alfa Romeo'
    ];

    // Try to find make
    let foundMake: string | undefined;
    for (const make of makes) {
        const regex = new RegExp(`\\b${make}\\b`, 'i');
        if (regex.test(text)) {
            foundMake = make === 'VW' ? 'Volkswagen' : make;
            break;
        }
    }

    // Try to find year (4-digit number between 2000-2030)
    const yearMatch = text.match(/\b(20[0-3][0-9])\b/);
    const foundYear = yearMatch ? parseInt(yearMatch[1]) : undefined;

    if (foundMake || foundYear) {
        return {
            make: foundMake,
            year: foundYear
        };
    }

    return null;
};
