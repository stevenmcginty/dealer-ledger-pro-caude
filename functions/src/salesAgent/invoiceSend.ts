/**
 * Send a saved SalesDocument PDF to its customer, straight from the invoice modal.
 *
 * Two channels, one rule that shapes everything: Meta will not carry a file on
 * WhatsApp outside the 24h customer-service window. So the WhatsApp button means
 * "document if their thread is live, email plus an approved nudge if it is not".
 * The decision is made BEFORE anything is sent, not by the outbox's gates — by the
 * time a media job hits applyWhatsAppWindow there is no way to fall back to email.
 */

import {
    findOrCreateConversation,
    indexContactIfFree,
    readSettings,
    updateConversation,
} from './conversations';
import {
    findExistingSharedContact,
    inboxForMember,
    mirrorConversationContacts,
} from './inboxRouting';
import { sendNow } from './outbox';
import { Contact, Conversation, MessageMedia, parseOutboundPhone } from './types';
import { isUsableEmail } from './identity';

export type InvoiceVia = 'email' | 'whatsapp';

export type InvoiceSendPlan =
    | { action: 'whatsapp-document' }
    | { action: 'email'; nudgeWhatsApp: boolean }
    | { action: 'refuse'; reason: string };

/**
 * Pure: given what we have and what was asked for, decide the route.
 *
 *  - WhatsApp, thread live            -> the PDF as a WhatsApp document.
 *  - WhatsApp, thread cold, email     -> the PDF by email + invoice_notice nudge.
 *  - WhatsApp, thread cold, no email  -> refuse; nothing can carry the file.
 *  - Email                            -> the PDF by email.
 */
export const planInvoiceSend = (input: {
    via: InvoiceVia;
    hasEmail: boolean;
    hasPhone: boolean;
    /** Is Meta's 24h free-text window open on this customer's WhatsApp thread? */
    windowOpen: boolean;
}): InvoiceSendPlan => {
    if (input.via === 'email') {
        return input.hasEmail
            ? { action: 'email', nudgeWhatsApp: false }
            : { action: 'refuse', reason: 'There is no email address on this document. Add one, or send it on WhatsApp.' };
    }

    if (!input.hasPhone) {
        return { action: 'refuse', reason: 'There is no mobile number on this document. Add one, or send it by email.' };
    }

    if (input.windowOpen) return { action: 'whatsapp-document' };

    if (input.hasEmail) return { action: 'email', nudgeWhatsApp: true };

    return {
        action: 'refuse',
        reason: 'WhatsApp cannot take files until the customer messages you first, and there is no email on this document. Add an email, or ask them to send you a WhatsApp message.',
    };
};

export interface SendInvoiceInput {
    companyId: string;
    via: InvoiceVia;
    email?: string;
    phone?: string;
    customerName?: string;
    vehicleTitle?: string;
    /** "invoice" / "deposit slip" — the words the customer reads. */
    documentLabel: string;
    invoiceNumber: string;
    /** The rendered PDF, already uploaded to Storage. */
    pdf: MessageMedia;
}

export interface SendInvoiceResult {
    convId: string;
    created: boolean;
    /** What actually went out. */
    sent: 'whatsapp' | 'email' | 'email+whatsapp';
    /** The WhatsApp half of the pair could not go out (template awaiting Meta, WhatsApp dark). The email still went. */
    nudgeHeld?: string;
}

export const INVOICE_NOTICE_TEMPLATE = 'invoice_notice';

const firstNameOf = (customerName?: string): string => {
    const first = (customerName || '').trim().split(/\s+/)[0] || '';
    return first;
};

/**
 * Find-or-create the customer's thread, send the PDF down the planned route, and
 * leave the thread the way the reply box leaves it: read, and Dave quiet — this
 * was the desk speaking, not the agent.
 */
export const sendInvoiceDocument = async (input: SendInvoiceInput): Promise<SendInvoiceResult> => {
    const email = (input.email || '').trim().toLowerCase();
    const hasEmail = isUsableEmail(email);
    const phone = parseOutboundPhone(input.phone || '');
    const hasPhone = !!phone;

    const firstName = firstNameOf(input.customerName);
    const lastName = (input.customerName || '').trim().split(/\s+/).slice(1).join(' ') || undefined;

    const contact: Contact = {
        ...(hasEmail ? { email } : {}),
        ...(hasPhone ? { phone: phone as string } : {}),
        ...(firstName ? { firstName } : {}),
        ...(lastName ? { lastName } : {}),
    };

    // The thread is keyed on the channel the PDF is meant for. When the plan
    // falls back to email with a WhatsApp nudge, both sends land on the same
    // thread so the inbox shows the whole story in one place.
    const keyChannel = input.via === 'whatsapp' && hasPhone ? 'whatsapp' : 'email';
    const keyAddress = keyChannel === 'whatsapp' ? (phone as string) : email;

    if (keyChannel === 'email' && !hasEmail) {
        throw new Error('There is no email address on this document. Add one, or send it on WhatsApp.');
    }

    const inbox = await inboxForMember(input.companyId);
    if (keyChannel === 'whatsapp') {
        const shared = inbox
            ? await findExistingSharedContact(inbox, 'whatsapp', phone as string, contact)
            : null;
        if (shared && shared.companyId !== input.companyId) {
            throw new Error('This number already has a thread in the other ledger. Send it from there rather than starting a second one.');
        }
    }

    const opened = await findOrCreateConversation(input.companyId, keyChannel, keyAddress, contact, {
        vehicleOfInterest: input.vehicleTitle,
    });
    let conversation: Conversation = opened.conversation;
    const created = opened.isNew;

    if (created) {
        // We wrote to them; they have not written back. findOrCreate stamps
        // "now" on a WhatsApp thread because the webhook path needs it, but
        // that would fabricate an open 24h window here and Meta would reject
        // the document (code 131047). Route on the truth: the window is shut.
        const patch: Record<string, unknown> = {
            mode: 'human',
            ...(keyChannel === 'whatsapp' ? { lastCustomerMessageAt: 0 } : {}),
        };
        if (input.vehicleTitle) {
            patch.vehicleInterest = { ...(conversation.vehicleInterest || {}), title: input.vehicleTitle };
        }
        if (inbox) {
            patch.routing = { inboxId: inbox.id, reason: 'owner', ownerCompanyId: input.companyId };
        }
        await updateConversation(input.companyId, conversation.id, patch);
        Object.assign(conversation, patch);
    }

    // A WhatsApp-keyed thread that also carries an email should be findable by
    // that email, or their reply opens a second thread nobody is watching.
    if (hasEmail && conversation.address !== email) {
        await indexContactIfFree(input.companyId, 'email', email, conversation.id);
    }

    if (keyChannel === 'whatsapp') {
        await mirrorConversationContacts(input.companyId, conversation, 'whatsapp', phone as string);
    }

    // The window is judged on the conversation as it stands now — which for a
    // thread we just opened is always shut (see the patch above).
    const windowOpen =
        keyChannel === 'whatsapp'
            && conversation.lastCustomerMessageAt > 0
            && Date.now() - conversation.lastCustomerMessageAt < 24 * 3_600_000;

    const plan = planInvoiceSend({ via: input.via, hasEmail, hasPhone, windowOpen });

    if (plan.action === 'refuse') throw new Error(plan.reason);

    const settings = await readSettings(input.companyId);
    const dealership = settings.dealershipName || 'us';
    const signature = settings.signature ? `\n\n${settings.signature}` : '';
    const label = input.documentLabel || 'invoice';
    const car = input.vehicleTitle ? ` for the ${input.vehicleTitle}` : '';

    let sent: SendInvoiceResult['sent'];
    let nudgeHeld: string | undefined;

    if (plan.action === 'whatsapp-document') {
        await sendNow({
            id: 'immediate',
            companyId: input.companyId,
            convId: conversation.id,
            channel: 'whatsapp',
            to: phone as string,
            text: `Your ${label}${car} from ${dealership}.`,
            media: input.pdf,
            sendAfter: Date.now(),
            attempts: 0,
            createdAt: Date.now(),
        }, 'owner');
        sent = 'whatsapp';
    } else {
        await sendNow({
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
                await sendNow({
                    id: 'immediate',
                    companyId: input.companyId,
                    convId: conversation.id,
                    channel: 'whatsapp',
                    to: phone,
                    text: '',
                    templateName: INVOICE_NOTICE_TEMPLATE,
                    templateParams: [firstName || 'there', label],
                    sendAfter: Date.now(),
                    attempts: 0,
                    createdAt: Date.now(),
                }, 'owner');
                sent = 'email+whatsapp';
            } catch (error: any) {
                // The email with the PDF went out; the nudge is a courtesy. Say
                // what happened rather than failing a send that succeeded.
                nudgeHeld = error?.message || String(error);
            }
        }
    }

    await updateConversation(input.companyId, conversation.id, {
        unread: 0,
        mode: 'human',
        pendingDraft: null,
    });

    return { convId: conversation.id, created, sent, ...(nudgeHeld ? { nudgeHeld } : {}) };
};
