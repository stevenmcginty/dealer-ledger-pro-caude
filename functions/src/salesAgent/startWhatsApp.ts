/**
 * Start a WhatsApp thread from a ledger, to a number that has not written in.
 *
 * Steve and Chris both need this: a walk-in, a phone lead, a CRM record with a
 * mobile. The thread is created on the company that pressed the button. The
 * Cloud API tokens still come from the shared inbox's credential company, so
 * Chris's portal sends from the same Radlett number as Steve's.
 *
 * A first message to someone new is outside Meta's 24-hour window, so it has
 * to be an approved template (the `enquiry_reply` family, whichever member Meta has approved). Free text waits until they
 * reply. Nothing is sent while `whatsappLive` is off; the thread is still
 * opened so the button works before verification.
 */

import {
    findOrCreateConversation,
    getConversation,
    readSettings,
    updateConversation,
} from './conversations';
import {
    findExistingSharedContact,
    inboxForMember,
    isWhatsAppLiveFor,
    mirrorConversationContacts,
} from './inboxRouting';
import { sendNow } from './outbox';
import { templateFallbackFor } from './channels/whatsapp';
import { Contact, Conversation, parseOutboundPhone, SharedContactRef } from './types';

export { parseOutboundPhone };

export type OutboundDecision =
    | { action: 'create' }
    | { action: 'reuse'; convId: string }
    | { action: 'other_ledger' };

export const decideOutboundHome = (
    callingCompanyId: string,
    existing: SharedContactRef | null
): OutboundDecision => {
    if (!existing) return { action: 'create' };
    if (existing.companyId === callingCompanyId) return { action: 'reuse', convId: existing.convId };
    return { action: 'other_ledger' };
};

export interface StartWhatsAppInput {
    companyId: string;
    phone: string;
    firstName?: string;
    lastName?: string;
    vehicleTitle?: string;
    leadId?: string;
}

export interface StartWhatsAppResult {
    convId: string;
    created: boolean;
    sent: boolean;
    live: boolean;
}

const openerText = (firstName?: string, vehicleTitle?: string): string => {
    const name = (firstName || 'there').trim() || 'there';
    const vehicle = (vehicleTitle || 'car').trim() || 'car';
    return `Hi ${name}, thanks for enquiring about the ${vehicle}. It's still available. Would you like any more details, or to arrange a viewing or test drive?`;
};

export const startOutboundWhatsApp = async (input: StartWhatsAppInput): Promise<StartWhatsAppResult> => {
    const phone = parseOutboundPhone(input.phone);
    if (!phone) throw new Error('That does not look like a phone number.');

    const companyId = input.companyId;
    const contact: Contact = {
        phone,
        ...(input.firstName ? { firstName: input.firstName.trim() } : {}),
        ...(input.lastName ? { lastName: input.lastName.trim() } : {}),
        ...(input.leadId ? { leadId: input.leadId } : {}),
    };

    const inbox = await inboxForMember(companyId);
    const shared = inbox
        ? await findExistingSharedContact(inbox, 'whatsapp', phone, contact)
        : null;
    const decision = decideOutboundHome(companyId, shared);

    if (decision.action === 'other_ledger') {
        throw new Error('This number already has a thread in the other ledger. Open it there rather than starting a second one.');
    }

    let conversation: Conversation;
    let created = false;

    if (decision.action === 'reuse') {
        const existing = await getConversation(companyId, decision.convId);
        if (!existing) throw new Error('That conversation no longer exists.');
        conversation = existing;
    } else {
        const opened = await findOrCreateConversation(companyId, 'whatsapp', phone, contact, {
            vehicleOfInterest: input.vehicleTitle,
        });
        conversation = opened.conversation;
        created = opened.isNew;

        if (created) {
            const patch: Record<string, unknown> = {
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
            await updateConversation(companyId, conversation.id, patch);
            Object.assign(conversation, patch);
        }

        await mirrorConversationContacts(companyId, conversation, 'whatsapp', phone);
    }

    const live = (await isWhatsAppLiveFor(companyId))
        && (await readSettings(companyId)).channels.whatsapp === true;

    if (!created || !live) {
        return { convId: conversation.id, created, sent: false, live };
    }

    const firstName = conversation.contact?.firstName || input.firstName;
    const vehicle = conversation.vehicleInterest?.title || input.vehicleTitle;
    const fallback = templateFallbackFor(firstName, vehicle);

    await sendNow({
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

    await updateConversation(companyId, conversation.id, { unread: 0 });

    return { convId: conversation.id, created: true, sent: true, live: true };
};
