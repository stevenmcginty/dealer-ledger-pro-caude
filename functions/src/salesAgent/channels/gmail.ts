/**
 * Email, via the Gmail API.
 *
 * Gmail pushes to Pub/Sub whenever the inbox changes; this reads what changed, turns
 * each new message into a ParsedLead, and hands the router something that looks the
 * same whether it started life as a CarGurus form or somebody typing an email.
 *
 * Three details do most of the work here:
 *   - The push carries a history id, not a message. Everything since the last stored id
 *     is fetched, so a missed push is caught up by the next one rather than lost.
 *   - Both the plain-text and the HTML part are pulled out, because the dealership's own
 *     website sends HTML only and its plaintext part just says "use an HTML viewer".
 *   - Replies are sent into the original Gmail thread with a real In-Reply-To, so the
 *     customer sees a conversation and not a series of unrelated emails.
 */

import * as functions from 'firebase-functions/v1';
import type { gmail_v1 } from 'googleapis';

import { getCompanyIds } from '../../utils/companyIds';
import {
    BRAIN_SECRETS,
    agentPath,
    db,
    findOrCreateLead,
    privatePath,
    readPrivate,
    readSettings,
    requireMember,
    routingPath,
} from '../conversations';
import { GMAIL_SECRETS, gmailClientFor, startGmailWatch } from '../gmailAuth';
import { handleInbound } from '../router';
import { ChannelSender, Channel, InboundMessage, extractUkMobiles, rtdbKey } from '../types';
import { ParsedLead, crmLeadSource, parseLeadEmail } from './leadParsers';

// --- Reading a message ------------------------------------------------------

const headerValue = (message: gmail_v1.Schema$Message, name: string): string => {
    const found = (message.payload?.headers || []).find(
        h => (h.name || '').toLowerCase() === name.toLowerCase()
    );
    return (found?.value || '').trim();
};

const decodePart = (data?: string | null): string =>
    data ? Buffer.from(data, 'base64url').toString('utf8') : '';

/** Walk the MIME tree and collect the first body of each type we care about. */
const bodiesOf = (payload?: gmail_v1.Schema$MessagePart): { text: string; html: string } => {
    const out = { text: '', html: '' };
    if (!payload) return out;

    const visit = (part: gmail_v1.Schema$MessagePart): void => {
        const mime = (part.mimeType || '').toLowerCase();

        if (mime === 'text/plain' && !out.text) out.text = decodePart(part.body?.data);
        else if (mime === 'text/html' && !out.html) out.html = decodePart(part.body?.data);

        (part.parts || []).forEach(visit);
    };

    visit(payload);
    return out;
};

/**
 * Where the customer stopped writing and their mail client started quoting.
 *
 * Getting this wrong feeds the brain the whole previous conversation on every reply,
 * which reads as the customer repeating themselves. Erring towards cutting slightly too
 * much is safer than cutting too little.
 */
const QUOTE_MARKERS: RegExp[] = [
    /^\s*On .{4,120}\bwrote:\s*$/im,
    /^\s*-{2,}\s*Original Message\s*-{2,}/im,
    /^\s*_{10,}\s*$/m,
    /^\s*From:\s.+\r?\n\s*(?:Sent|Date):\s/im,
    /^\s*Sent from my \w+/im,
    /^\s*Get Outlook for \w+/im,
    /^\s*Sent from Outlook\b/im,
];

export const stripQuotedReply = (body: string): string => {
    let text = (body || '').replace(/\r\n/g, '\n');

    let cut = text.length;
    for (const marker of QUOTE_MARKERS) {
        const found = text.match(marker);
        if (found?.index !== undefined && found.index < cut) cut = found.index;
    }
    text = text.slice(0, cut);

    const lines = text.split('\n');
    while (lines.length && (!lines[lines.length - 1].trim() || lines[lines.length - 1].startsWith('>'))) {
        lines.pop();
    }

    // A "-- " line is the RFC signature delimiter; everything after it is a sig block.
    const sig = lines.findIndex(line => /^--\s?$/.test(line));
    const kept = sig === -1 ? lines : lines.slice(0, sig);

    return kept.join('\n').trim();
};

/** Everything the parsers need, out of one Gmail message. */
export const toRawEmail = (message: gmail_v1.Schema$Message, selfEmail: string) => {
    const bodies = bodiesOf(message.payload);

    return {
        from: headerValue(message, 'From'),
        subject: headerValue(message, 'Subject'),
        text: stripQuotedReply(bodies.text),
        html: bodies.html || undefined,
        messageId: message.id || undefined,
        threadId: message.threadId || undefined,
        selfEmail,
    };
};

// --- Push handling ----------------------------------------------------------

const companyForGmailAddress = async (email: string): Promise<string | null> => {
    const key = rtdbKey(email.trim().toLowerCase());
    const snap = await db().ref(routingPath(`gmailAddresses/${key}`)).once('value');
    const indexed = snap.val() as string | null;
    if (indexed) return indexed;

    // Nothing indexed: a connection made before the index existed. Find it and record it.
    for (const companyId of await getCompanyIds()) {
        const priv = await readPrivate(companyId);
        if (priv.gmail?.email?.toLowerCase() === email.trim().toLowerCase()) {
            await db().ref(routingPath(`gmailAddresses/${key}`)).set(companyId);
            return companyId;
        }
    }

    return null;
};

/** A dropped lead is still worth a record — it is the only way to notice the ignore
 *  rules have gone wrong without reading the mailbox by hand. */
const recordIgnored = async (companyId: string, messageId: string, from: string, subject: string, reason: string) => {
    await db().ref(agentPath(companyId, `ignored/${rtdbKey(messageId)}`)).set({
        from,
        subject,
        reason,
        at: Date.now(),
    });
};

/**
 * Turn one fetched message into work for the router.
 *
 * The reply address comes from the ParsedLead, never from the From header — a CarGurus
 * lead arrives from a robot and answering it would talk to nobody.
 */
const processMessage = async (
    companyId: string,
    selfEmail: string,
    message: gmail_v1.Schema$Message
): Promise<void> => {
    const labels = message.labelIds || [];
    if (labels.includes('SENT') || labels.includes('DRAFT') || !labels.includes('INBOX')) return;

    const raw = toRawEmail(message, selfEmail);
    const lead = parseLeadEmail(raw);

    if (lead.kind === 'ignore') {
        await recordIgnored(companyId, message.id || String(Date.now()), raw.from, raw.subject, lead.ignoreReason || 'ignored');
        return;
    }

    const inbound: InboundMessage = {
        companyId,
        channel: (lead.replyTo.channel || 'email') as Channel,
        address: lead.replyTo.address || raw.from,
        text: lead.message,
        providerId: lead.correlationId ? `cazoo:${lead.correlationId}` : (message.id || ''),
        name: lead.name,
        subject: raw.subject,
        emailThreadId: message.threadId || undefined,
        extractedPhones: Array.from(new Set([
            ...(lead.phone ? [lead.phone] : []),
            ...extractUkMobiles(raw.text),
        ])),
        receivedAt: Number(message.internalDate) || Date.now(),
    };

    await handleInbound(inbound, { lead });
};

/**
 * The Pub/Sub push.
 *
 * A 404 from history.list means the stored id has aged out (Gmail keeps roughly a week).
 * There is no way to recover the gap, so the watch is restarted from now rather than
 * replaying an unbounded backfill nobody asked for.
 */
export const salesAgentGmailPush = functions
    .runWith({ timeoutSeconds: 300, memory: '512MB', secrets: [...GMAIL_SECRETS, ...BRAIN_SECRETS] })
    .pubsub.topic('gmail-sales-agent')
    .onPublish(async message => {
        const payload = (message.json || {}) as { emailAddress?: string; historyId?: string | number };
        const emailAddress = (payload.emailAddress || '').toLowerCase();

        if (!emailAddress) {
            console.warn('Gmail push carried no emailAddress');
            return null;
        }

        const companyId = await companyForGmailAddress(emailAddress);
        if (!companyId) {
            console.warn(`Gmail push for ${emailAddress}: no company connected`);
            return null;
        }

        const priv = await readPrivate(companyId);
        const startHistoryId = priv.gmail?.historyId;

        if (!startHistoryId) {
            // No floor to work from; set one and let the next push do the work.
            await startGmailWatch(companyId);
            return null;
        }

        const gmail = await gmailClientFor(companyId);
        const seen = new Set<string>();
        let latestHistoryId = String(payload.historyId || startHistoryId);
        let pageToken: string | undefined;

        try {
            do {
                const page = await gmail.users.history.list({
                    userId: 'me',
                    startHistoryId,
                    historyTypes: ['messageAdded'],
                    labelId: 'INBOX',
                    maxResults: 500,
                    pageToken,
                });

                if (page.data.historyId) latestHistoryId = String(page.data.historyId);

                for (const record of page.data.history || []) {
                    for (const added of record.messagesAdded || []) {
                        const id = added.message?.id;
                        if (id) seen.add(id);
                    }
                }

                pageToken = page.data.nextPageToken || undefined;
            } while (pageToken);
        } catch (error: any) {
            if (error?.code === 404 || error?.response?.status === 404) {
                console.warn(`Gmail history for ${emailAddress} has expired; restarting the watch`);
                await startGmailWatch(companyId);
                return null;
            }
            throw error;
        }

        for (const id of seen) {
            try {
                const full = await gmail.users.messages.get({ userId: 'me', id, format: 'full' });
                await processMessage(companyId, emailAddress, full.data);
            } catch (error) {
                console.error(`Gmail: handling message ${id} for company ${companyId} failed`, error);
            }
        }

        await db().ref(privatePath(companyId, 'gmail/historyId')).set(latestHistoryId);
        return null;
    });

// --- Sending ----------------------------------------------------------------

/** Non-ASCII in a header has to be encoded or the whole message is rejected. */
const encodeHeader = (value: string): string =>
    /^[\x20-\x7E]*$/.test(value)
        ? value
        : `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`;

/**
 * Gmail's own threadId keeps the reply in the right conversation in Gmail, but other
 * mail clients thread on In-Reply-To. The real Message-Id is only obtainable from the
 * thread, so it is fetched — headers only — rather than guessed from the threadId.
 */
const threadMessageId = async (gmail: gmail_v1.Gmail, threadId: string): Promise<string> => {
    try {
        const thread = await gmail.users.threads.get({
            userId: 'me',
            id: threadId,
            format: 'metadata',
            metadataHeaders: ['Message-Id'],
        });

        const messages = thread.data.messages || [];
        for (let i = messages.length - 1; i >= 0; i--) {
            const value = headerValue(messages[i], 'Message-Id');
            if (value) return value;
        }
    } catch (error) {
        console.warn(`Gmail: could not read Message-Id for thread ${threadId}`, error);
    }

    return '';
};

const buildMime = (parts: {
    fromName: string;
    fromEmail: string;
    to: string;
    subject: string;
    body: string;
    inReplyTo?: string;
}): string => {
    const headers = [
        `From: ${encodeHeader(parts.fromName)} <${parts.fromEmail}>`,
        `To: ${parts.to}`,
        `Subject: ${encodeHeader(parts.subject)}`,
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset="UTF-8"',
        'Content-Transfer-Encoding: 8bit',
    ];

    if (parts.inReplyTo) {
        headers.push(`In-Reply-To: ${parts.inReplyTo}`, `References: ${parts.inReplyTo}`);
    }

    return `${headers.join('\r\n')}\r\n\r\n${parts.body.replace(/\n/g, '\r\n')}`;
};

export const gmailSender: ChannelSender = {
    send: async (companyId, job) => {
        const [settings, priv, gmail] = await Promise.all([
            readSettings(companyId),
            readPrivate(companyId),
            gmailClientFor(companyId),
        ]);

        const fromEmail = priv.gmail?.email || settings.emailAddress;
        if (!fromEmail) throw new Error('No Gmail address is connected for this company');

        const rawSubject = job.subject || 'Your enquiry';
        const subject = /^re:\s/i.test(rawSubject) ? rawSubject : `Re: ${rawSubject}`;

        const inReplyTo = job.emailThreadId ? await threadMessageId(gmail, job.emailThreadId) : '';

        const mime = buildMime({
            fromName: settings.dealershipName || 'Sales',
            fromEmail,
            to: job.to,
            subject,
            body: job.text,
            inReplyTo: inReplyTo || undefined,
        });

        const sent = await gmail.users.messages.send({
            userId: 'me',
            requestBody: {
                raw: Buffer.from(mime, 'utf8').toString('base64url'),
                ...(job.emailThreadId ? { threadId: job.emailThreadId } : {}),
            },
        });

        // Mark the thread so Steve can see at a glance, in Gmail itself, that Dave has answered.
        try {
            const threadId = sent.data.threadId || job.emailThreadId;
            if (threadId) {
                const labelId = await ensureLabel(gmail, `${settings.agentName || 'Dave'} replied`);
                await gmail.users.threads.modify({ userId: 'me', id: threadId, requestBody: { addLabelIds: [labelId] } });
            }
        } catch (e) {
            console.warn('Could not label thread', (e as Error).message);
        }

        return { providerId: sent.data.id || '' };
    },
};

/** Find or create a user label by display name; returns its id. */
const ensureLabel = async (gmail: gmail_v1.Gmail, name: string): Promise<string> => {
    const list = await gmail.users.labels.list({ userId: 'me' });
    const existing = (list.data.labels || []).find((l: gmail_v1.Schema$Label) => (l.name || '').toLowerCase() === name.toLowerCase());
    if (existing?.id) return existing.id;
    const created = await gmail.users.labels.create({
        userId: 'me',
        requestBody: { name, labelListVisibility: 'labelShow', messageListVisibility: 'show', color: { backgroundColor: '#16a765', textColor: '#ffffff' } },
    });
    return created.data.id || '';
};

// --- Backfill ---------------------------------------------------------------

const MAX_BACKFILL_MESSAGES = 300;

/**
 * Run the parsers over the last N days of inbox without answering anybody.
 *
 * This exists so Steve can see what the parser makes of his real mail before the agent
 * is allowed to speak. It never replies and never queues anything; with dryRun it does
 * not even write, it just hands back the list.
 */
export const salesAgentBackfillLeads = functions
    .runWith({ secrets: GMAIL_SECRETS, timeoutSeconds: 540, memory: '512MB' })
    .https.onCall(async (data, context) => {
        const companyId = await requireMember(context, data?.companyId);
        const days = Math.min(Math.max(Number(data?.days) || 7, 1), 90);
        const dryRun = data?.dryRun !== false;

        const [settings, priv, gmail] = await Promise.all([
            readSettings(companyId),
            readPrivate(companyId),
            gmailClientFor(companyId),
        ]);

        const selfEmail = (priv.gmail?.email || settings.emailAddress || '').toLowerCase();

        const listed = await gmail.users.messages.list({
            userId: 'me',
            q: `in:inbox newer_than:${days}d`,
            maxResults: MAX_BACKFILL_MESSAGES,
        });

        const results: Array<{
            messageId: string;
            from: string;
            subject: string;
            lead: ParsedLead;
            leadId?: string;
        }> = [];

        for (const stub of listed.data.messages || []) {
            if (!stub.id) continue;

            const full = await gmail.users.messages.get({ userId: 'me', id: stub.id, format: 'full' });
            const raw = toRawEmail(full.data, selfEmail);
            const lead = parseLeadEmail(raw);

            const entry: (typeof results)[number] = {
                messageId: stub.id,
                from: raw.from,
                subject: raw.subject,
                lead,
            };

            if (!dryRun && lead.kind !== 'ignore') {
                entry.leadId = await findOrCreateLead(
                    companyId,
                    { firstName: lead.firstName, lastName: lead.name?.split(/\s+/).slice(1).join(' '), email: lead.email, phone: lead.phone },
                    crmLeadSource(lead.source),
                    lead.vehicle?.title
                );
            }

            results.push(entry);
        }

        const counts = results.reduce<Record<string, number>>((acc, r) => {
            acc[r.lead.kind] = (acc[r.lead.kind] || 0) + 1;
            return acc;
        }, {});

        return { dryRun, days, scanned: results.length, counts, results };
    });
