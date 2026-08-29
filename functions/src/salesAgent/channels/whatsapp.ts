/**
 * WhatsApp, via the Meta Cloud API.
 *
 * Steve's number runs in Coexistence: the WhatsApp Business app on his phone and the
 * Cloud API share one number. Anything he types on the handset is invisible to us, so
 * the agent only ever sees what comes through the webhook, and everything it sends goes
 * out through Graph.
 *
 * Two rules of the platform shape this file:
 *   - Free text is only allowed inside 24 hours of the customer's last message. Outside
 *     it, Meta rejects anything that is not an approved template.
 *   - Template parameters may not contain newlines, tabs, or long runs of spaces. An
 *     alert with a line break in it comes back as a 132000 error, not as a message.
 */

import * as crypto from 'crypto';

import * as functions from 'firebase-functions/v1';

import { getCompanyIds } from '../../utils/companyIds';
import { BRAIN_SECRETS, db, readPrivate, recordDelivery, routingPath } from '../conversations';
import { isWhatsAppLiveFor, readSendPrivate } from '../inboxRouting';
import { ChannelSender, DeliveryState, InboundMessage, MessageMedia, OutboxJob, WhatsAppMediaKind, toE164 } from '../types';
import { handleInbound } from '../router';
import { WHATSAPP_VIDEO_TARGET, compressVideoForWhatsApp } from './videoCompress';
import { pruneCompanyWhatsApp, saveInboundWhatsAppFile } from '../whatsappStorage';

const GRAPH_VERSION = 'v21.0';
const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;

/** Meta only accepts approved languages; Steve's templates are submitted as en_GB. */
const TEMPLATE_LANGUAGE = 'en_GB';

// --- Routing ----------------------------------------------------------------

/**
 * A webhook POST names a phone number id and nothing else, so the mapping back to a
 * company has to exist before the first message arrives. Written whenever the WhatsApp
 * credentials are saved.
 */
export const registerWhatsAppRouting = async (phoneNumberId: string, companyId: string): Promise<void> => {
    if (!phoneNumberId) return;
    await db().ref(routingPath(`whatsappPhoneIds/${phoneNumberId}`)).set(companyId);
};

export const companyForWhatsAppPhoneId = async (phoneNumberId: string): Promise<string | null> => {
    if (!phoneNumberId) return null;
    const snap = await db().ref(routingPath(`whatsappPhoneIds/${phoneNumberId}`)).once('value');
    return (snap.val() as string | null) || null;
};

// --- Sending ----------------------------------------------------------------

interface GraphSendResponse {
    messages?: Array<{ id: string }>;
    error?: { message?: string; code?: number; error_subcode?: number };
}

const graphPost = async (companyId: string, body: Record<string, unknown>): Promise<GraphSendResponse> => {
    const priv = await readSendPrivate(companyId);
    const wa = priv.whatsapp;

    if (!wa?.accessToken || !wa?.phoneNumberId) {
        throw new Error('WhatsApp is not connected for this company');
    }

    const response = await fetch(`${GRAPH}/${wa.phoneNumberId}/messages`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${wa.accessToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ messaging_product: 'whatsapp', ...body }),
    });

    const json = (await response.json().catch(() => ({}))) as GraphSendResponse;

    if (!response.ok || json.error) {
        const code = json.error?.code;
        if (code === 132001) throw new Error(TEMPLATE_PENDING_MESSAGE);
        if (code === 131047 || code === 131026) {
            throw new Error('WhatsApp could not deliver: more than 24 hours since their last message, so only an approved opener can be sent.');
        }
        if (isAccessBlockedCode(code)) throw new Error(accessBlockedMessage(json.error?.message, code));
        // Meta's own code, kept in the text: without it every unknown failure reads the
        // same and there is nothing to search their docs for (29 Aug).
        throw new Error(`WhatsApp send failed (${response.status}${code ? `, Meta code ${code}` : ''}): ${json.error?.message || 'unknown error'}`);
    }

    return json;
};

/** Meta rejects a parameter containing a newline, a tab, or four or more spaces. */
export const sanitiseTemplateParam = (value: string): string =>
    (value || '').replace(/[\r\n\t]+/g, ' — ').replace(/ {4,}/g, ' ').trim().slice(0, 900) || '-';

export const sendWhatsAppText = async (companyId: string, to: string, text: string): Promise<string> => {
    const result = await graphPost(companyId, {
        recipient_type: 'individual',
        to: toE164(to),
        type: 'text',
        text: { preview_url: false, body: text },
    });

    return result.messages?.[0]?.id || '';
};

const graphMediaId = async (companyId: string, media: MessageMedia): Promise<string> => {
    const priv = await readSendPrivate(companyId);
    const wa = priv.whatsapp;
    if (!wa?.accessToken || !wa?.phoneNumberId) {
        throw new Error('WhatsApp is not connected for this company');
    }

    const fileRes = await fetch(media.url);
    if (!fileRes.ok) {
        throw new Error(`Could not read the attachment (${fileRes.status}).`);
    }
    const bytes = Buffer.from(await fileRes.arrayBuffer());
    let payload: Buffer = bytes;
    let mime = media.mime || fileRes.headers.get('content-type') || 'application/octet-stream';
    let filename = media.filename || 'file';

    // Photos are squeezed in the browser before they are ever uploaded; video is
    // too big for that, so the original goes to Storage and is re-encoded here.
    if (media.kind === 'video' && bytes.length > WHATSAPP_VIDEO_TARGET) {
        payload = await compressVideoForWhatsApp(bytes);
        mime = 'video/mp4';
        filename = `${(media.filename || 'video').replace(/\.[^.]+$/, '')}.mp4`;
    }

    const form = new FormData();
    form.append('messaging_product', 'whatsapp');
    form.append('type', mime);
    form.append('file', new Blob([new Uint8Array(payload)], { type: mime }), filename);

    const uploaded = await fetch(`${GRAPH}/${wa.phoneNumberId}/media`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${wa.accessToken}` },
        body: form,
    });
    const json = (await uploaded.json().catch(() => ({}))) as { id?: string; error?: { message?: string } };
    if (!uploaded.ok || !json.id) {
        throw new Error(`WhatsApp media upload failed: ${json.error?.message || uploaded.status}`);
    }
    return json.id;
};

export const sendWhatsAppMedia = async (
    companyId: string,
    to: string,
    media: MessageMedia,
    caption?: string
): Promise<string> => {
    const id = await graphMediaId(companyId, media);
    const body: Record<string, unknown> = caption ? { id, caption } : { id };
    if (media.kind === 'document' && media.filename) body.filename = media.filename;

    const result = await graphPost(companyId, {
        recipient_type: 'individual',
        to: toE164(to),
        type: media.kind,
        [media.kind]: body,
    });

    return result.messages?.[0]?.id || '';
};


// --- Template families -------------------------------------------------------
//
// Meta only delivers a business-initiated message as an APPROVED template, and which of
// ours is approved changes over time (MARKETING ones sit in review for days, UTILITY
// ones clear in minutes). So callers ask for a *family* by naming any member and the
// sender picks whichever member Meta has actually approved, adapting the parameters.

interface TemplateVariant {
    name: string;
    /** Map the family's canonical params onto this variant's {{n}} slots. */
    params: (canonical: string[]) => string[];
    /** The exact wording the customer sees, for the thread record. */
    render: (canonical: string[]) => string;
    /**
     * This wording tells the customer we could not reach them by email. Only usable on
     * a thread where that is actually true. Ashley was told her email was not accepting
     * messages when nothing had bounced, because the cheapest variant happened to be
     * worded that way and was picked for every opener going (29 Aug).
     */
    bounceOnly?: boolean;
}

const ENQUIRY_FAMILY: TemplateVariant[] = [
    // Cheapest wording that is TRUE first. Meta bills UTILITY well below MARKETING (and
    // free inside the 24h window), so a transactional wording is preferred — but only
    // among the ones that do not claim something that did not happen. The two
    // bounce-worded variants below are equally cheap and were previously picked ahead
    // of this one purely by list order.
    {
        name: 'enquiry_update',
        params: ([name, car]) => [name || 'there', car || 'car', 'We have received it and the car is still available.'],
        render: ([name, car]) =>
            `Hi ${name || 'there'}, this is Radlett Cars replying to the enquiry you sent us about the ${car || 'car'}. We have received it and the car is still available. You can reply to this message with any questions about your enquiry.`,
    },
    {
        name: 'enquiry_ack',
        bounceOnly: true,
        params: ([name, car]) => [name || 'there', car || 'car'],
        render: ([name, car]) =>
            `Hi ${name || 'there'}, this is Radlett Cars. We received your enquiry about the ${car || 'car'} but the email address you gave us is not accepting messages, so we are replying here instead. Please reply to this message and we will answer your questions.`,
    },
    {
        name: 'enquiry_contact',
        bounceOnly: true,
        params: ([name, car]) => [name || 'there', car || 'car'],
        render: ([name, car]) =>
            `Hi ${name || 'there'}, this is Radlett Cars replying to your enquiry about the ${car || 'car'}. We could not reach you by email. Please reply to this message so we can help you with your enquiry.`,
    },
    {
        name: 'enquiry_reply',
        params: ([name, car]) => [name || 'there', car || 'car', "It's still available and ready to view."],
        render: ([name, car]) =>
            `Hi ${name || 'there'}, thanks for your enquiry about the ${car || 'car'}. It's still available and ready to view. Reply here with any questions or to arrange a viewing.`,
    },
    {
        name: 'enquiry_followup',
        params: ([name, car]) => [name || 'there', car || 'car'],
        render: ([name, car]) =>
            `Hi ${name || 'there'}, thanks for enquiring about the ${car || 'car'}. It's still available. Would you like any more details, or to arrange a viewing or test drive?`,
    },
];

const MISSED_CALL_FAMILY: TemplateVariant[] = [
    {
        name: 'missed_call_update',
        params: ([dealer]) => [dealer || 'us'],
        render: ([dealer]) =>
            `Hi, this is ${dealer || 'us'}. We missed your call and are replying here instead. Please reply with the registration or name of the car you called about and we will send you the details.`,
    },
    {
        name: 'missed_call_reply',
        params: ([dealer]) => [dealer || 'us'],
        render: ([dealer]) =>
            `Hi, thanks for calling ${dealer || 'us'} earlier — sorry we missed you. Which car were you calling about? Reply here and we'll get straight back to you.`,
    },
    {
        name: 'missed_call_followup',
        params: ([dealer]) => [dealer || 'us'],
        render: ([dealer]) => `Thanks for calling ${dealer || 'us'} earlier. Which car were you calling about?`,
    },
];

const OWNER_ALERT_FAMILY: TemplateVariant[] = [
    {
        name: 'owner_alert_v2',
        params: ([text]) => [text || '-'],
        render: ([text]) =>
            `Update from Dave, your sales assistant, about a customer conversation in the Agent Inbox: ${text} Open the inbox to reply.`,
    },
    { name: 'owner_alert', params: ([text]) => [text || '-'], render: ([text]) => text || '' },
];

const FAMILIES = [ENQUIRY_FAMILY, MISSED_CALL_FAMILY, OWNER_ALERT_FAMILY];

const familyOf = (templateName: string): TemplateVariant[] | null =>
    FAMILIES.find(f => f.some(v => v.name === templateName)) || null;

interface TemplateStatus { name: string; status: string; language?: string }

const approvedCache = new Map<string, { at: number; names: Set<string> }>();
const APPROVED_TTL_MS = 2 * 60_000;

/** Names of the templates Meta will actually deliver right now. Cached briefly per WABA. */
export const approvedTemplateNames = async (companyId: string): Promise<Set<string>> => {
    const priv = await readSendPrivate(companyId);
    const wa = priv.whatsapp;
    if (!wa?.accessToken || !wa?.businessAccountId) return new Set();

    const cached = approvedCache.get(wa.businessAccountId);
    if (cached && Date.now() - cached.at < APPROVED_TTL_MS) return cached.names;

    const res = await fetch(
        `${GRAPH}/${wa.businessAccountId}/message_templates?fields=name,status,language&limit=200`,
        { headers: { Authorization: `Bearer ${wa.accessToken}` } }
    );
    const json = (await res.json().catch(() => ({}))) as {
        data?: TemplateStatus[];
        error?: { message?: string; code?: number };
    };

    // A failed lookup is not an empty stock of templates. This used to swallow the
    // error and hand back an empty set, so every Graph outage came out of the far end
    // as "your opener is still awaiting Meta approval" — which is what Steve was told
    // on the morning Meta blocked the app outright (29 Aug). Nothing is cached here:
    // caching a failure would keep the wrong answer alive for two minutes after the
    // problem cleared.
    if (!res.ok || json.error) {
        const code = json.error?.code;
        if (isAccessBlockedCode(code)) throw new Error(accessBlockedMessage(json.error?.message, code));
        throw new Error(
            `Could not check which WhatsApp openers Meta has approved (${res.status}${code ? `, Meta code ${code}` : ''}): ${json.error?.message || 'unknown error'}`
        );
    }

    const names = new Set(
        (json.data || [])
            .filter(t => t.status === 'APPROVED' && (!t.language || t.language === TEMPLATE_LANGUAGE))
            .map(t => t.name)
    );
    approvedCache.set(wa.businessAccountId, { at: Date.now(), names });
    return names;
};

/**
 * Meta codes that mean the door is shut, not that the message was bad.
 *
 * 200 is the one that bit us: "API access blocked" on EVERY endpoint, reads included,
 * because Meta had restricted the app itself. 190 is a dead or revoked token and 10 is
 * a permission the app no longer holds. None of the three can come good by retrying a
 * minute later; all three come good on their own the moment the account is put right,
 * which is why the outbox parks these rather than binning the message.
 */
export const isAccessBlockedCode = (code?: number): boolean =>
    code === 200 || code === 190 || code === 10;

/**
 * The phrase the outbox recognises, and the opening words Steve reads. One string
 * doing both jobs on purpose: a separate marker prefix ends up on screen the first
 * time somebody forgets to strip it, which is exactly what happened on 29 Aug.
 */
export const ACCESS_BLOCKED_MARKER = 'Meta has blocked API access';

/** Said the way Steve needs to read it: whose problem it is, and where to go. */
export const accessBlockedMessage = (metaMessage?: string, code?: number): string =>
    `${ACCESS_BLOCKED_MARKER} for the WhatsApp app${code ? ` (code ${code}, "${metaMessage || 'API access blocked'}")` : ''}. `
    + 'Nothing can be sent until that is cleared at developers.facebook.com — check the app '
    + 'dashboard for a banner. Anything queued is being held, not lost.';

/**
 * An error the outbox must not burn its retries on: the account cannot send at all,
 * so trying again in a minute is pointless, and the message must be kept rather than
 * dropped. Matched on the text because these travel up through channel adapters that
 * only ever rethrow a plain `Error`, and an instanceof check does not survive that.
 */
export const isSendBlockedError = (message: string): boolean =>
    (message || '').includes(ACCESS_BLOCKED_MARKER) || (message || '').includes(TEMPLATE_PENDING_MESSAGE);

export const TEMPLATE_PENDING_MESSAGE =
    'WhatsApp opener is still awaiting Meta approval (usually a few minutes for a new template). Try again shortly.';

/**
 * Pick the approved member of the requested template's family and shape the params for
 * it. Throws a plain-English error when Meta has approved none of them.
 */
export const resolveTemplate = async (
    companyId: string,
    templateName: string,
    canonicalParams: string[],
    options: { bounced?: boolean } = {}
): Promise<{ name: string; params: string[]; text: string }> => {
    const family = familyOf(templateName);
    if (!family) return { name: templateName, params: canonicalParams, text: canonicalParams.join(' ') };

    const approved = await approvedTemplateNames(companyId);
    const usable = family.filter(v => !v.bounceOnly || options.bounced);
    const variant = usable.find(v => approved.has(v.name)) || family.find(v => approved.has(v.name));
    if (!variant) {
        approvedCache.clear();
        throw new Error(TEMPLATE_PENDING_MESSAGE);
    }
    return {
        name: variant.name,
        params: variant.params(canonicalParams).map(sanitiseTemplateParam),
        text: variant.render(canonicalParams),
    };
};

/** What the customer would read if this family were sent now with these params. */
export const renderTemplateFamily = (
    templateName: string,
    canonicalParams: string[],
    options: { bounced?: boolean } = {}
): string => {
    const family = familyOf(templateName);
    if (!family) return canonicalParams.join(' ');
    const usable = family.filter(v => !v.bounceOnly || options.bounced);
    return (usable[0] || family[0]).render(canonicalParams);
};

export const sendWhatsAppTemplate = async (
    companyId: string,
    to: string,
    templateName: string,
    params: string[] = []
): Promise<string> => (await sendWhatsAppTemplateResolved(companyId, to, templateName, params)).providerId;

export const sendWhatsAppTemplateResolved = async (
    companyId: string,
    to: string,
    templateName: string,
    params: string[] = []
): Promise<{ providerId: string; text: string; name: string }> => {
    const resolved = await resolveTemplate(companyId, templateName, params);
    const components = resolved.params.length
        ? [{ type: 'body', parameters: resolved.params.map(p => ({ type: 'text', text: p })) }]
        : [];

    let result: GraphSendResponse;
    try {
        result = await graphPost(companyId, {
            to: toE164(to),
            type: 'template',
            template: {
                name: resolved.name,
                language: { code: TEMPLATE_LANGUAGE },
                ...(components.length ? { components } : {}),
            },
        });
    } catch (error) {
        // Our idea of "approved" was stale. Forget it so the next try re-checks Meta.
        approvedCache.clear();
        throw error;
    }

    return { providerId: result.messages?.[0]?.id || '', text: resolved.text, name: resolved.name };
};

/** Blue ticks. Not required, but a customer who can see the message was read is a
 *  customer who waits for the reply instead of ringing. */
const markRead = async (companyId: string, messageId: string): Promise<void> => {
    try {
        await graphPost(companyId, { status: 'read', message_id: messageId });
    } catch (error) {
        console.warn(`WhatsApp: could not mark ${messageId} read`, error);
    }
};

export const whatsappSender: ChannelSender = {
    send: async (companyId, job) => {
        // Every customer-facing WhatsApp passes through here: the agent's replies,
        // approved drafts, the owner's REPLY, the app's reply box. One gate.
        if (!(await isWhatsAppLiveFor(companyId))) {
            throw new Error('WhatsApp is not live yet (Meta verification pending), so this message was not sent.');
        }
        if (job.templateName) {
            const sent = await sendWhatsAppTemplateResolved(companyId, job.to, job.templateName, job.templateParams || []);
            return { providerId: sent.providerId, text: sent.text };
        }
        const providerId = job.media
            ? await sendWhatsAppMedia(companyId, job.to, job.media, job.text || undefined)
            : await sendWhatsAppText(companyId, job.to, job.text);

        return { providerId };
    },
};

/** Enqueue-time helper for the router: is free text still allowed? */
export const withinCustomerServiceWindow = (lastCustomerMessageAt?: number): boolean =>
    !!lastCustomerMessageAt && Date.now() - lastCustomerMessageAt < 24 * 3_600_000;

// --- Webhook ----------------------------------------------------------------

interface WebhookMedia {
    id: string;
    mime_type?: string;
    caption?: string;
    filename?: string;
}

interface WebhookMessage {
    from: string;
    id: string;
    timestamp: string;
    type: string;
    text?: { body: string };
    button?: { text?: string };
    interactive?: { button_reply?: { title?: string }; list_reply?: { title?: string } };
    image?: WebhookMedia;
    video?: WebhookMedia;
    document?: WebhookMedia;
}

interface WebhookValue {
    metadata?: { phone_number_id?: string; display_phone_number?: string };
    contacts?: Array<{ wa_id?: string; profile?: { name?: string } }>;
    messages?: WebhookMessage[];
    statuses?: WebhookStatus[];
}

/** Meta's receipt for one of our outbound messages. */
interface WebhookStatus {
    id?: string;
    status?: string;
    timestamp?: string;
    errors?: Array<{ code?: number; title?: string; message?: string }>;
}

/**
 * Not everything is text. A voice note or a photo still needs to reach the brain as
 * something, or the customer gets silence — a placeholder lets the agent say "I can't
 * play voice notes, what were you after?" rather than nothing at all.
 */
const textOf = (message: WebhookMessage): string => {
    switch (message.type) {
        case 'text': return message.text?.body || '';
        case 'button': return message.button?.text || '[button]';
        case 'interactive':
            return message.interactive?.button_reply?.title || message.interactive?.list_reply?.title || '[selection]';
        case 'audio':
        case 'voice': return '[voice note]';
        case 'image': return message.image?.caption || '[photo]';
        case 'video': return message.video?.caption || '[video]';
        case 'document': return message.document?.caption || message.document?.filename || '[document]';
        case 'location': return '[location]';
        case 'sticker': return '[sticker]';
        case 'contacts': return '[contact card]';
        default: return `[${message.type}]`;
    }
};

/** Meta signs the raw bytes, so the parsed body cannot be re-serialised and checked. */
const signatureValid = (appSecret: string, rawBody: Buffer, header?: string): boolean => {
    if (!header?.startsWith('sha256=')) return false;

    const expected = 'sha256=' + crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');
    const a = Buffer.from(expected);
    const b = Buffer.from(header);

    return a.length === b.length && crypto.timingSafeEqual(a, b);
};

/**
 * Meta's verification handshake happens before any message exists, so there is no phone
 * number id to route on — the token itself has to identify the company. Verification is
 * a once-per-setup event, so walking the companies is cheap.
 */
const companyForVerifyToken = async (token: string): Promise<string | null> => {
    if (!token) return null;

    for (const companyId of await getCompanyIds()) {
        const priv = await readPrivate(companyId);
        if (priv.whatsapp?.verifyToken && priv.whatsapp.verifyToken === token) return companyId;
    }

    return null;
};

const inboundKind = (type: string): WhatsAppMediaKind | null =>
    type === 'image' || type === 'video' || type === 'document' ? type : null;

const webhookMediaOf = (message: WebhookMessage): WebhookMedia | null => {
    const kind = inboundKind(message.type);
    if (!kind) return null;
    return message[kind] || null;
};

/** Copy a customer photo/video/file into our bucket so the inbox can play it. */
const storeInboundMedia = async (
    companyId: string,
    providerId: string,
    message: WebhookMessage
): Promise<MessageMedia | undefined> => {
    const kind = inboundKind(message.type);
    const meta = webhookMediaOf(message);
    if (!kind || !meta?.id) return undefined;

    try {
        const priv = await readSendPrivate(companyId);
        const token = priv.whatsapp?.accessToken;
        if (!token) return undefined;

        const lookup = await fetch(`${GRAPH}/${meta.id}`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        const looked = (await lookup.json().catch(() => ({}))) as { url?: string; mime_type?: string };
        if (!lookup.ok || !looked.url) return undefined;

        const fileRes = await fetch(looked.url, { headers: { Authorization: `Bearer ${token}` } });
        if (!fileRes.ok) return undefined;
        const bytes = Buffer.from(await fileRes.arrayBuffer());
        const mime = meta.mime_type || looked.mime_type || fileRes.headers.get('content-type') || 'application/octet-stream';
        const filename = (meta.filename || `${kind}-${providerId}`).replace(/[^\w.\-]+/g, '_');
        const saved = await saveInboundWhatsAppFile(companyId, `${providerId}_${filename}`, bytes, mime);
        void pruneCompanyWhatsApp(companyId).catch(error => {
            console.warn(`WhatsApp: prune after inbound ${providerId} failed`, error);
        });
        return { kind, url: saved.url, mime, filename };
    } catch (error) {
        console.warn(`WhatsApp: could not store inbound ${kind} ${providerId}`, error);
        return undefined;
    }
};

/**
 * Meta's receipts for messages we sent. Nothing to answer, but this is the only
 * evidence that a message actually arrived — without recording it the app cannot
 * tell a delivered WhatsApp from one still in flight.
 */
const processStatuses = async (companyId: string, statuses: WebhookStatus[]): Promise<void> => {
    for (const status of statuses) {
        const state = deliveryStateOf(status.status);
        if (!state || !status.id) continue;

        const at = Number(status.timestamp) * 1000 || Date.now();
        const error = status.errors?.[0]
            ? (status.errors[0].message || status.errors[0].title || `error ${status.errors[0].code}`)
            : undefined;

        try {
            await recordDelivery(companyId, status.id, state, at, error);
        } catch (err) {
            console.warn(`WhatsApp: could not record ${state} for ${status.id}`, err);
        }
    }
};

const deliveryStateOf = (raw?: string): DeliveryState | null => {
    switch (raw) {
        case 'sent': return 'sent';
        case 'delivered': return 'delivered';
        case 'read': return 'read';
        case 'failed': return 'failed';
        default: return null;   // 'deleted', 'warning' and anything new: not a delivery state
    }
};

const processChange = async (companyId: string, value: WebhookValue): Promise<void> => {
    if (value.statuses?.length) await processStatuses(companyId, value.statuses);

    if (!value.messages?.length) return;

    const names = new Map<string, string>();
    (value.contacts || []).forEach(contact => {
        if (contact.wa_id && contact.profile?.name) names.set(contact.wa_id, contact.profile.name);
    });

    for (const message of value.messages) {
        const media = await storeInboundMedia(companyId, message.id, message);
        const inbound: InboundMessage = {
            companyId,
            channel: 'whatsapp',
            address: toE164(message.from),
            text: textOf(message),
            providerId: message.id,
            name: names.get(message.from),
            receivedAt: Number(message.timestamp) * 1000 || Date.now(),
            ...(media ? { media } : {}),
        };

        await markRead(companyId, message.id);

        try {
            await handleInbound(inbound);
        } catch (error) {
            console.error(`WhatsApp: handling ${message.id} for company ${companyId} failed`, error);
        }
    }
};

/**
 * The webhook itself.
 *
 * The work is done before the 200 goes back rather than after. An HTTP function's
 * container can be frozen the moment it responds, so "reply first, work later" loses
 * messages; Meta's redelivery plus the providerId dedupe makes the slower answer safe,
 * and a 200 is returned even when handling threw so a poison message cannot start a
 * retry storm.
 */
export const salesAgentWhatsAppWebhook = functions
    .runWith({ timeoutSeconds: 120, memory: '512MB', secrets: BRAIN_SECRETS })
    .https.onRequest(async (req, res) => {
        if (req.method === 'GET') {
            const mode = req.query['hub.mode'];
            const token = String(req.query['hub.verify_token'] || '');
            const challenge = String(req.query['hub.challenge'] || '');

            if (mode !== 'subscribe' || !(await companyForVerifyToken(token))) {
                res.status(403).send('Forbidden');
                return;
            }

            res.status(200).send(challenge);
            return;
        }

        if (req.method !== 'POST') {
            res.status(405).send('Method not allowed');
            return;
        }

        try {
            const body = req.body as { entry?: Array<{ changes?: Array<{ value?: WebhookValue }> }> };

            for (const entry of body?.entry || []) {
                for (const change of entry.changes || []) {
                    const value = change.value;
                    const phoneNumberId = value?.metadata?.phone_number_id;
                    if (!value || !phoneNumberId) continue;

                    const companyId = await companyForWhatsAppPhoneId(phoneNumberId);
                    if (!companyId) {
                        console.warn(`WhatsApp: no company registered for phone number id ${phoneNumberId}`);
                        continue;
                    }

                    const priv = await readPrivate(companyId);
                    if (priv.whatsapp?.appSecret) {
                        const header = req.header('x-hub-signature-256');
                        if (!signatureValid(priv.whatsapp.appSecret, req.rawBody, header)) {
                            console.error(`WhatsApp: bad X-Hub-Signature-256 for company ${companyId}`);
                            res.status(401).send('Bad signature');
                            return;
                        }
                    }

                    await processChange(companyId, value);
                }
            }
        } catch (error) {
            // Always 200: a retry of a message we already choked on would choke again,
            // and the dedupe means nothing is lost by not asking for one.
            console.error('WhatsApp webhook failed', error);
        }

        res.status(200).send('OK');
    });

/**
 * What to send instead, when a queued free-text reply has fallen out of the 24h window
 * by the time the outbox reaches it. Kept here so the rule and the API that enforces it
 * stay in one file.
 */
export const FALLBACK_TEMPLATE = 'enquiry_ack';

/** The approved template's wording, for the thread record. */
export const renderFallbackTemplate = (params: string[], options: { bounced?: boolean } = {}): string =>
    renderTemplateFamily(FALLBACK_TEMPLATE, params, options);

export const templateFallbackFor = (
    firstName?: string,
    vehicleTitle?: string
): Pick<OutboxJob, 'templateName' | 'templateParams'> => ({
    templateName: FALLBACK_TEMPLATE,
    templateParams: [sanitiseTemplateParam(firstName || 'there'), sanitiseTemplateParam(vehicleTitle || 'car')],
});
