/**
 * Nightly clear-out of old email from the Agent Inbox.
 *
 * The inbox downloads every conversation each time the app opens, so the node
 * cannot grow for ever. Steve's rule (11 Oct 2026): once a conversation has been
 * quiet for 30 days, its email messages go from the app. Gmail still holds every
 * one of them — Dave never trashes or archives mail, and his replies are sent
 * through the Gmail API, so they sit in Sent. WhatsApp messages stay, because
 * nothing else keeps them.
 *
 * One conversation can hold both channels (one customer, not one thread per
 * channel), so the channel is read per message, the same way the app does
 * (`messageChannelOf` in utils/agentInboxGroups.ts). A quiet thread with no
 * WhatsApp left in it is deleted whole; a mixed one only loses its email.
 *
 * Threads that need Steve (escalated, draft waiting, unread, human/paused) are
 * cleared too once they are 30 days quiet. That was his call.
 */

import * as functions from 'firebase-functions/v1';

import { getCompanyIds } from '../utils/companyIds';
import { agentPath, db, getConversation, listConversations, routingPath } from './conversations';
import { inboxForMember } from './inboxRouting';
import { AgentMessage, Channel, Conversation, normaliseAddress, rtdbKey } from './types';

export const EMAIL_PRUNE_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

type StoredMessage = Partial<AgentMessage>;

/** A conversation as it sits in RTDB: messages are nested under it. */
export type PrunableConversation = Partial<Conversation> & {
    id: string;
    messages?: Record<string, StoredMessage | null> | null;
};

export interface EmailPrunePlan {
    /** Quiet, and nothing but email in it. */
    deleteWhole: PrunableConversation[];
    /** Quiet and mixed: these email message ids go, everything else stays. */
    trim: Array<{ conversation: PrunableConversation; messageIds: string[] }>;
}

/** Same rule as messageChannelOf in utils/agentInboxGroups.ts. */
const channelOf = (message: StoredMessage, conv: PrunableConversation): Channel | undefined =>
    message.channel || conv.channel;

const messagesOf = (conv: PrunableConversation): Array<[string, StoredMessage]> =>
    Object.entries(conv.messages || {}).filter((entry): entry is [string, StoredMessage] => !!entry[1]);

/** Newest thing that happened on the thread, any channel. 0 when nothing is dated. */
export const lastActivityOf = (conv: PrunableConversation): number => {
    let last = Math.max(
        Number(conv.updatedAt) || 0,
        Number(conv.createdAt) || 0,
        Number(conv.lastInboundAt) || 0,
        Number(conv.lastOutboundAt) || 0,
        Number(conv.lastCustomerMessageAt) || 0
    );
    for (const [, message] of messagesOf(conv)) {
        last = Math.max(last, Number(message.createdAt) || 0);
    }
    return last;
};

/**
 * Pure: which conversations go whole, and which email messages go from the
 * mixed ones. A thread exactly `days` old counts as quiet.
 */
export const planEmailPrune = (
    conversations: PrunableConversation[],
    now: number,
    days = EMAIL_PRUNE_DAYS
): EmailPrunePlan => {
    const cutoff = now - days * DAY_MS;
    const plan: EmailPrunePlan = { deleteWhole: [], trim: [] };

    for (const conv of conversations) {
        if (!conv?.id) continue;
        const last = lastActivityOf(conv);
        if (!last || last > cutoff) continue;

        const emailIds: string[] = [];
        let kept = 0;
        for (const [id, message] of messagesOf(conv)) {
            if (channelOf(message, conv) === 'email') emailIds.push(id);
            else kept += 1;
        }

        if (!kept && (emailIds.length || conv.channel === 'email')) {
            plan.deleteWhole.push(conv);
        } else if (emailIds.length) {
            plan.trim.push({ conversation: conv, messageIds: emailIds });
        }
    }
    return plan;
};

/** Every contactIndex key that could point at this thread. */
const contactKeysOf = (conv: PrunableConversation): string[] => {
    const keys = new Set<string>();
    const add = (channel: Channel | undefined, address?: string) => {
        const value = (address || '').trim();
        if (!channel || !value) return;
        keys.add(rtdbKey(normaliseAddress(channel, value)));
    };
    add(conv.channel, conv.address);
    add('email', conv.contact?.email);
    add('whatsapp', conv.contact?.phone);
    add('sms', conv.contact?.phone);
    for (const [, message] of messagesOf(conv)) add(channelOf(message, conv), message.fromAddress);
    return [...keys];
};

/** outboundIndex keys for these messages (delivery receipts and reactions). */
const outboundKeysOf = (messages: StoredMessage[]): string[] =>
    messages
        .filter(message => message.direction === 'out' && message.providerId)
        .map(message => rtdbKey(String(message.providerId)));

interface CompanyIndexes {
    outbox: Record<string, { convId?: string } | null>;
    ownerAlerts: Record<string, { convId?: string } | null>;
    sharedInboxId: string | null;
}

const readCompanyIndexes = async (companyId: string): Promise<CompanyIndexes> => {
    const [outboxSnap, alertsSnap, inbox] = await Promise.all([
        db().ref(agentPath(companyId, 'outbox')).once('value'),
        db().ref(agentPath(companyId, 'ownerAlerts')).once('value'),
        inboxForMember(companyId),
    ]);
    return {
        outbox: outboxSnap.val() || {},
        ownerAlerts: alertsSnap.val() || {},
        sharedInboxId: inbox?.id || null,
    };
};

/**
 * Server copy of deleteAgentConversation (services/salesAgentService.ts), plus
 * the pointers that one leaves behind: outboundIndex, owner alerts for the
 * thread, and the shared-inbox contactIndex. One multi-path update.
 */
export const deleteConversationEverywhere = async (
    companyId: string,
    conv: PrunableConversation,
    indexes: CompanyIndexes
): Promise<void> => {
    const updates: Record<string, null> = {
        [agentPath(companyId, `conversations/${conv.id}`)]: null,
    };
    if (conv.shortId) updates[agentPath(companyId, `shortIds/${conv.shortId}`)] = null;

    for (const key of contactKeysOf(conv)) {
        const own = await db().ref(agentPath(companyId, `contactIndex/${key}`)).once('value');
        if (own.val() === conv.id) updates[agentPath(companyId, `contactIndex/${key}`)] = null;

        if (indexes.sharedInboxId) {
            const sharedPath = routingPath(`sharedInboxes/${indexes.sharedInboxId}/contactIndex/${key}`);
            const shared = (await db().ref(sharedPath).once('value')).val() as { companyId?: string; convId?: string } | null;
            if (shared?.companyId === companyId && shared.convId === conv.id) updates[sharedPath] = null;
        }
    }

    for (const key of outboundKeysOf(messagesOf(conv).map(([, message]) => message))) {
        const ref = (await db().ref(agentPath(companyId, `outboundIndex/${key}`)).once('value')).val() as { convId?: string } | null;
        if (ref?.convId === conv.id) updates[agentPath(companyId, `outboundIndex/${key}`)] = null;
    }

    Object.entries(indexes.outbox).forEach(([jobId, job]) => {
        if (job?.convId === conv.id) updates[agentPath(companyId, `outbox/${jobId}`)] = null;
    });
    Object.entries(indexes.ownerAlerts).forEach(([alertId, alert]) => {
        if (alert?.convId === conv.id) updates[agentPath(companyId, `ownerAlerts/${alertId}`)] = null;
    });

    await db().ref().update(updates);
};

/** Drop these email messages, and their outboundIndex entries, from a thread that stays. */
const trimEmailMessages = async (
    companyId: string,
    conv: PrunableConversation,
    messageIds: string[]
): Promise<void> => {
    const updates: Record<string, null> = {};
    const removed: StoredMessage[] = [];
    for (const id of messageIds) {
        updates[agentPath(companyId, `conversations/${conv.id}/messages/${id}`)] = null;
        const message = conv.messages?.[id];
        if (message) removed.push(message);
    }
    for (const key of outboundKeysOf(removed)) {
        const ref = (await db().ref(agentPath(companyId, `outboundIndex/${key}`)).once('value')).val() as { convId?: string; messageId?: string } | null;
        if (ref?.convId === conv.id && ref.messageId && messageIds.includes(ref.messageId)) {
            updates[agentPath(companyId, `outboundIndex/${key}`)] = null;
        }
    }
    await db().ref().update(updates);
};

export const pruneCompanyEmail = async (
    companyId: string,
    now = Date.now()
): Promise<{ deleted: number; trimmed: number; messages: number }> => {
    const conversations = (await listConversations(companyId)) as PrunableConversation[];
    const plan = planEmailPrune(conversations, now);
    const result = { deleted: 0, trimmed: 0, messages: 0 };
    if (!plan.deleteWhole.length && !plan.trim.length) return result;

    const indexes = await readCompanyIndexes(companyId);

    for (const stale of plan.deleteWhole) {
        // A customer may have written since the list was read. Only go if the
        // fresh copy still plans the same way.
        const fresh = (await getConversation(companyId, stale.id)) as PrunableConversation | null;
        if (!fresh || planEmailPrune([fresh], now).deleteWhole.length !== 1) continue;
        await deleteConversationEverywhere(companyId, fresh, indexes);
        result.deleted += 1;
        result.messages += messagesOf(fresh).length;
    }

    for (const { conversation } of plan.trim) {
        // Same fresh re-check as above: a new message on any channel means hands off.
        const fresh = (await getConversation(companyId, conversation.id)) as PrunableConversation | null;
        const freshPlan = fresh ? planEmailPrune([fresh], now).trim[0] : undefined;
        if (!fresh || !freshPlan) continue;
        await trimEmailMessages(companyId, fresh, freshPlan.messageIds);
        result.trimmed += 1;
        result.messages += freshPlan.messageIds.length;
    }

    return result;
};

/**
 * Nightly at 03:30 UK, after the WhatsApp storage cap. One company's failure
 * must not stop the rest.
 */
export const pruneOldEmailThreads = functions
    .runWith({ timeoutSeconds: 300, memory: '256MB' })
    .pubsub.schedule('30 3 * * *')
    .timeZone('Europe/London')
    .onRun(async () => {
        const companyIds = await getCompanyIds();
        for (const companyId of companyIds) {
            try {
                const result = await pruneCompanyEmail(companyId);
                if (result.deleted || result.trimmed) {
                    console.log(
                        `Email prune ${companyId}: deleted ${result.deleted} threads, trimmed ${result.trimmed}, ${result.messages} email messages removed`
                    );
                }
            } catch (error) {
                console.error(`Email prune failed for ${companyId}`, error);
            }
        }
        return null;
    });
