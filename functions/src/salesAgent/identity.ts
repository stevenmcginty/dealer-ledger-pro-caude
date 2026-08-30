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

import { isNoReplyAddress } from './channels/leadParsers';
import { Channel, Contact, normaliseAddress } from './types';

export const isUsableEmail = (address?: string): boolean => {
    const email = (address || '').trim().toLowerCase();
    return email.includes('@') && !isNoReplyAddress(email);
};

const addKey = (keys: Array<[Channel, string]>, channel: Channel, raw?: string): void => {
    const value = (raw || '').trim();
    if (!value) return;
    if (channel === 'email' && !isUsableEmail(value)) return;

    const already = keys.some(
        ([ch, address]) => ch === channel && normaliseAddress(ch, address) === normaliseAddress(channel, value)
    );
    if (!already) keys.push([channel, value]);
};

/**
 * Addresses we may look up an existing conversation by.
 *
 * For email inbound this is only the customer's email. Platform noreply
 * addresses are dropped so two Cazoo leads cannot collapse onto one thread.
 */
export const lookupKeys = (
    channel: Channel,
    address: string,
    contact: Contact = {}
): Array<[Channel, string]> => {
    const keys: Array<[Channel, string]> = [];

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

/** Every address we know them by — used when writing indexes, not when matching. */
export const indexKeys = (
    channel: Channel,
    address: string,
    contact: Contact = {}
): Array<[Channel, string]> => {
    const keys: Array<[Channel, string]> = [];
    addKey(keys, channel, address);
    addKey(keys, 'email', contact.email);
    if (contact.phone) {
        addKey(keys, 'whatsapp', contact.phone);
        addKey(keys, 'sms', contact.phone);
    }
    return keys;
};

export const emailsConflict = (a?: string, b?: string): boolean => {
    const left = (a || '').trim().toLowerCase();
    const right = (b || '').trim().toLowerCase();
    if (!isUsableEmail(left) || !isUsableEmail(right)) return false;
    return left !== right;
};

export const existingEmailOf = (conv: {
    channel?: Channel;
    address?: string;
    contact?: Contact;
}): string => {
    if (isUsableEmail(conv.contact?.email)) return conv.contact!.email!.trim().toLowerCase();
    if (conv.channel === 'email' && isUsableEmail(conv.address)) return conv.address!.trim().toLowerCase();
    return '';
};

export const inboundEmailOf = (channel: Channel, address: string, contact: Contact = {}): string => {
    if (isUsableEmail(contact.email)) return contact.email!.trim().toLowerCase();
    if (channel === 'email' && isUsableEmail(address)) return address.trim().toLowerCase();
    return '';
};

/** True when this inbound should not be glued onto that existing thread. */
export const isDifferentPerson = (
    channel: Channel,
    address: string,
    contact: Contact,
    existing: { channel?: Channel; address?: string; contact?: Contact }
): boolean => emailsConflict(inboundEmailOf(channel, address, contact), existingEmailOf(existing));
