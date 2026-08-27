"use strict";
/**
 * Where a reply from the Agent Inbox (or Dave) should actually go.
 *
 * Inbox replies stay on the current channel unless Steve ticks "send on
 * WhatsApp as well" (`both`) or the email has bounced (then WhatsApp is the
 * only remaining door). Meta still will not take free text until they have
 * written in; callers use `templateOnly` to fall back to the approved opener.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveSendTargets = exports.resolveSendVia = exports.contactEmail = exports.contactPhone = exports.whatsappWindowOpen = void 0;
const types_1 = require("./types");
const DAY_MS = 24 * 3600000;
const whatsappWindowOpen = (lastCustomerMessageAt, now = Date.now()) => !!lastCustomerMessageAt && now - lastCustomerMessageAt < DAY_MS;
exports.whatsappWindowOpen = whatsappWindowOpen;
const contactPhone = (conversation) => {
    const raw = conversation.contact?.phone
        || (conversation.channel !== 'email' ? conversation.address : undefined);
    if (!raw)
        return undefined;
    const e164 = (0, types_1.toE164)(raw);
    return e164.length >= 10 ? e164 : undefined;
};
exports.contactPhone = contactPhone;
const contactEmail = (conversation) => {
    const raw = conversation.contact?.email
        || (conversation.channel === 'email' ? conversation.address : undefined);
    if (!raw || !raw.includes('@'))
        return undefined;
    return raw.trim().toLowerCase();
};
exports.contactEmail = contactEmail;
const resolveSendVia = (conversation, via = 'auto') => {
    const phone = (0, exports.contactPhone)(conversation);
    const email = (0, exports.contactEmail)(conversation);
    const bounced = !!conversation.emailBounce;
    if (via !== 'auto') {
        if (via === 'email' && bounced && phone)
            return 'whatsapp';
        if (via === 'both' && bounced)
            return phone ? 'whatsapp' : 'email';
        if (via === 'whatsapp' && !phone)
            return email ? 'email' : 'whatsapp';
        return via;
    }
    if (bounced)
        return phone ? 'whatsapp' : 'email';
    if (conversation.channel === 'whatsapp' && phone)
        return 'whatsapp';
    if (conversation.channel === 'sms' && phone)
        return 'whatsapp';
    return email ? 'email' : phone ? 'whatsapp' : 'email';
};
exports.resolveSendVia = resolveSendVia;
const resolveSendTargets = (conversation, via = 'auto', now = Date.now()) => {
    const phone = (0, exports.contactPhone)(conversation);
    const email = (0, exports.contactEmail)(conversation);
    const bounced = !!conversation.emailBounce;
    const chosen = (0, exports.resolveSendVia)(conversation, via);
    const windowOpen = (0, exports.whatsappWindowOpen)(conversation.lastCustomerMessageAt, now);
    const targets = [];
    if ((chosen === 'email' || chosen === 'both') && email && !bounced) {
        targets.push({ channel: 'email', to: email, templateOnly: false });
    }
    if ((chosen === 'whatsapp' || chosen === 'both') && phone) {
        targets.push({ channel: 'whatsapp', to: phone, templateOnly: !windowOpen });
    }
    return targets;
};
exports.resolveSendTargets = resolveSendTargets;
//# sourceMappingURL=sendTargets.js.map