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
exports.salesAgentSimulate = exports.salesAgentSaveSharedInbox = exports.salesAgentStartWhatsApp = exports.salesAgentSavePrivate = exports.salesAgentDiscardDraft = exports.salesAgentDraftNow = exports.draftNow = exports.awaitingReply = exports.salesAgentApproveDraft = exports.salesAgentInstruct = exports.salesAgentAnswerQuestion = exports.salesAgentSendReply = exports.salesAgentSetMode = exports.answerPendingQuestion = exports.ownerOutsideWindowMessage = exports.discardDraft = exports.approveDraft = exports.signAsOwner = exports.needsApproval = exports.runAgentTurn = exports.handleInbound = exports.ledgerLabelName = exports.BRAIN_SECRETS = void 0;
const functions = __importStar(require("firebase-functions/v1"));
const brain_1 = require("./brain");
const prompt_1 = require("./brain/prompt");
const sendTargets_1 = require("./sendTargets");
const search_1 = require("./stock/search");
const conversations_1 = require("./conversations");
Object.defineProperty(exports, "BRAIN_SECRETS", { enumerable: true, get: function () { return conversations_1.BRAIN_SECRETS; } });
const alerts_1 = require("./alerts");
const outbox_1 = require("./outbox");
const sendHours_1 = require("./sendHours");
const ownerCommands_1 = require("./ownerCommands");
const lessons_1 = require("./lessons");
const whatsapp_1 = require("./channels/whatsapp");
const gmail_1 = require("./channels/gmail");
const twilio_1 = require("./channels/twilio");
const leadParsers_1 = require("./channels/leadParsers");
const identity_1 = require("./identity");
const inboxRouting_1 = require("./inboxRouting");
const startWhatsApp_1 = require("./startWhatsApp");
const types_1 = require("./types");
const approval_1 = require("./approval");
const gmailContext_1 = require("./channels/gmailContext");
/** Template used to answer a missed call or a phone lead. */
const MISSED_CALL_TEMPLATE = 'missed_call_update';
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
    const email = lead?.email || (msg.channel === 'email' && (0, identity_1.isUsableEmail)(msg.address) ? msg.address : undefined);
    if (email && (0, identity_1.isUsableEmail)(email))
        contact.email = email.toLowerCase();
    // A number scraped from an email body is not identity — it is often the last
    // customer Gmail quoted. Structured parsers (Cazoo / CarGurus / website) put
    // the customer's own phone on lead.phone; that is the only mobile we trust
    // enough to store on an email inbound. WhatsApp inbound still uses the From.
    const phone = lead?.phone || (msg.channel !== 'email' ? (msg.extractedPhones?.[0] || msg.address) : undefined);
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
                // Free text is a guess, so it is held to a standard the two exact
                // routes above are not. Cars still on the forecourt are tried first
                // and a loose word overlap is thrown away: a "still available?" with
                // no reg in it must not pin the thread to a car that sold last year
                // and then have Dave quote its price (Steve, 28 Aug).
                const live = await (0, search_1.searchStock)(companyId, { text, limit: 1 });
                item = live.find(hit => hit.matchQuality !== 'weak') || null;
                if (!item) {
                    // Nothing available fits. A car that has gone may still be the one
                    // they mean, but only if they described it exactly.
                    const gone = await (0, search_1.searchStock)(companyId, { text, includeReserved: true, limit: 1 });
                    item = gone.find(hit => hit.matchQuality === 'exact') || null;
                }
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
            ...(item.ownerCompanyId ? { ownerCompanyId: item.ownerCompanyId } : {}),
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
 * A customer on a live thread who names a different car is now asking about that
 * car. The thread used to stay pinned to the first one forever, so Tobias asking
 * to view the MX-5 sat in the inbox as a Z4 enquiry and looked like a mix-up of
 * two people (Steve, 30 Aug).
 *
 * Only the words they wrote this time count — not the subject line, which still
 * carries the old car in a reply. The match has to be a car for sale and has to
 * be unambiguous, otherwise the thread keeps the car it had.
 */
const switchVehicleIfNamed = async (credentialCompanyId, companyId, conversation, msg, lead) => {
    const current = conversation.vehicleInterest;
    if (!current?.stockId)
        return;
    if (lead && lead.kind !== 'enquiry')
        return;
    const body = ((lead ? lead.message : msg.text) || '').trim();
    if (!body)
        return;
    // One car for sale, named clearly. "The Mazda" when two are in must not move
    // the thread, and neither must a car that has gone.
    let item = null;
    try {
        const stock = await (0, search_1.readStock)(credentialCompanyId);
        const text = (0, search_1.carWordsOnly)(stock, body);
        const hits = text
            ? (0, search_1.rankStock)(stock, { text, includeHidden: true, limit: 5 }).filter(hit => hit.matchQuality !== 'weak')
            : [];
        item = hits.length === 1 ? hits[0] : null;
    }
    catch (error) {
        console.error(`Stock lookup failed for company ${credentialCompanyId}`, error);
        return;
    }
    if (!item || item.id === current.stockId)
        return;
    const vehicleInterest = {
        stockId: item.id,
        title: item.title,
        ...(item.ledgerVehicleId ? { ledgerVehicleId: item.ledgerVehicleId } : {}),
        ...(item.ownerCompanyId ? { ownerCompanyId: item.ownerCompanyId } : {}),
    };
    await (0, conversations_1.updateConversation)(companyId, conversation.id, { vehicleInterest });
    conversation.vehicleInterest = vehicleInterest;
    await (0, alerts_1.sendOwnerAlert)(companyId, 'inbound', conversation, `#${conversation.shortId} ${(0, alerts_1.describeCustomer)(conversation)} is now asking about the ${item.title} (was ${current.title || 'another car'}).`);
};
/**
 * A missed call or a CarGurus phone lead: a number and nothing else.
 *
 * Messaging a stranger who rang once is a judgement call, not a default. Steve gets the
 * alert either way; the WhatsApp only goes out if he has asked for it, or if the call
 * was short enough that it clearly never got answered.
 */
/**
 * Name the ledger a thread belongs to, for the shared mailbox.
 *
 * `ownerName` is what a dealer calls himself; the dealership name is the next best
 * thing, and a ledger that has set neither still gets a label rather than nothing.
 */
const ledgerLabelName = (settings) => {
    const name = (settings.ownerName || '').trim() || (settings.dealershipName || '').trim();
    return name ? `Lead: ${name}` : 'Lead: other ledger';
};
exports.ledgerLabelName = ledgerLabelName;
const labelOwningLedger = async (companyId, emailThreadId) => {
    try {
        const settings = await (0, conversations_1.readSettings)(companyId);
        await (0, gmail_1.labelEmailThread)(companyId, emailThreadId, (0, exports.ledgerLabelName)(settings), 'ledger');
    }
    catch (error) {
        console.warn(`Could not label the owning ledger on ${emailThreadId}`, error.message);
    }
};
/** The shade entry reads like the messaging app's own: the customer's name, then their words. */
const customerPush = (conversation, channel, text) => {
    const via = channel === 'whatsapp' ? 'WhatsApp' : channel === 'sms' ? 'SMS' : 'Email';
    const who = (0, alerts_1.describeCustomer)(conversation);
    return { title: `${who} · ${via}`, body: text.trim() || (channel === 'email' ? '(no text)' : '(attachment)') };
};
const handlePhoneLead = async (companyId, conversation, settings, lead) => {
    const label = lead.kind === 'missed_call' ? 'Missed call' : 'Phone lead';
    const duration = lead.callDurationSeconds !== undefined ? ` after ${lead.callDurationSeconds}s` : '';
    await (0, alerts_1.sendOwnerAlert)(companyId, 'new_conversation', conversation, `#${conversation.shortId} ${label} from ${lead.phone || 'an unknown number'}${duration} via ${lead.source}.`);
    const clearlyUnanswered = lead.callDurationSeconds !== undefined && lead.callDurationSeconds < 30;
    const autoFollowUp = settings.followUpPhoneLeads === true || clearlyUnanswered;
    if (!autoFollowUp || !settings.channels.whatsapp || !lead.phone)
        return;
    if (!(await (0, inboxRouting_1.isWhatsAppLiveFor)(companyId)))
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
/**
 * A Delivery Status Notification is not a customer. Do not run Dave, do not
 * draft a holding line, and do not send another email at the dead address.
 */
const handleEmailBounce = async (companyId, conversation, settings, msg, lead) => {
    const address = (lead.email || conversation.contact?.email || conversation.address || '').toLowerCase();
    const reason = lead.bounceReason || 'undeliverable';
    const phone = (0, sendTargets_1.contactPhone)(conversation) || lead.phone;
    const e164 = phone ? (0, types_1.toE164)(phone) : undefined;
    const who = (0, alerts_1.describeCustomer)(conversation);
    const booking = conversation.booking?.window;
    const vehicle = conversation.vehicleInterest?.title;
    const emailBounce = {
        address,
        reason,
        ...(lead.message ? { diagnostic: lead.message.slice(0, 400) } : {}),
        at: msg.receivedAt || Date.now(),
    };
    const notice = [
        `Email to ${who} bounced (${reason}).`,
        address ? `Address: ${address}.` : '',
        e164 ? `Phone on file: ${e164}. WhatsApp them from the inbox — do not email again.` : 'No phone on file.',
        booking ? `Booked: ${booking}${vehicle ? ` for the ${vehicle}` : ''}.` : '',
    ].filter(Boolean).join(' ');
    const patch = {
        emailBounce,
        escalated: true,
        escalationReason: `Email bounced: ${reason}`,
        pendingDraft: null,
        pendingQuestion: null,
        mode: 'human',
        lastInboundAt: msg.receivedAt || Date.now(),
        unread: (conversation.unread || 0) + 1,
    };
    if (e164) {
        patch.contact = { ...(conversation.contact || {}), phone: e164, ...(address ? { email: address } : {}) };
        patch.channel = 'whatsapp';
        patch.address = e164;
        await (0, conversations_1.indexContact)(companyId, 'whatsapp', e164, conversation.id);
        await (0, conversations_1.indexContact)(companyId, 'sms', e164, conversation.id);
    }
    await (0, conversations_1.updateConversation)(companyId, conversation.id, patch);
    Object.assign(conversation, patch);
    await (0, conversations_1.appendMessage)(companyId, conversation, {
        direction: 'in',
        channel: 'email',
        text: `${prompt_1.BOUNCE_NOTICE_PREFIX}${notice}`,
        from: 'owner',
        providerId: msg.providerId,
        subject: 'Delivery Status Notification (Failure)',
        createdAt: msg.receivedAt || Date.now(),
    });
    await (0, alerts_1.sendOwnerAlert)(companyId, 'error', conversation, `#${conversation.shortId} ${notice}`);
};
const handleInbound = async (msg, options = {}) => {
    const credentialCompanyId = msg.companyId;
    const inbox = await (0, inboxRouting_1.inboxForMember)(credentialCompanyId);
    // Shared inbox: one Gmail/WhatsApp retry must not be claimed once per member.
    if (inbox) {
        if (!(await (0, inboxRouting_1.claimSharedProviderId)(inbox.id, msg.providerId)))
            return;
    }
    else if (!(await (0, conversations_1.claimProviderId)(credentialCompanyId, msg.providerId))) {
        return;
    }
    const lead = options.lead;
    const contact = contactFromLead(msg, lead);
    // Owner commands come from a personal mobile. Each member's alert number is
    // tried so Chris's TAKE OVER hits Chris's short ids, not Steve's.
    if (msg.channel === 'whatsapp') {
        const ownerCompanyId = await (0, inboxRouting_1.ownerCompanyForWhatsApp)(inbox, msg.address, credentialCompanyId);
        if (ownerCompanyId) {
            // A thumbs-up on an owner alert is not TAKE OVER / ANSWER.
            if (msg.kind === 'reaction')
                return;
            await (0, alerts_1.recordOwnerInbound)(ownerCompanyId);
            const ownerSettings = await (0, conversations_1.readSettings)(ownerCompanyId);
            await (0, ownerCommands_1.handleOwnerCommand)(ownerCompanyId, ownerSettings, msg.text || '');
            return;
        }
    }
    const home = await (0, inboxRouting_1.resolveConversationHome)({
        inbox,
        credentialCompanyId,
        channel: msg.channel,
        address: msg.address,
        contact,
        lead,
        text: lead ? (0, leadParsers_1.messageOrDefault)(lead, lead.vehicle?.title) : msg.text,
        skipExisting: options.forceNewConversation === true,
    });
    const companyId = home.companyId;
    msg.companyId = companyId;
    const settings = await (0, conversations_1.readSettings)(companyId);
    const { conversation, isNew } = await (0, conversations_1.findOrCreateConversation)(companyId, msg.channel, msg.address, contact, {
        source: lead ? (0, leadParsers_1.crmLeadSource)(lead.source) : undefined,
        vehicleOfInterest: lead?.vehicle?.title || home.stockItem?.title,
        emailThreadId: options.forceNewConversation ? undefined : msg.emailThreadId,
        emailSubject: msg.subject,
        forceNew: options.forceNewConversation === true,
        stealFrom: options.stealFrom,
    });
    await (0, inboxRouting_1.mirrorConversationContacts)(companyId, conversation, msg.channel, msg.address, options.stealFrom);
    // One mailbox, two dealers. Whose car this is has just been decided above, so say
    // so in Gmail itself — otherwise both of them read every lead to find out whether
    // it is theirs. Fire and forget: a label must never hold up answering a customer.
    if (msg.channel === 'email' && msg.emailThreadId && inbox) {
        void labelOwningLedger(companyId, msg.emailThreadId);
    }
    if (lead?.kind === 'bounce') {
        await handleEmailBounce(companyId, conversation, settings, msg, lead);
        return;
    }
    const text = lead ? (0, leadParsers_1.messageOrDefault)(lead, conversation.vehicleInterest?.title) : msg.text;
    if (msg.kind === 'reaction') {
        const pinned = msg.reactionTo
            ? await (0, conversations_1.applyCustomerReaction)(companyId, msg.reactionTo, text || null, msg.receivedAt || Date.now())
            : false;
        if (!pinned && text) {
            await (0, conversations_1.appendMessage)(companyId, conversation, {
                direction: 'in',
                channel: msg.channel,
                text,
                from: 'customer',
                kind: 'reaction',
                providerId: msg.providerId,
                createdAt: msg.receivedAt || Date.now(),
            });
        }
        // Visible in the thread; not a customer turn. Do not refresh the 24h window,
        // ping Steve, or ask Dave to reply to a thumbs-up.
        if (text) {
            await (0, conversations_1.updateConversation)(companyId, conversation.id, {
                lastInboundAt: msg.receivedAt || Date.now(),
                unread: (conversation.unread || 0) + 1,
            });
        }
        return;
    }
    await (0, conversations_1.appendMessage)(companyId, conversation, {
        direction: 'in',
        channel: msg.channel,
        text,
        from: 'customer',
        providerId: msg.providerId,
        subject: msg.subject,
        createdAt: msg.receivedAt || Date.now(),
        ...(msg.address ? { fromAddress: msg.address } : {}),
        ...(msg.media ? { media: msg.media } : {}),
    });
    const patch = {
        lastInboundAt: msg.receivedAt || Date.now(),
        unread: (conversation.unread || 0) + 1,
    };
    // Meta's 24h free-text window is opened by a WhatsApp message and nothing else.
    // Letting an email refresh it would queue free text that Graph then refuses.
    if (msg.channel === 'whatsapp') {
        patch.lastCustomerMessageAt = msg.receivedAt || Date.now();
        if (conversation.channel !== 'whatsapp') {
            patch.channel = 'whatsapp';
            patch.address = msg.address;
        }
    }
    if (msg.emailThreadId && !options.forceNewConversation) {
        const inboundEmail = (0, identity_1.inboundEmailOf)(msg.channel, msg.address, contact);
        const taken = (await (0, conversations_1.listConversations)(companyId)).some(other => other.id !== conversation.id
            && other.emailThreadId === msg.emailThreadId
            && (0, identity_1.emailsConflict)(inboundEmail, (0, identity_1.existingEmailOf)(other)));
        if (!taken)
            patch.emailThreadId = msg.emailThreadId;
    }
    if (msg.subject)
        patch.emailSubject = msg.subject;
    if (isNew && inbox && home.reason !== 'single') {
        patch.routing = {
            inboxId: inbox.id,
            reason: home.reason,
            ...(home.ownerCompanyId ? { ownerCompanyId: home.ownerCompanyId } : {}),
        };
    }
    await (0, conversations_1.updateConversation)(companyId, conversation.id, patch);
    Object.assign(conversation, patch);
    if (msg.channel === 'whatsapp' && conversation.heldWords?.text) {
        await releaseHeldWords(companyId, conversation, settings);
    }
    if (home.stockItem && !conversation.vehicleInterest?.stockId) {
        const item = home.stockItem;
        const vehicleInterest = {
            stockId: item.id,
            title: item.title,
            ...(item.ledgerVehicleId ? { ledgerVehicleId: item.ledgerVehicleId } : {}),
            ...(item.ownerCompanyId ? { ownerCompanyId: item.ownerCompanyId } : {}),
        };
        await (0, conversations_1.updateConversation)(companyId, conversation.id, { vehicleInterest });
        conversation.vehicleInterest = vehicleInterest;
    }
    else if (lead) {
        await attachVehicle(companyId, conversation, lead);
    }
    if (!isNew) {
        await switchVehicleIfNamed(credentialCompanyId, companyId, conversation, msg, lead);
    }
    // The master switch. Bookkeeping and the new-lead ping still happen when Dave
    // is off, so a car routed to Chris is not silent in his inbox.
    if (isNew) {
        const unmatched = inbox && home.reason === 'fallback'
            ? ' (not matched to a ledger car — in the shared fallback inbox)'
            : '';
        await (0, alerts_1.sendOwnerAlert)(companyId, 'new_conversation', conversation, `#${conversation.shortId} New ${msg.channel} enquiry from ${(0, alerts_1.describeCustomer)(conversation)}${unmatched}: ${text.slice(0, 200)}`, customerPush(conversation, msg.channel, text));
    }
    else if (conversation.mode !== 'paused') {
        // Follow-up on a live thread: shade + PWA badge, not another WhatsApp to Steve.
        //
        // This used to fire only while the thread was Dave's. The effect was that the
        // moment Steve took one over, every reply from that customer arrived in silence
        // — no badge, no shade, nothing — which is the exact opposite of what taking a
        // thread over means (29 Aug: a customer's "Ok" sat unseen). Paused threads are
        // left out because they get their own alert further down.
        await (0, alerts_1.sendOwnerAlert)(companyId, 'inbound', conversation, `#${conversation.shortId} ${msg.channel} from ${(0, alerts_1.describeCustomer)(conversation)}: ${text.slice(0, 200)}`, customerPush(conversation, msg.channel, text));
    }
    if (!settings.enabled)
        return;
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
    // Paused means silent: no reply, no draft, just the alert.
    if (conversation.mode === 'paused') {
        await (0, alerts_1.sendOwnerAlert)(companyId, 'escalation', conversation, `#${conversation.shortId} ${(0, alerts_1.describeCustomer)(conversation)} (paused): ${text.slice(0, 400)}`);
        return;
    }
    /**
     * Steve is answering this one himself. Do not draft. He asked for Dave to
     * stay quiet unless he taps Ask Dave in the inbox — auto-drafting on every
     * inbound while he has the thread is how a prompt he never wanted kept
     * covering the compose box. The inbound shade already fired above.
     */
    if (conversation.mode !== 'agent') {
        return;
    }
    try {
        await (0, exports.runAgentTurn)(companyId, conversation, { ...msg, text }, settings);
    }
    catch (error) {
        // The turn is lost (AI outage, after retries). The customer is still waiting,
        // so this has to reach Steve as loudly as a draft would.
        console.error(`Agent turn failed for #${conversation.shortId} in company ${companyId}`, error);
        await (0, conversations_1.updateConversation)(companyId, conversation.id, {
            escalated: true,
            escalationReason: `agent error: ${String(error?.message || error).slice(0, 160)}`,
        });
        await (0, alerts_1.sendOwnerAlert)(companyId, 'error', conversation, `#${conversation.shortId} Dave could not reply to ${(0, alerts_1.describeCustomer)(conversation)} (AI service error). Please reply yourself: "${text.slice(0, 200)}"`);
    }
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
    // What was already true before this turn. An escalation is news the first time and
    // noise every time after: Dave kept reading a rude message from two days ago, at the
    // top of the replayed history, and escalating and handing over again on every single
    // inbound — five alerts in thirty seconds for one thread already sitting with Steve
    // (29 Aug).
    const wasEscalated = conversation.escalated === true;
    const wasEscalationReason = conversation.escalationReason || '';
    const wasWithAHuman = conversation.mode !== 'agent';
    if ((0, approval_1.agentTurnLimitReached)(history.filter(m => m.from === 'agent').length, settings.maxAgentTurns)) {
        await (0, conversations_1.updateConversation)(companyId, conversation.id, {
            mode: 'human',
            escalated: true,
            escalationReason: `Reached the ${settings.maxAgentTurns}-reply limit`,
        });
        conversation.mode = 'human';
        await (0, alerts_1.sendOwnerAlert)(companyId, 'escalation', conversation, `#${conversation.shortId} ${settings.agentName || 'Dave'} has had ${settings.maxAgentTurns} back-and-forths with ${(0, alerts_1.describeCustomer)(conversation)} — this one is yours.`);
        if (options.simulate)
            return { reply: approval_1.TURN_LIMIT_HANDOFF };
        if (!(0, approval_1.needsApproval)(conversation, settings)) {
            await deliverReply(companyId, conversation, settings, approval_1.TURN_LIMIT_HANDOFF, inbound);
            return { reply: approval_1.TURN_LIMIT_HANDOFF };
        }
        return { reply: '' };
    }
    // Email turns also get what the inbox knows: the rest of the thread, this sender's
    // earlier emails, and how the owner writes. Best-effort; never delays a reply for long.
    const emailContext = (!options.simulate && (inbound.channel === 'email' || conversation.emailThreadId))
        ? await (0, gmailContext_1.gatherEmailContext)({
            companyId,
            address: inbound.channel === 'email' ? inbound.address : conversation.contact?.email || '',
            threadId: inbound.emailThreadId || conversation.emailThreadId,
            history,
            inboundProviderId: inbound.providerId,
        })
        : undefined;
    // Everything the desk has put the agent right on, in front of it on every turn.
    // Cheap (one bounded read) and the only thing standing between a correction and
    // the same mistake next week.
    const lessons = options.simulate
        ? []
        : (0, lessons_1.formatLessons)(await (0, lessons_1.readLessons)(companyId).catch(() => []));
    const result = await (0, brain_1.runBrain)({
        companyId, conversation, history, inbound, settings, emailContext, lessons,
        ...(options.draftOnly ? { draftOnly: true } : {}),
    });
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
        // Already escalated for this same reason, or already handed over: he knows.
        const escalationIsNew = !!result.escalate
            && (!wasEscalated || wasEscalationReason !== result.escalate.reason)
            && !wasWithAHuman;
        if (result.escalate && escalationIsNew) {
            await (0, alerts_1.sendOwnerAlert)(companyId, 'escalation', conversation, `#${conversation.shortId} ESCALATION (${result.escalate.reason}): ${result.escalate.ownerMessage}`);
        }
        else if (result.escalate) {
            console.log(`#${conversation.shortId} escalation repeated (${result.escalate.reason}); not alerting again`);
        }
        if (result.askOwner) {
            await (0, alerts_1.sendOwnerAlert)(companyId, 'question', conversation, `#${conversation.shortId} ASK: ${result.askOwner.question}\nReply: ANSWER ${conversation.shortId} <text>`);
        }
        if (result.updates?.booking) {
            const booking = result.updates.booking;
            await (0, alerts_1.sendOwnerAlert)(companyId, 'booking', conversation, `#${conversation.shortId} BOOKING: ${booking.name} on ${booking.phone} wants ${booking.window} for ${conversation.vehicleInterest?.title || 'a viewing'}`);
        }
        // Handing over a thread that is already yours is not an event.
        if (result.handoff && !wasWithAHuman) {
            await (0, alerts_1.sendOwnerAlert)(companyId, 'escalation', conversation, `#${conversation.shortId} Handed over to you — the agent has stopped replying to ${(0, alerts_1.describeCustomer)(conversation)}.`);
        }
    }
    const reply = (result.reply || '').trim();
    if (!reply || options.simulate)
        return { reply };
    // Draft & Approve (Steve, 26 Aug): nothing goes out under the dealership's name
    // until Steve has read it. WhatsApp uses the same hold once that channel is sending.
    if (options.draftOnly || (0, approval_1.needsApproval)(conversation, settings)) {
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
/**
 * Held for approval unless this ledger ticked automatic reply on that channel.
 * The home company of the thread is what counts, so Steve's tick does not
 * send Chris's cars and the other way around.
 */
var approval_2 = require("./approval");
Object.defineProperty(exports, "needsApproval", { enumerable: true, get: function () { return approval_2.needsApproval; } });
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
/**
 * The agent's wording, the owner's name.
 *
 * Steve wants Dave to do the typing but the email to come from him (Steve, 26
 * Aug). The sign-off — the last few lines — has the agent's name swapped for the
 * owner's; the body is left alone, and the thread records it as the owner.
 */
const signAsOwner = (text, agentName, ownerName) => {
    const agent = agentName.trim();
    const owner = ownerName.trim();
    if (!agent || !owner || agent.toLowerCase() === owner.toLowerCase())
        return text;
    const lines = text.split('\n');
    const tail = Math.max(0, lines.length - 5);
    const pattern = new RegExp(`\\b${agent.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g');
    for (let i = tail; i < lines.length; i++)
        lines[i] = lines[i].replace(pattern, owner);
    return lines.join('\n');
};
exports.signAsOwner = signAsOwner;
const approveDraft = async (companyId, convId, edited, signAs = 'agent') => {
    const conversation = await (0, conversations_1.getConversation)(companyId, convId);
    if (!conversation)
        throw new Error(`Conversation ${convId} not found`);
    const draft = conversation.pendingDraft;
    if (!draft)
        throw new Error('There is no draft waiting on that one.');
    const settings = await (0, conversations_1.readSettings)(companyId);
    let text = (edited || draft.text || '').trim();
    if (signAs === 'owner')
        text = (0, exports.signAsOwner)(text, settings.agentName || 'Dave', settings.ownerName || '');
    if (!text)
        throw new Error('There is nothing to send.');
    const sendAfter = queueSendAfter(settings, 0);
    const result = await enqueueOrSend(companyId, conversation, settings, text, 'auto', signAs, { sendAfter });
    await (0, conversations_1.updateConversation)(companyId, convId, { pendingDraft: null });
    delete conversation.pendingDraft;
    return { text, name: (0, alerts_1.describeCustomer)(conversation), sendAfter: result.sendAfter, sent: result.sent };
};
exports.approveDraft = approveDraft;
/** Throw the held draft away. Nothing is sent and the agent is not asked to try again. */
const discardDraft = async (companyId, convId) => {
    const conversation = await (0, conversations_1.getConversation)(companyId, convId);
    if (!conversation)
        throw new Error(`Conversation ${convId} not found`);
    const had = !!conversation.pendingDraft;
    // Binning a draft has to mean something the next time the thread is opened, or
    // the inbox cheerfully writes the same unwanted words again. Pinned to the
    // message it was a reply to, so the veto lifts when the customer says something new.
    const history = await (0, conversations_1.readHistory)(companyId, convId);
    const lastCustomer = [...history].reverse().find(m => m.from === 'customer');
    await (0, conversations_1.updateConversation)(companyId, convId, {
        ...(had ? { pendingDraft: null } : {}),
        draftDeclinedFor: lastCustomer?.id || `none:${Date.now()}`,
    });
    if (had)
        delete conversation.pendingDraft;
    return { had };
};
exports.discardDraft = discardDraft;
/**
 * Queue Dave's reply on the channel they are on.
 *
 * First email to a lead who left a mobile also sends the WhatsApp opener once
 * (the desk still chooses "as well" from the inbox after that). A bounced
 * address is dropped. Outside the 24h window the opener template is used —
 * Meta will not take Dave's email wording as free text until they write in.
 */
const deliverReply = async (companyId, conversation, settings, reply, inbound) => {
    const sendAfter = queueSendAfter(settings, (0, outbox_1.randomDelayMs)(settings.replyDelaySeconds));
    const inboundPhone = inbound.channel === 'email' ? undefined : inbound.extractedPhones?.[0];
    if (inboundPhone && !conversation.contact?.phone) {
        const e164 = (0, types_1.toE164)(inboundPhone);
        const claimed = await (0, conversations_1.indexContactIfFree)(companyId, 'whatsapp', e164, conversation.id);
        if (claimed) {
            const contact = { ...(conversation.contact || {}), phone: e164 };
            conversation.contact = contact;
            await (0, conversations_1.updateConversation)(companyId, conversation.id, { contact });
        }
    }
    const phone = (0, sendTargets_1.contactPhone)(conversation);
    if (phone) {
        await (0, conversations_1.indexContactIfFree)(companyId, 'whatsapp', phone, conversation.id);
        await (0, conversations_1.indexContactIfFree)(companyId, 'sms', phone, conversation.id);
        await (0, inboxRouting_1.mirrorConversationContacts)(companyId, conversation, 'whatsapp', phone);
    }
    const live = settings.channels.whatsapp && await (0, inboxRouting_1.isWhatsAppLiveFor)(companyId);
    const firstEmailToMobile = conversation.channel === 'email'
        && !!phone
        && !conversation.lastOutboundAt
        && settings.preferWhatsAppReply !== false;
    const targets = (0, sendTargets_1.resolveSendTargets)(conversation, firstEmailToMobile ? 'both' : 'auto')
        .filter(target => target.channel !== 'whatsapp' || live);
    for (const target of targets) {
        const job = {
            companyId,
            convId: conversation.id,
            channel: target.channel,
            to: target.to,
            text: reply,
            sendAfter,
        };
        if (target.channel === 'email') {
            job.subject = conversation.emailSubject || inbound.subject;
            job.emailThreadId = conversation.emailThreadId;
        }
        if (target.channel === 'whatsapp' && target.templateOnly) {
            const fallback = (0, whatsapp_1.templateFallbackFor)(conversation.contact?.firstName, conversation.vehicleInterest?.title);
            Object.assign(job, fallback);
            job.text = (0, whatsapp_1.renderFallbackTemplate)(fallback.templateParams || []);
        }
        await (0, outbox_1.enqueue)(job);
    }
    if (conversation.emailBounce && phone && live && conversation.channel !== 'whatsapp') {
        const moved = { channel: 'whatsapp', address: phone };
        await (0, conversations_1.updateConversation)(companyId, conversation.id, moved);
        Object.assign(conversation, moved);
    }
};
/**
 * Steve wants to start on WhatsApp. Meta's rule: until the customer has written
 * to us on WhatsApp, the only message that can go is an approved template. So the
 * opener goes now (once), and any words of his own wait on the thread and go the
 * moment their first WhatsApp arrives. Nothing is ever sent over his name that he
 * did not write (29 Aug), and nothing he wrote is silently dropped (30 Aug).
 */
const openerThenHold = async (companyId, conversation, text, openerOnly) => {
    const who = conversation.contact?.firstName || 'they';
    const phone = (0, sendTargets_1.contactPhone)(conversation);
    let sentOpener = false;
    if (phone && !conversation.whatsappOpenerAt) {
        const fallback = (0, whatsapp_1.templateFallbackFor)(conversation.contact?.firstName, conversation.vehicleInterest?.title);
        await (0, outbox_1.sendNow)({
            companyId,
            convId: conversation.id,
            channel: 'whatsapp',
            to: phone,
            text: (0, whatsapp_1.renderFallbackTemplate)(fallback.templateParams || [], { bounced: !!conversation.emailBounce }),
            ...fallback,
            sendAfter: Date.now(),
            id: 'immediate',
            attempts: 0,
            createdAt: Date.now(),
        }, 'agent');
        const at = Date.now();
        await (0, conversations_1.updateConversation)(companyId, conversation.id, { whatsappOpenerAt: at });
        conversation.whatsappOpenerAt = at;
        sentOpener = true;
    }
    if (openerOnly || !text.trim()) {
        return {
            sentOpener,
            held: false,
            message: sentOpener
                ? `Opener sent on WhatsApp. Your own words can go once ${who} replies.`
                : `The opener already went on ${whenOn(conversation.whatsappOpenerAt)}. Your own words can go once ${who} replies.`,
        };
    }
    const heldWords = { text: text.trim(), at: Date.now() };
    await (0, conversations_1.updateConversation)(companyId, conversation.id, { heldWords });
    conversation.heldWords = heldWords;
    return {
        sentOpener,
        held: true,
        message: sentOpener
            ? `Opener sent on WhatsApp. Your words are waiting and go the moment ${who} replies.`
            : `Your words are waiting and go the moment ${who} replies on WhatsApp (opener went ${whenOn(conversation.whatsappOpenerAt)}).`,
    };
};
const whenOn = (at) => at
    ? new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(at))
    : 'earlier';
/** Their first WhatsApp has opened the window: send what Steve wrote while waiting. */
const releaseHeldWords = async (companyId, conversation, settings) => {
    const words = conversation.heldWords?.text;
    if (!words)
        return;
    await (0, conversations_1.updateConversation)(companyId, conversation.id, { heldWords: null });
    conversation.heldWords = null;
    try {
        await enqueueOrSend(companyId, conversation, settings, words, 'whatsapp', 'owner');
    }
    catch (error) {
        console.error(`Held words for #${conversation.shortId} could not be sent`, error);
        await (0, alerts_1.sendOwnerAlert)(companyId, 'error', conversation, `#${conversation.shortId} Your waiting WhatsApp to ${conversation.contact?.firstName || 'them'} could not be sent: ${error?.message || 'unknown error'}`);
    }
};
/** Why "Me" could not go out, in words Steve can act on. */
const ownerOutsideWindowMessage = (conversation) => {
    const who = conversation.contact?.firstName || 'They';
    const at = conversation.lastCustomerMessageAt;
    const when = at
        ? new Intl.DateTimeFormat('en-GB', {
            timeZone: 'Europe/London', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
        }).format(new Date(at))
        : 'never';
    return `Your words were not sent. ${who} last messaged on ${when}, over 24 hours ago, and WhatsApp only allows an approved opener after that. Send the opener from Dave, or reply by email.`;
};
exports.ownerOutsideWindowMessage = ownerOutsideWindowMessage;
const enqueueOrSend = async (companyId, conversation, settings, text, via, from, extra) => {
    const sendAfter = extra?.sendAfter ?? Date.now();
    const live = settings.channels.whatsapp && await (0, inboxRouting_1.isWhatsAppLiveFor)(companyId);
    const targets = (0, sendTargets_1.resolveSendTargets)(conversation, via);
    const sent = [];
    let skippedWhatsApp;
    let held = false;
    const phone = (0, sendTargets_1.contactPhone)(conversation);
    if (phone) {
        await (0, conversations_1.indexContactIfFree)(companyId, 'whatsapp', phone, conversation.id);
        await (0, conversations_1.indexContactIfFree)(companyId, 'sms', phone, conversation.id);
        await (0, inboxRouting_1.mirrorConversationContacts)(companyId, conversation, 'whatsapp', phone);
    }
    for (const target of targets) {
        if (target.channel === 'whatsapp' && !live) {
            skippedWhatsApp = 'WhatsApp is not live yet.';
            continue;
        }
        if (extra?.media && target.channel !== 'whatsapp')
            continue;
        if (extra?.media && target.channel === 'whatsapp' && target.templateOnly) {
            throw new Error('WhatsApp only accepts photos, videos and files within 24 hours of their last message.');
        }
        const job = {
            companyId,
            convId: conversation.id,
            channel: target.channel,
            to: target.to,
            text,
            sendAfter,
            ...(from === 'owner' ? { from } : {}),
            ...(target.channel === 'email'
                ? { subject: conversation.emailSubject, emailThreadId: conversation.emailThreadId }
                : {}),
            ...(extra?.media && target.channel === 'whatsapp' ? { media: extra.media } : {}),
        };
        if (target.channel === 'whatsapp' && target.templateOnly && !extra?.media) {
            // "Me" means the customer gets exactly these words. Outside the 24h window
            // WhatsApp will not carry them, and quietly posting a canned opener over
            // Steve's name instead is how a customer got told her email had bounced
            // when it had not, twice (29 Aug). His own messages refuse; Dave's openers
            // still fall back, because a template is what they are.
            if (from === 'owner') {
                const note = await openerThenHold(companyId, conversation, text, extra?.opener === true);
                if (note.sentOpener)
                    sent.push('whatsapp');
                if (note.held)
                    held = true;
                skippedWhatsApp = note.message;
                continue;
            }
            const fallback = (0, whatsapp_1.templateFallbackFor)(conversation.contact?.firstName, conversation.vehicleInterest?.title);
            Object.assign(job, fallback);
            job.text = (0, whatsapp_1.renderFallbackTemplate)(fallback.templateParams || [], { bounced: !!conversation.emailBounce });
        }
        try {
            if (sendAfter > Date.now() + 2000) {
                await (0, outbox_1.enqueue)(job);
            }
            else {
                await (0, outbox_1.sendNow)({
                    ...job,
                    id: 'immediate',
                    attempts: 0,
                    createdAt: Date.now(),
                }, from);
            }
            sent.push(target.channel);
        }
        catch (error) {
            if (target.channel === 'whatsapp' && sent.length) {
                skippedWhatsApp = error?.message || 'WhatsApp could not be sent.';
                continue;
            }
            throw error;
        }
    }
    if (!sent.length && !held) {
        throw new Error(skippedWhatsApp || 'There is nowhere to send that. No working email or mobile is on file.');
    }
    if (conversation.emailBounce && phone && live && conversation.channel !== 'whatsapp') {
        await (0, conversations_1.updateConversation)(companyId, conversation.id, { channel: 'whatsapp', address: phone });
        conversation.channel = 'whatsapp';
        conversation.address = phone;
    }
    return { sent, skippedWhatsApp, sendAfter };
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
    const companyId = await (0, conversations_1.requireInboxAccess)(context, data?.companyId);
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
/**
 * The reply box in the app. Sends immediately — somebody is sitting there watching.
 *
 * The extra memory and time are for attachments: a video goes through ffmpeg on the
 * way to Meta (see channels/videoCompress.ts), which the 256 MB default cannot do.
 */
exports.salesAgentSendReply = functions
    .runWith({
    secrets: [...conversations_1.BRAIN_SECRETS, 'GMAIL_CLIENT_ID', 'GMAIL_CLIENT_SECRET'],
    timeoutSeconds: 300,
    memory: '2GB',
})
    .https.onCall(async (data, context) => {
    const companyId = await (0, conversations_1.requireInboxAccess)(context, data?.companyId);
    const convId = String(data?.convId || '');
    const text = String(data?.text || '').trim();
    const rawMedia = data?.media && typeof data.media === 'object' ? data.media : null;
    const media = rawMedia?.url && (rawMedia.kind === 'image' || rawMedia.kind === 'video' || rawMedia.kind === 'document')
        ? {
            kind: rawMedia.kind,
            url: String(rawMedia.url),
            ...(rawMedia.mime ? { mime: String(rawMedia.mime) } : {}),
            ...(rawMedia.filename ? { filename: String(rawMedia.filename) } : {}),
        }
        : undefined;
    if (!text && !media)
        throw new functions.https.HttpsError('invalid-argument', 'There is nothing to send.');
    const conversation = await (0, conversations_1.getConversation)(companyId, convId);
    if (!conversation)
        throw new functions.https.HttpsError('not-found', 'That conversation no longer exists.');
    const givenPhone = String(data?.phone || '').trim();
    if (givenPhone && !conversation.contact?.phone) {
        const e164 = (0, types_1.toE164)(givenPhone);
        const contact = { ...(conversation.contact || {}), phone: e164 };
        await (0, conversations_1.updateConversation)(companyId, convId, { contact });
        conversation.contact = contact;
    }
    const viaRaw = String(data?.via || 'auto');
    const via = viaRaw === 'email' || viaRaw === 'whatsapp' || viaRaw === 'both' ? viaRaw : 'auto';
    if (media && via === 'email') {
        throw new functions.https.HttpsError('failed-precondition', 'Photos, videos and files can only be sent on WhatsApp.');
    }
    const settings = await (0, conversations_1.readSettings)(companyId);
    try {
        const opener = data?.opener === true;
        const result = await enqueueOrSend(companyId, conversation, settings, text || (media ? `[${media.kind}]` : ''), via, 'owner', { media, opener });
        // Same contract as REPLY on WhatsApp: his words went out as written,
        // Dave goes quiet, and a leftover draft must not sit there to be
        // approved by accident.
        await (0, conversations_1.updateConversation)(companyId, convId, {
            unread: 0,
            mode: 'human',
            pendingDraft: null,
            pendingQuestion: null,
        });
        // Nothing actually left the building. Returning ok here is what let the app
        // say "message sent" while the customer got nothing, or got something Steve
        // never wrote (29 Aug).
        if (!result.sent.length && !result.held) {
            throw new functions.https.HttpsError('failed-precondition', result.skippedWhatsApp || 'That message could not be sent.');
        }
        return { ok: true, sent: result.sent, held: result.held === true, skippedWhatsApp: result.skippedWhatsApp || null };
    }
    catch (error) {
        if (error instanceof functions.https.HttpsError)
            throw error;
        const message = error?.message || 'The message could not be sent.';
        if (/not live/i.test(message) || /nowhere to send/i.test(message) || /not sent/i.test(message)) {
            throw new functions.https.HttpsError('failed-precondition', message);
        }
        throw new functions.https.HttpsError('unavailable', message);
    }
});
/** Answer the question the agent is waiting on, from the app instead of by WhatsApp. */
exports.salesAgentAnswerQuestion = functions
    .runWith({ secrets: [...conversations_1.BRAIN_SECRETS, 'GMAIL_CLIENT_ID', 'GMAIL_CLIENT_SECRET'], timeoutSeconds: 120 })
    .https.onCall(async (data, context) => {
    const companyId = await (0, conversations_1.requireInboxAccess)(context, data?.companyId);
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
    const companyId = await (0, conversations_1.requireInboxAccess)(context, data?.companyId);
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
    .runWith({
    secrets: [...conversations_1.BRAIN_SECRETS, 'GMAIL_CLIENT_ID', 'GMAIL_CLIENT_SECRET'],
    timeoutSeconds: 300,
    memory: '2GB',
})
    .https.onCall(async (data, context) => {
    const companyId = await (0, conversations_1.requireInboxAccess)(context, data?.companyId);
    const convId = String(data?.convId || '');
    const edited = data?.text === undefined ? undefined : String(data.text).trim();
    const signAs = data?.signAs === 'owner' ? 'owner' : 'agent';
    try {
        const { text, sendAfter, sent } = await (0, exports.approveDraft)(companyId, convId, edited, signAs);
        return { ok: true, text, sendAfter, sent };
    }
    catch (error) {
        throw new functions.https.HttpsError('failed-precondition', error?.message || 'That draft could not be sent.');
    }
});
/**
 * Is there a customer message sitting here that nobody has answered?
 *
 * The last message in the thread being from the customer is the whole test: an
 * outbound after it means it was dealt with, and a draft already waiting means
 * there is nothing to write.
 */
const awaitingReply = (messages) => {
    const last = [...messages].reverse().find(m => m.from === 'customer' || m.direction === 'out');
    return !!last && last.from === 'customer';
};
exports.awaitingReply = awaitingReply;
/**
 * Write a draft for a message that is already sitting there.
 *
 * Called when Steve taps Ask Dave, not when he merely opens a thread. Opening
 * used to fire this automatically and covered the box he wanted to type in.
 * Idempotent: an existing draft is returned rather than replaced.
 */
const draftNow = async (companyId, convId, force = false) => {
    const settings = await (0, conversations_1.readSettings)(companyId);
    const conversation = await (0, conversations_1.getConversation)(companyId, convId);
    if (!conversation)
        throw new Error(`Conversation ${convId} not found`);
    if (conversation.pendingDraft && !force)
        return { ok: true, drafted: false, reason: 'already-drafted' };
    if (conversation.pendingQuestion)
        return { ok: true, drafted: false, reason: 'agent-is-asking' };
    if (conversation.mode === 'paused')
        return { ok: true, drafted: false, reason: 'paused' };
    const history = await (0, conversations_1.readHistory)(companyId, convId);
    if (!(0, exports.awaitingReply)(history) && !force)
        return { ok: true, drafted: false, reason: 'nothing-waiting' };
    const lastCustomer = [...history].reverse().find(m => m.from === 'customer');
    if (!lastCustomer)
        return { ok: true, drafted: false, reason: 'nothing-waiting' };
    // He has already read Dave's answer to this one and thrown it away.
    if (conversation.draftDeclinedFor === lastCustomer.id && !force) {
        return { ok: true, drafted: false, reason: 'declined' };
    }
    await (0, exports.runAgentTurn)(companyId, conversation, {
        companyId,
        channel: lastCustomer.channel || conversation.channel,
        address: conversation.address,
        text: lastCustomer.text || '',
        providerId: `draft-now:${convId}:${lastCustomer.id}`,
        receivedAt: lastCustomer.createdAt || Date.now(),
        ...(conversation.emailSubject ? { subject: conversation.emailSubject } : {}),
    }, settings, { draftOnly: true });
    return { ok: true, drafted: true };
};
exports.draftNow = draftNow;
/**
 * Ask Dave to write a reply to whatever the customer last said, without sending it.
 *
 * Fired from the inbox Ask Dave control, not from merely opening a thread.
 */
exports.salesAgentDraftNow = functions
    .runWith({ secrets: [...conversations_1.BRAIN_SECRETS, 'GMAIL_CLIENT_ID', 'GMAIL_CLIENT_SECRET'], timeoutSeconds: 120 })
    .https.onCall(async (data, context) => {
    const companyId = await (0, conversations_1.requireInboxAccess)(context, data?.companyId);
    const convId = String(data?.convId || '');
    try {
        return await (0, exports.draftNow)(companyId, convId, data?.force === true);
    }
    catch (error) {
        throw new functions.https.HttpsError('internal', error?.message || 'Dave could not draft a reply.');
    }
});
/** Bin the draft. The conversation stays with the agent unless you also take it over. */
exports.salesAgentDiscardDraft = functions.https.onCall(async (data, context) => {
    const companyId = await (0, conversations_1.requireInboxAccess)(context, data?.companyId);
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
    await (0, inboxRouting_1.bindInboxChannelsFromPrivate)(companyId);
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
exports.salesAgentStartWhatsApp = functions
    .runWith({ timeoutSeconds: 60 })
    .https.onCall(async (data, context) => {
    const companyId = await (0, conversations_1.requireMember)(context, data?.companyId);
    try {
        return {
            ok: true,
            ...(await (0, startWhatsApp_1.startOutboundWhatsApp)({
                companyId,
                phone: String(data?.phone || ''),
                firstName: data?.firstName ? String(data.firstName) : undefined,
                lastName: data?.lastName ? String(data.lastName) : undefined,
                vehicleTitle: data?.vehicleTitle ? String(data.vehicleTitle) : undefined,
                leadId: data?.leadId ? String(data.leadId) : undefined,
            })),
        };
    }
    catch (error) {
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
 * The other company is named by id — Steve is not logged into Chris's ledger,
 * and must not have to be. Connecting the Cloud API is not the same as sending;
 * `whatsappLive` stays off unless it is passed true.
 */
exports.salesAgentSaveSharedInbox = functions.https.onCall(async (data, context) => {
    const companyId = await (0, conversations_1.requireMember)(context, data?.companyId);
    const members = Array.isArray(data?.memberCompanyIds) ? data.memberCompanyIds.map(String) : [];
    const existing = await (0, inboxRouting_1.inboxForMember)(companyId);
    const blocked = (0, inboxRouting_1.sharedInboxSaveBlocked)(companyId, existing);
    if (blocked)
        throw new functions.https.HttpsError('permission-denied', blocked);
    if (!members.length && !existing) {
        throw new functions.https.HttpsError('invalid-argument', 'Name at least one other Dealer Ledger Pro company that shares this inbox.');
    }
    const others = [...members, ...(data?.fallbackCompanyId ? [String(data.fallbackCompanyId)] : [])]
        .map(id => String(id || '').trim())
        .filter(id => id && id !== companyId);
    for (const other of Array.from(new Set(others))) {
        if (!(await (0, inboxRouting_1.companyLooksReal)(other))) {
            throw new functions.https.HttpsError('not-found', `No Dealer Ledger Pro company exists for ${other}.`);
        }
        const theirs = await (0, inboxRouting_1.inboxForMember)(other);
        if (theirs && theirs.credentialCompanyId !== companyId && theirs.id !== existing?.id) {
            throw new functions.https.HttpsError('already-exists', 'That company already shares a different inbox. Remove it there first.');
        }
    }
    try {
        const inbox = await (0, inboxRouting_1.saveSharedInbox)({
            credentialCompanyId: companyId,
            memberCompanyIds: members.length ? members : (existing?.memberCompanyIds || []),
            fallbackCompanyId: data?.fallbackCompanyId ? String(data.fallbackCompanyId) : undefined,
            name: data?.name ? String(data.name) : undefined,
            whatsappLive: data?.whatsappLive === undefined ? undefined : data.whatsappLive === true,
        });
        return { ok: true, inbox };
    }
    catch (error) {
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