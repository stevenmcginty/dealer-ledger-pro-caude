/**
 * Where a reply from the Agent Inbox (or Dave) should actually go.
 *
 * Inbox replies stay on the current channel unless Steve ticks "send on
 * WhatsApp as well" (`both`) or the email has bounced (then WhatsApp is the
 * only remaining door). Meta still will not take free text until they have
 * written in; callers use `templateOnly` to fall back to the approved opener.
 */

import type { Channel, Conversation } from './types';
import { toE164 } from './types';

export type SendVia = 'auto' | 'email' | 'whatsapp' | 'both';

export interface SendTarget {
    channel: Channel;
    to: string;
    /** Outside Meta's 24h window — send the approved template, not free text. */
    templateOnly: boolean;
}

const DAY_MS = 24 * 3_600_000;

export const whatsappWindowOpen = (lastCustomerMessageAt?: number, now = Date.now()): boolean =>
    !!lastCustomerMessageAt && now - lastCustomerMessageAt < DAY_MS;

export const contactPhone = (conversation: Pick<Conversation, 'channel' | 'address' | 'contact'>): string | undefined => {
    const raw = conversation.contact?.phone
        || (conversation.channel !== 'email' ? conversation.address : undefined);
    if (!raw) return undefined;
    const e164 = toE164(raw);
    return e164.length >= 10 ? e164 : undefined;
};

export const contactEmail = (conversation: Pick<Conversation, 'channel' | 'address' | 'contact' | 'emailBounce'>): string | undefined => {
    const raw = conversation.contact?.email
        || (conversation.channel === 'email' ? conversation.address : undefined);
    if (!raw || !raw.includes('@')) return undefined;
    return raw.trim().toLowerCase();
};

export const resolveSendVia = (
    conversation: Pick<Conversation, 'channel' | 'address' | 'contact' | 'emailBounce'>,
    via: SendVia = 'auto'
): Exclude<SendVia, 'auto'> => {
    const phone = contactPhone(conversation);
    const email = contactEmail(conversation);
    const bounced = !!conversation.emailBounce;

    if (via !== 'auto') {
        if (via === 'email' && bounced && phone) return 'whatsapp';
        if (via === 'both' && bounced) return phone ? 'whatsapp' : 'email';
        if (via === 'whatsapp' && !phone) return email ? 'email' : 'whatsapp';
        return via;
    }

    if (bounced) return phone ? 'whatsapp' : 'email';
    if (conversation.channel === 'whatsapp' && phone) return 'whatsapp';
    if (conversation.channel === 'sms' && phone) return 'whatsapp';
    return email ? 'email' : phone ? 'whatsapp' : 'email';
};

export const resolveSendTargets = (
    conversation: Pick<Conversation, 'channel' | 'address' | 'contact' | 'emailBounce' | 'lastCustomerMessageAt'>,
    via: SendVia = 'auto',
    now = Date.now()
): SendTarget[] => {
    const phone = contactPhone(conversation);
    const email = contactEmail(conversation);
    const bounced = !!conversation.emailBounce;
    const chosen = resolveSendVia(conversation, via);
    const windowOpen = whatsappWindowOpen(conversation.lastCustomerMessageAt, now);

    const targets: SendTarget[] = [];
    if ((chosen === 'email' || chosen === 'both') && email && !bounced) {
        targets.push({ channel: 'email', to: email, templateOnly: false });
    }
    if ((chosen === 'whatsapp' || chosen === 'both') && phone) {
        targets.push({ channel: 'whatsapp', to: phone, templateOnly: !windowOpen });
    }
    return targets;
};
