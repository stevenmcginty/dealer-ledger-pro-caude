/**
 * Bounce detection for the Agent Inbox UI.
 *
 * New DSNs are stored as `conversation.emailBounce`. Threads that bounced
 * before that existed still have the Gmail failure sitting in the subject,
 * Dave's question, or the last customer-looking bubble.
 */

import type { AgentMessage, Conversation } from '../services/salesAgentService';

const BOUNCE_SUBJECT_RE = /delivery status notification|undeliverable|returned mail|mail delivery failed|failure notice/i;
const BOUNCE_BODY_RE = /mailer-daemon|wasn't delivered|was not delivered|address couldn't be found|undeliverable|delivery status notification/i;
const BOUNCE_QUESTION_RE = /email .*(bounc|undeliverable)|undeliverable|please call her/i;

export const looksLikeBounceSubject = (subject?: string): boolean =>
    BOUNCE_SUBJECT_RE.test(subject || '');

export const threadLooksBounced = (
    conv: Conversation,
    messages: Array<Pick<AgentMessage, 'from' | 'subject' | 'text'> > = []
): boolean => {
    if (conv.emailBounce) return true;
    if (looksLikeBounceSubject(conv.emailSubject) || looksLikeBounceSubject(conv.pendingDraft?.subject)) return true;
    if (conv.pendingQuestion && BOUNCE_QUESTION_RE.test(`${conv.pendingQuestion.question} ${conv.pendingQuestion.context || ''}`)) {
        return true;
    }
    const lastCustomer = [...messages].reverse().find(m => m.from === 'customer');
    if (lastCustomer && (looksLikeBounceSubject(lastCustomer.subject) || BOUNCE_BODY_RE.test(lastCustomer.text || ''))) {
        return true;
    }
    return false;
};

const looksLikeMobile = (raw?: string): string | undefined => {
    const value = (raw || '').trim();
    return value.replace(/\D/g, '').length >= 9 ? value : undefined;
};

const UK_MOBILE_RE = /(?:\+44\s?7\d{3}|\(?07\d{3}\)?)\s?\d{3}\s?\d{3}/g;

/** Mobiles written in a lead body, including CarGurus `Phone number:` lines. */
export const phonesInText = (text: string): string[] => {
    const labelled = (text || '').match(/phone(?:\s*number)?\s*[:*]\s*([+\d][\d\s()-]{9,})/i);
    const fromLabel = labelled?.[1] ? looksLikeMobile(labelled[1]) : undefined;
    const found = Array.from((text || '').match(UK_MOBILE_RE) || []);
    return [...new Set([fromLabel, ...found].filter(Boolean) as string[])];
};

export const phoneFromMessages = (
    messages: Array<{ text?: string; subject?: string; from?: string; direction?: string }>
): string | undefined => {
    const inbound = messages.filter(m => m.from === 'customer' || m.direction === 'in');
    for (const message of inbound) {
        const found = phonesInText(`${message.subject || ''} ${message.text || ''}`);
        if (found[0]) return found[0];
    }
    return undefined;
};

/** Last-ditch: Dave's bounce question often quotes the mobile even if contact.phone was empty. */
export const phoneFromThread = (conv: Conversation): string | undefined => {
    const stored = conv.contact?.phone || (conv.channel !== 'email' ? conv.address : '');
    if (looksLikeMobile(stored)) return stored;
    const blob = `${conv.pendingQuestion?.question || ''} ${conv.pendingQuestion?.context || ''} ${conv.booking?.phone || ''}`;
    const match = blob.match(/(\+44\d{9,11}|07\d{9})/);
    return match?.[1];
};

/** Every place a mobile might sit on an email lead — contact, CRM, body, Dave's notes. */
export const resolveThreadPhone = (
    conv: Conversation,
    messages: Array<{ text?: string; subject?: string; from?: string; direction?: string }> = [],
    extra?: string
): string | undefined =>
    phoneFromThread(conv) || looksLikeMobile(extra) || phoneFromMessages(messages);

export const displayUkPhone = (raw: string): string => {
    const digits = raw.replace(/\D/g, '');
    if (digits.startsWith('44') && digits.length === 12) {
        return `0${digits.slice(2, 6)} ${digits.slice(6, 9)} ${digits.slice(9)}`;
    }
    if (digits.startsWith('0') && digits.length === 11) {
        return `${digits.slice(0, 5)} ${digits.slice(5, 8)} ${digits.slice(8)}`;
    }
    return raw;
};
