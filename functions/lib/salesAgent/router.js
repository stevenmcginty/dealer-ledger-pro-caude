"use strict";
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
exports.salesAgentSimulate = exports.salesAgentSavePrivate = exports.salesAgentDiscardDraft = exports.salesAgentApproveDraft = exports.salesAgentInstruct = exports.salesAgentAnswerQuestion = exports.salesAgentSendReply = exports.salesAgentSetMode = exports.answerPendingQuestion = exports.discardDraft = exports.approveDraft = exports.needsApproval = exports.runAgentTurn = exports.handleInbound = exports.BRAIN_SECRETS = void 0;
const functions = __importStar(require("firebase-functions/v1"));
const brain_1 = require("./brain");
const prompt_1 = require("./brain/prompt");
const search_1 = require("./stock/search");
const conversations_1 = require("./conversations");
Object.defineProperty(exports, "BRAIN_SECRETS", { enumerable: true, get: function () { return conversations_1.BRAIN_SECRETS; } });
const alerts_1 = require("./alerts");
const outbox_1 = require("./outbox");
const sendHours_1 = require("./sendHours");
const ownerCommands_1 = require("./ownerCommands");
const whatsapp_1 = require("./channels/whatsapp");
const twilio_1 = require("./channels/twilio");
const leadParsers_1 = require("./channels/leadParsers");
const types_1 = require("./types");
/** Opening template for a lead that came in by email but left us a mobile. */
const FOLLOW_UP_TEMPLATE = 'enquiry_followup';
/** Template used to answer a missed call or a phone lead. */
const MISSED_CALL_TEMPLATE = 'missed_call_followup';
/** Human-feel delay, then the next office-hours window if that lands after close. */
const queueSendAfter = (settings, extraDelayMs = 0) => {
    const hours = (0, sendHours_1.resolveSendHours)(settings);
    const now = Date.now();
    const proposed = now + extraDelayMs;
    const jitter = (0, sendHours_1.isWithinSendHours)(hours, proposed) ? 0 : (0, sendHours_1.morningJitterMs)();
    return (0, sendHours_1.scheduleSendAfter)(settings, now, extraDelayMs, jitter);
};
// --- Inbound ----------------------------------------------------------------
const contactFromLead = (msg, lead) => {
    const contact = {};
    const name = lead?.name || msg.name;
    if (name) {
        const parts = name.trim().split(/\s+/);
        contact.firstName = lead?.firstName || parts[0];
        if (parts.length > 1)
            contact.lastName = parts.slice(1).join(' ');
    }
    const email = lead?.email || (msg.channel === 'email' ? msg.address : undefined);
    if (email)
        contact.email = email.toLowerCase();
    const phone = lead?.phone || msg.extractedPhones?.[0] || (msg.channel !== 'email' ? msg.address : undefined);
    if (phone)
        contact.phone = (0, types_1.toE164)(phone);
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
const attachVehicle = async (companyId, conversation, lead) => {
    if (conversation.vehicleInterest?.stockId)
        return;
    let item = null;
    try {
        if (lead.vehicle?.stockId) {
            item = await (0, search_1.getStockItem)(companyId, lead.vehicle.stockId);
        }
        if (!item && lead.vehicle?.reg) {
            const reg = lead.vehicle.reg.replace(/\s/g, '').toUpperCase();
            const hits = await (0, search_1.searchStock)(companyId, { text: reg, includeReserved: true, limit: 10 });
            item = hits.find(hit => (hit.reg || '').replace(/\s/g, '').toUpperCase() === reg) || null;
        }
        if (!item) {
            const text = lead.vehicle?.title || lead.vehicleHint;
            if (text) {
                const hits = await (0, search_1.searchStock)(companyId, { text, includeReserved: true, limit: 1 });
                item = hits[0] || null;
            }
        }
    }
    catch (error) {
        console.error(`Stock lookup failed for company ${companyId}`, error);
    }
    const vehicleInterest = item
        ? {
            stockId: item.id,
            title: item.title,
            ...(item.ledgerVehicleId ? { ledgerVehicleId: item.ledgerVehicleId } : {}),
        }
        : lead.vehicle?.title
            ? { title: lead.vehicle.title }
            : null;
    if (!vehicleInterest)
        return;
    await (0, conversations_1.updateConversation)(companyId, conversation.id, { vehicleInterest });
    conversation.vehicleInterest = vehicleInterest;
};
/**
 * A missed call or a CarGurus phone lead: a number and nothing else.
 *
 * Messaging a stranger who rang once is a judgement call, not a default. Steve gets the
 * alert either way; the WhatsApp only goes out if he has asked for it, or if the call
 * was short enough that it clearly never got answered.
 */
const handlePhoneLead = async (companyId, conversation, settings, lead) => {
    const label = lead.kind === 'missed_call' ? 'Missed call' : 'Phone lead';
    const duration = lead.callDurationSeconds !== undefined ? ` after ${lead.callDurationSeconds}s` : '';
    await (0, alerts_1.sendOwnerAlert)(companyId, 'new_conversation', conversation, `#${conversation.shortId} ${label} from ${lead.phone || 'an unknown number'}${duration} via ${lead.source}.`);
    const clearlyUnanswered = lead.callDurationSeconds !== undefined && lead.callDurationSeconds < 30;
    const autoFollowUp = settings.followUpPhoneLeads === true || clearlyUnanswered;
    if (!autoFollowUp || !settings.channels.whatsapp || !lead.phone)
        return;
    await (0, outbox_1.enqueue)({
        companyId,
        convId: conversation.id,
        channel: 'whatsapp',
        to: (0, types_1.toE164)(lead.phone),
        text: `Thanks for calling ${settings.dealershipName || 'us'} earlier. Which car were you calling about?`,
        templateName: MISSED_CALL_TEMPLATE,
        templateParams: [settings.dealershipName || 'Radlett Car Sales'],
        sendAfter: queueSendAfter(settings, (0, outbox_1.randomDelayMs)(settings.replyDelaySeconds)),
    });
};
const handleInbound = async (msg, options = {}) => {
    const { companyId } = msg;
    const settings = await (0, conversations_1.readSettings)(companyId);
    if (!(await (0, conversations_1.claimProviderId)(companyId, msg.providerId)))
        return;
    // Steve's own number is a control channel, not a customer. Checked before the
    // enabled flag so PAUSE ALL is reversible.
    const isOwner = msg.channel === 'whatsapp' &&
        !!settings.ownerAlertNumber &&
        (0, types_1.toE164)(msg.address) === (0, types_1.toE164)(settings.ownerAlertNumber);
    if (isOwner) {
        await (0, alerts_1.recordOwnerInbound)(companyId);
        await (0, ownerCommands_1.handleOwnerCommand)(companyId, settings, msg.text || '');
        return;
    }
    const lead = options.lead;
    const contact = contactFromLead(msg, lead);
    const { conversation, isNew } = await (0, conversations_1.findOrCreateConversation)(companyId, msg.channel, msg.address, contact, {
        source: lead ? (0, leadParsers_1.crmLeadSource)(lead.source) : undefined,
        vehicleOfInterest: lead?.vehicle?.title,
        emailThreadId: msg.emailThreadId,
        emailSubject: msg.subject,
    });
    const text = lead ? (0, leadParsers_1.messageOrDefault)(lead, conversation.vehicleInterest?.title) : msg.text;
    await (0, conversations_1.appendMessage)(companyId, conversation, {
        direction: 'in',
        channel: msg.channel,
        text,
        from: 'customer',
        providerId: msg.providerId,
        subject: msg.subject,
        createdAt: msg.receivedAt || Date.now(),
    });
    const patch = {
        lastInboundAt: msg.receivedAt || Date.now(),
        unread: (conversation.unread || 0) + 1,
    };
    // Meta's 24h free-text window is opened by a WhatsApp message and nothing else.
    // Letting an email refresh it would queue free text that Graph then refuses.
    if (msg.channel === 'whatsapp')
        patch.lastCustomerMessageAt = msg.receivedAt || Date.now();
    if (msg.emailThreadId)
        patch.emailThreadId = msg.emailThreadId;
    if (msg.subject)
        patch.emailSubject = msg.subject;
    await (0, conversations_1.updateConversation)(companyId, conversation.id, patch);
    Object.assign(conversation, patch);
    // The master switch. Everything above this line is bookkeeping that must happen
    // whether or not the agent is allowed to speak.
    if (!settings.enabled)
        return;
    if (lead)
        await attachVehicle(companyId, conversation, lead);
    if (isNew) {
        await (0, alerts_1.sendOwnerAlert)(companyId, 'new_conversation', conversation, `#${conversation.shortId} New ${msg.channel} enquiry from ${(0, alerts_1.describeCustomer)(conversation)}: ${text.slice(0, 200)}`);
    }
    if (lead?.kind === 'phone_lead' || lead?.kind === 'missed_call') {
        await handlePhoneLead(companyId, conversation, settings, lead);
        return;
    }
    if (lead?.kind === 'reservation') {
        const paid = lead.paymentFailed ? 'PAYMENT FAILED' : 'Reservation paid';
        await (0, alerts_1.sendOwnerAlert)(companyId, lead.paymentFailed ? 'error' : 'booking', conversation, `#${conversation.shortId} ${paid} for ${lead.vehicle?.reg || lead.vehicle?.title || 'a vehicle'} — ${(0, alerts_1.describeCustomer)(conversation)}`);
        // A failed payment is Steve's problem to sort out, not something to message a
        // customer about. A successful one falls through so the agent can confirm it.
        if (lead.paymentFailed)
            return;
    }
    if (lead && !lead.contactable) {
        await (0, alerts_1.sendOwnerAlert)(companyId, 'error', conversation, `#${conversation.shortId} A ${lead.source} lead arrived with no email and no phone number in it, so the agent cannot answer. Subject: ${msg.subject || '(none)'}`);
        return;
    }
    if (conversation.mode !== 'agent') {
        await (0, alerts_1.sendOwnerAlert)(companyId, 'escalation', conversation, `#${conversation.shortId} ${(0, alerts_1.describeCustomer)(conversation)} (you have this one): ${text.slice(0, 400)}`);
        return;
    }
    await (0, exports.runAgentTurn)(companyId, conversation, { ...msg, text }, settings);
};
exports.handleInbound = handleInbound;
/**
 * Run the brain once and act on what it decided.
 *
 * The conversation object is mutated alongside the database write so that the caller —
 * and the reply delivery below — sees the state the brain just produced rather than the
 * state it was handed.
 */
const runAgentTurn = async (companyId, conversation, inbound, settings, options = {}) => {
    const history = await (0, conversations_1.readHistory)(companyId, conversation.id);
    const result = await (0, brain_1.runBrain)({ companyId, conversation, history, inbound, settings });
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
    const patch = {};
    if (result.stage)
        patch.stage = result.stage;
    Object.entries(result.updates || {}).forEach(([key, value]) => {
        if (value !== undefined)
            patch[key] = value;
    });
    // Never let the brain drop a contact detail we already had.
    if (result.updates?.contact) {
        patch.contact = { ...(conversation.contact || {}), ...result.updates.contact };
    }
    if (result.escalate) {
        patch.escalated = true;
        patch.escalationReason = result.escalate.reason;
    }
    if (result.handoff)
        patch.mode = 'human';
    if (result.askOwner) {
        // Dave never goes quiet while he checks with Steve (Steve, 26 Aug).
        if (!result.reply.trim()) {
            result.reply = conversation.channel === 'email'
                ? 'Would you mind bearing with me a moment? Let me find that out for you and I will come straight back to you.'
                : 'Would you mind bearing with me a moment? Let me find that out for you.';
        }
        patch.pendingQuestion = {
            id: (0, conversations_1.db)().ref().push().key || String(Date.now()),
            question: result.askOwner.question,
            askedAt: Date.now(),
            ...(result.askOwner.context ? { context: result.askOwner.context } : {}),
        };
    }
    // Whatever Steve answered has now been read by the brain; it must not be re-read on
    // the customer's next message.
    if (conversation.ownerAnswer)
        patch.ownerAnswer = null;
    // State is written even for a simulated turn: the simulator is a real conversation on
    // a reserved number, and a second message would otherwise arrive with no memory of
    // the first. Only the sending and the pings to Steve are suppressed.
    await (0, conversations_1.updateConversation)(companyId, conversation.id, patch);
    Object.assign(conversation, patch);
    if (!options.simulate) {
        if (result.escalate) {
            await (0, alerts_1.sendOwnerAlert)(companyId, 'escalation', conversation, `#${conversation.shortId} ESCALATION (${result.escalate.reason}): ${result.escalate.ownerMessage}`);
        }
        if (result.askOwner) {
            await (0, alerts_1.sendOwnerAlert)(companyId, 'question', conversation, `#${conversation.shortId} ASK: ${result.askOwner.question}\nReply: ANSWER ${conversation.shortId} <text>`);
        }
        if (result.updates?.booking) {
            const booking = result.updates.booking;
            await (0, alerts_1.sendOwnerAlert)(companyId, 'booking', conversation, `#${conversation.shortId} BOOKING: ${booking.name} on ${booking.phone} wants ${booking.window} for ${conversation.vehicleInterest?.title || 'a viewing'}`);
        }
        if (result.handoff) {
            await (0, alerts_1.sendOwnerAlert)(companyId, 'escalation', conversation, `#${conversation.shortId} Handed over to you — the agent has stopped replying to ${(0, alerts_1.describeCustomer)(conversation)}.`);
        }
    }
    const reply = (result.reply || '').trim();
    if (!reply || options.simulate)
        return { reply };
    // Draft & Approve (Steve, 26 Aug): nothing goes out under the dealership's name
    // until Steve has read it. WhatsApp uses the same hold once that channel is sending.
    if ((0, exports.needsApproval)(conversation, settings)) {
        const source = options.draftSource || 'agent';
        const customerText = (source === 'instruction'
            ? conversation.pendingDraft?.customerText
            : inbound.text) || [...history].reverse().find(m => m.from === 'customer')?.text || inbound.text || '';
        await holdDraft(companyId, conversation, settings, reply, inbound.subject, source, customerText);
        return { reply };
    }
    await deliverReply(companyId, conversation, settings, reply, inbound);
    return { reply };
};
exports.runAgentTurn = runAgentTurn;
// --- Draft & Approve --------------------------------------------------------
/** Replies are held for approval unless Steve has turned that off. */
const needsApproval = (_conversation, settings) => settings.emailApprovalMode !== false;
exports.needsApproval = needsApproval;
/** A draft in an alert is a glance, not the whole email. */
const trimForAlert = (text, limit = 300) => text.length > limit ? `${text.slice(0, limit).trimEnd()}…` : text;
const draftAlertText = (conversation, settings, text) => {
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
const holdDraft = async (companyId, conversation, settings, text, inboundSubject, source, customerText) => {
    const subject = conversation.emailSubject || inboundSubject;
    const pendingDraft = {
        id: (0, conversations_1.db)().ref().push().key || String(Date.now()),
        text,
        ...(subject ? { subject } : {}),
        createdAt: Date.now(),
        source,
        ...(customerText ? { customerText } : {}),
    };
    await (0, conversations_1.updateConversation)(companyId, conversation.id, { pendingDraft });
    conversation.pendingDraft = pendingDraft;
    await (0, alerts_1.sendOwnerAlert)(companyId, 'draft', conversation, draftAlertText(conversation, settings, text));
};
/**
 * Approve the held draft.
 *
 * During office hours it goes out now — Steve is on the button, so a human-feel delay
 * would just look broken. After hours it joins the outbox until the next opening
 * (default 8am). An edited version replaces the agent's wording entirely. The draft
 * stays put if the send fails, so he can try again.
 */
const approveDraft = async (companyId, convId, edited) => {
    const conversation = await (0, conversations_1.getConversation)(companyId, convId);
    if (!conversation)
        throw new Error(`Conversation ${convId} not found`);
    const draft = conversation.pendingDraft;
    if (!draft)
        throw new Error('There is no draft waiting on that one.');
    const text = (edited || draft.text || '').trim();
    if (!text)
        throw new Error('There is nothing to send.');
    const settings = await (0, conversations_1.readSettings)(companyId);
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
    };
    if (sendAfter > Date.now() + 2000) {
        await (0, outbox_1.enqueue)(job);
    }
    else {
        await (0, outbox_1.sendNow)({
            ...job,
            id: 'approved-draft',
            attempts: 0,
            createdAt: Date.now(),
        }, 'agent');
    }
    await (0, conversations_1.updateConversation)(companyId, convId, { pendingDraft: null });
    delete conversation.pendingDraft;
    return { text, name: (0, alerts_1.describeCustomer)(conversation), sendAfter };
};
exports.approveDraft = approveDraft;
/** Throw the held draft away. Nothing is sent and the agent is not asked to try again. */
const discardDraft = async (companyId, convId) => {
    const conversation = await (0, conversations_1.getConversation)(companyId, convId);
    if (!conversation)
        throw new Error(`Conversation ${convId} not found`);
    const had = !!conversation.pendingDraft;
    if (had) {
        await (0, conversations_1.updateConversation)(companyId, convId, { pendingDraft: null });
        delete conversation.pendingDraft;
    }
    return { had };
};
exports.discardDraft = discardDraft;
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
const deliverReply = async (companyId, conversation, settings, reply, inbound) => {
    const sendAfter = queueSendAfter(settings, (0, outbox_1.randomDelayMs)(settings.replyDelaySeconds));
    const onEmail = conversation.channel === 'email';
    if (onEmail) {
        await (0, outbox_1.enqueue)({
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
    const phone = onEmail && settings.preferWhatsAppReply && settings.channels.whatsapp
        ? conversation.contact?.phone || inbound.extractedPhones?.[0]
        : undefined;
    if (phone) {
        const e164 = (0, types_1.toE164)(phone);
        await (0, outbox_1.enqueue)({
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
        await (0, conversations_1.indexContact)(companyId, 'whatsapp', e164, conversation.id);
        await (0, conversations_1.indexContact)(companyId, 'sms', e164, conversation.id);
        const moved = {
            channel: 'whatsapp',
            address: e164,
            contact: { ...(conversation.contact || {}), phone: e164 },
        };
        await (0, conversations_1.updateConversation)(companyId, conversation.id, moved);
        Object.assign(conversation, moved);
        return;
    }
    if (onEmail)
        return;
    const job = {
        companyId,
        convId: conversation.id,
        channel: conversation.channel,
        to: conversation.address,
        text: reply,
        sendAfter,
    };
    // Outside the 24h window Meta will not take free text at all. The outbox re-checks
    // this at send time; doing it here as well keeps the queued job honest.
    if (conversation.channel === 'whatsapp' && !(0, whatsapp_1.withinCustomerServiceWindow)(conversation.lastCustomerMessageAt)) {
        Object.assign(job, (0, whatsapp_1.templateFallbackFor)(conversation.contact?.firstName, conversation.vehicleInterest?.title));
    }
    await (0, outbox_1.enqueue)(job);
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
const answerPendingQuestion = async (companyId, convId, answer) => {
    const settings = await (0, conversations_1.readSettings)(companyId);
    const conversation = await (0, conversations_1.getConversation)(companyId, convId);
    if (!conversation)
        throw new Error(`Conversation ${convId} not found`);
    const pending = conversation.pendingQuestion;
    const ownerAnswer = {
        question: pending ? pending.question || '' : prompt_1.OWNER_INSTRUCTION_QUESTION,
        answer,
        answeredAt: Date.now(),
    };
    await (0, conversations_1.updateConversation)(companyId, convId, { ownerAnswer, pendingQuestion: null });
    conversation.ownerAnswer = ownerAnswer;
    delete conversation.pendingQuestion;
    await (0, conversations_1.appendMessage)(companyId, conversation, {
        direction: 'in',
        channel: conversation.channel,
        text: pending ? answer : `${prompt_1.OWNER_INSTRUCTION_PREFIX}${answer}`,
        from: 'owner',
        createdAt: Date.now(),
    });
    return (0, exports.runAgentTurn)(companyId, conversation, {
        companyId,
        channel: conversation.channel,
        address: conversation.address,
        text: answer,
        providerId: `owner-answer:${convId}:${Date.now()}`,
        receivedAt: Date.now(),
    }, settings, { draftSource: 'instruction' });
};
exports.answerPendingQuestion = answerPendingQuestion;
// --- Callables for the app --------------------------------------------------
/** Take over, hand back, or park a conversation from the conversations screen. */
exports.salesAgentSetMode = functions.https.onCall(async (data, context) => {
    const companyId = await (0, conversations_1.requireMember)(context, data?.companyId);
    const convId = String(data?.convId || '');
    const mode = String(data?.mode || '');
    if (!['agent', 'human', 'paused'].includes(mode)) {
        throw new functions.https.HttpsError('invalid-argument', 'mode must be agent, human or paused');
    }
    const conversation = await (0, conversations_1.getConversation)(companyId, convId);
    if (!conversation)
        throw new functions.https.HttpsError('not-found', 'That conversation no longer exists.');
    await (0, conversations_1.updateConversation)(companyId, convId, { mode });
    return { ok: true, mode };
});
/** The reply box in the app. Sends immediately — somebody is sitting there watching. */
exports.salesAgentSendReply = functions
    .runWith({ secrets: [...conversations_1.BRAIN_SECRETS, 'GMAIL_CLIENT_ID', 'GMAIL_CLIENT_SECRET'], timeoutSeconds: 120 })
    .https.onCall(async (data, context) => {
    const companyId = await (0, conversations_1.requireMember)(context, data?.companyId);
    const convId = String(data?.convId || '');
    const text = String(data?.text || '').trim();
    if (!text)
        throw new functions.https.HttpsError('invalid-argument', 'There is nothing to send.');
    const conversation = await (0, conversations_1.getConversation)(companyId, convId);
    if (!conversation)
        throw new functions.https.HttpsError('not-found', 'That conversation no longer exists.');
    const job = {
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
        const { providerId } = await (0, outbox_1.sendNow)(job, 'owner');
        await (0, conversations_1.updateConversation)(companyId, convId, { unread: 0 });
        return { ok: true, providerId };
    }
    catch (error) {
        throw new functions.https.HttpsError('unavailable', error?.message || 'The message could not be sent.');
    }
});
/** Answer the question the agent is waiting on, from the app instead of by WhatsApp. */
exports.salesAgentAnswerQuestion = functions
    .runWith({ secrets: [...conversations_1.BRAIN_SECRETS, 'GMAIL_CLIENT_ID', 'GMAIL_CLIENT_SECRET'], timeoutSeconds: 120 })
    .https.onCall(async (data, context) => {
    const companyId = await (0, conversations_1.requireMember)(context, data?.companyId);
    const convId = String(data?.convId || '');
    const answer = String(data?.answer || '').trim();
    if (!answer)
        throw new functions.https.HttpsError('invalid-argument', 'There is no answer to pass on.');
    try {
        return await (0, exports.answerPendingQuestion)(companyId, convId, answer);
    }
    catch (error) {
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
exports.salesAgentInstruct = functions
    .runWith({ secrets: [...conversations_1.BRAIN_SECRETS, 'GMAIL_CLIENT_ID', 'GMAIL_CLIENT_SECRET'], timeoutSeconds: 120 })
    .https.onCall(async (data, context) => {
    const companyId = await (0, conversations_1.requireMember)(context, data?.companyId);
    const convId = String(data?.convId || '');
    const text = String(data?.text || '').trim();
    if (!text)
        throw new functions.https.HttpsError('invalid-argument', 'There is nothing to pass on.');
    try {
        return await (0, exports.answerPendingQuestion)(companyId, convId, text);
    }
    catch (error) {
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
exports.salesAgentApproveDraft = functions
    .runWith({ secrets: [...conversations_1.BRAIN_SECRETS, 'GMAIL_CLIENT_ID', 'GMAIL_CLIENT_SECRET'], timeoutSeconds: 120 })
    .https.onCall(async (data, context) => {
    const companyId = await (0, conversations_1.requireMember)(context, data?.companyId);
    const convId = String(data?.convId || '');
    const edited = data?.text === undefined ? undefined : String(data.text).trim();
    try {
        const { text, sendAfter } = await (0, exports.approveDraft)(companyId, convId, edited);
        return { ok: true, text, sendAfter };
    }
    catch (error) {
        throw new functions.https.HttpsError('failed-precondition', error?.message || 'That draft could not be sent.');
    }
});
/** Bin the draft. The conversation stays with the agent unless you also take it over. */
exports.salesAgentDiscardDraft = functions.https.onCall(async (data, context) => {
    const companyId = await (0, conversations_1.requireMember)(context, data?.companyId);
    const convId = String(data?.convId || '');
    try {
        const { had } = await (0, exports.discardDraft)(companyId, convId);
        return { ok: true, had };
    }
    catch (error) {
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
exports.salesAgentSavePrivate = functions.https.onCall(async (data, context) => {
    const companyId = await (0, conversations_1.requireMember)(context, data?.companyId);
    const patch = {};
    if (data?.whatsapp) {
        const wa = data.whatsapp;
        patch.whatsapp = {
            phoneNumberId: String(wa.phoneNumberId || '').trim(),
            businessAccountId: String(wa.businessAccountId || '').trim(),
            accessToken: String(wa.accessToken || '').trim(),
            verifyToken: String(wa.verifyToken || '').trim(),
            ...(wa.appSecret ? { appSecret: String(wa.appSecret).trim() } : {}),
        };
    }
    if (data?.twilio) {
        const tw = data.twilio;
        patch.twilio = {
            accountSid: String(tw.accountSid || '').trim(),
            authToken: String(tw.authToken || '').trim(),
            fromNumber: String(tw.fromNumber || '').trim(),
        };
    }
    if (!Object.keys(patch).length) {
        throw new functions.https.HttpsError('invalid-argument', 'Nothing was given to save.');
    }
    await (0, conversations_1.db)().ref((0, conversations_1.privatePath)(companyId)).update((0, types_1.stripUndefined)(patch));
    const whatsapp = patch.whatsapp;
    const twilio = patch.twilio;
    if (whatsapp?.phoneNumberId)
        await (0, whatsapp_1.registerWhatsAppRouting)(whatsapp.phoneNumberId, companyId);
    if (twilio?.fromNumber)
        await (0, twilio_1.registerTwilioRouting)(twilio.fromNumber, companyId);
    return {
        ok: true,
        whatsapp: !!whatsapp?.phoneNumberId,
        twilio: !!twilio?.fromNumber,
    };
});
/**
 * The in-app simulator.
 *
 * A real conversation on a reserved number range, so the brain sees genuine history and
 * genuine stock, but nothing leaves the building: the reply comes straight back in the
 * response instead of being queued, and Steve's phone stays quiet.
 */
exports.salesAgentSimulate = functions
    .runWith({ secrets: conversations_1.BRAIN_SECRETS, timeoutSeconds: 120 })
    .https.onCall(async (data, context) => {
    const companyId = await (0, conversations_1.requireMember)(context, data?.companyId);
    const text = String(data?.text || '').trim();
    const sessionId = String(data?.sessionId || 'test').replace(/\D/g, '').slice(0, 5) || '1';
    if (!text)
        throw new functions.https.HttpsError('invalid-argument', 'Type something for the agent to answer.');
    const settings = await (0, conversations_1.readSettings)(companyId);
    const address = `+4400000${sessionId}`;
    const { conversation } = await (0, conversations_1.findOrCreateConversation)(companyId, 'whatsapp', address, {
        firstName: 'Simulator',
    });
    const now = Date.now();
    await (0, conversations_1.appendMessage)(companyId, conversation, {
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
    const { reply } = await (0, exports.runAgentTurn)(companyId, conversation, {
        companyId,
        channel: 'whatsapp',
        address,
        text,
        providerId: `sim:${sessionId}:${now}`,
        receivedAt: now,
    }, settings, { simulate: true });
    if (reply) {
        await (0, conversations_1.appendMessage)(companyId, conversation, {
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
//# sourceMappingURL=router.js.map