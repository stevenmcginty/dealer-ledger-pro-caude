"use strict";
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
exports.salesAgentBackfillLeads = exports.gmailSender = exports.salesAgentGmailPush = exports.toRawEmail = exports.stripQuotedReply = void 0;
const functions = __importStar(require("firebase-functions/v1"));
const companyIds_1 = require("../../utils/companyIds");
const inboxRouting_1 = require("../inboxRouting");
const conversations_1 = require("../conversations");
const gmailAuth_1 = require("../gmailAuth");
const router_1 = require("../router");
const types_1 = require("../types");
const leadParsers_1 = require("./leadParsers");
// --- Reading a message ------------------------------------------------------
const headerValue = (message, name) => {
    const found = (message.payload?.headers || []).find(h => (h.name || '').toLowerCase() === name.toLowerCase());
    return (found?.value || '').trim();
};
const decodePart = (data) => data ? Buffer.from(data, 'base64url').toString('utf8') : '';
/** Walk the MIME tree and collect the first body of each type we care about. */
const bodiesOf = (payload) => {
    const out = { text: '', html: '' };
    if (!payload)
        return out;
    const visit = (part) => {
        const mime = (part.mimeType || '').toLowerCase();
        if (mime === 'text/plain' && !out.text)
            out.text = decodePart(part.body?.data);
        else if (mime === 'text/html' && !out.html)
            out.html = decodePart(part.body?.data);
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
const QUOTE_MARKERS = [
    /^\s*On .{4,120}\bwrote:\s*$/im,
    /^\s*-{2,}\s*Original Message\s*-{2,}/im,
    /^\s*_{10,}\s*$/m,
    /^\s*From:\s.+\r?\n\s*(?:Sent|Date):\s/im,
    /^\s*Sent from my \w+/im,
    /^\s*Get Outlook for \w+/im,
    /^\s*Sent from Outlook\b/im,
];
const stripQuotedReply = (body) => {
    let text = (body || '').replace(/\r\n/g, '\n');
    let cut = text.length;
    for (const marker of QUOTE_MARKERS) {
        const found = text.match(marker);
        if (found?.index !== undefined && found.index < cut)
            cut = found.index;
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
exports.stripQuotedReply = stripQuotedReply;
/** Everything the parsers need, out of one Gmail message. */
const toRawEmail = (message, selfEmail) => {
    const bodies = bodiesOf(message.payload);
    return {
        from: headerValue(message, 'From'),
        subject: headerValue(message, 'Subject'),
        text: (0, exports.stripQuotedReply)(bodies.text),
        html: bodies.html || undefined,
        messageId: message.id || undefined,
        threadId: message.threadId || undefined,
        selfEmail,
    };
};
exports.toRawEmail = toRawEmail;
// --- Push handling ----------------------------------------------------------
const companyForGmailAddress = async (email) => {
    const key = (0, types_1.rtdbKey)(email.trim().toLowerCase());
    const snap = await (0, conversations_1.db)().ref((0, conversations_1.routingPath)(`gmailAddresses/${key}`)).once('value');
    const indexed = snap.val();
    if (indexed)
        return indexed;
    // Nothing indexed: a connection made before the index existed. Find it and record it.
    for (const companyId of await (0, companyIds_1.getCompanyIds)()) {
        const priv = await (0, conversations_1.readPrivate)(companyId);
        if (priv.gmail?.email?.toLowerCase() === email.trim().toLowerCase()) {
            await (0, conversations_1.db)().ref((0, conversations_1.routingPath)(`gmailAddresses/${key}`)).set(companyId);
            return companyId;
        }
    }
    return null;
};
/** A dropped lead is still worth a record — it is the only way to notice the ignore
 *  rules have gone wrong without reading the mailbox by hand. */
const recordIgnored = async (companyId, messageId, from, subject, reason) => {
    await (0, conversations_1.db)().ref((0, conversations_1.agentPath)(companyId, `ignored/${(0, types_1.rtdbKey)(messageId)}`)).set({
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
const processMessage = async (companyId, selfEmail, message) => {
    const labels = message.labelIds || [];
    if (labels.includes('SENT') || labels.includes('DRAFT') || !labels.includes('INBOX'))
        return;
    const raw = (0, exports.toRawEmail)(message, selfEmail);
    const lead = (0, leadParsers_1.parseLeadEmail)(raw);
    if (lead.kind === 'ignore') {
        await recordIgnored(companyId, message.id || String(Date.now()), raw.from, raw.subject, lead.ignoreReason || 'ignored');
        return;
    }
    const inbound = {
        companyId,
        channel: (lead.replyTo.channel || 'email'),
        address: lead.replyTo.address || raw.from,
        text: lead.message,
        providerId: lead.correlationId ? `cazoo:${lead.correlationId}` : (message.id || ''),
        name: lead.name,
        subject: raw.subject,
        emailThreadId: message.threadId || undefined,
        extractedPhones: Array.from(new Set([
            ...(lead.phone ? [lead.phone] : []),
            ...(0, types_1.extractUkMobiles)(raw.text),
        ])),
        receivedAt: Number(message.internalDate) || Date.now(),
    };
    await (0, router_1.handleInbound)(inbound, { lead });
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
const recordOwnerSentMessage = async (credentialCompanyId, selfEmail, message) => {
    const threadId = message.threadId;
    const id = message.id;
    if (!threadId || !id)
        return;
    const inbox = await (0, inboxRouting_1.inboxForMember)(credentialCompanyId);
    const companyIds = inbox?.memberCompanyIds?.length ? inbox.memberCompanyIds : [credentialCompanyId];
    for (const companyId of companyIds) {
        const conversation = (await (0, conversations_1.listConversations)(companyId)).find(conv => conv.emailThreadId === threadId);
        if (!conversation)
            continue;
        // The app's own sends are already on the thread under this id.
        const history = await (0, conversations_1.readHistory)(companyId, conversation.id, 200);
        if (history.some(m => m.providerId === id))
            return;
        const raw = (0, exports.toRawEmail)(message, selfEmail);
        const text = raw.text.trim();
        if (!text)
            return;
        await (0, conversations_1.appendMessage)(companyId, conversation, {
            direction: 'out',
            channel: 'email',
            text,
            from: 'owner',
            providerId: id,
            subject: raw.subject,
            createdAt: Number(message.internalDate) || Date.now(),
        });
        const patch = { lastOutboundAt: Number(message.internalDate) || Date.now() };
        if (conversation.pendingDraft)
            patch.pendingDraft = null;
        await (0, conversations_1.updateConversation)(companyId, conversation.id, patch);
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
exports.salesAgentGmailPush = functions
    .runWith({ timeoutSeconds: 300, memory: '512MB', secrets: [...gmailAuth_1.GMAIL_SECRETS, ...conversations_1.BRAIN_SECRETS] })
    .pubsub.topic('gmail-sales-agent')
    .onPublish(async (message) => {
    const payload = (message.json || {});
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
    const priv = await (0, conversations_1.readPrivate)(companyId);
    const startHistoryId = priv.gmail?.historyId;
    if (!startHistoryId) {
        // No floor to work from; set one and let the next push do the work.
        await (0, gmailAuth_1.startGmailWatch)(companyId);
        return null;
    }
    const gmail = await (0, gmailAuth_1.gmailClientFor)(companyId);
    const seen = new Set();
    let latestHistoryId = String(payload.historyId || startHistoryId);
    let pageToken;
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
            if (page.data.historyId)
                latestHistoryId = String(page.data.historyId);
            for (const record of page.data.history || []) {
                for (const added of record.messagesAdded || []) {
                    const id = added.message?.id;
                    if (id)
                        seen.add(id);
                }
            }
            pageToken = page.data.nextPageToken || undefined;
        } while (pageToken);
    }
    catch (error) {
        if (error?.code === 404 || error?.response?.status === 404) {
            console.warn(`Gmail history for ${emailAddress} has expired; restarting the watch`);
            await (0, gmailAuth_1.startGmailWatch)(companyId);
            return null;
        }
        throw error;
    }
    for (const id of seen) {
        try {
            const full = await gmail.users.messages.get({ userId: 'me', id, format: 'full' });
            await processMessage(companyId, emailAddress, full.data);
        }
        catch (error) {
            console.error(`Gmail: handling message ${id} for company ${companyId} failed`, error);
        }
    }
    // Second pass: what the desk sent from Gmail itself.
    try {
        const sent = new Set();
        let sentPage;
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
                    if (id && !seen.has(id))
                        sent.add(id);
                }
            }
            sentPage = page.data.nextPageToken || undefined;
        } while (sentPage);
        for (const id of sent) {
            try {
                const full = await gmail.users.messages.get({ userId: 'me', id, format: 'full' });
                await recordOwnerSentMessage(companyId, emailAddress, full.data);
            }
            catch (error) {
                console.error(`Gmail: recording sent message ${id} for company ${companyId} failed`, error);
            }
        }
    }
    catch (error) {
        console.warn(`Gmail: sent-mail pass for ${emailAddress} failed`, error);
    }
    await (0, conversations_1.db)().ref((0, conversations_1.privatePath)(companyId, 'gmail/historyId')).set(latestHistoryId);
    return null;
});
// --- Sending ----------------------------------------------------------------
/** Non-ASCII in a header has to be encoded or the whole message is rejected. */
const encodeHeader = (value) => /^[\x20-\x7E]*$/.test(value)
    ? value
    : `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`;
/**
 * Gmail's own threadId keeps the reply in the right conversation in Gmail, but other
 * mail clients thread on In-Reply-To. The real Message-Id is only obtainable from the
 * thread, so it is fetched — headers only — rather than guessed from the threadId.
 */
const threadMessageId = async (gmail, threadId) => {
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
            if (value)
                return value;
        }
    }
    catch (error) {
        console.warn(`Gmail: could not read Message-Id for thread ${threadId}`, error);
    }
    return '';
};
const buildMime = (parts) => {
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
exports.gmailSender = {
    send: async (companyId, job) => {
        const credId = await (0, inboxRouting_1.credentialsCompanyId)(companyId);
        const [settings, priv, gmail] = await Promise.all([
            (0, conversations_1.readSettings)(companyId),
            (0, conversations_1.readPrivate)(credId),
            (0, gmailAuth_1.gmailClientFor)(credId),
        ]);
        const fromEmail = priv.gmail?.email || settings.emailAddress;
        if (!fromEmail)
            throw new Error('No Gmail address is connected for this company');
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
        }
        catch (e) {
            console.warn('Could not label thread', e.message);
        }
        return { providerId: sent.data.id || '' };
    },
};
/** Find or create a user label by display name; returns its id. */
const ensureLabel = async (gmail, name) => {
    const list = await gmail.users.labels.list({ userId: 'me' });
    const existing = (list.data.labels || []).find((l) => (l.name || '').toLowerCase() === name.toLowerCase());
    if (existing?.id)
        return existing.id;
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
exports.salesAgentBackfillLeads = functions
    .runWith({ secrets: gmailAuth_1.GMAIL_SECRETS, timeoutSeconds: 540, memory: '512MB' })
    .https.onCall(async (data, context) => {
    const companyId = await (0, conversations_1.requireMember)(context, data?.companyId);
    const days = Math.min(Math.max(Number(data?.days) || 7, 1), 90);
    const dryRun = data?.dryRun !== false;
    const [settings, priv, gmail] = await Promise.all([
        (0, conversations_1.readSettings)(companyId),
        (0, conversations_1.readPrivate)(companyId),
        (0, gmailAuth_1.gmailClientFor)(companyId),
    ]);
    const selfEmail = (priv.gmail?.email || settings.emailAddress || '').toLowerCase();
    const listed = await gmail.users.messages.list({
        userId: 'me',
        q: `in:inbox newer_than:${days}d`,
        maxResults: MAX_BACKFILL_MESSAGES,
    });
    const results = [];
    for (const stub of listed.data.messages || []) {
        if (!stub.id)
            continue;
        const full = await gmail.users.messages.get({ userId: 'me', id: stub.id, format: 'full' });
        const raw = (0, exports.toRawEmail)(full.data, selfEmail);
        const lead = (0, leadParsers_1.parseLeadEmail)(raw);
        const entry = {
            messageId: stub.id,
            from: raw.from,
            subject: raw.subject,
            lead,
        };
        if (!dryRun && lead.kind !== 'ignore') {
            entry.leadId = await (0, conversations_1.findOrCreateLead)(companyId, { firstName: lead.firstName, lastName: lead.name?.split(/\s+/).slice(1).join(' '), email: lead.email, phone: lead.phone }, (0, leadParsers_1.crmLeadSource)(lead.source), lead.vehicle?.title);
        }
        results.push(entry);
    }
    const counts = results.reduce((acc, r) => {
        acc[r.lead.kind] = (acc[r.lead.kind] || 0) + 1;
        return acc;
    }, {});
    return { dryRun, days, scanned: results.length, counts, results };
});
//# sourceMappingURL=gmail.js.map