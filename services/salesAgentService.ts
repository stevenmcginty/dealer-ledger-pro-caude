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
import { db } from './firebase';

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
     * Email replies are written but held until you approve them, on WhatsApp with
     * `SEND 12` or in the Agent Inbox. WhatsApp and SMS replies always go on their own.
     * Undefined means on.
     */
    emailApprovalMode?: boolean;
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
    lastCustomerMessageAt: number;
    createdAt: number;
    updatedAt: number;
    unread: number;
    emailThreadId?: string;
    emailSubject?: string;
}

export interface AgentMessage {
    id: string;
    direction: 'in' | 'out';
    channel: Channel;
    text: string;
    from: 'customer' | 'agent' | 'owner';
    providerId?: string;
    subject?: string;
    createdAt: number;
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
            return { ...rest, id } as Conversation;
        });
        list.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
        cb(list);
    };
    ref.on('value', listener);
    return () => ref.off('value', listener);
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

/** One bubble out of the thread. Does not touch the conversation itself. */
export const deleteAgentMessage = (companyId: string, convId: string, messageId: string) =>
    db.ref(`${agentRoot(companyId)}/conversations/${convId}/messages/${messageId}`).remove();

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

/** Send a message to the customer as Steve, on whichever channel they used. */
export const sendAgentReply = (companyId: string, convId: string, text: string) =>
    call<{ companyId: string; convId: string; text: string }, void>(
        'salesAgentSendReply',
        { companyId, convId, text },
        60000,
        'That message was not sent.'
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
export const approveAgentDraft = (companyId: string, convId: string, text?: string) =>
    call<{ companyId: string; convId: string; text?: string }, { ok: boolean; text: string; sendAfter: number }>(
        'salesAgentApproveDraft',
        { companyId, convId, ...(text === undefined ? {} : { text }) },
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
