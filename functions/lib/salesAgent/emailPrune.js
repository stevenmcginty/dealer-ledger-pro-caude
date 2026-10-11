"use strict";
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
exports.pruneOldEmailThreads = exports.pruneCompanyEmail = exports.deleteConversationEverywhere = exports.planEmailPrune = exports.lastActivityOf = exports.EMAIL_PRUNE_DAYS = void 0;
const functions = __importStar(require("firebase-functions/v1"));
const companyIds_1 = require("../utils/companyIds");
const conversations_1 = require("./conversations");
const inboxRouting_1 = require("./inboxRouting");
const types_1 = require("./types");
exports.EMAIL_PRUNE_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
/** Same rule as messageChannelOf in utils/agentInboxGroups.ts. */
const channelOf = (message, conv) => message.channel || conv.channel;
const messagesOf = (conv) => Object.entries(conv.messages || {}).filter((entry) => !!entry[1]);
/** Newest thing that happened on the thread, any channel. 0 when nothing is dated. */
const lastActivityOf = (conv) => {
    let last = Math.max(Number(conv.updatedAt) || 0, Number(conv.createdAt) || 0, Number(conv.lastInboundAt) || 0, Number(conv.lastOutboundAt) || 0, Number(conv.lastCustomerMessageAt) || 0);
    for (const [, message] of messagesOf(conv)) {
        last = Math.max(last, Number(message.createdAt) || 0);
    }
    return last;
};
exports.lastActivityOf = lastActivityOf;
/**
 * Pure: which conversations go whole, and which email messages go from the
 * mixed ones. A thread exactly `days` old counts as quiet.
 */
const planEmailPrune = (conversations, now, days = exports.EMAIL_PRUNE_DAYS) => {
    const cutoff = now - days * DAY_MS;
    const plan = { deleteWhole: [], trim: [] };
    for (const conv of conversations) {
        if (!conv?.id)
            continue;
        const last = (0, exports.lastActivityOf)(conv);
        if (!last || last > cutoff)
            continue;
        const emailIds = [];
        let kept = 0;
        for (const [id, message] of messagesOf(conv)) {
            if (channelOf(message, conv) === 'email')
                emailIds.push(id);
            else
                kept += 1;
        }
        if (!kept && (emailIds.length || conv.channel === 'email')) {
            plan.deleteWhole.push(conv);
        }
        else if (emailIds.length) {
            plan.trim.push({ conversation: conv, messageIds: emailIds });
        }
    }
    return plan;
};
exports.planEmailPrune = planEmailPrune;
/** Every contactIndex key that could point at this thread. */
const contactKeysOf = (conv) => {
    const keys = new Set();
    const add = (channel, address) => {
        const value = (address || '').trim();
        if (!channel || !value)
            return;
        keys.add((0, types_1.rtdbKey)((0, types_1.normaliseAddress)(channel, value)));
    };
    add(conv.channel, conv.address);
    add('email', conv.contact?.email);
    add('whatsapp', conv.contact?.phone);
    add('sms', conv.contact?.phone);
    for (const [, message] of messagesOf(conv))
        add(channelOf(message, conv), message.fromAddress);
    return [...keys];
};
/** outboundIndex keys for these messages (delivery receipts and reactions). */
const outboundKeysOf = (messages) => messages
    .filter(message => message.direction === 'out' && message.providerId)
    .map(message => (0, types_1.rtdbKey)(String(message.providerId)));
const readCompanyIndexes = async (companyId) => {
    const [outboxSnap, alertsSnap, inbox] = await Promise.all([
        (0, conversations_1.db)().ref((0, conversations_1.agentPath)(companyId, 'outbox')).once('value'),
        (0, conversations_1.db)().ref((0, conversations_1.agentPath)(companyId, 'ownerAlerts')).once('value'),
        (0, inboxRouting_1.inboxForMember)(companyId),
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
const deleteConversationEverywhere = async (companyId, conv, indexes) => {
    const updates = {
        [(0, conversations_1.agentPath)(companyId, `conversations/${conv.id}`)]: null,
    };
    if (conv.shortId)
        updates[(0, conversations_1.agentPath)(companyId, `shortIds/${conv.shortId}`)] = null;
    for (const key of contactKeysOf(conv)) {
        const own = await (0, conversations_1.db)().ref((0, conversations_1.agentPath)(companyId, `contactIndex/${key}`)).once('value');
        if (own.val() === conv.id)
            updates[(0, conversations_1.agentPath)(companyId, `contactIndex/${key}`)] = null;
        if (indexes.sharedInboxId) {
            const sharedPath = (0, conversations_1.routingPath)(`sharedInboxes/${indexes.sharedInboxId}/contactIndex/${key}`);
            const shared = (await (0, conversations_1.db)().ref(sharedPath).once('value')).val();
            if (shared?.companyId === companyId && shared.convId === conv.id)
                updates[sharedPath] = null;
        }
    }
    for (const key of outboundKeysOf(messagesOf(conv).map(([, message]) => message))) {
        const ref = (await (0, conversations_1.db)().ref((0, conversations_1.agentPath)(companyId, `outboundIndex/${key}`)).once('value')).val();
        if (ref?.convId === conv.id)
            updates[(0, conversations_1.agentPath)(companyId, `outboundIndex/${key}`)] = null;
    }
    Object.entries(indexes.outbox).forEach(([jobId, job]) => {
        if (job?.convId === conv.id)
            updates[(0, conversations_1.agentPath)(companyId, `outbox/${jobId}`)] = null;
    });
    Object.entries(indexes.ownerAlerts).forEach(([alertId, alert]) => {
        if (alert?.convId === conv.id)
            updates[(0, conversations_1.agentPath)(companyId, `ownerAlerts/${alertId}`)] = null;
    });
    await (0, conversations_1.db)().ref().update(updates);
};
exports.deleteConversationEverywhere = deleteConversationEverywhere;
/** Drop these email messages, and their outboundIndex entries, from a thread that stays. */
const trimEmailMessages = async (companyId, conv, messageIds) => {
    const updates = {};
    const removed = [];
    for (const id of messageIds) {
        updates[(0, conversations_1.agentPath)(companyId, `conversations/${conv.id}/messages/${id}`)] = null;
        const message = conv.messages?.[id];
        if (message)
            removed.push(message);
    }
    for (const key of outboundKeysOf(removed)) {
        const ref = (await (0, conversations_1.db)().ref((0, conversations_1.agentPath)(companyId, `outboundIndex/${key}`)).once('value')).val();
        if (ref?.convId === conv.id && ref.messageId && messageIds.includes(ref.messageId)) {
            updates[(0, conversations_1.agentPath)(companyId, `outboundIndex/${key}`)] = null;
        }
    }
    await (0, conversations_1.db)().ref().update(updates);
};
const pruneCompanyEmail = async (companyId, now = Date.now()) => {
    const conversations = (await (0, conversations_1.listConversations)(companyId));
    const plan = (0, exports.planEmailPrune)(conversations, now);
    const result = { deleted: 0, trimmed: 0, messages: 0 };
    if (!plan.deleteWhole.length && !plan.trim.length)
        return result;
    const indexes = await readCompanyIndexes(companyId);
    for (const stale of plan.deleteWhole) {
        // A customer may have written since the list was read. Only go if the
        // fresh copy still plans the same way.
        const fresh = (await (0, conversations_1.getConversation)(companyId, stale.id));
        if (!fresh || (0, exports.planEmailPrune)([fresh], now).deleteWhole.length !== 1)
            continue;
        await (0, exports.deleteConversationEverywhere)(companyId, fresh, indexes);
        result.deleted += 1;
        result.messages += messagesOf(fresh).length;
    }
    for (const { conversation } of plan.trim) {
        // Same fresh re-check as above: a new message on any channel means hands off.
        const fresh = (await (0, conversations_1.getConversation)(companyId, conversation.id));
        const freshPlan = fresh ? (0, exports.planEmailPrune)([fresh], now).trim[0] : undefined;
        if (!fresh || !freshPlan)
            continue;
        await trimEmailMessages(companyId, fresh, freshPlan.messageIds);
        result.trimmed += 1;
        result.messages += freshPlan.messageIds.length;
    }
    return result;
};
exports.pruneCompanyEmail = pruneCompanyEmail;
/**
 * Nightly at 03:30 UK, after the WhatsApp storage cap. One company's failure
 * must not stop the rest.
 */
exports.pruneOldEmailThreads = functions
    .runWith({ timeoutSeconds: 300, memory: '256MB' })
    .pubsub.schedule('30 3 * * *')
    .timeZone('Europe/London')
    .onRun(async () => {
    const companyIds = await (0, companyIds_1.getCompanyIds)();
    for (const companyId of companyIds) {
        try {
            const result = await (0, exports.pruneCompanyEmail)(companyId);
            if (result.deleted || result.trimmed) {
                console.log(`Email prune ${companyId}: deleted ${result.deleted} threads, trimmed ${result.trimmed}, ${result.messages} email messages removed`);
            }
        }
        catch (error) {
            console.error(`Email prune failed for ${companyId}`, error);
        }
    }
    return null;
});
//# sourceMappingURL=emailPrune.js.map