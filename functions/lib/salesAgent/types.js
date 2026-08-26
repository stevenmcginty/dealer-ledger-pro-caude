"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.stripUndefined = exports.rtdbKey = exports.extractUkMobiles = exports.parseOutboundPhone = exports.toE164 = exports.normaliseAddress = void 0;
const normaliseAddress = (channel, address) => {
    if (channel === 'email')
        return `email:${address.trim().toLowerCase()}`;
    return `${channel === 'whatsapp' ? 'wa' : 'sms'}:${(0, exports.toE164)(address)}`;
};
exports.normaliseAddress = normaliseAddress;
/** UK-centric E.164: "07123 456789" -> "+447123456789"; "447123456789" -> "+447123456789" */
const toE164 = (raw) => {
    const d = raw.replace(/[^\d+]/g, '');
    if (d.startsWith('+'))
        return d;
    if (d.startsWith('00'))
        return '+' + d.slice(2);
    if (d.startsWith('0'))
        return '+44' + d.slice(1);
    if (d.startsWith('44'))
        return '+' + d;
    return '+' + d;
};
exports.toE164 = toE164;
/**
 * A number we are willing to open a WhatsApp thread to. toE164 will happily
 * turn "0" into "+44"; this will not.
 */
const parseOutboundPhone = (raw) => {
    const trimmed = (raw || '').trim();
    if (!trimmed)
        return null;
    if (trimmed.replace(/[^\d]/g, '').length < 10)
        return null;
    const e164 = (0, exports.toE164)(trimmed);
    return /^\+[1-9]\d{9,14}$/.test(e164) ? e164 : null;
};
exports.parseOutboundPhone = parseOutboundPhone;
const extractUkMobiles = (text) => {
    const re = /(?:\+44\s?7\d{3}|\(?07\d{3}\)?)\s?\d{3}\s?\d{3}/g;
    return Array.from(new Set((text.match(re) || []).map(exports.toE164)));
};
exports.extractUkMobiles = extractUkMobiles;
/** RTDB-safe key for contactIndex ('.', '#', '$', '[', ']', '/' are illegal) */
const rtdbKey = (s) => s.replace(/[.#$\[\]\/]/g, '_');
exports.rtdbKey = rtdbKey;
/** RTDB rejects `undefined` anywhere in a written value; drop such keys recursively (arrays kept). */
const stripUndefined = (value) => {
    if (Array.isArray(value))
        return value.map(exports.stripUndefined);
    if (value && typeof value === 'object') {
        const out = {};
        for (const [k, v] of Object.entries(value)) {
            if (v !== undefined)
                out[k] = (0, exports.stripUndefined)(v);
        }
        return out;
    }
    return value;
};
exports.stripUndefined = stripUndefined;
//# sourceMappingURL=types.js.map