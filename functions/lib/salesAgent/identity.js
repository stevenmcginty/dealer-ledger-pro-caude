"use strict";
/**
 * Who an inbound message is allowed to attach to.
 *
 * Email identity is the customer's email. A mobile found in the body is not —
 * it is often the last customer Gmail quoted, or the desk's own number, and
 * matching on it glues two different people onto one thread (Steve, 30 Aug:
 * Tobias's Z4 and a separate MX-5 enquiry landed in the same Dave inbox).
 *
 * WhatsApp identity is the number they wrote from. Email is a bonus link so a
 * lead who emailed then answered the follow-up stays on the same conversation.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.isDifferentPerson = exports.inboundEmailOf = exports.existingEmailOf = exports.emailsConflict = exports.indexKeys = exports.lookupKeys = exports.isUsableEmail = void 0;
const leadParsers_1 = require("./channels/leadParsers");
const types_1 = require("./types");
const isUsableEmail = (address) => {
    const email = (address || '').trim().toLowerCase();
    return email.includes('@') && !(0, leadParsers_1.isNoReplyAddress)(email);
};
exports.isUsableEmail = isUsableEmail;
const addKey = (keys, channel, raw) => {
    const value = (raw || '').trim();
    if (!value)
        return;
    if (channel === 'email' && !(0, exports.isUsableEmail)(value))
        return;
    const already = keys.some(([ch, address]) => ch === channel && (0, types_1.normaliseAddress)(ch, address) === (0, types_1.normaliseAddress)(channel, value));
    if (!already)
        keys.push([channel, value]);
};
/**
 * Addresses we may look up an existing conversation by.
 *
 * For email inbound this is only the customer's email. Platform noreply
 * addresses are dropped so two Cazoo leads cannot collapse onto one thread.
 */
const lookupKeys = (channel, address, contact = {}) => {
    const keys = [];
    if (channel === 'email') {
        addKey(keys, 'email', address);
        addKey(keys, 'email', contact.email);
        return keys;
    }
    addKey(keys, channel, address);
    if (contact.phone) {
        addKey(keys, 'whatsapp', contact.phone);
        addKey(keys, 'sms', contact.phone);
    }
    addKey(keys, 'email', contact.email);
    return keys;
};
exports.lookupKeys = lookupKeys;
/** Every address we know them by — used when writing indexes, not when matching. */
const indexKeys = (channel, address, contact = {}) => {
    const keys = [];
    addKey(keys, channel, address);
    addKey(keys, 'email', contact.email);
    if (contact.phone) {
        addKey(keys, 'whatsapp', contact.phone);
        addKey(keys, 'sms', contact.phone);
    }
    return keys;
};
exports.indexKeys = indexKeys;
const emailsConflict = (a, b) => {
    const left = (a || '').trim().toLowerCase();
    const right = (b || '').trim().toLowerCase();
    if (!(0, exports.isUsableEmail)(left) || !(0, exports.isUsableEmail)(right))
        return false;
    return left !== right;
};
exports.emailsConflict = emailsConflict;
const existingEmailOf = (conv) => {
    if ((0, exports.isUsableEmail)(conv.contact?.email))
        return conv.contact.email.trim().toLowerCase();
    if (conv.channel === 'email' && (0, exports.isUsableEmail)(conv.address))
        return conv.address.trim().toLowerCase();
    return '';
};
exports.existingEmailOf = existingEmailOf;
const inboundEmailOf = (channel, address, contact = {}) => {
    if ((0, exports.isUsableEmail)(contact.email))
        return contact.email.trim().toLowerCase();
    if (channel === 'email' && (0, exports.isUsableEmail)(address))
        return address.trim().toLowerCase();
    return '';
};
exports.inboundEmailOf = inboundEmailOf;
/** True when this inbound should not be glued onto that existing thread. */
const isDifferentPerson = (channel, address, contact, existing) => (0, exports.emailsConflict)((0, exports.inboundEmailOf)(channel, address, contact), (0, exports.existingEmailOf)(existing));
exports.isDifferentPerson = isDifferentPerson;
//# sourceMappingURL=identity.js.map