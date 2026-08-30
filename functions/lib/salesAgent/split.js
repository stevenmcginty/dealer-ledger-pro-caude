"use strict";
/**
 * "Different person."
 *
 * Two emails can land on one Dave thread when Gmail groups them or when a phone
 * in the body matched someone else. Steve taps the stray bubble and this pulls
 * it into its own lead, on the ledger that owns the car, without taking the
 * original customer's email or number with it.
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
exports.salesAgentDetachMessage = exports.detachMessageToOwnLead = void 0;
const functions = __importStar(require("firebase-functions/v1"));
const gmail_1 = require("./channels/gmail");
const leadParsers_1 = require("./channels/leadParsers");
const conversations_1 = require("./conversations");
const gmailAuth_1 = require("./gmailAuth");
const identity_1 = require("./identity");
const inboxRouting_1 = require("./inboxRouting");
const router_1 = require("./router");
const gmailMessageIdOf = (providerId) => {
    const id = (providerId || '').trim();
    if (!id)
        return null;
    if (id.startsWith('cazoo:') || id.startsWith('wamid.') || id.startsWith('SM') || id.startsWith('MM'))
        return null;
    return id;
};
const restoreSubject = async (companyId, convId, conversation, removedSubject) => {
    if (!removedSubject || conversation.emailSubject !== removedSubject)
        return;
    const leftover = await (0, conversations_1.readHistory)(companyId, convId, 200);
    const previous = leftover.find(m => m.from === 'customer' && m.subject);
    await (0, conversations_1.updateConversation)(companyId, convId, {
        emailSubject: previous?.subject || null,
    });
};
const binDraftIfFor = async (companyId, conversation, detached) => {
    const draft = conversation.pendingDraft;
    if (!draft)
        return;
    if (draft.customerText && draft.customerText !== detached.text)
        return;
    await (0, conversations_1.updateConversation)(companyId, conversation.id, { pendingDraft: null });
};
const lookupNewThread = async (companyId, address, stealFrom) => {
    if (!(0, identity_1.isUsableEmail)(address))
        return null;
    const convId = await (0, conversations_1.lookupContactIndex)(companyId, 'email', address);
    if (convId && convId !== stealFrom)
        return { companyId, convId };
    return null;
};
const detachMessageToOwnLead = async (args) => {
    const { companyId, convId, messageId } = args;
    const conversation = await (0, conversations_1.getConversation)(companyId, convId);
    if (!conversation)
        throw new Error('That thread is gone.');
    const history = await (0, conversations_1.readHistory)(companyId, convId, 200);
    const detached = history.find(m => m.id === messageId);
    if (!detached)
        throw new Error('That message is gone.');
    if (detached.from !== 'customer') {
        throw new Error('Pick the customer email that belongs to someone else.');
    }
    const inbox = await (0, inboxRouting_1.inboxForMember)(companyId);
    const credId = await (0, inboxRouting_1.credentialsCompanyId)(companyId);
    const gmailId = gmailMessageIdOf(detached.providerId);
    const stealFrom = convId;
    if (detached.providerId) {
        await (0, conversations_1.releaseProviderId)(companyId, detached.providerId);
        await (0, conversations_1.releaseProviderId)(credId, detached.providerId);
        if (inbox)
            await (0, inboxRouting_1.releaseSharedProviderId)(inbox.id, detached.providerId);
        if (gmailId && gmailId !== detached.providerId) {
            await (0, conversations_1.releaseProviderId)(companyId, gmailId);
            await (0, conversations_1.releaseProviderId)(credId, gmailId);
            if (inbox)
                await (0, inboxRouting_1.releaseSharedProviderId)(inbox.id, gmailId);
        }
    }
    let newHome = null;
    if (gmailId) {
        await (0, gmail_1.reprocessGmailMessage)(credId, gmailId, {
            forceNewConversation: true,
            stealFrom,
        });
        const parsed = (0, leadParsers_1.parseLeadEmail)({
            from: detached.fromAddress || '',
            subject: detached.subject || '',
            text: detached.text || '',
        });
        const email = (parsed.email && (0, identity_1.isUsableEmail)(parsed.email) ? parsed.email : '')
            || ((0, identity_1.isUsableEmail)(detached.fromAddress) ? detached.fromAddress : '');
        const inboxIds = inbox?.memberCompanyIds?.length ? inbox.memberCompanyIds : [companyId];
        if (email && (0, identity_1.emailsConflict)(email, (0, identity_1.existingEmailOf)(conversation))) {
            for (const id of inboxIds) {
                newHome = await lookupNewThread(id, email, stealFrom);
                if (newHome)
                    break;
            }
        }
        if (!newHome && detached.subject) {
            for (const id of inboxIds) {
                const hits = (await (0, conversations_1.listConversations)(id))
                    .filter(c => c.id !== stealFrom && c.emailSubject === detached.subject)
                    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
                if (hits[0]) {
                    newHome = { companyId: id, convId: hits[0].id };
                    break;
                }
            }
        }
    }
    else {
        const address = (0, identity_1.isUsableEmail)(detached.fromAddress) && (0, identity_1.emailsConflict)(detached.fromAddress, (0, identity_1.existingEmailOf)(conversation))
            ? detached.fromAddress
            : `split:${messageId}`;
        await (0, router_1.handleInbound)({
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
            lead: (0, leadParsers_1.parseLeadEmail)({
                from: address.includes('@') ? address : '',
                subject: detached.subject || '',
                text: detached.text || '',
            }),
        });
        const inboxIds = inbox?.memberCompanyIds?.length ? inbox.memberCompanyIds : [companyId];
        if ((0, identity_1.isUsableEmail)(address)) {
            for (const id of inboxIds) {
                newHome = await lookupNewThread(id, address, stealFrom);
                if (newHome)
                    break;
            }
        }
    }
    await (0, conversations_1.db)().ref((0, conversations_1.agentPath)(companyId, `conversations/${convId}/messages/${messageId}`)).remove();
    await restoreSubject(companyId, convId, conversation, detached.subject);
    await binDraftIfFor(companyId, conversation, detached);
    const settings = await (0, conversations_1.readSettings)(newHome?.companyId || companyId);
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
exports.detachMessageToOwnLead = detachMessageToOwnLead;
exports.salesAgentDetachMessage = functions
    .runWith({ secrets: [...conversations_1.BRAIN_SECRETS, ...gmailAuth_1.GMAIL_SECRETS], timeoutSeconds: 180, memory: '512MB' })
    .https.onCall(async (data, context) => {
    const companyId = await (0, conversations_1.requireInboxAccess)(context, data?.companyId);
    const convId = String(data?.convId || '').trim();
    const messageId = String(data?.messageId || '').trim();
    if (!convId || !messageId) {
        throw new functions.https.HttpsError('invalid-argument', 'Pick the email that is someone else.');
    }
    try {
        return await (0, exports.detachMessageToOwnLead)({ companyId, convId, messageId });
    }
    catch (error) {
        throw new functions.https.HttpsError('internal', error?.message || 'That email could not be separated.');
    }
});
//# sourceMappingURL=split.js.map