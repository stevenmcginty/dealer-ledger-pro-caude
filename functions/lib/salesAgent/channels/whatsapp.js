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
exports.templateFallbackFor = exports.renderFallbackTemplate = exports.FALLBACK_TEMPLATE = exports.salesAgentWhatsAppWebhook = exports.withinCustomerServiceWindow = exports.whatsappSender = exports.sendWhatsAppTemplate = exports.sendWhatsAppMedia = exports.sendWhatsAppText = exports.sanitiseTemplateParam = exports.companyForWhatsAppPhoneId = exports.registerWhatsAppRouting = void 0;
const crypto = __importStar(require("crypto"));
const admin = __importStar(require("firebase-admin"));
const functions = __importStar(require("firebase-functions/v1"));
const companyIds_1 = require("../../utils/companyIds");
const conversations_1 = require("../conversations");
const inboxRouting_1 = require("../inboxRouting");
const types_1 = require("../types");
const router_1 = require("../router");
const videoCompress_1 = require("./videoCompress");
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
        throw new Error(`WhatsApp send failed (${response.status}): ${json.error?.message || 'unknown error'}`);
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
const sendWhatsAppTemplate = async (companyId, to, templateName, params = []) => {
    const components = params.length
        ? [{ type: 'body', parameters: params.map(p => ({ type: 'text', text: (0, exports.sanitiseTemplateParam)(p) })) }]
        : [];
    const result = await graphPost(companyId, {
        to: (0, types_1.toE164)(to),
        type: 'template',
        template: {
            name: templateName,
            language: { code: TEMPLATE_LANGUAGE },
            ...(components.length ? { components } : {}),
        },
    });
    return result.messages?.[0]?.id || '';
};
exports.sendWhatsAppTemplate = sendWhatsAppTemplate;
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
        const providerId = job.templateName
            ? await (0, exports.sendWhatsAppTemplate)(companyId, job.to, job.templateName, job.templateParams || [])
            : job.media
                ? await (0, exports.sendWhatsAppMedia)(companyId, job.to, job.media, job.text || undefined)
                : await (0, exports.sendWhatsAppText)(companyId, job.to, job.text);
        return { providerId };
    },
};
/** Enqueue-time helper for the router: is free text still allowed? */
const withinCustomerServiceWindow = (lastCustomerMessageAt) => !!lastCustomerMessageAt && Date.now() - lastCustomerMessageAt < 24 * 3600000;
exports.withinCustomerServiceWindow = withinCustomerServiceWindow;
/**
 * Not everything is text. A voice note or a photo still needs to reach the brain as
 * something, or the customer gets silence — a placeholder lets the agent say "I can't
 * play voice notes, what were you after?" rather than nothing at all.
 */
const textOf = (message) => {
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
        const tokenId = crypto.randomUUID();
        const path = `${companyId}/salesAgent/whatsapp/${providerId}_${filename}`;
        const file = admin.storage().bucket().file(path);
        await file.save(bytes, {
            resumable: false,
            metadata: {
                contentType: mime,
                metadata: { firebaseStorageDownloadTokens: tokenId },
            },
        });
        const bucket = admin.storage().bucket().name;
        const url = `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(path)}?alt=media&token=${tokenId}`;
        return { kind, url, mime, filename };
    }
    catch (error) {
        console.warn(`WhatsApp: could not store inbound ${kind} ${providerId}`, error);
        return undefined;
    }
};
const processChange = async (companyId, value) => {
    // Delivery receipts for our own outbound messages. Nothing to answer.
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
            text: textOf(message),
            providerId: message.id,
            name: names.get(message.from),
            receivedAt: Number(message.timestamp) * 1000 || Date.now(),
            ...(media ? { media } : {}),
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
exports.FALLBACK_TEMPLATE = 'enquiry_followup';
/** The approved template's wording, for the thread record. */
const renderFallbackTemplate = (params) => `Hi ${params[0] || 'there'}, thanks for enquiring about the ${params[1] || 'car'}. It's still available. Would you like any more details, or to arrange a viewing or test drive?`;
exports.renderFallbackTemplate = renderFallbackTemplate;
const templateFallbackFor = (firstName, vehicleTitle) => ({
    templateName: exports.FALLBACK_TEMPLATE,
    templateParams: [(0, exports.sanitiseTemplateParam)(firstName || 'there'), (0, exports.sanitiseTemplateParam)(vehicleTitle || 'car')],
});
exports.templateFallbackFor = templateFallbackFor;
//# sourceMappingURL=whatsapp.js.map