"use strict";
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
exports.templateFallbackFor = exports.renderFallbackTemplate = exports.FALLBACK_TEMPLATE = exports.salesAgentWhatsAppWebhook = exports.withinCustomerServiceWindow = exports.whatsappSender = exports.sendWhatsAppTemplateResolved = exports.sendWhatsAppTemplate = exports.renderTemplateFamily = exports.resolveTemplate = exports.TEMPLATE_PENDING_MESSAGE = exports.isSendBlockedError = exports.accessBlockedMessage = exports.ACCESS_BLOCKED_MARKER = exports.isAccessBlockedCode = exports.approvedTemplateNames = exports.sendWhatsAppMedia = exports.sendWhatsAppText = exports.sanitiseTemplateParam = exports.companyForWhatsAppPhoneId = exports.registerWhatsAppRouting = void 0;
const crypto = __importStar(require("crypto"));
const functions = __importStar(require("firebase-functions/v1"));
const companyIds_1 = require("../../utils/companyIds");
const conversations_1 = require("../conversations");
const inboxRouting_1 = require("../inboxRouting");
const types_1 = require("../types");
const router_1 = require("../router");
const videoCompress_1 = require("./videoCompress");
const whatsappStorage_1 = require("../whatsappStorage");
const whatsappInbound_1 = require("./whatsappInbound");
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
const registerWhatsAppRouting = async (phoneNumberId, companyId) => {
    if (!phoneNumberId)
        return;
    await (0, conversations_1.db)().ref((0, conversations_1.routingPath)(`whatsappPhoneIds/${phoneNumberId}`)).set(companyId);
};
exports.registerWhatsAppRouting = registerWhatsAppRouting;
const companyForWhatsAppPhoneId = async (phoneNumberId) => {
    if (!phoneNumberId)
        return null;
    const snap = await (0, conversations_1.db)().ref((0, conversations_1.routingPath)(`whatsappPhoneIds/${phoneNumberId}`)).once('value');
    return snap.val() || null;
};
exports.companyForWhatsAppPhoneId = companyForWhatsAppPhoneId;
const graphPost = async (companyId, body) => {
    const priv = await (0, inboxRouting_1.readSendPrivate)(companyId);
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
    const json = (await response.json().catch(() => ({})));
    if (!response.ok || json.error) {
        const code = json.error?.code;
        if (code === 132001)
            throw new Error(exports.TEMPLATE_PENDING_MESSAGE);
        if (code === 131047 || code === 131026) {
            throw new Error('WhatsApp could not deliver: more than 24 hours since their last message, so only an approved opener can be sent.');
        }
        if ((0, exports.isAccessBlockedCode)(code))
            throw new Error((0, exports.accessBlockedMessage)(json.error?.message, code));
        // Meta's own code, kept in the text: without it every unknown failure reads the
        // same and there is nothing to search their docs for (29 Aug).
        throw new Error(`WhatsApp send failed (${response.status}${code ? `, Meta code ${code}` : ''}): ${json.error?.message || 'unknown error'}`);
    }
    return json;
};
/** Meta rejects a parameter containing a newline, a tab, or four or more spaces. */
const sanitiseTemplateParam = (value) => (value || '').replace(/[\r\n\t]+/g, ' — ').replace(/ {4,}/g, ' ').trim().slice(0, 900) || '-';
exports.sanitiseTemplateParam = sanitiseTemplateParam;
const sendWhatsAppText = async (companyId, to, text) => {
    const result = await graphPost(companyId, {
        recipient_type: 'individual',
        to: (0, types_1.toE164)(to),
        type: 'text',
        text: { preview_url: false, body: text },
    });
    return result.messages?.[0]?.id || '';
};
exports.sendWhatsAppText = sendWhatsAppText;
const graphMediaId = async (companyId, media) => {
    const priv = await (0, inboxRouting_1.readSendPrivate)(companyId);
    const wa = priv.whatsapp;
    if (!wa?.accessToken || !wa?.phoneNumberId) {
        throw new Error('WhatsApp is not connected for this company');
    }
    const fileRes = await fetch(media.url);
    if (!fileRes.ok) {
        throw new Error(`Could not read the attachment (${fileRes.status}).`);
    }
    const bytes = Buffer.from(await fileRes.arrayBuffer());
    let payload = bytes;
    let mime = media.mime || fileRes.headers.get('content-type') || 'application/octet-stream';
    let filename = media.filename || 'file';
    // Photos are squeezed in the browser before they are ever uploaded; video is
    // too big for that, so the original goes to Storage and is re-encoded here.
    if (media.kind === 'video' && bytes.length > videoCompress_1.WHATSAPP_VIDEO_TARGET) {
        payload = await (0, videoCompress_1.compressVideoForWhatsApp)(bytes);
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
    const json = (await uploaded.json().catch(() => ({})));
    if (!uploaded.ok || !json.id) {
        throw new Error(`WhatsApp media upload failed: ${json.error?.message || uploaded.status}`);
    }
    return json.id;
};
const sendWhatsAppMedia = async (companyId, to, media, caption) => {
    const id = await graphMediaId(companyId, media);
    const body = caption ? { id, caption } : { id };
    if (media.kind === 'document' && media.filename)
        body.filename = media.filename;
    const result = await graphPost(companyId, {
        recipient_type: 'individual',
        to: (0, types_1.toE164)(to),
        type: media.kind,
        [media.kind]: body,
    });
    return result.messages?.[0]?.id || '';
};
exports.sendWhatsAppMedia = sendWhatsAppMedia;
const ENQUIRY_FAMILY = [
    // Cheapest wording that is TRUE first. Meta bills UTILITY well below MARKETING (and
    // free inside the 24h window), so a transactional wording is preferred — but only
    // among the ones that do not claim something that did not happen. The two
    // bounce-worded variants below are equally cheap and were previously picked ahead
    // of this one purely by list order.
    {
        name: 'enquiry_update',
        params: ([name, car]) => [name || 'there', car || 'car', 'We have received it and the car is still available.'],
        render: ([name, car]) => `Hi ${name || 'there'}, this is Radlett Cars replying to the enquiry you sent us about the ${car || 'car'}. We have received it and the car is still available. You can reply to this message with any questions about your enquiry.`,
    },
    {
        name: 'enquiry_ack',
        bounceOnly: true,
        params: ([name, car]) => [name || 'there', car || 'car'],
        render: ([name, car]) => `Hi ${name || 'there'}, this is Radlett Cars. We received your enquiry about the ${car || 'car'} but the email address you gave us is not accepting messages, so we are replying here instead. Please reply to this message and we will answer your questions.`,
    },
    {
        name: 'enquiry_contact',
        bounceOnly: true,
        params: ([name, car]) => [name || 'there', car || 'car'],
        render: ([name, car]) => `Hi ${name || 'there'}, this is Radlett Cars replying to your enquiry about the ${car || 'car'}. We could not reach you by email. Please reply to this message so we can help you with your enquiry.`,
    },
    {
        name: 'enquiry_reply',
        params: ([name, car]) => [name || 'there', car || 'car', "It's still available and ready to view."],
        render: ([name, car]) => `Hi ${name || 'there'}, thanks for your enquiry about the ${car || 'car'}. It's still available and ready to view. Reply here with any questions or to arrange a viewing.`,
    },
    {
        name: 'enquiry_followup',
        params: ([name, car]) => [name || 'there', car || 'car'],
        render: ([name, car]) => `Hi ${name || 'there'}, thanks for enquiring about the ${car || 'car'}. It's still available. Would you like any more details, or to arrange a viewing or test drive?`,
    },
];
const MISSED_CALL_FAMILY = [
    {
        name: 'missed_call_update',
        params: ([dealer]) => [dealer || 'us'],
        render: ([dealer]) => `Hi, this is ${dealer || 'us'}. We missed your call and are replying here instead. Please reply with the registration or name of the car you called about and we will send you the details.`,
    },
    {
        name: 'missed_call_reply',
        params: ([dealer]) => [dealer || 'us'],
        render: ([dealer]) => `Hi, thanks for calling ${dealer || 'us'} earlier — sorry we missed you. Which car were you calling about? Reply here and we'll get straight back to you.`,
    },
    {
        name: 'missed_call_followup',
        params: ([dealer]) => [dealer || 'us'],
        render: ([dealer]) => `Thanks for calling ${dealer || 'us'} earlier. Which car were you calling about?`,
    },
];
const OWNER_ALERT_FAMILY = [
    {
        name: 'owner_alert_v2',
        params: ([text]) => [text || '-'],
        render: ([text]) => `Update from Dave, your sales assistant, about a customer conversation in the Agent Inbox: ${text} Open the inbox to reply.`,
    },
    { name: 'owner_alert', params: ([text]) => [text || '-'], render: ([text]) => text || '' },
];
const FAMILIES = [ENQUIRY_FAMILY, MISSED_CALL_FAMILY, OWNER_ALERT_FAMILY];
const familyOf = (templateName) => FAMILIES.find(f => f.some(v => v.name === templateName)) || null;
const approvedCache = new Map();
const APPROVED_TTL_MS = 2 * 60000;
/** Names of the templates Meta will actually deliver right now. Cached briefly per WABA. */
const approvedTemplateNames = async (companyId) => {
    const priv = await (0, inboxRouting_1.readSendPrivate)(companyId);
    const wa = priv.whatsapp;
    if (!wa?.accessToken || !wa?.businessAccountId)
        return new Set();
    const cached = approvedCache.get(wa.businessAccountId);
    if (cached && Date.now() - cached.at < APPROVED_TTL_MS)
        return cached.names;
    const res = await fetch(`${GRAPH}/${wa.businessAccountId}/message_templates?fields=name,status,language&limit=200`, { headers: { Authorization: `Bearer ${wa.accessToken}` } });
    const json = (await res.json().catch(() => ({})));
    // A failed lookup is not an empty stock of templates. This used to swallow the
    // error and hand back an empty set, so every Graph outage came out of the far end
    // as "your opener is still awaiting Meta approval" — which is what Steve was told
    // on the morning Meta blocked the app outright (29 Aug). Nothing is cached here:
    // caching a failure would keep the wrong answer alive for two minutes after the
    // problem cleared.
    if (!res.ok || json.error) {
        const code = json.error?.code;
        if ((0, exports.isAccessBlockedCode)(code))
            throw new Error((0, exports.accessBlockedMessage)(json.error?.message, code));
        throw new Error(`Could not check which WhatsApp openers Meta has approved (${res.status}${code ? `, Meta code ${code}` : ''}): ${json.error?.message || 'unknown error'}`);
    }
    const names = new Set((json.data || [])
        .filter(t => t.status === 'APPROVED' && (!t.language || t.language === TEMPLATE_LANGUAGE))
        .map(t => t.name));
    approvedCache.set(wa.businessAccountId, { at: Date.now(), names });
    return names;
};
exports.approvedTemplateNames = approvedTemplateNames;
/**
 * Meta codes that mean the door is shut, not that the message was bad.
 *
 * 200 is the one that bit us: "API access blocked" on EVERY endpoint, reads included,
 * because Meta had restricted the app itself. 190 is a dead or revoked token and 10 is
 * a permission the app no longer holds. None of the three can come good by retrying a
 * minute later; all three come good on their own the moment the account is put right,
 * which is why the outbox parks these rather than binning the message.
 */
const isAccessBlockedCode = (code) => code === 200 || code === 190 || code === 10;
exports.isAccessBlockedCode = isAccessBlockedCode;
/**
 * The phrase the outbox recognises, and the opening words Steve reads. One string
 * doing both jobs on purpose: a separate marker prefix ends up on screen the first
 * time somebody forgets to strip it, which is exactly what happened on 29 Aug.
 */
exports.ACCESS_BLOCKED_MARKER = 'Meta has blocked API access';
/** Said the way Steve needs to read it: whose problem it is, and where to go. */
const accessBlockedMessage = (metaMessage, code) => `${exports.ACCESS_BLOCKED_MARKER} for the WhatsApp app${code ? ` (code ${code}, "${metaMessage || 'API access blocked'}")` : ''}. `
    + 'Nothing can be sent until that is cleared at developers.facebook.com — check the app '
    + 'dashboard for a banner. Anything queued is being held, not lost.';
exports.accessBlockedMessage = accessBlockedMessage;
/**
 * An error the outbox must not burn its retries on: the account cannot send at all,
 * so trying again in a minute is pointless, and the message must be kept rather than
 * dropped. Matched on the text because these travel up through channel adapters that
 * only ever rethrow a plain `Error`, and an instanceof check does not survive that.
 */
const isSendBlockedError = (message) => (message || '').includes(exports.ACCESS_BLOCKED_MARKER) || (message || '').includes(exports.TEMPLATE_PENDING_MESSAGE);
exports.isSendBlockedError = isSendBlockedError;
exports.TEMPLATE_PENDING_MESSAGE = 'WhatsApp opener is still awaiting Meta approval (usually a few minutes for a new template). Try again shortly.';
/**
 * Pick the approved member of the requested template's family and shape the params for
 * it. Throws a plain-English error when Meta has approved none of them.
 */
const resolveTemplate = async (companyId, templateName, canonicalParams, options = {}) => {
    const family = familyOf(templateName);
    if (!family)
        return { name: templateName, params: canonicalParams, text: canonicalParams.join(' ') };
    const approved = await (0, exports.approvedTemplateNames)(companyId);
    const usable = family.filter(v => !v.bounceOnly || options.bounced);
    const variant = usable.find(v => approved.has(v.name)) || family.find(v => approved.has(v.name));
    if (!variant) {
        approvedCache.clear();
        throw new Error(exports.TEMPLATE_PENDING_MESSAGE);
    }
    return {
        name: variant.name,
        params: variant.params(canonicalParams).map(exports.sanitiseTemplateParam),
        text: variant.render(canonicalParams),
    };
};
exports.resolveTemplate = resolveTemplate;
/** What the customer would read if this family were sent now with these params. */
const renderTemplateFamily = (templateName, canonicalParams, options = {}) => {
    const family = familyOf(templateName);
    if (!family)
        return canonicalParams.join(' ');
    const usable = family.filter(v => !v.bounceOnly || options.bounced);
    return (usable[0] || family[0]).render(canonicalParams);
};
exports.renderTemplateFamily = renderTemplateFamily;
const sendWhatsAppTemplate = async (companyId, to, templateName, params = []) => (await (0, exports.sendWhatsAppTemplateResolved)(companyId, to, templateName, params)).providerId;
exports.sendWhatsAppTemplate = sendWhatsAppTemplate;
const sendWhatsAppTemplateResolved = async (companyId, to, templateName, params = []) => {
    const resolved = await (0, exports.resolveTemplate)(companyId, templateName, params);
    const components = resolved.params.length
        ? [{ type: 'body', parameters: resolved.params.map(p => ({ type: 'text', text: p })) }]
        : [];
    let result;
    try {
        result = await graphPost(companyId, {
            to: (0, types_1.toE164)(to),
            type: 'template',
            template: {
                name: resolved.name,
                language: { code: TEMPLATE_LANGUAGE },
                ...(components.length ? { components } : {}),
            },
        });
    }
    catch (error) {
        // Our idea of "approved" was stale. Forget it so the next try re-checks Meta.
        approvedCache.clear();
        throw error;
    }
    return { providerId: result.messages?.[0]?.id || '', text: resolved.text, name: resolved.name };
};
exports.sendWhatsAppTemplateResolved = sendWhatsAppTemplateResolved;
/** Blue ticks. Not required, but a customer who can see the message was read is a
 *  customer who waits for the reply instead of ringing. */
const markRead = async (companyId, messageId) => {
    try {
        await graphPost(companyId, { status: 'read', message_id: messageId });
    }
    catch (error) {
        console.warn(`WhatsApp: could not mark ${messageId} read`, error);
    }
};
exports.whatsappSender = {
    send: async (companyId, job) => {
        // Every customer-facing WhatsApp passes through here: the agent's replies,
        // approved drafts, the owner's REPLY, the app's reply box. One gate.
        if (!(await (0, inboxRouting_1.isWhatsAppLiveFor)(companyId))) {
            throw new Error('WhatsApp is not live yet (Meta verification pending), so this message was not sent.');
        }
        if (job.templateName) {
            const sent = await (0, exports.sendWhatsAppTemplateResolved)(companyId, job.to, job.templateName, job.templateParams || []);
            return { providerId: sent.providerId, text: sent.text };
        }
        const providerId = job.media
            ? await (0, exports.sendWhatsAppMedia)(companyId, job.to, job.media, job.text || undefined)
            : await (0, exports.sendWhatsAppText)(companyId, job.to, job.text);
        return { providerId };
    },
};
/** Enqueue-time helper for the router: is free text still allowed? */
const withinCustomerServiceWindow = (lastCustomerMessageAt) => !!lastCustomerMessageAt && Date.now() - lastCustomerMessageAt < 24 * 3600000;
exports.withinCustomerServiceWindow = withinCustomerServiceWindow;
/** Meta signs the raw bytes, so the parsed body cannot be re-serialised and checked. */
const signatureValid = (appSecret, rawBody, header) => {
    if (!header?.startsWith('sha256='))
        return false;
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
const companyForVerifyToken = async (token) => {
    if (!token)
        return null;
    for (const companyId of await (0, companyIds_1.getCompanyIds)()) {
        const priv = await (0, conversations_1.readPrivate)(companyId);
        if (priv.whatsapp?.verifyToken && priv.whatsapp.verifyToken === token)
            return companyId;
    }
    return null;
};
const inboundKind = (type) => type === 'image' || type === 'video' || type === 'document' ? type : null;
const webhookMediaOf = (message) => {
    const kind = inboundKind(message.type);
    if (!kind)
        return null;
    return message[kind] || null;
};
/** Copy a customer photo/video/file into our bucket so the inbox can play it. */
const storeInboundMedia = async (companyId, providerId, message) => {
    const kind = inboundKind(message.type);
    const meta = webhookMediaOf(message);
    if (!kind || !meta?.id)
        return undefined;
    try {
        const priv = await (0, inboxRouting_1.readSendPrivate)(companyId);
        const token = priv.whatsapp?.accessToken;
        if (!token)
            return undefined;
        const lookup = await fetch(`${GRAPH}/${meta.id}`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        const looked = (await lookup.json().catch(() => ({})));
        if (!lookup.ok || !looked.url)
            return undefined;
        const fileRes = await fetch(looked.url, { headers: { Authorization: `Bearer ${token}` } });
        if (!fileRes.ok)
            return undefined;
        const bytes = Buffer.from(await fileRes.arrayBuffer());
        const mime = meta.mime_type || looked.mime_type || fileRes.headers.get('content-type') || 'application/octet-stream';
        const filename = (meta.filename || `${kind}-${providerId}`).replace(/[^\w.\-]+/g, '_');
        const saved = await (0, whatsappStorage_1.saveInboundWhatsAppFile)(companyId, `${providerId}_${filename}`, bytes, mime);
        void (0, whatsappStorage_1.pruneCompanyWhatsApp)(companyId).catch(error => {
            console.warn(`WhatsApp: prune after inbound ${providerId} failed`, error);
        });
        return { kind, url: saved.url, mime, filename };
    }
    catch (error) {
        console.warn(`WhatsApp: could not store inbound ${kind} ${providerId}`, error);
        return undefined;
    }
};
/**
 * Meta's receipts for messages we sent. Nothing to answer, but this is the only
 * evidence that a message actually arrived — without recording it the app cannot
 * tell a delivered WhatsApp from one still in flight.
 */
const processStatuses = async (companyId, statuses) => {
    for (const status of statuses) {
        const state = deliveryStateOf(status.status);
        if (!state || !status.id)
            continue;
        const at = Number(status.timestamp) * 1000 || Date.now();
        const error = status.errors?.[0]
            ? (status.errors[0].message || status.errors[0].title || `error ${status.errors[0].code}`)
            : undefined;
        try {
            await (0, conversations_1.recordDelivery)(companyId, status.id, state, at, error);
        }
        catch (err) {
            console.warn(`WhatsApp: could not record ${state} for ${status.id}`, err);
        }
    }
};
const deliveryStateOf = (raw) => {
    switch (raw) {
        case 'sent': return 'sent';
        case 'delivered': return 'delivered';
        case 'read': return 'read';
        case 'failed': return 'failed';
        default: return null; // 'deleted', 'warning' and anything new: not a delivery state
    }
};
const processChange = async (companyId, value) => {
    if (value.statuses?.length)
        await processStatuses(companyId, value.statuses);
    if (!value.messages?.length)
        return;
    const names = new Map();
    (value.contacts || []).forEach(contact => {
        if (contact.wa_id && contact.profile?.name)
            names.set(contact.wa_id, contact.profile.name);
    });
    for (const message of value.messages) {
        const media = await storeInboundMedia(companyId, message.id, message);
        const inbound = {
            companyId,
            channel: 'whatsapp',
            address: (0, types_1.toE164)(message.from),
            text: (0, whatsappInbound_1.whatsappInboundText)(message),
            providerId: message.id,
            name: names.get(message.from),
            receivedAt: Number(message.timestamp) * 1000 || Date.now(),
            ...(media ? { media } : {}),
            ...(message.type === 'reaction' ? {
                kind: 'reaction',
                ...(message.reaction?.message_id ? { reactionTo: message.reaction.message_id } : {}),
            } : {}),
        };
        await markRead(companyId, message.id);
        try {
            await (0, router_1.handleInbound)(inbound);
        }
        catch (error) {
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
exports.salesAgentWhatsAppWebhook = functions
    .runWith({ timeoutSeconds: 120, memory: '512MB', secrets: conversations_1.BRAIN_SECRETS })
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
        const body = req.body;
        for (const entry of body?.entry || []) {
            for (const change of entry.changes || []) {
                const value = change.value;
                const phoneNumberId = value?.metadata?.phone_number_id;
                if (!value || !phoneNumberId)
                    continue;
                const companyId = await (0, exports.companyForWhatsAppPhoneId)(phoneNumberId);
                if (!companyId) {
                    console.warn(`WhatsApp: no company registered for phone number id ${phoneNumberId}`);
                    continue;
                }
                const priv = await (0, conversations_1.readPrivate)(companyId);
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
    }
    catch (error) {
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
exports.FALLBACK_TEMPLATE = 'enquiry_ack';
/** The approved template's wording, for the thread record. */
const renderFallbackTemplate = (params, options = {}) => (0, exports.renderTemplateFamily)(exports.FALLBACK_TEMPLATE, params, options);
exports.renderFallbackTemplate = renderFallbackTemplate;
const templateFallbackFor = (firstName, vehicleTitle) => ({
    templateName: exports.FALLBACK_TEMPLATE,
    templateParams: [(0, exports.sanitiseTemplateParam)(firstName || 'there'), (0, exports.sanitiseTemplateParam)(vehicleTitle || 'car')],
});
exports.templateFallbackFor = templateFallbackFor;
//# sourceMappingURL=whatsapp.js.map