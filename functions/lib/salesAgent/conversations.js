"use strict";
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
exports.setLeadStage = exports.appendLeadActivity = exports.findOrCreateLead = exports.readHistory = exports.recordDelivery = exports.appendMessage = exports.findOrCreateConversation = exports.allocateShortId = exports.lookupContactIndex = exports.indexContact = exports.convIdForShortId = exports.listConversations = exports.updateConversation = exports.getConversation = exports.pruneSeenProviderIds = exports.claimProviderId = exports.readPrivate = exports.readSettings = exports.requireInboxAccess = exports.requireMember = exports.privatePath = exports.routingPath = exports.agentPath = exports.agentRoot = exports.BRAIN_SECRETS = exports.db = void 0;
const admin = __importStar(require("firebase-admin"));
const functions = __importStar(require("firebase-functions/v1"));
const types_1 = require("./types");
const db = () => admin.database();
exports.db = db;
exports.BRAIN_SECRETS = ['GEMINI_API_KEY'];
const agentRoot = (companyId) => `companies/${companyId}/salesAgent`;
exports.agentRoot = agentRoot;
const agentPath = (companyId, sub) => `${(0, exports.agentRoot)(companyId)}/${sub}`;
exports.agentPath = agentPath;
/** Top-level, outside any company: the webhooks arrive knowing only a phone number id. */
const routingPath = (sub) => `salesAgentRouting/${sub}`;
exports.routingPath = routingPath;
/**
 * Tokens live outside the company tree on purpose.
 *
 * A member is granted read on companies/{id} and everything under it, and an RTDB child
 * rule cannot take that back — a `.read: false` on a descendant of a granted node is
 * ignored. Anything under companies/{id}/salesAgent/private would therefore be readable
 * by every member of the company. Up here the default deny stands and only the admin
 * SDK gets in.
 */
const privatePath = (companyId, sub = '') => `salesAgentPrivate/${companyId}${sub ? `/${sub}` : ''}`;
exports.privatePath = privatePath;
/**
 * Every callable here is handed a companyId by the client, so the pointer at
 * users/{uid}/companyId proves nothing on its own — the same guard the connector
 * callables use is applied to the id that was actually passed in.
 */
const requireMember = async (context, companyId) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'You need to be signed in to do that.');
    }
    const id = String(companyId || '').trim();
    if (!id) {
        throw new functions.https.HttpsError('invalid-argument', 'No company was given.');
    }
    const member = await (0, exports.db)().ref(`companies/${id}/users/${context.auth.uid}`).once('value');
    if (!member.exists()) {
        throw new functions.https.HttpsError('permission-denied', 'You do not have access to this company');
    }
    return id;
};
exports.requireMember = requireMember;
/**
 * Same as requireMember, plus anyone on the shared Gmail / WhatsApp inbox.
 *
 * Steve and Chris do not share a ledger, but they share a number. Replies and
 * read-state on a thread that landed in the other account have to work from
 * either login or the shared inbox is read-only theatre.
 */
const requireInboxAccess = async (context, companyId) => {
    try {
        return await (0, exports.requireMember)(context, companyId);
    }
    catch (error) {
        if (!context.auth || !(error instanceof functions.https.HttpsError) || error.code !== 'permission-denied') {
            throw error;
        }
        const id = String(companyId || '').trim();
        const userCompanySnap = await (0, exports.db)().ref(`users/${context.auth.uid}/companyId`).once('value');
        const userCompany = String(userCompanySnap.val() || '').trim();
        if (!id || !userCompany)
            throw error;
        const [mine, theirs] = await Promise.all([
            (0, exports.db)().ref((0, exports.routingPath)(`inboxMembers/${userCompany}`)).once('value'),
            (0, exports.db)().ref((0, exports.routingPath)(`inboxMembers/${id}`)).once('value'),
        ]);
        const inboxId = mine.val();
        if (inboxId && inboxId === theirs.val())
            return id;
        throw error;
    }
};
exports.requireInboxAccess = requireInboxAccess;
const ACTIVITY_TYPES = {
    whatsapp: { in: 'WHATSAPP_IN', out: 'WHATSAPP_OUT' },
    sms: { in: 'SMS_IN', out: 'SMS_OUT' },
    email: { in: 'EMAIL_IN', out: 'EMAIL_OUT' },
};
/** Everything off until somebody turns it on — an unconfigured company must stay silent. */
const SETTINGS_DEFAULTS = {
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
    channels: { whatsapp: true, sms: false, email: false },
    preferWhatsAppReply: true,
    followUpPhoneLeads: false,
    emailAddress: '',
    signature: '',
    emailApprovalMode: true,
    maxAgentTurns: 0,
    sendHours: {
        enabled: true,
        start: '08:00',
        end: '17:00',
        days: [1, 2, 3, 4, 5, 6],
        timeZone: 'Europe/London',
    },
    updatedAt: 0,
};
const readSettings = async (companyId) => {
    const snap = await (0, exports.db)().ref((0, exports.agentPath)(companyId, 'settings')).once('value');
    const saved = (snap.val() || {});
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
exports.readSettings = readSettings;
/**
 * Tokens. The old CRM settings held WhatsApp/Twilio credentials in a client-readable
 * node; those are honoured as a fallback so an existing setup keeps working, but
 * anything saved through salesAgentSavePrivate wins.
 */
const readPrivate = async (companyId) => {
    const [privSnap, crmSnap] = await Promise.all([
        (0, exports.db)().ref((0, exports.privatePath)(companyId)).once('value'),
        (0, exports.db)().ref(`companies/${companyId}/crmSettings`).once('value'),
    ]);
    const priv = (privSnap.val() || {});
    const crm = (crmSnap.val() || {});
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
exports.readPrivate = readPrivate;
// --- Dedupe -----------------------------------------------------------------
/**
 * Claim a provider message id. Returns true the first time and false ever after,
 * which is what makes webhook retries harmless: Meta, Twilio and Gmail all re-deliver
 * when they don't like our response, and Cazoo sends the same lead two or three times
 * on its own.
 */
const claimProviderId = async (companyId, providerId) => {
    if (!providerId)
        return true;
    const ref = (0, exports.db)().ref((0, exports.agentPath)(companyId, `seenProviderIds/${(0, types_1.rtdbKey)(providerId)}`));
    const result = await ref.transaction(current => (current === null ? Date.now() : undefined));
    return result.committed;
};
exports.claimProviderId = claimProviderId;
/** Seven days is well past every provider's retry window; anything older is dead weight. */
const pruneSeenProviderIds = async (companyId, maxAgeMs = 7 * 86400000) => {
    const ref = (0, exports.db)().ref((0, exports.agentPath)(companyId, 'seenProviderIds'));
    const snap = await ref.once('value');
    const all = (snap.val() || {});
    const cutoff = Date.now() - maxAgeMs;
    const updates = {};
    Object.entries(all).forEach(([key, ts]) => {
        if (typeof ts === 'number' && ts < cutoff)
            updates[key] = null;
    });
    const count = Object.keys(updates).length;
    if (count)
        await ref.update((0, types_1.stripUndefined)(updates));
    return count;
};
exports.pruneSeenProviderIds = pruneSeenProviderIds;
// --- Conversations ----------------------------------------------------------
const getConversation = async (companyId, convId) => {
    const snap = await (0, exports.db)().ref((0, exports.agentPath)(companyId, `conversations/${convId}`)).once('value');
    if (!snap.exists())
        return null;
    const conv = snap.val();
    return { ...conv, id: convId };
};
exports.getConversation = getConversation;
const updateConversation = async (companyId, convId, patch) => {
    if (!Object.keys(patch).length)
        return;
    await (0, exports.db)().ref((0, exports.agentPath)(companyId, `conversations/${convId}`)).update((0, types_1.stripUndefined)({ ...patch, updatedAt: Date.now() }));
};
exports.updateConversation = updateConversation;
const listConversations = async (companyId) => {
    const snap = await (0, exports.db)().ref((0, exports.agentPath)(companyId, 'conversations')).once('value');
    const all = (snap.val() || {});
    return Object.entries(all)
        .map(([id, conv]) => ({ ...conv, id }))
        .sort((a, b) => (b.lastInboundAt || 0) - (a.lastInboundAt || 0));
};
exports.listConversations = listConversations;
const convIdForShortId = async (companyId, shortId) => {
    const snap = await (0, exports.db)().ref((0, exports.agentPath)(companyId, `shortIds/${shortId}`)).once('value');
    return snap.val() || null;
};
exports.convIdForShortId = convIdForShortId;
/** Point one more address at an existing conversation. */
const indexContact = async (companyId, channel, address, convId) => {
    if (!address)
        return;
    const key = (0, types_1.rtdbKey)((0, types_1.normaliseAddress)(channel, address));
    await (0, exports.db)().ref((0, exports.agentPath)(companyId, `contactIndex/${key}`)).set(convId);
};
exports.indexContact = indexContact;
const lookupContactIndex = async (companyId, channel, address) => {
    if (!address)
        return null;
    const key = (0, types_1.rtdbKey)((0, types_1.normaliseAddress)(channel, address));
    const snap = await (0, exports.db)().ref((0, exports.agentPath)(companyId, `contactIndex/${key}`)).once('value');
    return snap.val() || null;
};
exports.lookupContactIndex = lookupContactIndex;
/** Short ids are handed out per company and never reused, so a stale "TAKE OVER 8"
 *  can only ever hit the conversation it was printed for. */
const allocateShortId = async (companyId) => {
    const result = await (0, exports.db)()
        .ref((0, exports.agentPath)(companyId, 'nextShortId'))
        .transaction(current => (typeof current === 'number' && current > 0 ? current + 1 : 1));
    return result.snapshot.val() || 1;
};
exports.allocateShortId = allocateShortId;
/** Merge what we have just learned about somebody without wiping what we already knew. */
const mergeContact = (existing, incoming) => {
    const merged = { ...existing };
    Object.keys(incoming).forEach(field => {
        const value = incoming[field];
        if (value && !merged[field])
            merged[field] = value;
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
const findOrCreateConversation = async (companyId, channel, address, contact, options = {}) => {
    const candidates = [[channel, address]];
    if (contact.email)
        candidates.push(['email', contact.email]);
    if (contact.phone)
        candidates.push(['whatsapp', contact.phone], ['sms', contact.phone]);
    for (const [candidateChannel, candidateAddress] of candidates) {
        const convId = await (0, exports.lookupContactIndex)(companyId, candidateChannel, candidateAddress);
        if (!convId)
            continue;
        const existing = await (0, exports.getConversation)(companyId, convId);
        if (!existing)
            continue;
        const merged = mergeContact(existing.contact || {}, contact);
        if (JSON.stringify(merged) !== JSON.stringify(existing.contact || {})) {
            await (0, exports.updateConversation)(companyId, convId, { contact: merged });
            existing.contact = merged;
        }
        // Whatever address they have just used now points here too.
        await (0, exports.indexContact)(companyId, channel, address, convId);
        return { conversation: existing, isNew: false };
    }
    const ref = (0, exports.db)().ref((0, exports.agentPath)(companyId, 'conversations')).push();
    const id = ref.key;
    const shortId = await (0, exports.allocateShortId)(companyId);
    const now = Date.now();
    const leadId = await (0, exports.findOrCreateLead)(companyId, contact, options.source || sourceForChannel(channel), options.vehicleOfInterest);
    const conversation = {
        id,
        shortId,
        companyId,
        channel,
        address: channel === 'email' ? address.trim().toLowerCase() : (0, types_1.toE164)(address),
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
    if (options.emailThreadId)
        conversation.emailThreadId = options.emailThreadId;
    if (options.emailSubject)
        conversation.emailSubject = options.emailSubject;
    await ref.set((0, types_1.stripUndefined)(conversation));
    await (0, exports.db)().ref((0, exports.agentPath)(companyId, `shortIds/${shortId}`)).set(id);
    await (0, exports.indexContact)(companyId, channel, address, id);
    if (contact.email)
        await (0, exports.indexContact)(companyId, 'email', contact.email, id);
    if (contact.phone) {
        await (0, exports.indexContact)(companyId, 'whatsapp', contact.phone, id);
        await (0, exports.indexContact)(companyId, 'sms', contact.phone, id);
    }
    return { conversation, isNew: true };
};
exports.findOrCreateConversation = findOrCreateConversation;
const sourceForChannel = (channel) => (channel === 'email' ? 'Website' : 'Other');
// --- Messages ---------------------------------------------------------------
const appendMessage = async (companyId, conversation, message) => {
    const ref = (0, exports.db)().ref((0, exports.agentPath)(companyId, `conversations/${conversation.id}/messages`)).push();
    const stored = { ...message, id: ref.key };
    // Undefined keys are rejected by RTDB rather than ignored.
    const clean = Object.fromEntries(Object.entries(stored).filter(([, v]) => v !== undefined));
    await ref.set((0, types_1.stripUndefined)(clean));
    // A delivery receipt arrives knowing only the provider's id, so the way back to
    // the message it belongs to has to be written now, while we still have both.
    if (message.direction === 'out' && message.providerId) {
        await (0, exports.db)()
            .ref((0, exports.agentPath)(companyId, `outboundIndex/${(0, types_1.rtdbKey)(message.providerId)}`))
            .set({ convId: conversation.id, messageId: stored.id, at: Date.now() });
    }
    const leadId = conversation.contact?.leadId;
    if (leadId) {
        const type = ACTIVITY_TYPES[message.channel][message.direction];
        await (0, exports.appendLeadActivity)(companyId, leadId, type, message.text, message.from === 'owner' ? 'Owner' : undefined);
    }
    return stored;
};
exports.appendMessage = appendMessage;
/**
 * Record how far an outbound message got.
 *
 * Receipts arrive out of order and more than once — Meta will happily send 'sent'
 * after 'delivered' — so a state only ever moves forward. Returns false when the
 * providerId belongs to no message we hold, which is normal for anything sent
 * before this index existed.
 */
const recordDelivery = async (companyId, providerId, state, at, error) => {
    if (!providerId)
        return false;
    const snap = await (0, exports.db)().ref((0, exports.agentPath)(companyId, `outboundIndex/${(0, types_1.rtdbKey)(providerId)}`)).once('value');
    const ref = snap.val();
    if (!ref?.convId || !ref?.messageId)
        return false;
    const messageRef = (0, exports.db)().ref((0, exports.agentPath)(companyId, `conversations/${ref.convId}/messages/${ref.messageId}`));
    const current = (await messageRef.child('delivery').once('value')).val();
    if (current && types_1.DELIVERY_RANK[current] >= types_1.DELIVERY_RANK[state])
        return true;
    await messageRef.update((0, types_1.stripUndefined)({
        delivery: state,
        deliveryAt: at || Date.now(),
        ...(error ? { deliveryError: error } : {}),
    }));
    return true;
};
exports.recordDelivery = recordDelivery;
const readHistory = async (companyId, convId, limit = 40) => {
    const snap = await (0, exports.db)()
        .ref((0, exports.agentPath)(companyId, `conversations/${convId}/messages`))
        .orderByChild('createdAt')
        .limitToLast(limit)
        .once('value');
    const all = (snap.val() || {});
    return Object.entries(all)
        .map(([id, m]) => ({ ...m, id }))
        .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
};
exports.readHistory = readHistory;
// --- CRM leads --------------------------------------------------------------
const leadsPath = (companyId) => `companies/${companyId}/leads`;
const splitName = (name) => {
    const parts = (name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length)
        return { firstName: '', lastName: '' };
    return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
};
/** Who new leads belong to. The CRM already has this setting; the sales agent reuses it
 *  rather than adding a second answer to the same question. */
const defaultLeadOwner = async (companyId) => {
    const snap = await (0, exports.db)().ref(`companies/${companyId}/crmSettings/defaultLeadOwner`).once('value');
    return snap.val() || '';
};
/**
 * Attach to the customer's existing CRM lead, or open one.
 *
 * Matching is on phone or email only. Names are not reliable enough to merge on — two
 * different Sams is a much worse outcome than two lead records for one person.
 */
const findOrCreateLead = async (companyId, contact, source, vehicleOfInterest) => {
    if (!contact.phone && !contact.email)
        return undefined;
    const snap = await (0, exports.db)().ref(leadsPath(companyId)).once('value');
    const all = (snap.val() || {});
    const wantPhone = contact.phone ? (0, types_1.toE164)(contact.phone) : '';
    const wantEmail = contact.email ? contact.email.trim().toLowerCase() : '';
    const match = Object.entries(all).find(([, lead]) => {
        if (wantPhone && lead.phone && (0, types_1.toE164)(lead.phone) === wantPhone)
            return true;
        if (wantEmail && lead.email && lead.email.trim().toLowerCase() === wantEmail)
            return true;
        return false;
    });
    if (match)
        return match[0];
    const ref = (0, exports.db)().ref(leadsPath(companyId)).push();
    const now = new Date().toISOString();
    const { firstName, lastName } = splitName([contact.firstName, contact.lastName].filter(Boolean).join(' '));
    const lead = {
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
    if (wantPhone)
        lead.phone = wantPhone;
    if (vehicleOfInterest)
        lead.vehicleOfInterest = vehicleOfInterest;
    await ref.set((0, types_1.stripUndefined)(lead));
    return ref.key;
};
exports.findOrCreateLead = findOrCreateLead;
const appendLeadActivity = async (companyId, leadId, type, content, performedBy) => {
    const ref = (0, exports.db)().ref(`${leadsPath(companyId)}/${leadId}`);
    const snap = await ref.once('value');
    if (!snap.exists())
        return;
    const lead = snap.val();
    const activity = {
        id: (0, exports.db)().ref().push().key || String(Date.now()),
        type,
        content,
        timestamp: new Date().toISOString(),
    };
    if (performedBy)
        activity.performedBy = performedBy;
    await ref.update({
        history: [...(lead.history || []), activity],
        updatedAt: new Date().toISOString(),
    });
};
exports.appendLeadActivity = appendLeadActivity;
const setLeadStage = async (companyId, leadId, stage) => {
    await (0, exports.db)().ref(`${leadsPath(companyId)}/${leadId}`).update({ stage, updatedAt: new Date().toISOString() });
};
exports.setLeadStage = setLeadStage;
//# sourceMappingURL=conversations.js.map