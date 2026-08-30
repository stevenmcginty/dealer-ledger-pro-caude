/**
 * "Different person."
 *
 * Two emails can land on one Dave thread when Gmail groups them or when a phone
 * in the body matched someone else. Steve taps the stray bubble and this pulls
 * it into its own lead, on the ledger that owns the car, without taking the
 * original customer's email or number with it.
 */

import * as functions from 'firebase-functions/v1';

import { reprocessGmailMessage } from './channels/gmail';
import { parseLeadEmail } from './channels/leadParsers';
import {
    BRAIN_SECRETS,
    agentPath,
    db,
    getConversation,
    listConversations,
    lookupContactIndex,
    readHistory,
    readSettings,
    requireInboxAccess,
    updateConversation,
    releaseProviderId,
} from './conversations';
import { GMAIL_SECRETS } from './gmailAuth';
import { emailsConflict, existingEmailOf, isUsableEmail } from './identity';
import { credentialsCompanyId, inboxForMember, releaseSharedProviderId } from './inboxRouting';
import { handleInbound } from './router';
import { AgentMessage, Conversation } from './types';

export interface SplitResult {
    ok: true;
    companyId: string;
    convId: string;
    message: string;
}

const gmailMessageIdOf = (providerId?: string): string | null => {
    const id = (providerId || '').trim();
    if (!id) return null;
    if (id.startsWith('cazoo:') || id.startsWith('wamid.') || id.startsWith('SM') || id.startsWith('MM')) return null;
    return id;
};

const restoreSubject = async (companyId: string, convId: string, conversation: Conversation, removedSubject?: string): Promise<void> => {
    if (!removedSubject || conversation.emailSubject !== removedSubject) return;
    const leftover = await readHistory(companyId, convId, 200);
    const previous = leftover.find(m => m.from === 'customer' && m.subject);
    await updateConversation(companyId, convId, {
        emailSubject: previous?.subject || null,
    });
};

const binDraftIfFor = async (companyId: string, conversation: Conversation, detached: AgentMessage): Promise<void> => {
    const draft = conversation.pendingDraft;
    if (!draft) return;
    if (draft.customerText && draft.customerText !== detached.text) return;
    await updateConversation(companyId, conversation.id, { pendingDraft: null });
};

const lookupNewThread = async (
    companyId: string,
    address: string,
    stealFrom: string
): Promise<{ companyId: string; convId: string } | null> => {
    if (!isUsableEmail(address)) return null;
    const convId = await lookupContactIndex(companyId, 'email', address);
    if (convId && convId !== stealFrom) return { companyId, convId };
    return null;
};

export const detachMessageToOwnLead = async (args: {
    companyId: string;
    convId: string;
    messageId: string;
}): Promise<SplitResult> => {
    const { companyId, convId, messageId } = args;

    const conversation = await getConversation(companyId, convId);
    if (!conversation) throw new Error('That thread is gone.');

    const history = await readHistory(companyId, convId, 200);
    const detached = history.find(m => m.id === messageId);
    if (!detached) throw new Error('That message is gone.');
    if (detached.from !== 'customer') {
        throw new Error('Pick the customer email that belongs to someone else.');
    }

    const inbox = await inboxForMember(companyId);
    const credId = await credentialsCompanyId(companyId);
    const gmailId = gmailMessageIdOf(detached.providerId);
    const stealFrom = convId;

    if (detached.providerId) {
        await releaseProviderId(companyId, detached.providerId);
        await releaseProviderId(credId, detached.providerId);
        if (inbox) await releaseSharedProviderId(inbox.id, detached.providerId);
        if (gmailId && gmailId !== detached.providerId) {
            await releaseProviderId(companyId, gmailId);
            await releaseProviderId(credId, gmailId);
            if (inbox) await releaseSharedProviderId(inbox.id, gmailId);
        }
    }

    let newHome: { companyId: string; convId: string } | null = null;

    if (gmailId) {
        await reprocessGmailMessage(credId, gmailId, {
            forceNewConversation: true,
            stealFrom,
        });
        const parsed = parseLeadEmail({
            from: detached.fromAddress || '',
            subject: detached.subject || '',
            text: detached.text || '',
        });
        const email = (parsed.email && isUsableEmail(parsed.email) ? parsed.email : '')
            || (isUsableEmail(detached.fromAddress) ? detached.fromAddress! : '');
        const inboxIds = inbox?.memberCompanyIds?.length ? inbox.memberCompanyIds : [companyId];
        if (email && emailsConflict(email, existingEmailOf(conversation))) {
            for (const id of inboxIds) {
                newHome = await lookupNewThread(id, email, stealFrom);
                if (newHome) break;
            }
        }
        if (!newHome && detached.subject) {
            for (const id of inboxIds) {
                const hits = (await listConversations(id))
                    .filter(c => c.id !== stealFrom && c.emailSubject === detached.subject)
                    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
                if (hits[0]) {
                    newHome = { companyId: id, convId: hits[0].id };
                    break;
                }
            }
        }
    } else {
        const address = isUsableEmail(detached.fromAddress) && emailsConflict(detached.fromAddress, existingEmailOf(conversation))
            ? detached.fromAddress!
            : `split:${messageId}`;
        await handleInbound({
            companyId: credId,
            channel: detached.channel || 'email',
            address,
            text: detached.text || '',
            providerId: detached.providerId || `split:${messageId}`,
            name: undefined,
            subject: detached.subject,
            receivedAt: detached.createdAt || Date.now(),
        }, {
            forceNewConversation: true,
            stealFrom,
            lead: parseLeadEmail({
                from: address.includes('@') ? address : '',
                subject: detached.subject || '',
                text: detached.text || '',
            }),
        });
        const inboxIds = inbox?.memberCompanyIds?.length ? inbox.memberCompanyIds : [companyId];
        if (isUsableEmail(address)) {
            for (const id of inboxIds) {
                newHome = await lookupNewThread(id, address, stealFrom);
                if (newHome) break;
            }
        }
    }

    await db().ref(agentPath(companyId, `conversations/${convId}/messages/${messageId}`)).remove();
    await restoreSubject(companyId, convId, conversation, detached.subject);
    await binDraftIfFor(companyId, conversation, detached);

    const settings = await readSettings(newHome?.companyId || companyId);
    const agent = settings.agentName || 'Dave';
    const where = newHome && newHome.companyId !== companyId
        ? ' on the other ledger'
        : '';

    return {
        ok: true,
        companyId: newHome?.companyId || companyId,
        convId: newHome?.convId || convId,
        message: newHome
            ? `Pulled into its own lead${where}. ${agent} will treat it as a new enquiry.`
            : `Pulled that email off this thread. If a new lead does not appear, open the inbox again.`,
    };
};

export const salesAgentDetachMessage = functions
    .runWith({ secrets: [...BRAIN_SECRETS, ...GMAIL_SECRETS], timeoutSeconds: 180, memory: '512MB' })
    .https.onCall(async (data, context) => {
        const companyId = await requireInboxAccess(context, data?.companyId);
        const convId = String(data?.convId || '').trim();
        const messageId = String(data?.messageId || '').trim();
        if (!convId || !messageId) {
            throw new functions.https.HttpsError('invalid-argument', 'Pick the email that is someone else.');
        }

        try {
            return await detachMessageToOwnLead({ companyId, convId, messageId });
        } catch (error: any) {
            throw new functions.https.HttpsError('internal', error?.message || 'That email could not be separated.');
        }
    });
