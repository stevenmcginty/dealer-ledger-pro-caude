"use strict";
/**
 * Send a saved SalesDocument PDF to its customer, straight from the invoice modal.
 *
 * Two channels, one rule that shapes everything: Meta will not carry a file on
 * WhatsApp outside the 24h customer-service window. So the WhatsApp button means
 * "document if their thread is live, email plus an approved nudge if it is not".
 * The decision is made BEFORE anything is sent, not by the outbox's gates — by the
 * time a media job hits applyWhatsAppWindow there is no way to fall back to email.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendInvoiceDocument = exports.INVOICE_NOTICE_TEMPLATE = exports.planInvoiceSend = void 0;
const conversations_1 = require("./conversations");
const inboxRouting_1 = require("./inboxRouting");
const outbox_1 = require("./outbox");
const types_1 = require("./types");
const identity_1 = require("./identity");
/**
 * Pure: given what we have and what was asked for, decide the route.
 *
 *  - WhatsApp, thread live            -> the PDF as a WhatsApp document.
 *  - WhatsApp, thread cold, email     -> the PDF by email + invoice_notice nudge.
 *  - WhatsApp, thread cold, no email  -> refuse; nothing can carry the file.
 *  - Email                            -> the PDF by email.
 */
const planInvoiceSend = (input) => {
    if (input.via === 'email') {
        return input.hasEmail
            ? { action: 'email', nudgeWhatsApp: false }
            : { action: 'refuse', reason: 'There is no email address on this document. Add one, or send it on WhatsApp.' };
    }
    if (!input.hasPhone) {
        return { action: 'refuse', reason: 'There is no mobile number on this document. Add one, or send it by email.' };
    }
    if (input.windowOpen)
        return { action: 'whatsapp-document' };
    if (input.hasEmail)
        return { action: 'email', nudgeWhatsApp: true };
    return {
        action: 'refuse',
        reason: 'WhatsApp cannot take files until the customer messages you first, and there is no email on this document. Add an email, or ask them to send you a WhatsApp message.',
    };
};
exports.planInvoiceSend = planInvoiceSend;
exports.INVOICE_NOTICE_TEMPLATE = 'invoice_notice';
const firstNameOf = (customerName) => {
    const first = (customerName || '').trim().split(/\s+/)[0] || '';
    return first;
};
/**
 * Find-or-create the customer's thread, send the PDF down the planned route, and
 * leave the thread the way the reply box leaves it: read, and Dave quiet — this
 * was the desk speaking, not the agent.
 */
const sendInvoiceDocument = async (input) => {
    const email = (input.email || '').trim().toLowerCase();
    const hasEmail = (0, identity_1.isUsableEmail)(email);
    const phone = (0, types_1.parseOutboundPhone)(input.phone || '');
    const hasPhone = !!phone;
    const firstName = firstNameOf(input.customerName);
    const lastName = (input.customerName || '').trim().split(/\s+/).slice(1).join(' ') || undefined;
    const contact = {
        ...(hasEmail ? { email } : {}),
        ...(hasPhone ? { phone: phone } : {}),
        ...(firstName ? { firstName } : {}),
        ...(lastName ? { lastName } : {}),
    };
    // The thread is keyed on the channel the PDF is meant for. When the plan
    // falls back to email with a WhatsApp nudge, both sends land on the same
    // thread so the inbox shows the whole story in one place.
    const keyChannel = input.via === 'whatsapp' && hasPhone ? 'whatsapp' : 'email';
    const keyAddress = keyChannel === 'whatsapp' ? phone : email;
    if (keyChannel === 'email' && !hasEmail) {
        throw new Error('There is no email address on this document. Add one, or send it on WhatsApp.');
    }
    const inbox = await (0, inboxRouting_1.inboxForMember)(input.companyId);
    if (keyChannel === 'whatsapp') {
        const shared = inbox
            ? await (0, inboxRouting_1.findExistingSharedContact)(inbox, 'whatsapp', phone, contact)
            : null;
        if (shared && shared.companyId !== input.companyId) {
            throw new Error('This number already has a thread in the other ledger. Send it from there rather than starting a second one.');
        }
    }
    const opened = await (0, conversations_1.findOrCreateConversation)(input.companyId, keyChannel, keyAddress, contact, {
        vehicleOfInterest: input.vehicleTitle,
    });
    let conversation = opened.conversation;
    const created = opened.isNew;
    if (created) {
        // We wrote to them; they have not written back. findOrCreate stamps
        // "now" on a WhatsApp thread because the webhook path needs it, but
        // that would fabricate an open 24h window here and Meta would reject
        // the document (code 131047). Route on the truth: the window is shut.
        const patch = {
            mode: 'human',
            ...(keyChannel === 'whatsapp' ? { lastCustomerMessageAt: 0 } : {}),
        };
        if (input.vehicleTitle) {
            patch.vehicleInterest = { ...(conversation.vehicleInterest || {}), title: input.vehicleTitle };
        }
        if (inbox) {
            patch.routing = { inboxId: inbox.id, reason: 'owner', ownerCompanyId: input.companyId };
        }
        await (0, conversations_1.updateConversation)(input.companyId, conversation.id, patch);
        Object.assign(conversation, patch);
    }
    // A WhatsApp-keyed thread that also carries an email should be findable by
    // that email, or their reply opens a second thread nobody is watching.
    if (hasEmail && conversation.address !== email) {
        await (0, conversations_1.indexContactIfFree)(input.companyId, 'email', email, conversation.id);
    }
    if (keyChannel === 'whatsapp') {
        await (0, inboxRouting_1.mirrorConversationContacts)(input.companyId, conversation, 'whatsapp', phone);
    }
    // The window is judged on the conversation as it stands now — which for a
    // thread we just opened is always shut (see the patch above).
    const windowOpen = keyChannel === 'whatsapp'
        && conversation.lastCustomerMessageAt > 0
        && Date.now() - conversation.lastCustomerMessageAt < 24 * 3600000;
    const plan = (0, exports.planInvoiceSend)({ via: input.via, hasEmail, hasPhone, windowOpen });
    if (plan.action === 'refuse')
        throw new Error(plan.reason);
    const settings = await (0, conversations_1.readSettings)(input.companyId);
    const dealership = settings.dealershipName || 'us';
    const signature = settings.signature ? `\n\n${settings.signature}` : '';
    const label = input.documentLabel || 'invoice';
    const car = input.vehicleTitle ? ` for the ${input.vehicleTitle}` : '';
    let sent;
    let nudgeHeld;
    if (plan.action === 'whatsapp-document') {
        await (0, outbox_1.sendNow)({
            id: 'immediate',
            companyId: input.companyId,
            convId: conversation.id,
            channel: 'whatsapp',
            to: phone,
            text: `Your ${label}${car} from ${dealership}.`,
            media: input.pdf,
            sendAfter: Date.now(),
            attempts: 0,
            createdAt: Date.now(),
        }, 'owner');
        sent = 'whatsapp';
    }
    else {
        await (0, outbox_1.sendNow)({
            id: 'immediate',
            companyId: input.companyId,
            convId: conversation.id,
            channel: 'email',
            to: email,
            subject: `Your ${label} #${input.invoiceNumber}`,
            text: `Hi ${firstName || 'there'}, your ${label}${car} from ${dealership} is attached.${signature}`,
            media: input.pdf,
            sendAfter: Date.now(),
            attempts: 0,
            createdAt: Date.now(),
        }, 'owner');
        sent = 'email';
        if (plan.nudgeWhatsApp && phone) {
            try {
                await (0, outbox_1.sendNow)({
                    id: 'immediate',
                    companyId: input.companyId,
                    convId: conversation.id,
                    channel: 'whatsapp',
                    to: phone,
                    text: '',
                    templateName: exports.INVOICE_NOTICE_TEMPLATE,
                    templateParams: [firstName || 'there', label],
                    sendAfter: Date.now(),
                    attempts: 0,
                    createdAt: Date.now(),
                }, 'owner');
                sent = 'email+whatsapp';
            }
            catch (error) {
                // The email with the PDF went out; the nudge is a courtesy. Say
                // what happened rather than failing a send that succeeded.
                nudgeHeld = error?.message || String(error);
            }
        }
    }
    await (0, conversations_1.updateConversation)(input.companyId, conversation.id, {
        unread: 0,
        mode: 'human',
        pendingDraft: null,
    });
    return { convId: conversation.id, created, sent, ...(nudgeHeld ? { nudgeHeld } : {}) };
};
exports.sendInvoiceDocument = sendInvoiceDocument;
//# sourceMappingURL=invoiceSend.js.map