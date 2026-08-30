/**
 * The client half of the AI Sales Agent.
 *
 * Everything the agent actually does happens in the `salesAgent/*` Cloud
 * Functions. This module is the only place the app talks to them: the callables
 * it exposes and the live views of the Realtime Database branches they keep.
 * It follows services/websiteConnector.ts, which does the same job for the
 * website link.
 *
 * The shapes below mirror `functions/src/salesAgent/types.ts`, which is the
 * contract. The client cannot import from `functions/` (separate tsconfig and
 * build), so they are copied here — change them only when that file changes.
 */

import firebase from 'firebase/compat/app';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db, storage } from './firebase';
import { isWhatsAppStoragePath, storagePathFromUrl } from '../utils/whatsappMedia';

// --- Contract (mirror of functions/src/salesAgent/types.ts) -----------------

export type Channel = 'whatsapp' | 'sms' | 'email';
export type ConversationMode = 'agent' | 'human' | 'paused';
export type ConversationStage = 'vehicle' | 'deal' | 'timing' | 'details' | 'booked' | 'closed';

export interface SalesAgentSettings {
    enabled: boolean;
    dealershipName: string;
    location: string;
    websiteUrl: string;
    stockListUrl: string;
    openingHours: string;
    address: string;
    phone: string;
    faqs: string;
    ownerAlertNumber: string;
    ownerName: string;
    /** The persona customers talk to. It never volunteers that it is not a person. */
    agentName: string;
    /** The humans it can hand over to, named the way a customer would hear them. */
    teamNames: string;
    priceFlexMode: 'hint' | 'figure' | 'none';
    negotiationMaxDiscount: number;
    replyDelaySeconds: [number, number];
    channels: { whatsapp: boolean; sms: boolean; email: boolean };
    preferWhatsAppReply: boolean;
    emailAddress: string;
    signature: string;
    /**
     * The website may be shared with another dealer who runs their own ledger.
     * Left on, this company's cars can be sold by whichever agent a customer
     * happens to be talking to; turned off, they are hidden from every agent.
     */
    shareStockWithAgent?: boolean;
    /** What this agent does with cars on the site that match no ledger account at all. */
    unmatchedStockPolicy?: 'include' | 'exclude';
    /** Open a WhatsApp thread with someone who rang off a portal ad and left nothing. */
    followUpPhoneLeads?: boolean;
    /** Web push to this company's registered devices, alongside the WhatsApp alert. */
    pushNotifications?: boolean;
    /**
     * Hold Dave's email replies for approval in this ledger's Agent Inbox.
     * `true` / undefined: he drafts, you send. `false`: he replies himself.
     * Also the fallback for WhatsApp until `whatsappApprovalMode` is set.
     */
    emailApprovalMode?: boolean;
    /**
     * Hold Dave's WhatsApp replies for approval. Undefined inherits
     * `emailApprovalMode` (the original single switch).
     */
    whatsappApprovalMode?: boolean;
    /**
     * How many customer-facing Dave replies before the next inbound is handed
     * to a human. 0 / missing = no cap.
     */
    maxAgentTurns?: number;
    /**
     * When Dave may send to the customer. Drafts and notifications still happen
     * at night; an approved reply outside this window waits until the next opening.
     */
    sendHours?: {
        enabled?: boolean;
        start?: string;
        end?: string;
        days?: number[];
        timeZone?: string;
    };
    updatedAt: number;
    /**
     * Which connections have credentials stored in `salesAgent/private`.
     *
     * The tokens themselves are write-only — the client posts them to
     * `salesAgentSavePrivate` and can never read them back — so this flag is the
     * only way the settings page can say "connected". It is set here after a
     * save succeeds, and by the Gmail return leg.
     */
    connections?: { whatsapp?: boolean; twilio?: boolean; gmail?: boolean };
}

export interface StockMeta {
    lastIndexedAt: number;
    count: number;
    availableCount: number;
    sourceUrl: string;
    errors: string[];
    durationMs: number;
}

export interface Contact {
    firstName?: string;
    lastName?: string;
    phone?: string;
    email?: string;
    leadId?: string;
}

export interface Conversation {
    id: string;
    shortId: number;
    companyId: string;
    channel: Channel;
    address: string;
    originChannel: Channel;
    contact: Contact;
    mode: ConversationMode;
    stage: ConversationStage;
    vehicleInterest?: { stockId?: string; title?: string; ledgerVehicleId?: string };
    partExOrFinance?: string;
    preferredTime?: string;
    booking?: { name: string; phone: string; window: string; confirmedAt: number };
    escalated: boolean;
    escalationReason?: string;
    /** The agent has stopped and is waiting for Steve to answer this. */
    pendingQuestion?: { id: string; question: string; askedAt: number; context?: string };
    ownerAnswer?: { question: string; answer: string; answeredAt: number };
    /** The customer message you last binned a draft for; stops it coming back on re-open. */
    draftDeclinedFor?: string;
    /** A reply the agent has written and is holding until you approve it. */
    pendingDraft?: {
        id: string;
        text: string;
        subject?: string;
        createdAt: number;
        source: 'agent' | 'instruction';
        customerText?: string;
    };
    priceRequests: number;
    summary?: string;
    lastInboundAt: number;
    lastOutboundAt?: number;
    whatsappOpenerAt?: number;
    /** Your words, waiting for their first WhatsApp so Meta will carry them. */
    heldWords?: { text: string; at: number } | null;
    lastCustomerMessageAt: number;
    createdAt: number;
    updatedAt: number;
    unread: number;
    emailThreadId?: string;
    emailSubject?: string;
    /** Set when a Delivery Status Notification came back for this thread. */
    emailBounce?: { address: string; reason: string; diagnostic?: string; at: number };
    /**
     * Set when a shared inbox placed this thread. The client uses it to mark
     * conversations that live on another ledger in the WhatsApp shared view.
     */
    routing?: {
        inboxId: string;
        reason: 'existing' | 'owner' | 'fallback' | 'corrected';
        ownerCompanyId?: string;
    };
}

/** One Gmail / one WhatsApp number shared by several ledger accounts. */
export type OwnerAlertKind =
    | 'new_conversation' | 'inbound' | 'escalation' | 'question' | 'booking' | 'draft' | 'error';

/**
 * One thing the agent wants Steve to know, as written by salesAgent/alerts.ts.
 *
 * These have been recorded on every alert since the agent shipped and read by
 * nothing: the bell only ever listed conversations holding a draft, so a customer
 * message arriving on a thread Steve had taken over — which produces no draft —
 * showed nowhere in the app at all (29 Aug).
 */
export interface OwnerAlert {
    id: string;
    kind: OwnerAlertKind;
    convId: string;
    shortId: number;
    text: string;
    /** What the phone shade shows: the customer's name and their own words. */
    push?: { title: string; body: string };
    sentAt: number;
    deliveredVia?: 'whatsapp' | 'push' | 'none';
    pushedTo?: number;
    error?: string;
}

export interface SharedInboxMeta {
    id: string;
    name?: string;
    credentialCompanyId: string;
    memberCompanyIds: string[];
    fallbackCompanyId: string;
    gmailAddress?: string;
    whatsappPhoneNumberId?: string;
    whatsappLive?: boolean;
}

export type WhatsAppMediaKind = 'image' | 'video' | 'document';

export interface MessageMedia {
    kind: WhatsAppMediaKind;
    url: string;
    mime?: string;
    filename?: string;
}

export type DeliveryState = 'sent' | 'delivered' | 'read' | 'failed';

export interface AgentMessage {
    id: string;
    direction: 'in' | 'out';
    channel: Channel;
    text: string;
    from: 'customer' | 'agent' | 'owner';
    providerId?: string;
    subject?: string;
    fromAddress?: string;
    media?: MessageMedia;
    /** WhatsApp emoji tap, stored as its own bubble when we cannot pin it on the original. */
    kind?: 'reaction';
    /** Emoji a customer tapped onto this outbound message. */
    customerReaction?: string;
    customerReactionAt?: number;
    createdAt: number;
    /** How far an outbound message got. WhatsApp reports delivered/read back; other channels stop at 'sent'. */
    delivery?: DeliveryState;
    deliveryAt?: number;
    deliveryError?: string;
}

/** What `salesAgentSimulate` answers with. */
export interface SimulationTurn {
    reply: string;
    stage: ConversationStage;
    escalated: boolean;
    handoff: boolean;
}

// --- Fixed facts -----------------------------------------------------------

/**
 * The two addresses Steve has to paste into Meta and Twilio by hand. They are
 * fixed by the project id and the function names, so they are worth showing on
 * screen with a copy button rather than leaving in a setup document.
 */
export const SALES_AGENT_WEBHOOKS = {
    whatsapp: 'https://us-central1-motor-ledger-pro.cloudfunctions.net/salesAgentWhatsAppWebhook',
    sms: 'https://us-central1-motor-ledger-pro.cloudfunctions.net/salesAgentSmsWebhook',
};

/** What a brand new agent starts as. Radlett's own answers, not placeholders. */
export const DEFAULT_SALES_AGENT_SETTINGS: SalesAgentSettings = {
    enabled: false,
    dealershipName: 'Radlett Car Sales',
    location: 'Radlett, Hertfordshire',
    websiteUrl: 'https://radlettcarsales.com',
    stockListUrl: 'https://radlettcarsales.com/used/cars/radlett/',
    openingHours: '',
    address: '',
    phone: '',
    faqs: '',
    ownerAlertNumber: '',
    ownerName: '',
    agentName: 'Dave',
    teamNames: 'Steve and Chris',
    priceFlexMode: 'hint',
    negotiationMaxDiscount: 0,
    replyDelaySeconds: [5, 15],
    channels: { whatsapp: true, sms: true, email: true },
    preferWhatsAppReply: true,
    emailAddress: 'radlettcars@gmail.com',
    signature: '',
    shareStockWithAgent: true,
    unmatchedStockPolicy: 'include',
    followUpPhoneLeads: false,
    pushNotifications: true,
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

const agentRoot = (companyId: string) => `companies/${companyId}/salesAgent`;

// --- Live views ------------------------------------------------------------

/**
 * The settings branch, with the defaults filled in underneath.
 *
 * A half-written settings node is the normal state before the first save, and
 * the form should still open with sensible answers rather than empty boxes.
 */
export const subscribeToSalesAgentSettings = (
    companyId: string,
    cb: (settings: SalesAgentSettings) => void
) => {
    const ref = db.ref(`${agentRoot(companyId)}/settings`);
    const listener = (snap: firebase.database.DataSnapshot) => {
        const raw = snap.val() || {};
        cb({
            ...DEFAULT_SALES_AGENT_SETTINGS,
            ...raw,
            channels: { ...DEFAULT_SALES_AGENT_SETTINGS.channels, ...(raw.channels || {}) },
            replyDelaySeconds: normaliseDelay(raw.replyDelaySeconds),
            sendHours: {
                ...DEFAULT_SALES_AGENT_SETTINGS.sendHours,
                ...(raw.sendHours || {}),
                days: Array.isArray(raw.sendHours?.days) && raw.sendHours.days.length
                    ? raw.sendHours.days
                    : DEFAULT_SALES_AGENT_SETTINGS.sendHours?.days,
            },
            connections: { ...(raw.connections || {}) },
        });
    };
    ref.on('value', listener);
    return () => ref.off('value', listener);
};

/** Realtime Database stores a two-element array as `{0: n, 1: n}` when partly written. */
const normaliseDelay = (raw: any): [number, number] => {
    const min = Number(raw?.[0]);
    const max = Number(raw?.[1]);
    if (!Number.isFinite(min) || !Number.isFinite(max)) return [...DEFAULT_SALES_AGENT_SETTINGS.replyDelaySeconds];
    return [min, max];
};

export const subscribeToSalesAgentStockMeta = (
    companyId: string,
    cb: (meta: StockMeta | null) => void
) => {
    const ref = db.ref(`${agentRoot(companyId)}/stockMeta`);
    const listener = (snap: firebase.database.DataSnapshot) => {
        if (!snap.exists()) return cb(null);
        const raw = snap.val() || {};
        cb({ ...raw, errors: raw.errors || [] } as StockMeta);
    };
    ref.on('value', listener);
    return () => ref.off('value', listener);
};

/**
 * Every conversation, newest activity first.
 *
 * Sorted here rather than with `orderByChild('updatedAt')` so the list does not
 * depend on an index rule being deployed — there are tens of these, not
 * thousands, and an unindexed query would only warn and sort client-side anyway.
 */
export const subscribeToAgentConversations = (
    companyId: string,
    cb: (conversations: Conversation[]) => void
) => {
    const ref = db.ref(`${agentRoot(companyId)}/conversations`);
    const listener = (snap: firebase.database.DataSnapshot) => {
        const raw = snap.val() || {};
        const list = Object.keys(raw).map(id => {
            // `messages` is a child of the conversation; it is fetched separately
            // and would otherwise be carried around in every list row.
            const { messages, ...rest } = raw[id] || {};
            return { ...rest, id, companyId: rest.companyId || companyId } as Conversation;
        });
        list.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
        cb(list);
    };
    ref.on('value', listener);
    return () => ref.off('value', listener);
};

/**
 * The alert feed, newest first.
 *
 * Capped rather than paged: the bell is a "what needs me now" list, not a log,
 * and the node is written to on every inbound message.
 */
export const subscribeToOwnerAlerts = (
    companyId: string,
    cb: (alerts: OwnerAlert[]) => void,
    limit = 30
) => {
    const ref = db.ref(`${agentRoot(companyId)}/ownerAlerts`).orderByChild('sentAt').limitToLast(limit);
    const listener = (snap: firebase.database.DataSnapshot) => {
        const raw = (snap.val() || {}) as Record<string, OwnerAlert>;
        const list = Object.keys(raw)
            .map(id => ({ ...raw[id], id }))
            .filter(alert => !!alert && !!alert.sentAt)
            .sort((a, b) => (b.sentAt || 0) - (a.sentAt || 0));
        cb(list);
    };
    ref.on('value', listener);
    return () => ref.off('value', listener);
};

/** What the bell shows for an alert: the customer's words where we have them. */
export const alertHeadline = (alert: OwnerAlert): string =>
    alert.push?.title || `#${alert.shortId || '?'}`;

export const alertBody = (alert: OwnerAlert): string =>
    alert.push?.body || alert.text || '';

const asSharedInbox = (id: string, raw: Partial<SharedInboxMeta> | null): SharedInboxMeta | null => {
    if (!raw?.credentialCompanyId) return null;
    const stored = Array.isArray(raw.memberCompanyIds)
        ? raw.memberCompanyIds
        : raw.memberCompanyIds && typeof raw.memberCompanyIds === 'object'
            ? Object.values(raw.memberCompanyIds as Record<string, string>)
            : [];
    const memberCompanyIds = Array.from(new Set(
        [raw.credentialCompanyId, ...stored, raw.fallbackCompanyId || ''].map(s => String(s || '').trim()).filter(Boolean)
    ));
    return {
        id,
        credentialCompanyId: raw.credentialCompanyId,
        memberCompanyIds,
        fallbackCompanyId: raw.fallbackCompanyId || raw.credentialCompanyId,
        whatsappLive: raw.whatsappLive === true,
        ...(raw.name ? { name: raw.name } : {}),
        ...(raw.gmailAddress ? { gmailAddress: raw.gmailAddress } : {}),
        ...(raw.whatsappPhoneNumberId ? { whatsappPhoneNumberId: raw.whatsappPhoneNumberId } : {}),
    };
};

/**
 * The shared Gmail / WhatsApp inbox this company belongs to, or null.
 *
 * Lives outside the company tree (`salesAgentRouting`). A missing rule or a
 * company that does not share a number is treated as "no shared inbox".
 */
export const subscribeToSharedInbox = (
    companyId: string,
    cb: (inbox: SharedInboxMeta | null) => void
) => {
    let inboxUnsub: (() => void) | null = null;
    const memberRef = db.ref(`salesAgentRouting/inboxMembers/${companyId}`);
    const onMember = (snap: firebase.database.DataSnapshot) => {
        inboxUnsub?.();
        inboxUnsub = null;
        const inboxId = String(snap.val() || '');
        if (!inboxId) {
            cb(null);
            return;
        }
        const inboxRef = db.ref(`salesAgentRouting/sharedInboxes/${inboxId}`);
        const onInbox = (inboxSnap: firebase.database.DataSnapshot) => {
            cb(asSharedInbox(inboxId, inboxSnap.val() as Partial<SharedInboxMeta> | null));
        };
        inboxRef.on('value', onInbox, () => cb(null));
        inboxUnsub = () => inboxRef.off('value', onInbox);
    };
    memberRef.on('value', onMember, () => cb(null));
    return () => {
        memberRef.off('value', onMember);
        inboxUnsub?.();
    };
};

/**
 * Live conversations across several ledgers. Used for the WhatsApp shared
 * inbox so Steve and Chris see every message to the shared number.
 *
 * Duplicate ids from two companies are kept as two threads (push keys are
 * unique, but the merge key is companyId:id to be safe).
 */
export const subscribeToAgentConversationsAcross = (
    companyIds: string[],
    cb: (conversations: Conversation[]) => void
) => {
    const unique = Array.from(new Set(companyIds.map(id => String(id || '').trim()).filter(Boolean)));
    if (!unique.length) {
        cb([]);
        return () => undefined;
    }

    const byCompany = new Map<string, Conversation[]>();
    const unsubs = unique.map(id => {
        const ref = db.ref(`${agentRoot(id)}/conversations`);
        const listener = (snap: firebase.database.DataSnapshot) => {
            const raw = snap.val() || {};
            const list = Object.keys(raw).map(convId => {
                const { messages, ...rest } = raw[convId] || {};
                return { ...rest, id: convId, companyId: rest.companyId || id } as Conversation;
            });
            byCompany.set(id, list);
            const merged = Array.from(byCompany.values()).flat();
            merged.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
            cb(merged);
        };
        ref.on('value', listener, () => {
            byCompany.set(id, []);
            const merged = Array.from(byCompany.values()).flat();
            merged.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
            cb(merged);
        });
        return () => ref.off('value', listener);
    });

    return () => unsubs.forEach(stop => stop());
};

export const subscribeToAgentMessages = (
    companyId: string,
    convId: string,
    cb: (messages: AgentMessage[]) => void
) => {
    const ref = db.ref(`${agentRoot(companyId)}/conversations/${convId}/messages`);
    const listener = (snap: firebase.database.DataSnapshot) => {
        const raw = snap.val() || {};
        const list = Object.keys(raw).map(id => ({ ...raw[id], id } as AgentMessage));
        list.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
        cb(list);
    };
    ref.on('value', listener);
    return () => ref.off('value', listener);
};

// --- Writes the client owns ------------------------------------------------

/** Settings are client-editable by design; only `private` is off limits. */
export const saveSalesAgentSettings = (companyId: string, patch: Partial<SalesAgentSettings>) =>
    db.ref(`${agentRoot(companyId)}/settings`).update({ ...patch, updatedAt: Date.now() });

/** Records that a set of credentials made it into `private`. See `connections`. */
export const setConnectionFlag = (
    companyId: string,
    key: 'whatsapp' | 'twilio' | 'gmail',
    value: boolean
) => db.ref(`${agentRoot(companyId)}/settings/connections/${key}`).set(value);

/** Opening a conversation clears its unread count. */
export const markConversationRead = (companyId: string, convId: string) =>
    db.ref(`${agentRoot(companyId)}/conversations/${convId}/unread`).set(0);

const rtdbKey = (s: string): string => s.replace(/[.#$\[\]\/]/g, '_');

const contactIndexKeys = (conv: Conversation): string[] => {
    const keys: string[] = [];
    const add = (channel: Channel, address?: string) => {
        if (!address) return;
        const prefix = channel === 'email' ? 'email' : channel === 'whatsapp' ? 'wa' : 'sms';
        const addr = channel === 'email' ? address.trim().toLowerCase() : address.trim();
        if (addr) keys.push(rtdbKey(`${prefix}:${addr}`));
    };
    add(conv.channel, conv.address);
    add('email', conv.contact?.email);
    add('whatsapp', conv.contact?.phone);
    add('sms', conv.contact?.phone);
    return [...new Set(keys)];
};

/** Owner upload of a WhatsApp photo/video/file. Dedicated folder, not receipts. */
export const uploadWhatsAppFile = async (companyId: string, file: File): Promise<string> => {
    const safe = (file.name || 'file').replace(/[^\w.\-]+/g, '_');
    const fileRef = storage.ref(`${companyId}/whatsapp/${Date.now()}_${safe}`);
    const snapshot = await fileRef.put(file, file.type ? { contentType: file.type } : undefined);
    return snapshot.ref.getDownloadURL();
};

const deleteWhatsAppFile = async (url?: string): Promise<void> => {
    if (!url) return;
    const path = storagePathFromUrl(url);
    if (!path || !isWhatsAppStoragePath(path)) return;
    try {
        await storage.refFromURL(url).delete();
    } catch {
        // Nightly prune will get it if this user cannot delete the object.
    }
};

/** One bubble out of the thread. Also drops the Storage file if it is ours. */
export const deleteAgentMessage = async (
    companyId: string,
    convId: string,
    messageId: string,
    mediaUrl?: string
) => {
    await db.ref(`${agentRoot(companyId)}/conversations/${convId}/messages/${messageId}`).remove();
    await deleteWhatsAppFile(mediaUrl);
};

/**
 * Remove a conversation and the indexes that would send the next inbound back
 * into it. Queued replies for that thread are dropped so they cannot go out
 * after Steve has thrown the thread away.
 */
export const deleteAgentConversation = async (companyId: string, conv: Conversation): Promise<void> => {
    const root = agentRoot(companyId);
    const updates: Record<string, null> = {
        [`${root}/conversations/${conv.id}`]: null,
    };
    if (conv.shortId) updates[`${root}/shortIds/${conv.shortId}`] = null;

    for (const key of contactIndexKeys(conv)) {
        const snap = await db.ref(`${root}/contactIndex/${key}`).once('value');
        if (snap.val() === conv.id) updates[`${root}/contactIndex/${key}`] = null;
    }

    const outboxSnap = await db.ref(`${root}/outbox`).once('value');
    const outbox = (outboxSnap.val() || {}) as Record<string, { convId?: string }>;
    Object.entries(outbox).forEach(([jobId, job]) => {
        if (job?.convId === conv.id) updates[`${root}/outbox/${jobId}`] = null;
    });

    await db.ref().update(updates);
};

// --- Callables -------------------------------------------------------------

/**
 * Turns whatever came back from a callable into a sentence worth showing.
 * The functions answer refusals in wording meant to be read by a person, so the
 * job here is to pass it through rather than replace it with something vaguer.
 */
const readableError = (error: any, fallback: string): Error => {
    if (error?.code === 'functions/unauthenticated') {
        return new Error('You need to be signed in to do that.');
    }
    if (error?.code === 'functions/not-found') {
        return new Error('That part of the sales agent has not been deployed yet.');
    }
    if (error?.code === 'functions/deadline-exceeded') {
        return new Error('That is taking longer than expected. It may still finish — reopen this page in a minute.');
    }
    return new Error(error?.message || fallback);
};

const call = async <TReq, TRes>(name: string, payload: TReq, timeout: number, fallback: string): Promise<TRes> => {
    const callable = httpsCallable<TReq, TRes>(getFunctions(firebase.app()), name, { timeout });
    try {
        const { data } = await callable(payload);
        return data;
    } catch (error: any) {
        throw readableError(error, fallback);
    }
};

export interface WhatsAppCredentials {
    phoneNumberId: string;
    businessAccountId: string;
    accessToken: string;
    verifyToken: string;
    appSecret?: string;
}

export interface TwilioCredentials {
    accountSid: string;
    authToken: string;
    fromNumber: string;
}

/**
 * Store credentials in `salesAgent/private`, which no client can read back.
 * Whichever block is passed is replaced; the other is left alone.
 */
export const saveSalesAgentPrivate = (
    companyId: string,
    creds: { whatsapp?: WhatsAppCredentials; twilio?: TwilioCredentials }
) => call<{ companyId: string; whatsapp?: WhatsAppCredentials; twilio?: TwilioCredentials }, void>(
    'salesAgentSavePrivate',
    { companyId, ...creds },
    30000,
    'Could not save those credentials.'
);

/**
 * One Gmail / one WhatsApp number, several ledger accounts. Tokens stay on
 * `companyId`. Threads land in the member that owns the car.
 * `whatsappLive` defaults off; connecting the number does not start sending.
 */
export const saveSalesAgentSharedInbox = (
    companyId: string,
    input: {
        memberCompanyIds: string[];
        fallbackCompanyId?: string;
        name?: string;
        whatsappLive?: boolean;
    }
) => call<
    { companyId: string; memberCompanyIds: string[]; fallbackCompanyId?: string; name?: string; whatsappLive?: boolean },
    { ok: true; inbox: { id: string; memberCompanyIds: string[]; whatsappLive?: boolean } }
>(
    'salesAgentSaveSharedInbox',
    { companyId, ...input },
    30000,
    'Could not save the shared inbox.'
);

/** Where to send the browser to hand Gmail access to the agent. */
export const getGmailAuthUrl = (companyId: string) =>
    call<{ companyId: string }, { url: string }>(
        'salesAgentGmailAuthUrl',
        { companyId },
        30000,
        'Could not start the Gmail connection.'
    );

/** Re-scrape the website's stock list now instead of waiting for 06:00. */
export const runStockIndexNow = (companyId: string) =>
    call<{ companyId: string }, Partial<StockMeta>>(
        'runSalesAgentStockIndexNow',
        { companyId },
        540000,
        'The stock index did not finish.'
    );

/** Take over, hand back, or pause a conversation. */
export const setConversationMode = (companyId: string, convId: string, mode: ConversationMode) =>
    call<{ companyId: string; convId: string; mode: ConversationMode }, void>(
        'salesAgentSetMode',
        { companyId, convId, mode },
        30000,
        'Could not change who is answering.'
    );

/**
 * Open a WhatsApp thread to a number from this ledger. First message is the
 * approved follow-up template. While WhatsApp is not live the thread is still
 * created and nothing is sent.
 */
export const startAgentWhatsApp = (
    companyId: string,
    input: { phone: string; firstName?: string; lastName?: string; vehicleTitle?: string; leadId?: string }
) => call<
    { companyId: string; phone: string; firstName?: string; lastName?: string; vehicleTitle?: string; leadId?: string },
    { ok: true; convId: string; created: boolean; sent: boolean; live: boolean }
>(
    'salesAgentStartWhatsApp',
    { companyId, ...input },
    60000,
    'That WhatsApp could not be started.'
);

export type SendVia = 'auto' | 'email' | 'whatsapp' | 'both';

/** Send a message to the customer as Steve. `via` sends email, WhatsApp, or both. */
export const sendAgentReply = (
    companyId: string,
    convId: string,
    text: string,
    media?: MessageMedia,
    via: SendVia = 'auto',
    phone?: string,
    opener = false
) =>
    call<{ companyId: string; convId: string; text: string; media?: MessageMedia; via?: SendVia; phone?: string; opener?: boolean }, { ok: true; sent?: Channel[]; held?: boolean; skippedWhatsApp?: string | null }>(
        'salesAgentSendReply',
        { companyId, convId, text, via, ...(media ? { media } : {}), ...(phone ? { phone } : {}), ...(opener ? { opener } : {}) },
        120000,
        'That message was not sent.'
    );

/**
 * Ask Dave to write a reply to whatever the customer last said, without sending it.
 *
 * Inbox Ask Dave control. The webhook still drafts inbound while Dave owns the
 * thread; opening a conversation does not. Returns drafted:false with a reason
 * when there is nothing to write (already drafted, paused, nothing waiting).
 */
export const draftNow = (companyId: string, convId: string, force = false) =>
    call<{ companyId: string; convId: string; force?: boolean }, { ok: true; drafted: boolean; reason?: string }>(
        'salesAgentDraftNow',
        { companyId, convId, ...(force ? { force } : {}) },
        120000,
        'Dave could not draft a reply.'
    );

/**
 * Answer the question the agent stopped to ask. The agent puts the answer into
 * its own words, so this is not sent to the customer verbatim.
 */
export const answerAgentQuestion = (companyId: string, convId: string, answer: string) =>
    call<{ companyId: string; convId: string; answer: string }, void>(
        'salesAgentAnswerQuestion',
        { companyId, convId, answer },
        60000,
        'Could not pass that answer back to the agent.'
    );

/**
 * Tell the agent what to say, without it having asked. It rephrases the
 * instruction in its own voice and carries on with the conversation, so this is
 * never sent to the customer verbatim either. If the agent does happen to be
 * waiting on a question, this counts as the answer to it.
 */
export const instructAgent = (companyId: string, convId: string, text: string) =>
    call<{ companyId: string; convId: string; text: string }, { reply: string }>(
        'salesAgentInstruct',
        { companyId, convId, text },
        60000,
        'Could not pass that on to the agent.'
    );

/**
 * Send the reply the agent has drafted, as written or after editing it.
 *
 * During office hours it goes out on the spot. After hours it is queued until
 * the next opening; `sendAfter` says when.
 */
export const approveAgentDraft = (companyId: string, convId: string, text?: string, signAs: 'agent' | 'owner' = 'agent') =>
    call<{ companyId: string; convId: string; text?: string; signAs: 'agent' | 'owner' }, { ok: boolean; text: string; sendAfter: number; sent?: Channel[] }>(
        'salesAgentApproveDraft',
        { companyId, convId, signAs, ...(text === undefined ? {} : { text }) },
        60000,
        'That draft could not be sent.'
    );

/** "Thu, 8:00 am" in the dealership's timezone. */
export const formatQueuedSend = (at: number, timeZone = 'Europe/London'): string =>
    new Intl.DateTimeFormat('en-GB', {
        timeZone,
        weekday: 'short',
        hour: 'numeric',
        minute: '2-digit',
        hourCycle: 'h12',
    }).format(new Date(at));

export const approvedSendMessage = (channelLabel: string, sendAfter?: number, timeZone?: string): string => {
    if (sendAfter && sendAfter > Date.now() + 5000) {
        return `Queued to send ${channelLabel} at ${formatQueuedSend(sendAfter, timeZone)}.`;
    }
    return `Sent on ${channelLabel}.`;
};

/** Throw the draft away. The conversation stays with the agent. */
export interface ThreadCorrection {
    ok: true;
    vehicle?: { stockId: string; title: string; ownerCompanyId?: string; status: string };
    moved: boolean;
    toCompanyId?: string;
    toName?: string;
    /** Where the thread lives now. After a move both of these have changed. */
    convId: string;
    companyId: string;
    redrafted: boolean;
    message: string;
}

/**
 * "Wrong car." Tell Dave which car the thread is really about, in your own words.
 *
 * It re-pins the thread, bins the draft it wrote about the wrong car, keeps what
 * you said as a standing lesson, and — if the right car belongs to the other
 * ledger on the shared inbox — moves the whole conversation over there and has
 * Dave write it again from that side. The returned convId/companyId is where the
 * thread has ended up, which is not where it started when it moved.
 */
export const correctThreadCar = (companyId: string, convId: string, note: string, stockId?: string) =>
    call<{ companyId: string; convId: string; note: string; stockId?: string }, ThreadCorrection>(
        'salesAgentCorrectThread',
        { companyId, convId, note, ...(stockId ? { stockId } : {}) },
        300000,
        'That correction could not be applied.'
    );

export interface ThreadSplit {
    ok: true;
    companyId: string;
    convId: string;
    message: string;
}

/**
 * "Different person." Pull one inbound email off this thread into its own lead.
 * The car on that email is matched again, so it can land on the other ledger.
 */
export const detachAgentMessage = (companyId: string, convId: string, messageId: string) =>
    call<{ companyId: string; convId: string; messageId: string }, ThreadSplit>(
        'salesAgentDetachMessage',
        { companyId, convId, messageId },
        180000,
        'That email could not be separated.'
    );

export const discardAgentDraft = (companyId: string, convId: string) =>
    call<{ companyId: string; convId: string }, { ok: boolean; had: boolean }>(
        'salesAgentDiscardDraft',
        { companyId, convId },
        30000,
        'That draft could not be discarded.'
    );

/**
 * Put this browser on the list that gets Dave's alerts as a web push.
 *
 * The token addresses one browser on one device, so it is registered per
 * device rather than per user; services/pushService.ts owns getting hold of it.
 */
export const registerPushToken = (companyId: string, token: string, platform: string) =>
    call<{ companyId: string; token: string; platform: string }, { ok: boolean }>(
        'salesAgentRegisterPush',
        { companyId, token, platform },
        30000,
        'Could not turn on alerts for this device.'
    );

/** Fire a real alert at every registered device and report what happened. */
export const sendTestPush = (companyId: string, token: string) =>
    call<{ companyId: string; token: string }, { devices: number; delivered: number; thisDevice: boolean; stillRegistered: number }>(
        'salesAgentTestPush',
        { companyId, token },
        30000,
        'Could not send a test alert.'
    );

/** Report which step of push registration failed on this device. Never throws. */
export const reportPushDebug = async (companyId: string, step: string, detail: string): Promise<void> => {
    try {
        await call<{ companyId: string; step: string; detail: string; ua: string }, { ok: boolean }>(
            'salesAgentPushDebug',
            { companyId, step, detail, ua: navigator.userAgent },
            15000,
            'debug'
        );
    } catch {
        // Diagnostics must never get in the way.
    }
};

/** Take this browser back off the list. */
export const unregisterPushToken = (companyId: string, token: string) =>
    call<{ companyId: string; token: string }, { ok: boolean }>(
        'salesAgentUnregisterPush',
        { companyId, token },
        30000,
        'Could not turn off alerts for this device.'
    );

/** One turn of a throwaway conversation, for trying the agent out. */
export const simulateAgentTurn = (companyId: string, text: string, sessionId: string) =>
    call<{ companyId: string; text: string; sessionId: string }, SimulationTurn>(
        'salesAgentSimulate',
        { companyId, text, sessionId },
        120000,
        'The agent did not answer.'
    );

// --- Formatting shared by the three screens --------------------------------

/** "just now", "14:32", "Tue 14:32", or a full date once it is old. */
export const formatAgentTime = (at?: number): string => {
    if (!at) return 'never';
    const date = new Date(at);
    const age = Date.now() - at;
    if (age < 60_000) return 'just now';
    if (age < 24 * 3600_000) {
        return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    }
    if (age < 7 * 24 * 3600_000) {
        return date.toLocaleString('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
};

/**
 * What Steve told the agent to say, or null if this is an ordinary message.
 *
 * Instructions are stored in the thread like anything else so he can see what he
 * asked for, but they never went to the customer — the agent's own wording of
 * them did. The marker is written by `router.answerPendingQuestion` and mirrors
 * `OWNER_INSTRUCTION_PREFIX` in `functions/src/salesAgent/brain/prompt.ts`.
 */
export const OWNER_INSTRUCTION_PREFIX = '[instruction] ';

export const instructionText = (message: AgentMessage): string | null => {
    if (message.from !== 'owner') return null;
    const text = (message.text || '').trim();
    return text.startsWith(OWNER_INSTRUCTION_PREFIX)
        ? text.slice(OWNER_INSTRUCTION_PREFIX.length).trim()
        : null;
};

export const BOUNCE_NOTICE_PREFIX = '[bounce] ';

export const bounceNoticeText = (message: AgentMessage): string | null => {
    if (message.from !== 'owner') return null;
    const text = (message.text || '').trim();
    return text.startsWith(BOUNCE_NOTICE_PREFIX)
        ? text.slice(BOUNCE_NOTICE_PREFIX.length).trim()
        : null;
};

/** True when this bubble is a WhatsApp emoji reaction, not a real customer turn. */
export const isReactionMessage = (message: AgentMessage): boolean =>
    message.kind === 'reaction' || (message.text || '').trim() === '[reaction]';

/** The emoji they tapped, or null for the old placeholder-only bubbles. */
export const reactionEmojiOf = (message: AgentMessage): string | null => {
    if (message.kind !== 'reaction') return null;
    const emoji = (message.text || '').trim();
    return emoji || null;
};

export const conversationPhone = (conv: Conversation): string | undefined => {
    const raw = conv.contact?.phone || (conv.channel !== 'email' ? conv.address : '');
    const digits = (raw || '').replace(/\D/g, '');
    return digits.length >= 9 ? raw : undefined;
};

export const conversationEmail = (conv: Conversation): string | undefined => {
    const raw = (conv.contact?.email || (conv.channel === 'email' ? conv.address : '') || '').trim().toLowerCase();
    return raw.includes('@') ? raw : undefined;
};

/** The name to put at the top of a conversation when the customer gave one. */
export const conversationName = (conv: Conversation): string => {
    const full = [conv.contact?.firstName, conv.contact?.lastName].filter(Boolean).join(' ').trim();
    return full || conv.contact?.phone || conv.contact?.email || conv.address || 'Unknown';
};

export const CHANNEL_LABELS: Record<Channel, string> = {
    whatsapp: 'WhatsApp',
    sms: 'SMS',
    email: 'Email',
};

export const STAGE_LABELS: Record<ConversationStage, string> = {
    vehicle: 'Vehicle',
    deal: 'Deal',
    timing: 'Timing',
    details: 'Details',
    booked: 'Booked',
    closed: 'Closed',
};

export const MODE_LABELS: Record<ConversationMode, string> = {
    agent: 'Agent',
    human: 'You',
    paused: 'Paused',
};
