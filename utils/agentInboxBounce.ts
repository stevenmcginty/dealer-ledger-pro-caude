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

/** Last-ditch: Dave's bounce question often quotes the mobile even if contact.phone was empty. */
export const phoneFromThread = (conv: Conversation): string | undefined => {
    const stored = conv.contact?.phone || (conv.channel !== 'email' ? conv.address : '');
    if ((stored || '').replace(/\D/g, '').length >= 9) return stored;
    const blob = `${conv.pendingQuestion?.question || ''} ${conv.pendingQuestion?.context || ''} ${conv.booking?.phone || ''}`;
    const match = blob.match(/(\+44\d{9,11}|07\d{9})/);
    return match?.[1];
};

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
