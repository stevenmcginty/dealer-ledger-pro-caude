/**
 * Conversation state for the sales agent, plus the small shared reads every other
 * salesAgent module needs (settings, tokens, the RTDB paths).
 *
 * One customer is one Conversation, not one thread per channel. Somebody who emails
 * about a car and then answers the WhatsApp follow-up is the same person, so every
 * address we learn about them is written into contactIndex and points at the same
 * conversation id. That is what lets the agent keep its memory when the router moves
 * an email lead onto WhatsApp.
 *
 * Every conversation also gets a short number. Steve replies "TAKE OVER 12" on his
 * phone; a push key would be unusable for that.
 */

import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions/v1';

import {
    AgentMessage,
    Channel,
    Contact,
    Conversation,
    SalesAgentPrivate,
    SalesAgentSettings,
    normaliseAddress,
    rtdbKey,
    toE164, stripUndefined } from './types';

export const db = () => admin.database();

/**
 * The Gemini secret, mounted on every function that can reach the brain.
 *
 * It lives here rather than in router.ts because the channel adapters read it while
 * their module is still being loaded — `functions.runWith({ secrets })` runs at import
 * time — and router.ts sits inside an import cycle with them, so reading it from there
 * hands back `undefined` depending on which module the container happened to load
 * first. This file imports nothing of ours, so it is always finished before anybody
 * asks. The type keeps it honest: it is a compile error if brain renames its constant.
 */
type GeminiSecretName = typeof import('./brain')['GEMINI_SECRET_NAME'];
export const BRAIN_SECRETS: GeminiSecretName[] = ['GEMINI_API_KEY'];

export const agentRoot = (companyId: string) => `companies/${companyId}/salesAgent`;
export const agentPath = (companyId: string, sub: string) => `${agentRoot(companyId)}/${sub}`;

/** Top-level, outside any company: the webhooks arrive knowing only a phone number id. */
export const routingPath = (sub: string) => `salesAgentRouting/${sub}`;

/**
 * Tokens live outside the company tree on purpose.
 *
 * A member is granted read on companies/{id} and everything under it, and an RTDB child
 * rule cannot take that back — a `.read: false` on a descendant of a granted node is
 * ignored. Anything under companies/{id}/salesAgent/private would therefore be readable
 * by every member of the company. Up here the default deny stands and only the admin
 * SDK gets in.
 */
export const privatePath = (companyId: string, sub = '') =>
    `salesAgentPrivate/${companyId}${sub ? `/${sub}` : ''}`;

/**
 * Every callable here is handed a companyId by the client, so the pointer at
 * users/{uid}/companyId proves nothing on its own — the same guard the connector
 * callables use is applied to the id that was actually passed in.
 */
export const requireMember = async (
    context: functions.https.CallableContext,
    companyId: unknown
): Promise<string> => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'You need to be signed in to do that.');
    }

    const id = String(companyId || '').trim();
    if (!id) {
        throw new functions.https.HttpsError('invalid-argument', 'No company was given.');
    }

    const member = await db().ref(`companies/${id}/users/${context.auth.uid}`).once('value');
    if (!member.exists()) {
        throw new functions.https.HttpsError('permission-denied', 'You do not have access to this company');
    }

    return id;
};

/** CRM lead shapes, mirrored from the app's root types.ts. Functions compile only ./src,
 *  so the shapes are restated here the same way connectors/types.ts restates its own. */
export type LeadSource =
    | 'Website' | 'Walk-in' | 'Referral' | 'Motors.co.uk' | 'CarGurus'
    | 'AutoTrader' | 'eBay' | 'Facebook' | 'Other';

export type ActivityType =
    | 'EMAIL_IN' | 'EMAIL_OUT' | 'SMS_IN' | 'SMS_OUT'
    | 'WHATSAPP_IN' | 'WHATSAPP_OUT' | 'CALL_LOG' | 'NOTE' | 'SYSTEM';

interface Activity {
    id: string;
    type: ActivityType;
    content: string;
    timestamp: string;
    performedBy?: string;
}

interface StoredLead {
    ownerId: string;
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
    source: LeadSource;
    vehicleOfInterest?: string;
    stage: string;
    history: Activity[];
    createdAt: string;
    updatedAt: string;
}

const ACTIVITY_TYPES: Record<Channel, { in: ActivityType; out: ActivityType }> = {
    whatsapp: { in: 'WHATSAPP_IN', out: 'WHATSAPP_OUT' },
    sms: { in: 'SMS_IN', out: 'SMS_OUT' },
    email: { in: 'EMAIL_IN', out: 'EMAIL_OUT' },
};

/** Everything off until somebody turns it on — an unconfigured company must stay silent. */
const SETTINGS_DEFAULTS: SalesAgentSettings = {
    enabled: false,
    dealershipName: '',
    location: '',
    websiteUrl: '',
    stockListUrl: '',
    openingHours: '',
    address: '',
    phone: '',
    faqs: '',
    ownerAlertNumber: '',
    ownerName: '',
    agentName: 'Dave',
    teamNames: '',
    priceFlexMode: 'hint',
    negotiationMaxDiscount: 0,
    replyDelaySeconds: [5, 15],
    channels: { whatsapp: false, sms: false, email: false },
    preferWhatsAppReply: true,
    followUpPhoneLeads: false,
    emailAddress: '',
    signature: '',
    sendHours: {
        enabled: true,
        start: '08:00',
        end: '17:00',
        days: [1, 2, 3, 4, 5, 6],
        timeZone: 'Europe/London',
    },
    updatedAt: 0,
};

export const readSettings = async (companyId: string): Promise<SalesAgentSettings> => {
    const snap = await db().ref(agentPath(companyId, 'settings')).once('value');
    const saved = (snap.val() || {}) as Partial<SalesAgentSettings>;

    return {
        ...SETTINGS_DEFAULTS,
        ...saved,
        channels: { ...SETTINGS_DEFAULTS.channels, ...(saved.channels || {}) },
        replyDelaySeconds: Array.isArray(saved.replyDelaySeconds) && saved.replyDelaySeconds.length === 2
            ? saved.replyDelaySeconds
            : SETTINGS_DEFAULTS.replyDelaySeconds,
        sendHours: {
            ...(SETTINGS_DEFAULTS.sendHours || {}),
            ...(saved.sendHours || {}),
            days: Array.isArray(saved.sendHours?.days) && saved.sendHours.days.length
                ? saved.sendHours.days
                : [1, 2, 3, 4, 5, 6],
        },
    };
};

/**
 * Tokens. The old CRM settings held WhatsApp/Twilio credentials in a client-readable
 * node; those are honoured as a fallback so an existing setup keeps working, but
 * anything saved through salesAgentSavePrivate wins.
 */
export const readPrivate = async (companyId: string): Promise<SalesAgentPrivate> => {
    const [privSnap, crmSnap] = await Promise.all([
        db().ref(privatePath(companyId)).once('value'),
        db().ref(`companies/${companyId}/crmSettings`).once('value'),
    ]);

    const priv = (privSnap.val() || {}) as SalesAgentPrivate;
    const crm = (crmSnap.val() || {}) as Record<string, string | undefined>;

    if (!priv.whatsapp?.accessToken && crm.whatsappAccessToken && crm.whatsappPhoneId) {
        priv.whatsapp = {
            phoneNumberId: crm.whatsappPhoneId,
            businessAccountId: crm.whatsappBusinessId || '',
            accessToken: crm.whatsappAccessToken,
            verifyToken: priv.whatsapp?.verifyToken || '',
        };
    }

    if (!priv.twilio?.authToken && crm.twilioAccountSid && crm.twilioAuthToken) {
        priv.twilio = {
            accountSid: crm.twilioAccountSid,
            authToken: crm.twilioAuthToken,
            fromNumber: crm.twilioPhoneNumber || '',
        };
    }

    return priv;
};

// --- Dedupe -----------------------------------------------------------------

/**
 * Claim a provider message id. Returns true the first time and false ever after,
 * which is what makes webhook retries harmless: Meta, Twilio and Gmail all re-deliver
 * when they don't like our response, and Cazoo sends the same lead two or three times
 * on its own.
 */
export const claimProviderId = async (companyId: string, providerId: string): Promise<boolean> => {
    if (!providerId) return true;

    const ref = db().ref(agentPath(companyId, `seenProviderIds/${rtdbKey(providerId)}`));
    const result = await ref.transaction(current => (current === null ? Date.now() : undefined));
    return result.committed;
};

/** Seven days is well past every provider's retry window; anything older is dead weight. */
export const pruneSeenProviderIds = async (companyId: string, maxAgeMs = 7 * 86_400_000): Promise<number> => {
    const ref = db().ref(agentPath(companyId, 'seenProviderIds'));
    const snap = await ref.once('value');
    const all = (snap.val() || {}) as Record<string, number>;

    const cutoff = Date.now() - maxAgeMs;
    const updates: Record<string, null> = {};
    Object.entries(all).forEach(([key, ts]) => {
        if (typeof ts === 'number' && ts < cutoff) updates[key] = null;
    });

    const count = Object.keys(updates).length;
    if (count) await ref.update(stripUndefined(updates));
    return count;
};

// --- Conversations ----------------------------------------------------------

export const getConversation = async (companyId: string, convId: string): Promise<Conversation | null> => {
    const snap = await db().ref(agentPath(companyId, `conversations/${convId}`)).once('value');
    if (!snap.exists()) return null;
    const conv = snap.val() as Conversation;
    return { ...conv, id: convId };
};

export const updateConversation = async (
    companyId: string,
    convId: string,
    patch: Record<string, unknown>
): Promise<void> => {
    if (!Object.keys(patch).length) return;
    await db().ref(agentPath(companyId, `conversations/${convId}`)).update(stripUndefined({ ...patch, updatedAt: Date.now() }));
};

export const listConversations = async (companyId: string): Promise<Conversation[]> => {
    const snap = await db().ref(agentPath(companyId, 'conversations')).once('value');
    const all = (snap.val() || {}) as Record<string, Conversation>;

    return Object.entries(all)
        .map(([id, conv]) => ({ ...conv, id }))
        .sort((a, b) => (b.lastInboundAt || 0) - (a.lastInboundAt || 0));
};

export const convIdForShortId = async (companyId: string, shortId: number): Promise<string | null> => {
    const snap = await db().ref(agentPath(companyId, `shortIds/${shortId}`)).once('value');
    return (snap.val() as string | null) || null;
};

/** Point one more address at an existing conversation. */
export const indexContact = async (
    companyId: string,
    channel: Channel,
    address: string,
    convId: string
): Promise<void> => {
    if (!address) return;
    const key = rtdbKey(normaliseAddress(channel, address));
    await db().ref(agentPath(companyId, `contactIndex/${key}`)).set(convId);
};

const lookupContactIndex = async (companyId: string, channel: Channel, address: string): Promise<string | null> => {
    if (!address) return null;
    const key = rtdbKey(normaliseAddress(channel, address));
    const snap = await db().ref(agentPath(companyId, `contactIndex/${key}`)).once('value');
    return (snap.val() as string | null) || null;
};

/** Short ids are handed out per company and never reused, so a stale "TAKE OVER 8"
 *  can only ever hit the conversation it was printed for. */
const allocateShortId = async (companyId: string): Promise<number> => {
    const result = await db()
        .ref(agentPath(companyId, 'nextShortId'))
        .transaction(current => (typeof current === 'number' && current > 0 ? current + 1 : 1));
    return (result.snapshot.val() as number) || 1;
};

/** Merge what we have just learned about somebody without wiping what we already knew. */
const mergeContact = (existing: Contact, incoming: Contact): Contact => {
    const merged: Contact = { ...existing };
    (Object.keys(incoming) as Array<keyof Contact>).forEach(field => {
        const value = incoming[field];
        if (value && !merged[field]) (merged as Record<string, unknown>)[field] = value;
    });
    return merged;
};

/**
 * Find this person's conversation or start one.
 *
 * The address they used is tried first, then any other address we were handed with
 * them — a CarGurus lead arrives with an email and a mobile at the same time, and if
 * either one is already known this is not a new customer.
 */
export const findOrCreateConversation = async (
    companyId: string,
    channel: Channel,
    address: string,
    contact: Contact,
    options: { source?: LeadSource; vehicleOfInterest?: string; emailSubject?: string; emailThreadId?: string } = {}
): Promise<{ conversation: Conversation; isNew: boolean }> => {
    const candidates: Array<[Channel, string]> = [[channel, address]];
    if (contact.email) candidates.push(['email', contact.email]);
    if (contact.phone) candidates.push(['whatsapp', contact.phone], ['sms', contact.phone]);

    for (const [candidateChannel, candidateAddress] of candidates) {
        const convId = await lookupContactIndex(companyId, candidateChannel, candidateAddress);
        if (!convId) continue;

        const existing = await getConversation(companyId, convId);
        if (!existing) continue;

        const merged = mergeContact(existing.contact || {}, contact);
        if (JSON.stringify(merged) !== JSON.stringify(existing.contact || {})) {
            await updateConversation(companyId, convId, { contact: merged });
            existing.contact = merged;
        }

        // Whatever address they have just used now points here too.
        await indexContact(companyId, channel, address, convId);
        return { conversation: existing, isNew: false };
    }

    const ref = db().ref(agentPath(companyId, 'conversations')).push();
    const id = ref.key as string;
    const shortId = await allocateShortId(companyId);
    const now = Date.now();

    const leadId = await findOrCreateLead(companyId, contact, options.source || sourceForChannel(channel), options.vehicleOfInterest);

    const conversation: Conversation = {
        id,
        shortId,
        companyId,
        channel,
        address: channel === 'email' ? address.trim().toLowerCase() : toE164(address),
        originChannel: channel,
        contact: { ...contact, leadId },
        mode: 'agent',
        stage: 'vehicle',
        escalated: false,
        priceRequests: 0,
        lastInboundAt: now,
        // Only a WhatsApp message from the customer opens Meta's 24h free-text window.
        // An email or a text does not, so this stays at zero until they use WhatsApp —
        // otherwise the first message we send them would be free text Meta rejects.
        lastCustomerMessageAt: channel === 'whatsapp' ? now : 0,
        createdAt: now,
        updatedAt: now,
        unread: 0,
    };

    if (options.emailThreadId) conversation.emailThreadId = options.emailThreadId;
    if (options.emailSubject) conversation.emailSubject = options.emailSubject;

    await ref.set(stripUndefined(conversation));
    await db().ref(agentPath(companyId, `shortIds/${shortId}`)).set(id);

    await indexContact(companyId, channel, address, id);
    if (contact.email) await indexContact(companyId, 'email', contact.email, id);
    if (contact.phone) {
        await indexContact(companyId, 'whatsapp', contact.phone, id);
        await indexContact(companyId, 'sms', contact.phone, id);
    }

    return { conversation, isNew: true };
};

const sourceForChannel = (channel: Channel): LeadSource => (channel === 'email' ? 'Website' : 'Other');

// --- Messages ---------------------------------------------------------------

export const appendMessage = async (
    companyId: string,
    conversation: Conversation,
    message: Omit<AgentMessage, 'id'>
): Promise<AgentMessage> => {
    const ref = db().ref(agentPath(companyId, `conversations/${conversation.id}/messages`)).push();
    const stored: AgentMessage = { ...message, id: ref.key as string };

    // Undefined keys are rejected by RTDB rather than ignored.
    const clean = Object.fromEntries(Object.entries(stored).filter(([, v]) => v !== undefined));
    await ref.set(stripUndefined(clean));

    const leadId = conversation.contact?.leadId;
    if (leadId) {
        const type = ACTIVITY_TYPES[message.channel][message.direction];
        await appendLeadActivity(companyId, leadId, type, message.text, message.from === 'owner' ? 'Owner' : undefined);
    }

    return stored;
};

export const readHistory = async (companyId: string, convId: string, limit = 40): Promise<AgentMessage[]> => {
    const snap = await db()
        .ref(agentPath(companyId, `conversations/${convId}/messages`))
        .orderByChild('createdAt')
        .limitToLast(limit)
        .once('value');

    const all = (snap.val() || {}) as Record<string, AgentMessage>;
    return Object.entries(all)
        .map(([id, m]) => ({ ...m, id }))
        .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
};

// --- CRM leads --------------------------------------------------------------

const leadsPath = (companyId: string) => `companies/${companyId}/leads`;

const splitName = (name?: string): { firstName: string; lastName: string } => {
    const parts = (name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return { firstName: '', lastName: '' };
    return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
};

/** Who new leads belong to. The CRM already has this setting; the sales agent reuses it
 *  rather than adding a second answer to the same question. */
const defaultLeadOwner = async (companyId: string): Promise<string> => {
    const snap = await db().ref(`companies/${companyId}/crmSettings/defaultLeadOwner`).once('value');
    return (snap.val() as string | null) || '';
};

/**
 * Attach to the customer's existing CRM lead, or open one.
 *
 * Matching is on phone or email only. Names are not reliable enough to merge on — two
 * different Sams is a much worse outcome than two lead records for one person.
 */
export const findOrCreateLead = async (
    companyId: string,
    contact: Contact,
    source: LeadSource,
    vehicleOfInterest?: string
): Promise<string | undefined> => {
    if (!contact.phone && !contact.email) return undefined;

    const snap = await db().ref(leadsPath(companyId)).once('value');
    const all = (snap.val() || {}) as Record<string, StoredLead>;

    const wantPhone = contact.phone ? toE164(contact.phone) : '';
    const wantEmail = contact.email ? contact.email.trim().toLowerCase() : '';

    const match = Object.entries(all).find(([, lead]) => {
        if (wantPhone && lead.phone && toE164(lead.phone) === wantPhone) return true;
        if (wantEmail && lead.email && lead.email.trim().toLowerCase() === wantEmail) return true;
        return false;
    });

    if (match) return match[0];

    const ref = db().ref(leadsPath(companyId)).push();
    const now = new Date().toISOString();
    const { firstName, lastName } = splitName([contact.firstName, contact.lastName].filter(Boolean).join(' '));

    const lead: StoredLead = {
        ownerId: await defaultLeadOwner(companyId),
        firstName: contact.firstName || firstName,
        lastName: contact.lastName || lastName,
        email: wantEmail,
        stage: 'New Lead',
        source,
        history: [],
        createdAt: now,
        updatedAt: now,
    };

    if (wantPhone) lead.phone = wantPhone;
    if (vehicleOfInterest) lead.vehicleOfInterest = vehicleOfInterest;

    await ref.set(stripUndefined(lead));
    return ref.key as string;
};

export const appendLeadActivity = async (
    companyId: string,
    leadId: string,
    type: ActivityType,
    content: string,
    performedBy?: string
): Promise<void> => {
    const ref = db().ref(`${leadsPath(companyId)}/${leadId}`);
    const snap = await ref.once('value');
    if (!snap.exists()) return;

    const lead = snap.val() as StoredLead;
    const activity: Activity = {
        id: db().ref().push().key || String(Date.now()),
        type,
        content,
        timestamp: new Date().toISOString(),
    };
    if (performedBy) activity.performedBy = performedBy;

    await ref.update({
        history: [...(lead.history || []), activity],
        updatedAt: new Date().toISOString(),
    });
};

export const setLeadStage = async (companyId: string, leadId: string, stage: string): Promise<void> => {
    await db().ref(`${leadsPath(companyId)}/${leadId}`).update({ stage, updatedAt: new Date().toISOString() });
};
