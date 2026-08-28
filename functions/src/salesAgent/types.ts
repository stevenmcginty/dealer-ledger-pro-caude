/**
 * Shared contracts for the AI Sales Agent. All salesAgent modules import from here.
 *
 * RTDB layout (all under companies/{companyId}/salesAgent/):
 *   settings                                -> SalesAgentSettings   (client-editable)
 *   (secrets live OUTSIDE the company tree: top-level salesAgentPrivate/{companyId} -> SalesAgentPrivate,
 *    because companies/{id} grants subtree read to members and RTDB child rules cannot revoke it)
 *   stock/{stockId}                         -> StockItem            (rebuilt daily by stock/index.ts)
 *   stockMeta                               -> StockMeta
 *   conversations/{convId}                  -> Conversation
 *   conversations/{convId}/messages/{msgId} -> AgentMessage
 *   contactIndex/{normalisedKey}            -> convId   (key from normaliseAddress())
 *   shortIds/{n}                            -> convId   (short number used in owner alerts / commands)
 *   ownerAlerts/{alertId}                   -> OwnerAlert
 *   outbox/{jobId}                          -> OutboxJob (delayed replies; drained by outboxTick every minute)
 *
 * Shared inbox (several ledger accounts, one Gmail / one WhatsApp number):
 *   salesAgentRouting/sharedInboxes/{inboxId}                 -> SharedInbox
 *   salesAgentRouting/sharedInboxes/{inboxId}/contactIndex/k  -> { companyId, convId }
 *   salesAgentRouting/sharedInboxes/{inboxId}/seenProviderIds -> timestamp
 *   salesAgentRouting/inboxMembers/{companyId}                -> inboxId
 *   salesAgentRouting/channelToInbox/{whatsapp|gmail}/{key}   -> inboxId
 * Channel credentials still live on the credential company. Threads live on the
 * company that owns the car. WhatsApp stays dark until SharedInbox.whatsappLive.
 */

export type Channel = 'whatsapp' | 'sms' | 'email';

export interface SalesAgentSettings {
    enabled: boolean;                    // master kill switch
    dealershipName: string;              // "Radlett Car Sales"
    location: string;                    // "Radlett, Hertfordshire"
    websiteUrl: string;                  // "https://radlettcarsales.com"
    stockListUrl: string;                // "https://radlettcarsales.com/used/cars/radlett/"
    openingHours: string;
    address: string;
    phone: string;
    faqs: string;                        // warranty, finance partners, test-drive rules (licence), delivery, part-ex
    ownerAlertNumber: string;            // E.164 WhatsApp number that gets pings (Steve)
    ownerName: string;
    agentName: string;                   // 'Dave' — the persona customers talk to; never volunteers that it is AI
    teamNames: string;                   // 'Steve and Chris' — the humans Dave can hand over to
    priceFlexMode: 'hint' | 'figure' | 'none'; // Steve chose 'hint': say "a few hundred", never a number
    negotiationMaxDiscount: number;      // only used when priceFlexMode === 'figure'
    replyDelaySeconds: [number, number]; // human-feel delay window, default [5, 15] (Steve wants Dave quick)
    channels: { whatsapp: boolean; sms: boolean; email: boolean };
    preferWhatsAppReply: boolean;        // email containing a mobile -> open WhatsApp instead of replying by email
    emailAddress: string;                // "radlettcars@gmail.com"
    signature: string;                   // "Steve, Radlett Car Sales"
    /** Multi-dealer site: this company's cars may be discussed by ANY company's Dave (default true). Chris/Tommy can turn theirs off. */
    shareStockWithAgent?: boolean;
    /** What Dave does with site cars matched to no ledger account at all (default 'include'). */
    unmatchedStockPolicy?: 'include' | 'exclude';
    /** Push notifications to this company's phones as well as WhatsApp alerts (default true). */
    pushNotifications?: boolean;
    /**
     * Hold Dave's *email* replies for approval in this ledger's Agent Inbox
     * (default true). `false` is automatic reply on email. Also the fallback
     * for WhatsApp until `whatsappApprovalMode` is set, so an existing tick
     * keeps covering both channels.
     */
    emailApprovalMode?: boolean;
    /**
     * Hold Dave's WhatsApp replies for approval. Undefined inherits
     * `emailApprovalMode` (the original single switch).
     */
    whatsappApprovalMode?: boolean;
    /**
     * How many customer-facing Dave replies in a thread before the next inbound
     * is handed to a human. 0 / missing = no cap.
     */
    maxAgentTurns?: number;
    /**
     * When Dave is allowed to send to the customer. Drafting and owner alerts
     * still happen around the clock; an approved reply outside this window waits
     * until the next opening. Default 08:00–17:00 Europe/London, Mon–Sat.
     */
    sendHours?: {
        enabled?: boolean;
        start?: string;
        end?: string;
        /** 0 = Sunday … 6 = Saturday. */
        days?: number[];
        timeZone?: string;
    };
    followUpPhoneLeads?: boolean;        // auto-WhatsApp CarGurus/Cazoo phone leads & missed calls
    /** client-readable connected flags (set by the app after a successful save / OAuth return) */
    connections?: { whatsapp?: boolean; twilio?: boolean; gmail?: boolean };
    updatedAt: number;
}

/** Function-only secrets/tokens. Never readable by the client. */
export interface SalesAgentPrivate {
    whatsapp?: { phoneNumberId: string; businessAccountId: string; accessToken: string; verifyToken: string; appSecret?: string };
    twilio?: { accountSid: string; authToken: string; fromNumber: string };
    gmail?: { refreshToken: string; email: string; historyId?: string; watchExpiration?: number };
}

export interface StockItem {
    id: string;                          // site listing id (e.g. "1862524")
    url: string;
    make: string;
    model: string;
    variant: string;
    title: string;                       // "Ford Focus 2.0T EcoBoost ST-3"
    price: number;                       // GBP
    monthlyFrom?: number;
    year?: number;
    mileage?: number;
    fuel?: string;
    transmission?: string;
    bodyType?: string;
    colour?: string;
    engineSize?: string;
    owners?: number;
    serviceHistory?: string;
    motExpiry?: string;
    motStatus?: string;
    taxStatus?: string;
    taxDueDate?: string;
    annualRoadTax?: number;
    estimatedMpg?: number;
    ulezCompliant?: boolean;
    reg?: string;
    description?: string;                // dealer blurb, trimmed to ~1500 chars
    features?: string[];
    imageUrl?: string;
    status: 'available' | 'reserved' | 'sold';
    ledgerVehicleId?: string;            // matched ledger Vehicle (by reg, else make+model+year)
    ownerCompanyId?: string;             // which ledger account owns the car (site is shared between dealers)
    hiddenReason?: 'owner_opted_out' | 'unmatched_excluded' | 'stale_listing'; // present => Dave must not discuss this car (search/get must skip it)
    indexedAt: number;
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
    phone?: string;                      // E.164
    email?: string;
    leadId?: string;                     // CRM lead once created
}

export type ConversationMode = 'agent' | 'human' | 'paused';
export type ConversationStage = 'vehicle' | 'deal' | 'timing' | 'details' | 'booked' | 'closed';

export interface Conversation {
    id: string;
    shortId: number;                     // used in owner alerts: "TAKE OVER 12"
    companyId: string;
    channel: Channel;                    // channel we currently reply on
    address: string;                     // phone (E.164) or email we reply to
    originChannel: Channel;              // where the customer first contacted us
    contact: Contact;
    mode: ConversationMode;              // 'human' = owner took over, bot silent
    stage: ConversationStage;
    vehicleInterest?: { stockId?: string; title?: string; ledgerVehicleId?: string; ownerCompanyId?: string };
    /**
     * Set when this thread was placed by a shared inbox. `existing` means a later
     * message found the person already; we never move a thread once it has a home.
     */
    routing?: {
        inboxId: string;
        reason: 'existing' | 'owner' | 'fallback' | 'corrected';
        ownerCompanyId?: string;
    };
    partExOrFinance?: string;
    preferredTime?: string;
    booking?: { name: string; phone: string; window: string; confirmedAt: number };
    escalated: boolean;
    escalationReason?: string;
    /** Agent has asked Steve something and is waiting; bot tells customer it's checking and stays quiet until answered. */
    pendingQuestion?: { id: string; question: string; askedAt: number; context?: string };
    /** Steve's answer, consumed by the next brain run and then cleared. */
    ownerAnswer?: { question: string; answer: string; answeredAt: number };
    /** A reply the agent has written but not sent; waiting on SEND from Steve. See emailApprovalMode. */
    /**
     * The customer message Steve last binned a draft for. Stops the inbox writing
     * the same unwanted draft again every time he re-opens the thread; a genuinely
     * new message from the customer clears the veto by not matching it.
     */
    draftDeclinedFor?: string;
    pendingDraft?: {
        id: string;
        text: string;
        subject?: string;
        createdAt: number;
        source: 'agent' | 'instruction';
        /** The customer message this draft is answering, so the review UI can show both sides. */
        customerText?: string;
    };
    priceRequests: number;               // how many times they've pushed on price
    summary?: string;                    // rolling summary maintained by brain
    lastInboundAt: number;
    lastOutboundAt?: number;
    lastCustomerMessageAt: number;       // WhatsApp 24h customer-service window check
    createdAt: number;
    updatedAt: number;
    unread: number;
    emailThreadId?: string;              // Gmail threadId for replies
    emailSubject?: string;
    /**
     * Set when a Delivery Status Notification comes back for this thread.
     * Email replies are skipped; WhatsApp/phone is the way through if we have a number.
     */
    emailBounce?: { address: string; reason: string; diagnostic?: string; at: number };
}

export type WhatsAppMediaKind = 'image' | 'video' | 'document';

export interface MessageMedia {
    kind: WhatsAppMediaKind;
    url: string;
    mime?: string;
    filename?: string;
}

export interface AgentMessage {
    id: string;
    direction: 'in' | 'out';
    channel: Channel;
    text: string;
    from: 'customer' | 'agent' | 'owner';
    providerId?: string;                 // WhatsApp wamid / Twilio SID / Gmail message id (dedupe)
    subject?: string;
    media?: MessageMedia;
    createdAt: number;
    /**
     * How far an outbound message got. WhatsApp reports this back on the webhook;
     * other channels stop at 'sent'. Without it the app cannot tell a delivered
     * message from one still in flight, which is exactly what it looked like.
     */
    delivery?: DeliveryState;
    deliveryAt?: number;
    deliveryError?: string;
}

export type DeliveryState = 'sent' | 'delivered' | 'read' | 'failed';

/** Later states never regress: a 'read' receipt must not be undone by a late 'sent'. */
export const DELIVERY_RANK: Record<DeliveryState, number> = {
    sent: 1,
    delivered: 2,
    read: 3,
    failed: 4,
};

export interface InboundMessage {
    companyId: string;
    channel: Channel;
    address: string;                     // sender phone (E.164) or email
    text: string;
    providerId: string;
    name?: string;
    subject?: string;
    emailThreadId?: string;
    extractedPhones?: string[];          // mobiles found in an email body -> router may open WhatsApp
    /** The whole email as readable text (capped), so the brain reads what the parser did not. */
    fullText?: string;
    media?: MessageMedia;
    receivedAt: number;
}

export type OwnerAlertKind = 'new_conversation' | 'inbound' | 'escalation' | 'booking' | 'question' | 'draft' | 'error';

export interface OwnerAlert {
    id: string;
    kind: OwnerAlertKind;
    convId: string;
    shortId: number;
    text: string;
    /** What the phone shows. Defaults to the alert text; inbound customer messages use the customer's name and their own words. */
    push?: { title: string; body: string };
    sentAt: number;
    /** 'push' means WhatsApp failed but the web push landed on at least one device. */
    deliveredVia?: 'whatsapp' | 'push' | 'none';
    /** How many registered devices the web push reached. See salesAgent/push.ts. */
    pushedTo?: number;
    error?: string;
}

/**
 * One Gmail address and/or WhatsApp number shared by several ledger accounts.
 *
 * Tokens stay on `credentialCompanyId`. New conversations land on the member that
 * owns the car, or on `fallbackCompanyId` when we cannot tell. `whatsappLive` is
 * the go-live switch: connecting the Cloud API does not start sending.
 */
export interface SharedInbox {
    id: string;
    name?: string;
    credentialCompanyId: string;
    memberCompanyIds: string[];
    fallbackCompanyId: string;
    gmailAddress?: string;
    whatsappPhoneNumberId?: string;
    /** Customer WhatsApp is queued only when this is true. Default false. */
    whatsappLive?: boolean;
    createdAt: number;
    updatedAt: number;
}

export interface SharedContactRef {
    companyId: string;
    convId: string;
}

export interface OutboxJob {
    id: string;
    /** Who the thread shows as the sender. Default agent. */
    from?: 'agent' | 'owner';
    companyId: string;
    convId: string;
    channel: Channel;
    to: string;
    text: string;
    subject?: string;
    emailThreadId?: string;
    templateName?: string;               // WhatsApp business-initiated (outside 24h window)
    templateParams?: string[];
    media?: MessageMedia;
    sendAfter: number;                   // epoch ms
    attempts: number;
    lastError?: string;
    createdAt: number;
}

/** What brain returns for the router to act on */
export interface BrainResult {
    reply: string;                       // text for the customer ('' = say nothing)
    stage: ConversationStage;
    updates: Partial<Pick<Conversation, 'vehicleInterest' | 'partExOrFinance' | 'preferredTime' | 'booking' | 'summary' | 'contact' | 'priceRequests'>>;
    escalate?: { reason: string; ownerMessage: string }; // ping owner; bot keeps replying unless handoff
    /** Agent wants Steve's input before continuing (e.g. viewing time availability). Router alerts owner with "#n ASK: ..." and sets pendingQuestion. */
    askOwner?: { question: string; context?: string };
    handoff?: boolean;                   // set mode='human', stop replying
    usage?: { inputTokens: number; outputTokens: number; model: string };
}

/** Channel adapters implement this. */
export interface ChannelSender {
    send(companyId: string, job: Pick<OutboxJob, 'to' | 'text' | 'subject' | 'emailThreadId' | 'templateName' | 'templateParams' | 'media'>): Promise<{ providerId: string; text?: string }>;
}

export const normaliseAddress = (channel: Channel, address: string): string => {
    if (channel === 'email') return `email:${address.trim().toLowerCase()}`;
    return `${channel === 'whatsapp' ? 'wa' : 'sms'}:${toE164(address)}`;
};

/** UK-centric E.164: "07123 456789" -> "+447123456789"; "447123456789" -> "+447123456789" */
export const toE164 = (raw: string): string => {
    const d = raw.replace(/[^\d+]/g, '');
    if (d.startsWith('+')) return d;
    if (d.startsWith('00')) return '+' + d.slice(2);
    if (d.startsWith('0')) return '+44' + d.slice(1);
    if (d.startsWith('44')) return '+' + d;
    return '+' + d;
};

/**
 * A number we are willing to open a WhatsApp thread to. toE164 will happily
 * turn "0" into "+44"; this will not.
 */
export const parseOutboundPhone = (raw: string): string | null => {
    const trimmed = (raw || '').trim();
    if (!trimmed) return null;
    if (trimmed.replace(/[^\d]/g, '').length < 10) return null;
    const e164 = toE164(trimmed);
    return /^\+[1-9]\d{9,14}$/.test(e164) ? e164 : null;
};

export const extractUkMobiles = (text: string): string[] => {
    const re = /(?:\+44\s?7\d{3}|\(?07\d{3}\)?)\s?\d{3}\s?\d{3}/g;
    return Array.from(new Set((text.match(re) || []).map(toE164)));
};

/** RTDB-safe key for contactIndex ('.', '#', '$', '[', ']', '/' are illegal) */
export const rtdbKey = (s: string): string => s.replace(/[.#$\[\]\/]/g, '_');

/** RTDB rejects `undefined` anywhere in a written value; drop such keys recursively (arrays kept). */
export const stripUndefined = <T>(value: T): T => {
    if (Array.isArray(value)) return value.map(stripUndefined) as unknown as T;
    if (value && typeof value === 'object') {
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
            if (v !== undefined) out[k] = stripUndefined(v);
        }
        return out as T;
    }
    return value;
};
