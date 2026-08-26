/**
 * Where every inbound message lands, whatever channel carried it.
 *
 * The channel adapters do one job each — decode WhatsApp's JSON, check Twilio's
 * signature, pull a Gmail message apart — and then hand this an InboundMessage that
 * looks identical in all three cases. Everything after that point is one path: dedupe,
 * find the person, write down what they said, decide who answers.
 *
 * Two orderings in here are deliberate and easy to get wrong:
 *
 *   - Owner commands are checked before the enabled flag. PAUSE ALL sets enabled to
 *     false, and if the flag were read first there would be no way to send RESUME ALL.
 *   - The reply is queued, never sent. Sending happens a minute later in the outbox, so
 *     a webhook that times out cannot leave a customer half-answered.
 */

import * as functions from 'firebase-functions/v1';

import { runBrain } from './brain';
import { OWNER_INSTRUCTION_PREFIX, OWNER_INSTRUCTION_QUESTION } from './brain/prompt';
import { getStockItem, searchStock } from './stock/search';
import {
    BRAIN_SECRETS,
    appendMessage,
    claimProviderId,
    findOrCreateConversation,
    getConversation,
    indexContact,
    privatePath,
    readHistory,
    readSettings,
    requireMember,
    updateConversation,
    db,
} from './conversations';
import { describeCustomer, recordOwnerInbound, sendOwnerAlert } from './alerts';
import { NewOutboxJob, enqueue, randomDelayMs, sendNow } from './outbox';
import { isWithinSendHours, morningJitterMs, resolveSendHours, scheduleSendAfter } from './sendHours';
import { handleOwnerCommand } from './ownerCommands';
import { registerWhatsAppRouting, templateFallbackFor, withinCustomerServiceWindow } from './channels/whatsapp';
import { registerTwilioRouting } from './channels/twilio';
import { ParsedLead, crmLeadSource, messageOrDefault } from './channels/leadParsers';
import {
    bindInboxChannelsFromPrivate,
    claimSharedProviderId,
    inboxForMember,
    isWhatsAppLiveFor,
    mirrorConversationContacts,
    ownerCompanyForWhatsApp,
    resolveConversationHome,
    saveSharedInbox,
} from './inboxRouting';
import { startOutboundWhatsApp } from './startWhatsApp';
import {
    Contact,
    Conversation,
    InboundMessage,
    OutboxJob,
    SalesAgentSettings,
    StockItem,
    toE164, stripUndefined } from './types';

// BRAIN_SECRETS lives in conversations.ts: the channel adapters read it at module-load
// time and this file is inside an import cycle with them. Re-exported for callers that
// only know about the router.
export { BRAIN_SECRETS };

/** Opening template for a lead that came in by email but left us a mobile. */
const FOLLOW_UP_TEMPLATE = 'enquiry_followup';

/** Template used to answer a missed call or a phone lead. */
const MISSED_CALL_TEMPLATE = 'missed_call_followup';

/** Human-feel delay, then the next office-hours window if that lands after close. */
const queueSendAfter = (settings: SalesAgentSettings, extraDelayMs = 0): number => {
    const hours = resolveSendHours(settings);
    const now = Date.now();
    const proposed = now + extraDelayMs;
    const jitter = isWithinSendHours(hours, proposed) ? 0 : morningJitterMs();
    return scheduleSendAfter(settings, now, extraDelayMs, jitter);
};

export interface InboundOptions {
    /** Set by the Gmail adapter; the platform-specific reading of a lead email. */
    lead?: ParsedLead;
}

// --- Inbound ----------------------------------------------------------------

const contactFromLead = (msg: InboundMessage, lead?: ParsedLead): Contact => {
    const contact: Contact = {};

    const name = lead?.name || msg.name;
    if (name) {
        const parts = name.trim().split(/\s+/);
        contact.firstName = lead?.firstName || parts[0];
        if (parts.length > 1) contact.lastName = parts.slice(1).join(' ');
    }

    const email = lead?.email || (msg.channel === 'email' ? msg.address : undefined);
    if (email) contact.email = email.toLowerCase();

    const phone = lead?.phone || msg.extractedPhones?.[0] || (msg.channel !== 'email' ? msg.address : undefined);
    if (phone) contact.phone = toE164(phone);

    return contact;
};

/**
 * Work out which car the enquiry is about, best evidence first.
 *
 * A stock number from CarGurus or the website is exact. A registration is nearly exact.
 * Free text is a guess, so it is only used when there is nothing better, and a guess
 * that finds nothing leaves whatever the platform called the car as the title rather
 * than inventing one.
 */
const attachVehicle = async (companyId: string, conversation: Conversation, lead: ParsedLead): Promise<void> => {
    if (conversation.vehicleInterest?.stockId) return;

    let item: StockItem | null = null;

    try {
        if (lead.vehicle?.stockId) {
            item = await getStockItem(companyId, lead.vehicle.stockId);
        }

        if (!item && lead.vehicle?.reg) {
            const reg = lead.vehicle.reg.replace(/\s/g, '').toUpperCase();
            const hits = await searchStock(companyId, { text: reg, includeReserved: true, limit: 10 });
            item = hits.find(hit => (hit.reg || '').replace(/\s/g, '').toUpperCase() === reg) || null;
        }

        if (!item) {
            const text = lead.vehicle?.title || lead.vehicleHint;
            if (text) {
                const hits = await searchStock(companyId, { text, includeReserved: true, limit: 1 });
                item = hits[0] || null;
            }
        }
    } catch (error) {
        console.error(`Stock lookup failed for company ${companyId}`, error);
    }

    const vehicleInterest: Conversation['vehicleInterest'] | null = item
        ? {
            stockId: item.id,
            title: item.title,
            ...(item.ledgerVehicleId ? { ledgerVehicleId: item.ledgerVehicleId } : {}),
            ...(item.ownerCompanyId ? { ownerCompanyId: item.ownerCompanyId } : {}),
        }
        : lead.vehicle?.title
            ? { title: lead.vehicle.title }
            : null;

    if (!vehicleInterest) return;

    await updateConversation(companyId, conversation.id, { vehicleInterest });
    conversation.vehicleInterest = vehicleInterest;
};

/**
 * A missed call or a CarGurus phone lead: a number and nothing else.
 *
 * Messaging a stranger who rang once is a judgement call, not a default. Steve gets the
 * alert either way; the WhatsApp only goes out if he has asked for it, or if the call
 * was short enough that it clearly never got answered.
 */
const handlePhoneLead = async (
    companyId: string,
    conversation: Conversation,
    settings: SalesAgentSettings,
    lead: ParsedLead
): Promise<void> => {
    const label = lead.kind === 'missed_call' ? 'Missed call' : 'Phone lead';
    const duration = lead.callDurationSeconds !== undefined ? ` after ${lead.callDurationSeconds}s` : '';

    await sendOwnerAlert(
        companyId,
        'new_conversation',
        conversation,
        `#${conversation.shortId} ${label} from ${lead.phone || 'an unknown number'}${duration} via ${lead.source}.`
    );

    const clearlyUnanswered = lead.callDurationSeconds !== undefined && lead.callDurationSeconds < 30;
    const autoFollowUp = settings.followUpPhoneLeads === true || clearlyUnanswered;

    if (!autoFollowUp || !settings.channels.whatsapp || !lead.phone) return;
    if (!(await isWhatsAppLiveFor(companyId))) return;

    await enqueue({
        companyId,
        convId: conversation.id,
        channel: 'whatsapp',
        to: toE164(lead.phone),
        text: `Thanks for calling ${settings.dealershipName || 'us'} earlier. Which car were you calling about?`,
        templateName: MISSED_CALL_TEMPLATE,
        templateParams: [settings.dealershipName || 'Radlett Car Sales'],
        sendAfter: queueSendAfter(settings, randomDelayMs(settings.replyDelaySeconds)),
    });
};

export const handleInbound = async (msg: InboundMessage, options: InboundOptions = {}): Promise<void> => {
    const credentialCompanyId = msg.companyId;
    const inbox = await inboxForMember(credentialCompanyId);

    // Shared inbox: one Gmail/WhatsApp retry must not be claimed once per member.
    if (inbox) {
        if (!(await claimSharedProviderId(inbox.id, msg.providerId))) return;
    } else if (!(await claimProviderId(credentialCompanyId, msg.providerId))) {
        return;
    }

    const lead = options.lead;
    const contact = contactFromLead(msg, lead);

    // Owner commands come from a personal mobile. Each member's alert number is
    // tried so Chris's TAKE OVER hits Chris's short ids, not Steve's.
    if (msg.channel === 'whatsapp') {
        const ownerCompanyId = await ownerCompanyForWhatsApp(inbox, msg.address, credentialCompanyId);
        if (ownerCompanyId) {
            await recordOwnerInbound(ownerCompanyId);
            const ownerSettings = await readSettings(ownerCompanyId);
            await handleOwnerCommand(ownerCompanyId, ownerSettings, msg.text || '');
            return;
        }
    }

    const home = await resolveConversationHome({
        inbox,
        credentialCompanyId,
        channel: msg.channel,
        address: msg.address,
        contact,
        lead,
        text: lead ? messageOrDefault(lead, lead.vehicle?.title) : msg.text,
    });

    const companyId = home.companyId;
    msg.companyId = companyId;
    const settings = await readSettings(companyId);

    const { conversation, isNew } = await findOrCreateConversation(companyId, msg.channel, msg.address, contact, {
        source: lead ? crmLeadSource(lead.source) : undefined,
        vehicleOfInterest: lead?.vehicle?.title || home.stockItem?.title,
        emailThreadId: msg.emailThreadId,
        emailSubject: msg.subject,
    });

    await mirrorConversationContacts(companyId, conversation, msg.channel, msg.address);

    const text = lead ? messageOrDefault(lead, conversation.vehicleInterest?.title) : msg.text;

    await appendMessage(companyId, conversation, {
        direction: 'in',
        channel: msg.channel,
        text,
        from: 'customer',
        providerId: msg.providerId,
        subject: msg.subject,
        createdAt: msg.receivedAt || Date.now(),
    });

    const patch: Record<string, unknown> = {
        lastInboundAt: msg.receivedAt || Date.now(),
        unread: (conversation.unread || 0) + 1,
    };

    // Meta's 24h free-text window is opened by a WhatsApp message and nothing else.
    // Letting an email refresh it would queue free text that Graph then refuses.
    if (msg.channel === 'whatsapp') patch.lastCustomerMessageAt = msg.receivedAt || Date.now();
    if (msg.emailThreadId) patch.emailThreadId = msg.emailThreadId;
    if (msg.subject) patch.emailSubject = msg.subject;

    if (isNew && inbox && home.reason !== 'single') {
        patch.routing = {
            inboxId: inbox.id,
            reason: home.reason,
            ...(home.ownerCompanyId ? { ownerCompanyId: home.ownerCompanyId } : {}),
        };
    }

    await updateConversation(companyId, conversation.id, patch);
    Object.assign(conversation, patch);

    if (home.stockItem && !conversation.vehicleInterest?.stockId) {
        const item = home.stockItem;
        const vehicleInterest: Conversation['vehicleInterest'] = {
            stockId: item.id,
            title: item.title,
            ...(item.ledgerVehicleId ? { ledgerVehicleId: item.ledgerVehicleId } : {}),
            ...(item.ownerCompanyId ? { ownerCompanyId: item.ownerCompanyId } : {}),
        };
        await updateConversation(companyId, conversation.id, { vehicleInterest });
        conversation.vehicleInterest = vehicleInterest;
    } else if (lead) {
        await attachVehicle(companyId, conversation, lead);
    }

    // The master switch. Bookkeeping and the new-lead ping still happen when Dave
    // is off, so a car routed to Chris is not silent in his inbox.
    if (isNew) {
        const unmatched = inbox && home.reason === 'fallback'
            ? ' (not matched to a ledger car — in the shared fallback inbox)'
            : '';
        await sendOwnerAlert(
            companyId,
            'new_conversation',
            conversation,
            `#${conversation.shortId} New ${msg.channel} enquiry from ${describeCustomer(conversation)}${unmatched}: ${text.slice(0, 200)}`
        );
    }

    if (!settings.enabled) return;

    if (lead?.kind === 'phone_lead' || lead?.kind === 'missed_call') {
        await handlePhoneLead(companyId, conversation, settings, lead);
        return;
    }

    if (lead?.kind === 'reservation') {
        const paid = lead.paymentFailed ? 'PAYMENT FAILED' : 'Reservation paid';
        await sendOwnerAlert(
            companyId,
            lead.paymentFailed ? 'error' : 'booking',
            conversation,
            `#${conversation.shortId} ${paid} for ${lead.vehicle?.reg || lead.vehicle?.title || 'a vehicle'} — ${describeCustomer(conversation)}`
        );

        // A failed payment is Steve's problem to sort out, not something to message a
        // customer about. A successful one falls through so the agent can confirm it.
        if (lead.paymentFailed) return;
    }

    if (lead && !lead.contactable) {
        await sendOwnerAlert(
            companyId,
            'error',
            conversation,
            `#${conversation.shortId} A ${lead.source} lead arrived with no email and no phone number in it, so the agent cannot answer. Subject: ${msg.subject || '(none)'}`
        );
        return;
    }

    if (conversation.mode !== 'agent') {
        await sendOwnerAlert(
            companyId,
            'escalation',
            conversation,
            `#${conversation.shortId} ${describeCustomer(conversation)} (you have this one): ${text.slice(0, 400)}`
        );
        return;
    }

    try {
        await runAgentTurn(companyId, conversation, { ...msg, text }, settings);
    } catch (error: any) {
        // The turn is lost (AI outage, after retries). The customer is still waiting,
        // so this has to reach Steve as loudly as a draft would.
        console.error(`Agent turn failed for #${conversation.shortId} in company ${companyId}`, error);
        await updateConversation(companyId, conversation.id, {
            escalated: true,
            escalationReason: `agent error: ${String(error?.message || error).slice(0, 160)}`,
        });
        await sendOwnerAlert(
            companyId,
            'error',
            conversation,
            `#${conversation.shortId} Dave could not reply to ${describeCustomer(conversation)} (AI service error). Please reply yourself: "${text.slice(0, 200)}"`
        );
    }
};

// --- The agent's turn -------------------------------------------------------

export interface AgentTurnOptions {
    /** Return the reply instead of queuing it, and ping nobody. Used by the simulator. */
    simulate?: boolean;
    /** Where a held email draft came from, if this turn produces one. Default 'agent'. */
    draftSource?: 'agent' | 'instruction';
}

/**
 * Run the brain once and act on what it decided.
 *
 * The conversation object is mutated alongside the database write so that the caller —
 * and the reply delivery below — sees the state the brain just produced rather than the
 * state it was handed.
 */
export const runAgentTurn = async (
    companyId: string,
    conversation: Conversation,
    inbound: InboundMessage,
    settings: SalesAgentSettings,
    options: AgentTurnOptions = {}
): Promise<{ reply: string }> => {
    const history = await readHistory(companyId, conversation.id);
    const result = await runBrain({ companyId, conversation, history, inbound, settings });

    // Silence guard (Steve, 26 Aug): in agent mode a customer message must never go unanswered.
    // If the brain came back empty without asking Steve or handing off, send a holding line and
    // flag it so a human sees it.
    if (!result.reply.trim() && !result.askOwner && !result.handoff && conversation.mode === 'agent') {
        console.warn(`Brain returned an empty reply for #${conversation.shortId}; applying silence guard`, JSON.stringify({ stage: result.stage, escalate: result.escalate, usage: result.usage }));
        result.reply = conversation.channel === 'email'
            ? 'Thanks for your message. Let me look into that for you and come straight back.'
            : 'Let me look into that for you and come straight back.';
        result.escalate = result.escalate || { reason: 'empty reply from agent', ownerMessage: `Dave could not answer: "${inbound.text.slice(0, 200)}"` };
    }

    const patch: Record<string, unknown> = {};
    if (result.stage) patch.stage = result.stage;

    Object.entries(result.updates || {}).forEach(([key, value]) => {
        if (value !== undefined) patch[key] = value;
    });

    // Never let the brain drop a contact detail we already had.
    if (result.updates?.contact) {
        patch.contact = { ...(conversation.contact || {}), ...result.updates.contact };
    }

    if (result.escalate) {
        patch.escalated = true;
        patch.escalationReason = result.escalate.reason;
    }

    if (result.handoff) patch.mode = 'human';

    if (result.askOwner) {
        // Dave never goes quiet while he checks with Steve (Steve, 26 Aug).
        if (!result.reply.trim()) {
            result.reply = conversation.channel === 'email'
                ? 'Would you mind bearing with me a moment? Let me find that out for you and I will come straight back to you.'
                : 'Would you mind bearing with me a moment? Let me find that out for you.';
        }
        patch.pendingQuestion = {
            id: db().ref().push().key || String(Date.now()),
            question: result.askOwner.question,
            askedAt: Date.now(),
            ...(result.askOwner.context ? { context: result.askOwner.context } : {}),
        };
    }

    // Whatever Steve answered has now been read by the brain; it must not be re-read on
    // the customer's next message.
    if (conversation.ownerAnswer) patch.ownerAnswer = null;

    // State is written even for a simulated turn: the simulator is a real conversation on
    // a reserved number, and a second message would otherwise arrive with no memory of
    // the first. Only the sending and the pings to Steve are suppressed.
    await updateConversation(companyId, conversation.id, patch);
    Object.assign(conversation, patch);

    if (!options.simulate) {
        if (result.escalate) {
            await sendOwnerAlert(
                companyId,
                'escalation',
                conversation,
                `#${conversation.shortId} ESCALATION (${result.escalate.reason}): ${result.escalate.ownerMessage}`
            );
        }

        if (result.askOwner) {
            await sendOwnerAlert(
                companyId,
                'question',
                conversation,
                `#${conversation.shortId} ASK: ${result.askOwner.question}\nReply: ANSWER ${conversation.shortId} <text>`
            );
        }

        if (result.updates?.booking) {
            const booking = result.updates.booking;
            await sendOwnerAlert(
                companyId,
                'booking',
                conversation,
                `#${conversation.shortId} BOOKING: ${booking.name} on ${booking.phone} wants ${booking.window} for ${conversation.vehicleInterest?.title || 'a viewing'}`
            );
        }

        if (result.handoff) {
            await sendOwnerAlert(
                companyId,
                'escalation',
                conversation,
                `#${conversation.shortId} Handed over to you — the agent has stopped replying to ${describeCustomer(conversation)}.`
            );
        }
    }

    const reply = (result.reply || '').trim();
    if (!reply || options.simulate) return { reply };

    // Draft & Approve (Steve, 26 Aug): nothing goes out under the dealership's name
    // until Steve has read it. WhatsApp uses the same hold once that channel is sending.
    if (needsApproval(conversation, settings)) {
        const source = options.draftSource || 'agent';
        const customerText = (
            source === 'instruction'
                ? conversation.pendingDraft?.customerText
                : inbound.text
        ) || [...history].reverse().find(m => m.from === 'customer')?.text || inbound.text || '';

        await holdDraft(companyId, conversation, settings, reply, inbound.subject, source, customerText);
        return { reply };
    }

    await deliverReply(companyId, conversation, settings, reply, inbound);
    return { reply };
};

// --- Draft & Approve --------------------------------------------------------

/** Replies are held for approval unless Steve has turned that off. */
export const needsApproval = (_conversation: Conversation, settings: SalesAgentSettings): boolean =>
    settings.emailApprovalMode !== false;

/** A draft in an alert is a glance, not the whole email. */
const trimForAlert = (text: string, limit = 300): string =>
    text.length > limit ? `${text.slice(0, limit).trimEnd()}…` : text;

const draftAlertText = (
    conversation: Conversation,
    settings: SalesAgentSettings,
    text: string
): string => {
    const who = conversation.contact?.firstName || conversation.address;
    const vehicle = conversation.vehicleInterest?.title ? ` (${conversation.vehicleInterest.title})` : '';
    const n = conversation.shortId;

    return `#${n} ${settings.agentName || 'Dave'} drafted reply to ${who}${vehicle}:\n` +
        `"${trimForAlert(text)}"\n` +
        `Reply: SEND ${n} to approve, TELL ${n} <changes>, or TAKE OVER ${n}`;
};

/**
 * Write the reply down instead of sending it, and put it in front of Steve.
 *
 * A second draft on the same conversation replaces the first: he approves what the agent
 * would say now, not what it would have said two messages ago.
 */
const holdDraft = async (
    companyId: string,
    conversation: Conversation,
    settings: SalesAgentSettings,
    text: string,
    inboundSubject: string | undefined,
    source: 'agent' | 'instruction',
    customerText: string
): Promise<void> => {
    const subject = conversation.emailSubject || inboundSubject;

    const pendingDraft: NonNullable<Conversation['pendingDraft']> = {
        id: db().ref().push().key || String(Date.now()),
        text,
        ...(subject ? { subject } : {}),
        createdAt: Date.now(),
        source,
        ...(customerText ? { customerText } : {}),
    };

    await updateConversation(companyId, conversation.id, { pendingDraft });
    conversation.pendingDraft = pendingDraft;

    await sendOwnerAlert(companyId, 'draft', conversation, draftAlertText(conversation, settings, text));
};

/**
 * Approve the held draft.
 *
 * During office hours it goes out now — Steve is on the button, so a human-feel delay
 * would just look broken. After hours it joins the outbox until the next opening
 * (default 8am). An edited version replaces the agent's wording entirely. The draft
 * stays put if the send fails, so he can try again.
 */
/**
 * The agent's wording, the owner's name.
 *
 * Steve wants Dave to do the typing but the email to come from him (Steve, 26
 * Aug). The sign-off — the last few lines — has the agent's name swapped for the
 * owner's; the body is left alone, and the thread records it as the owner.
 */
export const signAsOwner = (text: string, agentName: string, ownerName: string): string => {
    const agent = agentName.trim();
    const owner = ownerName.trim();
    if (!agent || !owner || agent.toLowerCase() === owner.toLowerCase()) return text;

    const lines = text.split('\n');
    const tail = Math.max(0, lines.length - 5);
    const pattern = new RegExp(`\\b${agent.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g');
    for (let i = tail; i < lines.length; i++) lines[i] = lines[i].replace(pattern, owner);
    return lines.join('\n');
};

export const approveDraft = async (
    companyId: string,
    convId: string,
    edited?: string,
    signAs: 'agent' | 'owner' = 'agent'
): Promise<{ text: string; name: string; sendAfter: number }> => {
    const conversation = await getConversation(companyId, convId);
    if (!conversation) throw new Error(`Conversation ${convId} not found`);

    const draft = conversation.pendingDraft;
    if (!draft) throw new Error('There is no draft waiting on that one.');

    const settings = await readSettings(companyId);
    let text = (edited || draft.text || '').trim();
    if (signAs === 'owner') text = signAsOwner(text, settings.agentName || 'Dave', settings.ownerName || '');
    if (!text) throw new Error('There is nothing to send.');

    const sendAfter = queueSendAfter(settings, 0);

    const job = {
        companyId,
        convId,
        channel: conversation.channel,
        to: conversation.address,
        text,
        subject: draft.subject || conversation.emailSubject,
        emailThreadId: conversation.emailThreadId,
        sendAfter,
        ...(signAs === 'owner' ? { from: 'owner' as const } : {}),
    };

    if (sendAfter > Date.now() + 2000) {
        await enqueue(job);
    } else {
        await sendNow({
            ...job,
            id: 'approved-draft',
            attempts: 0,
            createdAt: Date.now(),
        }, signAs);
    }

    await updateConversation(companyId, convId, { pendingDraft: null });
    delete conversation.pendingDraft;

    return { text, name: describeCustomer(conversation), sendAfter };
};

/** Throw the held draft away. Nothing is sent and the agent is not asked to try again. */
export const discardDraft = async (companyId: string, convId: string): Promise<{ had: boolean }> => {
    const conversation = await getConversation(companyId, convId);
    if (!conversation) throw new Error(`Conversation ${convId} not found`);

    const had = !!conversation.pendingDraft;
    if (had) {
        await updateConversation(companyId, convId, { pendingDraft: null });
        delete conversation.pendingDraft;
    }

    return { had };
};

/**
 * Queue the reply, and decide whether this is the moment to move an email lead onto
 * WhatsApp.
 *
 * When it is, both go out. The email is what stops the customer being left cold if the
 * WhatsApp template is rejected or their number turns out not to be on WhatsApp; the
 * template is what actually starts a conversation, because almost nobody replies to a
 * dealership email twice. From then on the conversation lives on WhatsApp, and their
 * number is indexed so their reply finds its way back to the same thread.
 */
const deliverReply = async (
    companyId: string,
    conversation: Conversation,
    settings: SalesAgentSettings,
    reply: string,
    inbound: InboundMessage
): Promise<void> => {
    const sendAfter = queueSendAfter(settings, randomDelayMs(settings.replyDelaySeconds));
    const onEmail = conversation.channel === 'email';

    if (onEmail) {
        await enqueue({
            companyId,
            convId: conversation.id,
            channel: 'email',
            to: conversation.address,
            text: reply,
            subject: conversation.emailSubject || inbound.subject,
            emailThreadId: conversation.emailThreadId,
            sendAfter,
        });
    }

    const phone = onEmail
        ? conversation.contact?.phone || inbound.extractedPhones?.[0]
        : undefined;

    if (phone) {
        const e164 = toE164(phone);
        const contact = { ...(conversation.contact || {}), phone: e164 };

        // Index the mobile even while WhatsApp is dark, so a later inbound finds
        // this thread instead of opening a second one.
        await indexContact(companyId, 'whatsapp', e164, conversation.id);
        await indexContact(companyId, 'sms', e164, conversation.id);
        conversation.contact = contact;
        await updateConversation(companyId, conversation.id, { contact });
        await mirrorConversationContacts(companyId, conversation, 'whatsapp', e164);

        const whatsappLive = settings.preferWhatsAppReply
            && settings.channels.whatsapp
            && await isWhatsAppLiveFor(companyId);

        if (whatsappLive) {
            await enqueue({
                companyId,
                convId: conversation.id,
                channel: 'whatsapp',
                to: e164,
                text: reply,
                templateName: FOLLOW_UP_TEMPLATE,
                templateParams: [
                    conversation.contact?.firstName || 'there',
                    conversation.vehicleInterest?.title || 'car',
                ],
                sendAfter,
            });

            const moved = { channel: 'whatsapp' as const, address: e164, contact };
            await updateConversation(companyId, conversation.id, moved);
            Object.assign(conversation, moved);
        }

        return;
    }

    if (onEmail) return;

    const job: NewOutboxJob = {
        companyId,
        convId: conversation.id,
        channel: conversation.channel,
        to: conversation.address,
        text: reply,
        sendAfter,
    };

    // Outside the 24h window Meta will not take free text at all. The outbox re-checks
    // this at send time; doing it here as well keeps the queued job honest.
    if (conversation.channel === 'whatsapp' && !withinCustomerServiceWindow(conversation.lastCustomerMessageAt)) {
        Object.assign(job, templateFallbackFor(conversation.contact?.firstName, conversation.vehicleInterest?.title));
    }

    await enqueue(job);
};

// --- Steve talking to the agent ---------------------------------------------

/**
 * Feed Steve's words back in and let the agent carry on.
 *
 * Two things arrive here and they take the same road. One is the answer to a question
 * the agent stopped to ask. The other is Steve simply telling it what to say — "tell him
 * we can do Saturday 11 but not before" — with nothing pending at all. Either way the
 * agent puts it into its own voice and keeps the flow going, which is the whole point:
 * Steve types the substance, the agent handles the wording.
 *
 * It is stored as an inbound message from 'owner' so it shows in the thread, but it is
 * never presented to the brain as something the customer said — it arrives as an
 * ownerAnswer on the conversation, which runAgentTurn clears once it has been used. An
 * unprompted instruction is marked in the thread so the transcript builder skips it.
 */
export const answerPendingQuestion = async (
    companyId: string,
    convId: string,
    answer: string
): Promise<{ reply: string }> => {
    const settings = await readSettings(companyId);
    const conversation = await getConversation(companyId, convId);

    if (!conversation) throw new Error(`Conversation ${convId} not found`);

    const pending = conversation.pendingQuestion;

    const ownerAnswer = {
        question: pending ? pending.question || '' : OWNER_INSTRUCTION_QUESTION,
        answer,
        answeredAt: Date.now(),
    };

    await updateConversation(companyId, convId, { ownerAnswer, pendingQuestion: null });
    conversation.ownerAnswer = ownerAnswer;
    delete conversation.pendingQuestion;

    await appendMessage(companyId, conversation, {
        direction: 'in',
        channel: conversation.channel,
        text: pending ? answer : `${OWNER_INSTRUCTION_PREFIX}${answer}`,
        from: 'owner',
        createdAt: Date.now(),
    });

    return runAgentTurn(
        companyId,
        conversation,
        {
            companyId,
            channel: conversation.channel,
            address: conversation.address,
            text: answer,
            providerId: `owner-answer:${convId}:${Date.now()}`,
            receivedAt: Date.now(),
        },
        settings,
        { draftSource: 'instruction' }
    );
};

// --- Callables for the app --------------------------------------------------

/** Take over, hand back, or park a conversation from the conversations screen. */
export const salesAgentSetMode = functions.https.onCall(async (data, context) => {
    const companyId = await requireMember(context, data?.companyId);
    const convId = String(data?.convId || '');
    const mode = String(data?.mode || '');

    if (!['agent', 'human', 'paused'].includes(mode)) {
        throw new functions.https.HttpsError('invalid-argument', 'mode must be agent, human or paused');
    }

    const conversation = await getConversation(companyId, convId);
    if (!conversation) throw new functions.https.HttpsError('not-found', 'That conversation no longer exists.');

    await updateConversation(companyId, convId, { mode });
    return { ok: true, mode };
});

/** The reply box in the app. Sends immediately — somebody is sitting there watching. */
export const salesAgentSendReply = functions
    .runWith({ secrets: [...BRAIN_SECRETS, 'GMAIL_CLIENT_ID', 'GMAIL_CLIENT_SECRET'], timeoutSeconds: 120 })
    .https.onCall(async (data, context) => {
        const companyId = await requireMember(context, data?.companyId);
        const convId = String(data?.convId || '');
        const text = String(data?.text || '').trim();

        if (!text) throw new functions.https.HttpsError('invalid-argument', 'There is nothing to send.');

        const conversation = await getConversation(companyId, convId);
        if (!conversation) throw new functions.https.HttpsError('not-found', 'That conversation no longer exists.');

        if (conversation.channel === 'whatsapp' && !(await isWhatsAppLiveFor(companyId))) {
            throw new functions.https.HttpsError('failed-precondition', 'WhatsApp is not live yet. The thread is here; nothing will be sent until Meta verification is on.');
        }

        const job: OutboxJob = {
            id: 'immediate',
            companyId,
            convId,
            channel: conversation.channel,
            to: conversation.address,
            text,
            subject: conversation.emailSubject,
            emailThreadId: conversation.emailThreadId,
            sendAfter: Date.now(),
            attempts: 0,
            createdAt: Date.now(),
        };

        try {
            const { providerId } = await sendNow(job, 'owner');
            await updateConversation(companyId, convId, { unread: 0 });
            return { ok: true, providerId };
        } catch (error: any) {
            throw new functions.https.HttpsError('unavailable', error?.message || 'The message could not be sent.');
        }
    });

/** Answer the question the agent is waiting on, from the app instead of by WhatsApp. */
export const salesAgentAnswerQuestion = functions
    .runWith({ secrets: [...BRAIN_SECRETS, 'GMAIL_CLIENT_ID', 'GMAIL_CLIENT_SECRET'], timeoutSeconds: 120 })
    .https.onCall(async (data, context) => {
        const companyId = await requireMember(context, data?.companyId);
        const convId = String(data?.convId || '');
        const answer = String(data?.answer || '').trim();

        if (!answer) throw new functions.https.HttpsError('invalid-argument', 'There is no answer to pass on.');

        try {
            return await answerPendingQuestion(companyId, convId, answer);
        } catch (error: any) {
            throw new functions.https.HttpsError('internal', error?.message || 'The answer could not be passed on.');
        }
    });

/**
 * Tell the agent what to say, whether or not it asked.
 *
 * The same callable covers both: if the agent happens to be waiting on a question this
 * counts as the answer to it, and if it is not, the instruction is simply the next thing
 * it has been told. Steve should not have to know which of the two he is doing.
 */
export const salesAgentInstruct = functions
    .runWith({ secrets: [...BRAIN_SECRETS, 'GMAIL_CLIENT_ID', 'GMAIL_CLIENT_SECRET'], timeoutSeconds: 120 })
    .https.onCall(async (data, context) => {
        const companyId = await requireMember(context, data?.companyId);
        const convId = String(data?.convId || '');
        const text = String(data?.text || '').trim();

        if (!text) throw new functions.https.HttpsError('invalid-argument', 'There is nothing to pass on.');

        try {
            return await answerPendingQuestion(companyId, convId, text);
        } catch (error: any) {
            throw new functions.https.HttpsError('internal', error?.message || 'The agent could not be told that.');
        }
    });

/**
 * Approve the reply the agent has drafted, optionally after editing it.
 *
 * Sent immediately — Steve is sitting on the button, and a minute on the outbox queue
 * would look like the tap did nothing. Gmail credentials live in functions secrets, so
 * this callable has to mount them the same way the reply box does.
 */
export const salesAgentApproveDraft = functions
    .runWith({ secrets: [...BRAIN_SECRETS, 'GMAIL_CLIENT_ID', 'GMAIL_CLIENT_SECRET'], timeoutSeconds: 120 })
    .https.onCall(async (data, context) => {
        const companyId = await requireMember(context, data?.companyId);
        const convId = String(data?.convId || '');
        const edited = data?.text === undefined ? undefined : String(data.text).trim();
        const signAs = data?.signAs === 'owner' ? 'owner' : 'agent';

        try {
            const { text, sendAfter } = await approveDraft(companyId, convId, edited, signAs);
            return { ok: true, text, sendAfter };
        } catch (error: any) {
            throw new functions.https.HttpsError('failed-precondition', error?.message || 'That draft could not be sent.');
        }
    });

/** Bin the draft. The conversation stays with the agent unless you also take it over. */
export const salesAgentDiscardDraft = functions.https.onCall(async (data, context) => {
    const companyId = await requireMember(context, data?.companyId);
    const convId = String(data?.convId || '');

    try {
        const { had } = await discardDraft(companyId, convId);
        return { ok: true, had };
    } catch (error: any) {
        throw new functions.https.HttpsError('failed-precondition', error?.message || 'That draft could not be discarded.');
    }
});

/**
 * Save the channel credentials and register the routing they imply.
 *
 * The routing index has to be written here rather than lazily on first use: a webhook
 * arrives knowing a phone number id and nothing else, and without the index there is no
 * company to attribute the message to.
 */
export const salesAgentSavePrivate = functions.https.onCall(async (data, context) => {
    const companyId = await requireMember(context, data?.companyId);

    const patch: Record<string, unknown> = {};

    if (data?.whatsapp) {
        const wa = data.whatsapp as Record<string, string>;
        patch.whatsapp = {
            phoneNumberId: String(wa.phoneNumberId || '').trim(),
            businessAccountId: String(wa.businessAccountId || '').trim(),
            accessToken: String(wa.accessToken || '').trim(),
            verifyToken: String(wa.verifyToken || '').trim(),
            ...(wa.appSecret ? { appSecret: String(wa.appSecret).trim() } : {}),
        };
    }

    if (data?.twilio) {
        const tw = data.twilio as Record<string, string>;
        patch.twilio = {
            accountSid: String(tw.accountSid || '').trim(),
            authToken: String(tw.authToken || '').trim(),
            fromNumber: String(tw.fromNumber || '').trim(),
        };
    }

    if (!Object.keys(patch).length) {
        throw new functions.https.HttpsError('invalid-argument', 'Nothing was given to save.');
    }

    await db().ref(privatePath(companyId)).update(stripUndefined(patch));

    const whatsapp = patch.whatsapp as { phoneNumberId?: string } | undefined;
    const twilio = patch.twilio as { fromNumber?: string } | undefined;

    if (whatsapp?.phoneNumberId) await registerWhatsAppRouting(whatsapp.phoneNumberId, companyId);
    if (twilio?.fromNumber) await registerTwilioRouting(twilio.fromNumber, companyId);
    await bindInboxChannelsFromPrivate(companyId);

    return {
        ok: true,
        whatsapp: !!whatsapp?.phoneNumberId,
        twilio: !!twilio?.fromNumber,
    };
});

/**
 * Open a WhatsApp thread to a number from this ledger, Steve's or Chris's.
 *
 * First message is the approved follow-up template — Meta will not take free
 * text until the customer replies. While WhatsApp is not live the thread is
 * still created and nothing is sent.
 */
export const salesAgentStartWhatsApp = functions
    .runWith({ timeoutSeconds: 60 })
    .https.onCall(async (data, context) => {
        const companyId = await requireMember(context, data?.companyId);

        try {
            return {
                ok: true,
                ...(await startOutboundWhatsApp({
                    companyId,
                    phone: String(data?.phone || ''),
                    firstName: data?.firstName ? String(data.firstName) : undefined,
                    lastName: data?.lastName ? String(data.lastName) : undefined,
                    vehicleTitle: data?.vehicleTitle ? String(data.vehicleTitle) : undefined,
                    leadId: data?.leadId ? String(data.leadId) : undefined,
                })),
            };
        } catch (error: any) {
            const message = error?.message || 'That WhatsApp could not be started.';
            if (/does not look like a phone number/i.test(message)) {
                throw new functions.https.HttpsError('invalid-argument', message);
            }
            if (/other ledger/i.test(message)) {
                throw new functions.https.HttpsError('already-exists', message);
            }
            throw new functions.https.HttpsError('failed-precondition', message);
        }
    });

/**
 * Register who shares this Gmail / WhatsApp number. Tokens stay on the calling
 * company. Threads are placed on the member that owns the car.
 *
 * `whatsappLive` defaults off and stays off unless it is passed true — connecting
 * the Cloud API is not the same as sending.
 */
export const salesAgentSaveSharedInbox = functions.https.onCall(async (data, context) => {
    const companyId = await requireMember(context, data?.companyId);
    const members = Array.isArray(data?.memberCompanyIds) ? data.memberCompanyIds.map(String) : [];
    const existing = await inboxForMember(companyId);

    // Naming another company here hands it our tokens and lets its threads land in
    // our ledger. Only someone who belongs to every company listed may do that.
    for (const other of [...members, ...(data?.fallbackCompanyId ? [String(data.fallbackCompanyId)] : [])]) {
        if (other !== companyId) await requireMember(context, other);
    }

    if (!members.length && !existing) {
        throw new functions.https.HttpsError('invalid-argument', 'Name at least one other Dealer Ledger Pro company that shares this inbox.');
    }

    try {
        const inbox = await saveSharedInbox({
            credentialCompanyId: companyId,
            memberCompanyIds: members.length ? members : (existing?.memberCompanyIds || []),
            fallbackCompanyId: data?.fallbackCompanyId ? String(data.fallbackCompanyId) : undefined,
            name: data?.name ? String(data.name) : undefined,
            whatsappLive: data?.whatsappLive === undefined ? undefined : data.whatsappLive === true,
        });
        return { ok: true, inbox };
    } catch (error: any) {
        throw new functions.https.HttpsError('internal', error?.message || 'The shared inbox could not be saved.');
    }
});

/**
 * The in-app simulator.
 *
 * A real conversation on a reserved number range, so the brain sees genuine history and
 * genuine stock, but nothing leaves the building: the reply comes straight back in the
 * response instead of being queued, and Steve's phone stays quiet.
 */
export const salesAgentSimulate = functions
    .runWith({ secrets: BRAIN_SECRETS, timeoutSeconds: 120 })
    .https.onCall(async (data, context) => {
        const companyId = await requireMember(context, data?.companyId);
        const text = String(data?.text || '').trim();
        const sessionId = String(data?.sessionId || 'test').replace(/\D/g, '').slice(0, 5) || '1';

        if (!text) throw new functions.https.HttpsError('invalid-argument', 'Type something for the agent to answer.');

        const settings = await readSettings(companyId);
        const address = `+4400000${sessionId}`;

        const { conversation } = await findOrCreateConversation(companyId, 'whatsapp', address, {
            firstName: 'Simulator',
        });

        const now = Date.now();
        await appendMessage(companyId, conversation, {
            direction: 'in',
            channel: 'whatsapp',
            text,
            from: 'customer',
            createdAt: now,
        });

        // The simulator is for testing the agent, so it always runs as the agent even if
        // a previous run handed this thread over.
        conversation.mode = 'agent';
        conversation.lastInboundAt = now;
        conversation.lastCustomerMessageAt = now;

        const { reply } = await runAgentTurn(
            companyId,
            conversation,
            {
                companyId,
                channel: 'whatsapp',
                address,
                text,
                providerId: `sim:${sessionId}:${now}`,
                receivedAt: now,
            },
            settings,
            { simulate: true }
        );

        if (reply) {
            await appendMessage(companyId, conversation, {
                direction: 'out',
                channel: 'whatsapp',
                text: reply,
                from: 'agent',
                createdAt: Date.now(),
            });
        }

        return {
            reply,
            convId: conversation.id,
            stage: conversation.stage,
            vehicleInterest: conversation.vehicleInterest || null,
            pendingQuestion: conversation.pendingQuestion || null,
            escalated: !!conversation.escalated,
            mode: conversation.mode,
        };
    });
