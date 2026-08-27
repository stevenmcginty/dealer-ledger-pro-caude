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
import { credentialsCompanyId, inboxForMember } from '../inboxRouting';
import {
    BRAIN_SECRETS,
    agentPath,
    appendMessage,
    db,
    findOrCreateLead,
    listConversations,
    privatePath,
    readHistory,
    readPrivate,
    readSettings,
    requireMember,
    routingPath,
    updateConversation,
} from '../conversations';
import { GMAIL_SECRETS, gmailClientFor, startGmailWatch } from '../gmailAuth';
import { handleInbound } from '../router';
import { ChannelSender, Channel, InboundMessage, extractUkMobiles, rtdbKey } from '../types';
import { ParsedLead, crmLeadSource, htmlToText, parseLeadEmail } from './leadParsers';
import { stripQuotedReply } from './gmailParse';

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

export { stripQuotedReply } from './gmailParse';

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
        failedRecipient: headerValue(message, 'X-Failed-Recipients') || undefined,
        autoSubmitted: headerValue(message, 'Auto-Submitted') || undefined,
    };
};

/**
 * The whole email as the brain should read it: the text part if it is real, else
 * the HTML flattened; tracking links and "do not reply" chrome dropped; capped so a
 * newsletter-sized lead cannot swamp the prompt.
 */
export const FULL_EMAIL_CHARS = 4000;
export const emailBodyForBrain = (raw: { text: string; html?: string }): string => {
    const text = raw.text && raw.text.length > 60 && !/use an HTML compatible email viewer/i.test(raw.text)
        ? raw.text
        : htmlToText(raw.html) || raw.text;
    const cleaned = text
        .replace(/https?:\/\/\S{60,}/g, '[link]')
        .split('\n')
        .map(line => line.trim())
        .filter(line => !/^PLEASE DO NOT REPLY|^This is an automated email/i.test(line))
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    return cleaned.length > FULL_EMAIL_CHARS ? `${cleaned.slice(0, FULL_EMAIL_CHARS)} […]` : cleaned;
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

    if (lead.kind === 'bounce' && !lead.email) {
        await recordIgnored(companyId, message.id || String(Date.now()), raw.from, raw.subject, 'bounce_no_recipient');
        return;
    }

    const inbound: InboundMessage = {
        companyId,
        channel: (lead.replyTo.channel || 'email') as Channel,
        address: lead.replyTo.address || raw.from,
        text: lead.message,
        providerId: lead.correlationId ? `cazoo:${lead.correlationId}` : (message.id || ''),
        name: lead.kind === 'bounce' ? undefined : lead.name,
        subject: lead.kind === 'bounce' ? undefined : raw.subject,
        emailThreadId: lead.kind === 'bounce' ? undefined : (message.threadId || undefined),
        extractedPhones: Array.from(new Set([
            ...(lead.phone ? [lead.phone] : []),
            ...extractUkMobiles(raw.text),
        ])),
        fullText: emailBodyForBrain(raw),
        receivedAt: Number(message.internalDate) || Date.now(),
    };

    await handleInbound(inbound, { lead });
};

/**
 * A reply Steve or Chris typed in Gmail itself, not in the app.
 *
 * Without this the agent never learns the desk already answered, and carries on
 * from where it thought the thread was. Every SENT message is checked against the
 * conversations of every company on the inbox; one whose Gmail thread matches is
 * recorded as the owner speaking, and any draft the agent was holding for that
 * thread is dropped — the owner has answered it themselves.
 */
const recordOwnerSentMessage = async (
    credentialCompanyId: string,
    selfEmail: string,
    message: gmail_v1.Schema$Message
): Promise<void> => {
    const threadId = message.threadId;
    const id = message.id;
    if (!threadId || !id) return;

    const inbox = await inboxForMember(credentialCompanyId);
    const companyIds = inbox?.memberCompanyIds?.length ? inbox.memberCompanyIds : [credentialCompanyId];

    for (const companyId of companyIds) {
        const conversation = (await listConversations(companyId)).find(conv => conv.emailThreadId === threadId);
        if (!conversation) continue;

        // The app's own sends are already on the thread under this id.
        const history = await readHistory(companyId, conversation.id, 200);
        if (history.some(m => m.providerId === id)) return;

        const raw = toRawEmail(message, selfEmail);
        const text = raw.text.trim();
        if (!text) return;

        await appendMessage(companyId, conversation, {
            direction: 'out',
            channel: 'email',
            text,
            from: 'owner',
            providerId: id,
            subject: raw.subject,
            createdAt: Number(message.internalDate) || Date.now(),
        });

        const patch: Record<string, unknown> = { lastOutboundAt: Number(message.internalDate) || Date.now() };
        if (conversation.pendingDraft) patch.pendingDraft = null;
        await updateConversation(companyId, conversation.id, patch);
        return;
    }
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

        // Second pass: what the desk sent from Gmail itself.
        try {
            const sent = new Set<string>();
            let sentPage: string | undefined;
            do {
                const page = await gmail.users.history.list({
                    userId: 'me',
                    startHistoryId,
                    historyTypes: ['messageAdded'],
                    labelId: 'SENT',
                    maxResults: 500,
                    pageToken: sentPage,
                });
                for (const record of page.data.history || []) {
                    for (const added of record.messagesAdded || []) {
                        const id = added.message?.id;
                        if (id && !seen.has(id)) sent.add(id);
                    }
                }
                sentPage = page.data.nextPageToken || undefined;
            } while (sentPage);

            for (const id of sent) {
                try {
                    const full = await gmail.users.messages.get({ userId: 'me', id, format: 'full' });
                    await recordOwnerSentMessage(companyId, emailAddress, full.data);
                } catch (error) {
                    console.error(`Gmail: recording sent message ${id} for company ${companyId} failed`, error);
                }
            }
        } catch (error) {
            console.warn(`Gmail: sent-mail pass for ${emailAddress} failed`, error);
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
        const credId = await credentialsCompanyId(companyId);
        const [settings, priv, gmail] = await Promise.all([
            readSettings(companyId),
            readPrivate(credId),
            gmailClientFor(credId),
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

/**
 * Gmail only accepts colours from its own fixed palette and rejects anything else
 * outright, so a label is worth more than its colour: a rejected colour falls back
 * to a plain label rather than losing the label altogether.
 */
const LABEL_COLOURS: Record<string, string> = {
    agent: '#16a766',      // green  — Dave answered this one
    whatsapp: '#43d692',   // mint   — moved to WhatsApp
    ledger: '#4a86e8',     // blue   — fallback for a ledger label
};

/**
 * Each dealer's label wants its own colour so the shared mailbox can be read at a
 * glance. Derived from the label's own name rather than configured, so a third
 * ledger joining picks up a colour without anyone choosing one — and the same
 * dealer keeps the same colour forever. Values are from Gmail's fixed palette;
 * anything else is rejected outright.
 */
const LEDGER_PALETTE = ['#4a86e8', '#a479e2', '#f691b3', '#ffad47', '#fad165', '#fb4c2f'];

export const ledgerColour = (labelName: string): string => {
    let hash = 0;
    for (let i = 0; i < labelName.length; i += 1) {
        hash = (hash * 31 + labelName.charCodeAt(i)) >>> 0;
    }
    return LEDGER_PALETTE[hash % LEDGER_PALETTE.length];
};

/** Find or create a user label by display name; returns its id. */
const ensureLabel = async (
    gmail: gmail_v1.Gmail,
    name: string,
    colour = LABEL_COLOURS.agent
): Promise<string> => {
    const list = await gmail.users.labels.list({ userId: 'me' });
    const existing = (list.data.labels || []).find((l: gmail_v1.Schema$Label) => (l.name || '').toLowerCase() === name.toLowerCase());
    if (existing?.id) return existing.id;

    const body = { name, labelListVisibility: 'labelShow', messageListVisibility: 'show' };

    try {
        const created = await gmail.users.labels.create({
            userId: 'me',
            requestBody: { ...body, color: { backgroundColor: colour, textColor: '#ffffff' } },
        });
        return created.data.id || '';
    } catch (error) {
        console.warn(`Gmail rejected the colour for label "${name}", creating it plain`, (error as Error).message);
        const created = await gmail.users.labels.create({ userId: 'me', requestBody: body });
        return created.data.id || '';
    }
};

/**
 * Put a label on a customer's email thread from outside the email channel.
 *
 * Steve lives in Gmail as much as in the app, so what happened to a customer has to
 * be visible there too: that Dave answered, and that the conversation has moved to
 * WhatsApp. Never throws — a label is a convenience and must not fail a send.
 */
export const labelEmailThread = async (
    companyId: string,
    emailThreadId: string,
    name: string,
    kind: 'agent' | 'whatsapp' | 'ledger' = 'agent'
): Promise<boolean> => {
    if (!emailThreadId || !name) return false;

    try {
        const gmail = await gmailClientFor(await credentialsCompanyId(companyId));
        if (!gmail) return false;

        const colour = kind === 'ledger' ? ledgerColour(name) : LABEL_COLOURS[kind];
        const labelId = await ensureLabel(gmail, name, colour);
        if (!labelId) return false;

        await gmail.users.threads.modify({
            userId: 'me',
            id: emailThreadId,
            requestBody: { addLabelIds: [labelId] },
        });
        return true;
    } catch (error) {
        console.warn(`Could not label thread ${emailThreadId} "${name}"`, (error as Error).message);
        return false;
    }
};

// --- Backfill ---------------------------------------------------------------

const MAX_BACKFILL_MESSAGES = 300;

/**
 * Put one Gmail message through the inbox pipeline again, exactly as the push would
 * have. For a lead the parser got wrong the first time: fix the parser, deploy, delete
 * the bad conversation, replay. Duplicate protection is the message's providerId.
 */
export const salesAgentReplayEmail = functions
    .runWith({ secrets: [...GMAIL_SECRETS, ...BRAIN_SECRETS], timeoutSeconds: 120 })
    .database.ref('/companies/{companyId}/salesAgent/replay/{jobId}')
    .onCreate(async (snap, context) => {
        const companyId = context.params.companyId as string;
        const job = (snap.val() || {}) as { messageId?: string; dryRun?: boolean };
        const messageId = String(job.messageId || '');
        const report = (patch: Record<string, unknown>) => snap.ref.update({ ...patch, finishedAt: Date.now() });
        if (!messageId) { await report({ error: 'messageId is required' }); return; }

        try {
            const [settings, priv, gmail] = await Promise.all([readSettings(companyId), readPrivate(companyId), gmailClientFor(companyId)]);
            const selfEmail = (priv.gmail?.email || settings.emailAddress || '').toLowerCase();
            const full = await gmail.users.messages.get({ userId: 'me', id: messageId, format: 'full' });
            const raw = toRawEmail(full.data, selfEmail);
            const lead = parseLeadEmail(raw);
            const parts = (full.data.payload?.parts || []).map(p => p.mimeType);
            if (job.dryRun !== false) {
                await report({ dryRun: true, from: raw.from, subject: raw.subject, textLength: raw.text.length, hasHtml: !!raw.html, mimeParts: parts, textPreview: raw.text.slice(0, 3000), bodyText: htmlToText(raw.html).slice(0, 10000), lead: JSON.parse(JSON.stringify(lead)) });
                return;
            }
            await processMessage(companyId, selfEmail, full.data);
            await report({ dryRun: false, lead: JSON.parse(JSON.stringify(lead)) });
        } catch (error) {
            await report({ error: (error as Error).message || String(error) });
        }
    });

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
