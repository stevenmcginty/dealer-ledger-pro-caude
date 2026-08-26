"use strict";
/**
 * Start a WhatsApp thread from a ledger, to a number that has not written in.
 *
 * Steve and Chris both need this: a walk-in, a phone lead, a CRM record with a
 * mobile. The thread is created on the company that pressed the button. The
 * Cloud API tokens still come from the shared inbox's credential company, so
 * Chris's portal sends from the same Radlett number as Steve's.
 *
 * A first message to someone new is outside Meta's 24-hour window, so it has
 * to be an approved template (`enquiry_followup`). Free text waits until they
 * reply. Nothing is sent while `whatsappLive` is off; the thread is still
 * opened so the button works before verification.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.startOutboundWhatsApp = exports.decideOutboundHome = exports.parseOutboundPhone = void 0;
const conversations_1 = require("./conversations");
const inboxRouting_1 = require("./inboxRouting");
const outbox_1 = require("./outbox");
const whatsapp_1 = require("./channels/whatsapp");
const types_1 = require("./types");
Object.defineProperty(exports, "parseOutboundPhone", { enumerable: true, get: function () { return types_1.parseOutboundPhone; } });
const decideOutboundHome = (callingCompanyId, existing) => {
    if (!existing)
        return { action: 'create' };
    if (existing.companyId === callingCompanyId)
        return { action: 'reuse', convId: existing.convId };
    return { action: 'other_ledger' };
};
exports.decideOutboundHome = decideOutboundHome;
const openerText = (firstName, vehicleTitle) => {
    const name = (firstName || 'there').trim() || 'there';
    const vehicle = (vehicleTitle || 'car').trim() || 'car';
    return `Hi ${name}, thanks for enquiring about the ${vehicle}. It's still available. Would you like any more details, or to arrange a viewing or test drive?`;
};
const startOutboundWhatsApp = async (input) => {
    const phone = (0, types_1.parseOutboundPhone)(input.phone);
    if (!phone)
        throw new Error('That does not look like a phone number.');
    const companyId = input.companyId;
    const contact = {
        phone,
        ...(input.firstName ? { firstName: input.firstName.trim() } : {}),
        ...(input.lastName ? { lastName: input.lastName.trim() } : {}),
        ...(input.leadId ? { leadId: input.leadId } : {}),
    };
    const inbox = await (0, inboxRouting_1.inboxForMember)(companyId);
    const shared = inbox
        ? await (0, inboxRouting_1.findExistingSharedContact)(inbox, 'whatsapp', phone, contact)
        : null;
    const decision = (0, exports.decideOutboundHome)(companyId, shared);
    if (decision.action === 'other_ledger') {
        throw new Error('This number already has a thread in the other ledger. Open it there rather than starting a second one.');
    }
    let conversation;
    let created = false;
    if (decision.action === 'reuse') {
        const existing = await (0, conversations_1.getConversation)(companyId, decision.convId);
        if (!existing)
            throw new Error('That conversation no longer exists.');
        conversation = existing;
    }
    else {
        const opened = await (0, conversations_1.findOrCreateConversation)(companyId, 'whatsapp', phone, contact, {
            vehicleOfInterest: input.vehicleTitle,
        });
        conversation = opened.conversation;
        created = opened.isNew;
        if (created) {
            const patch = {
                mode: 'human',
                // We wrote to them. They have not written back, so Meta will not
                // take free text until they do. findOrCreate stamps "now" because
                // the channel is WhatsApp; that would lie about the 24h window.
                lastCustomerMessageAt: 0,
            };
            if (input.vehicleTitle) {
                patch.vehicleInterest = {
                    ...(conversation.vehicleInterest || {}),
                    title: input.vehicleTitle,
                };
            }
            if (inbox) {
                patch.routing = { inboxId: inbox.id, reason: 'owner', ownerCompanyId: companyId };
            }
            await (0, conversations_1.updateConversation)(companyId, conversation.id, patch);
            Object.assign(conversation, patch);
        }
        await (0, inboxRouting_1.mirrorConversationContacts)(companyId, conversation, 'whatsapp', phone);
    }
    const live = (await (0, inboxRouting_1.isWhatsAppLiveFor)(companyId))
        && (await (0, conversations_1.readSettings)(companyId)).channels.whatsapp === true;
    if (!created || !live) {
        return { convId: conversation.id, created, sent: false, live };
    }
    const firstName = conversation.contact?.firstName || input.firstName;
    const vehicle = conversation.vehicleInterest?.title || input.vehicleTitle;
    const fallback = (0, whatsapp_1.templateFallbackFor)(firstName, vehicle);
    await (0, outbox_1.sendNow)({
        id: 'immediate',
        companyId,
        convId: conversation.id,
        channel: 'whatsapp',
        to: phone,
        text: openerText(firstName, vehicle),
        templateName: fallback.templateName,
        templateParams: fallback.templateParams,
        sendAfter: Date.now(),
        attempts: 0,
        createdAt: Date.now(),
    }, 'owner');
    await (0, conversations_1.updateConversation)(companyId, conversation.id, { unread: 0 });
    return { convId: conversation.id, created: true, sent: true, live: true };
};
exports.startOutboundWhatsApp = startOutboundWhatsApp;
//# sourceMappingURL=startWhatsApp.js.map