"use strict";
/**
 * Shared inbox: one Gmail and one WhatsApp number, several ledger accounts.
 *
 * The website and the phone belong to Radlett Car Sales. The cars do not — Steve's
 * stock lives in his Dealer Ledger Pro, Chris's in his. A lead about a car should
 * land in the account that owns it, and stay there. Credentials (the mailbox, the
 * Cloud API token) stay on one company; sending reads those, never the home
 * company's empty private node.
 *
 * WhatsApp is not live until `whatsappLive` is flipped. Connecting the number
 * does not start sending.
 *
 * No shared inbox configured: every message stays on the company the webhook
 * already mapped, which is how a single-dealer install behaves today.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.saveSharedInbox = exports.bindInboxChannelsFromPrivate = exports.ownerCompanyForWhatsApp = exports.resolveConversationHome = exports.pickHomeCompany = exports.mirrorConversationContacts = exports.backfillSharedContacts = exports.findExistingSharedContact = exports.releaseSharedProviderId = exports.claimSharedProviderId = exports.isWhatsAppLiveFor = exports.readSendPrivate = exports.credentialsCompanyId = exports.companyLooksReal = exports.sharedInboxSaveBlocked = exports.inboxForMember = exports.inboxById = void 0;
const conversations_1 = require("./conversations");
const identity_1 = require("./identity");
const search_1 = require("./stock/search");
const types_1 = require("./types");
const inboxRef = (inboxId, sub = '') => (0, conversations_1.db)().ref((0, conversations_1.routingPath)(`sharedInboxes/${inboxId}${sub ? `/${sub}` : ''}`));
const uniqueIds = (ids) => Array.from(new Set(ids.map(id => String(id || '').trim()).filter(Boolean)));
const asInbox = (id, raw) => {
    if (!raw?.credentialCompanyId)
        return null;
    const storedMembers = Array.isArray(raw.memberCompanyIds)
        ? raw.memberCompanyIds
        : raw.memberCompanyIds && typeof raw.memberCompanyIds === 'object'
            ? Object.values(raw.memberCompanyIds)
            : [];
    const memberCompanyIds = uniqueIds([
        raw.credentialCompanyId,
        ...storedMembers,
        raw.fallbackCompanyId || '',
    ]);
    return {
        id,
        credentialCompanyId: raw.credentialCompanyId,
        memberCompanyIds,
        fallbackCompanyId: raw.fallbackCompanyId || raw.credentialCompanyId,
        whatsappLive: raw.whatsappLive === true,
        createdAt: raw.createdAt || 0,
        updatedAt: raw.updatedAt || 0,
        ...(raw.name ? { name: raw.name } : {}),
        ...(raw.gmailAddress ? { gmailAddress: raw.gmailAddress } : {}),
        ...(raw.whatsappPhoneNumberId ? { whatsappPhoneNumberId: raw.whatsappPhoneNumberId } : {}),
    };
};
const inboxById = async (inboxId) => {
    if (!inboxId)
        return null;
    const snap = await inboxRef(inboxId).once('value');
    const raw = snap.val();
    if (!raw)
        return null;
    return asInbox(inboxId, raw);
};
exports.inboxById = inboxById;
const inboxForMember = async (companyId) => {
    if (!companyId)
        return null;
    const snap = await (0, conversations_1.db)().ref((0, conversations_1.routingPath)(`inboxMembers/${companyId}`)).once('value');
    const inboxId = snap.val();
    return inboxId ? (0, exports.inboxById)(inboxId) : null;
};
exports.inboxForMember = inboxForMember;
/**
 * Who may change the shared inbox.
 *
 * Steve (the company that holds the Meta / Gmail tokens) lists the other
 * ledgers by id. He is not a member of Chris's Dealer Ledger Pro, and requiring
 * that is why Chris never got WhatsApp on his own login. A peer must not save
 * either — that would move the credential company onto an account with no tokens
 * and kill the number for everyone.
 */
const sharedInboxSaveBlocked = (callerCompanyId, existing) => {
    if (existing && existing.credentialCompanyId !== callerCompanyId) {
        return 'The other ledger owns this shared number. They add members from their settings.';
    }
    return null;
};
exports.sharedInboxSaveBlocked = sharedInboxSaveBlocked;
const companyLooksReal = async (companyId) => {
    if (!companyId)
        return false;
    const snap = await (0, conversations_1.db)().ref(`companies/${companyId}`).once('value');
    return snap.exists();
};
exports.companyLooksReal = companyLooksReal;
/**
 * Tokens for anything we send. A thread sitting in Chris's account still goes
 * out through Steve's connected Gmail / WhatsApp.
 */
const credentialsCompanyId = async (homeCompanyId) => {
    const inbox = await (0, exports.inboxForMember)(homeCompanyId);
    return inbox?.credentialCompanyId || homeCompanyId;
};
exports.credentialsCompanyId = credentialsCompanyId;
const readSendPrivate = async (homeCompanyId) => (0, conversations_1.readPrivate)(await (0, exports.credentialsCompanyId)(homeCompanyId));
exports.readSendPrivate = readSendPrivate;
/** Customer WhatsApp is off until the shared inbox is marked live. No inbox → old behaviour. */
const isWhatsAppLiveFor = async (companyId) => {
    const inbox = await (0, exports.inboxForMember)(companyId);
    if (!inbox)
        return true;
    return inbox.whatsappLive === true;
};
exports.isWhatsAppLiveFor = isWhatsAppLiveFor;
const claimSharedProviderId = async (inboxId, providerId) => {
    if (!providerId)
        return true;
    const ref = inboxRef(inboxId, `seenProviderIds/${(0, types_1.rtdbKey)(providerId)}`);
    const result = await ref.transaction(current => (current === null ? Date.now() : undefined));
    return result.committed;
};
exports.claimSharedProviderId = claimSharedProviderId;
const writeSharedContact = async (inboxId, companyId, channel, address, convId, stealFrom) => {
    if (!address)
        return;
    if (channel === 'email' && !(0, identity_1.isUsableEmail)(address))
        return;
    const key = (0, types_1.rtdbKey)((0, types_1.normaliseAddress)(channel, address));
    const ref = inboxRef(inboxId, `contactIndex/${key}`);
    const current = (await ref.once('value')).val();
    const canSteal = channel === 'email' && stealFrom && current?.convId === stealFrom;
    if (current?.convId && current.convId !== convId && !canSteal)
        return;
    await ref.set({ companyId, convId });
};
const releaseSharedProviderId = async (inboxId, providerId) => {
    if (!inboxId || !providerId)
        return;
    await inboxRef(inboxId, `seenProviderIds/${(0, types_1.rtdbKey)(providerId)}`).remove();
};
exports.releaseSharedProviderId = releaseSharedProviderId;
const lookupSharedContact = async (inboxId, channel, address) => {
    if (!address)
        return null;
    const key = (0, types_1.rtdbKey)((0, types_1.normaliseAddress)(channel, address));
    const snap = await inboxRef(inboxId, `contactIndex/${key}`).once('value');
    const val = snap.val();
    return val?.companyId && val?.convId ? val : null;
};
const findExistingSharedContact = async (inbox, channel, address, contact) => {
    for (const [candidateChannel, candidateAddress] of (0, identity_1.lookupKeys)(channel, address, contact)) {
        const found = await lookupSharedContact(inbox.id, candidateChannel, candidateAddress);
        if (!found || !inbox.memberCompanyIds.includes(found.companyId))
            continue;
        // A thread deleted from the inbox leaves its pointer behind. Following it
        // would pin the customer to a ledger and a conversation that no longer
        // exist, so the pointer goes and the placement rule runs afresh.
        const existing = await (0, conversations_1.getConversation)(found.companyId, found.convId);
        if (!existing) {
            await inboxRef(inbox.id, `contactIndex/${(0, types_1.rtdbKey)((0, types_1.normaliseAddress)(candidateChannel, candidateAddress))}`).remove();
            continue;
        }
        if ((0, identity_1.isDifferentPerson)(channel, address, contact, existing)) {
            await inboxRef(inbox.id, `contactIndex/${(0, types_1.rtdbKey)((0, types_1.normaliseAddress)(candidateChannel, candidateAddress))}`).remove();
            continue;
        }
        return found;
    }
    return null;
};
exports.findExistingSharedContact = findExistingSharedContact;
/**
 * Threads that existed before the inbox was shared are only in their company's
 * own index. Mirror them, so a returning customer stays on the ledger that
 * already knows them instead of getting a second thread next door.
 */
const backfillSharedContacts = async (inbox) => {
    let mirrored = 0;
    for (const companyId of inbox.memberCompanyIds) {
        const conversations = await (0, conversations_1.listConversations)(companyId);
        for (const conversation of conversations) {
            if (!conversation?.address)
                continue;
            const contact = conversation.contact || {};
            for (const [candidateChannel, candidateAddress] of (0, identity_1.indexKeys)(conversation.channel, conversation.address, contact)) {
                const key = (0, types_1.rtdbKey)((0, types_1.normaliseAddress)(candidateChannel, candidateAddress));
                const current = (await inboxRef(inbox.id, `contactIndex/${key}`).once('value')).val();
                if (current?.companyId && current?.convId)
                    continue;
                await writeSharedContact(inbox.id, companyId, candidateChannel, candidateAddress, conversation.id);
                mirrored += 1;
            }
        }
    }
    return mirrored;
};
exports.backfillSharedContacts = backfillSharedContacts;
const mirrorConversationContacts = async (companyId, conversation, channel, address, stealFrom) => {
    const inbox = await (0, exports.inboxForMember)(companyId);
    if (!inbox)
        return;
    const contact = conversation.contact || {};
    for (const [candidateChannel, candidateAddress] of (0, identity_1.indexKeys)(channel, address, contact)) {
        await writeSharedContact(inbox.id, companyId, candidateChannel, candidateAddress, conversation.id, stealFrom);
    }
};
exports.mirrorConversationContacts = mirrorConversationContacts;
/**
 * Pure placement rule. The IO wrapper below fills `existing` and `stockItem`.
 *
 * existing wins: once a customer has a thread, later WhatsApps and emails stay
 * on that ledger even if they then mention the other dealer's car.
 */
const pickHomeCompany = (args) => {
    const { inbox, credentialCompanyId, existing, stockItem } = args;
    const ownerCompanyId = stockItem?.ownerCompanyId;
    if (!inbox) {
        return {
            companyId: credentialCompanyId,
            reason: 'single',
            ...(ownerCompanyId ? { ownerCompanyId } : {}),
            ...(stockItem ? { stockItem } : {}),
        };
    }
    if (existing && inbox.memberCompanyIds.includes(existing.companyId)) {
        return {
            companyId: existing.companyId,
            convId: existing.convId,
            reason: 'existing',
            ...(ownerCompanyId ? { ownerCompanyId } : {}),
            ...(stockItem ? { stockItem } : {}),
        };
    }
    if (ownerCompanyId && inbox.memberCompanyIds.includes(ownerCompanyId)) {
        return { companyId: ownerCompanyId, reason: 'owner', ownerCompanyId, ...(stockItem ? { stockItem } : {}) };
    }
    return {
        companyId: inbox.fallbackCompanyId || inbox.credentialCompanyId,
        reason: 'fallback',
        ...(ownerCompanyId ? { ownerCompanyId } : {}),
        ...(stockItem ? { stockItem } : {}),
    };
};
exports.pickHomeCompany = pickHomeCompany;
const resolveConversationHome = async (args) => {
    const { inbox, credentialCompanyId, channel, address, contact, lead, text } = args;
    const existing = inbox && !args.skipExisting
        ? await (0, exports.findExistingSharedContact)(inbox, channel, address, contact)
        : null;
    const stockItem = await (0, search_1.matchEnquiryStockForCompany)(credentialCompanyId, {
        stockId: lead?.vehicle?.stockId,
        reg: lead?.vehicle?.reg,
        title: lead?.vehicle?.title || lead?.vehicleHint,
        text,
    });
    return (0, exports.pickHomeCompany)({ inbox, credentialCompanyId, existing, stockItem });
};
exports.resolveConversationHome = resolveConversationHome;
/**
 * Commands come from a personal mobile, not the shared business number. Each
 * member's `ownerAlertNumber` is tried so Chris's TAKE OVER hits Chris's #12.
 */
const ownerCompanyForWhatsApp = async (inbox, address, fallbackCompanyId) => {
    const e164 = (0, types_1.toE164)(address);
    const companyIds = inbox ? inbox.memberCompanyIds : [fallbackCompanyId];
    for (const companyId of companyIds) {
        const settings = await (0, conversations_1.readSettings)(companyId);
        if (settings.ownerAlertNumber && (0, types_1.toE164)(settings.ownerAlertNumber) === e164) {
            return companyId;
        }
    }
    return null;
};
exports.ownerCompanyForWhatsApp = ownerCompanyForWhatsApp;
const bindChannelPointers = async (inbox) => {
    if (inbox.gmailAddress) {
        const key = (0, types_1.rtdbKey)(inbox.gmailAddress.trim().toLowerCase());
        await (0, conversations_1.db)().ref((0, conversations_1.routingPath)(`channelToInbox/gmail/${key}`)).set(inbox.id);
    }
    if (inbox.whatsappPhoneNumberId) {
        await (0, conversations_1.db)().ref((0, conversations_1.routingPath)(`channelToInbox/whatsapp/${inbox.whatsappPhoneNumberId}`)).set(inbox.id);
    }
};
/**
 * After Gmail or WhatsApp tokens are saved on the credential company, point the
 * shared inbox at those channel ids so later inbound can find the group.
 */
const bindInboxChannelsFromPrivate = async (companyId) => {
    const inbox = await (0, exports.inboxForMember)(companyId);
    if (!inbox || inbox.credentialCompanyId !== companyId)
        return;
    const priv = await (0, conversations_1.readPrivate)(companyId);
    const patch = {};
    if (priv.gmail?.email)
        patch.gmailAddress = priv.gmail.email.trim().toLowerCase();
    if (priv.whatsapp?.phoneNumberId)
        patch.whatsappPhoneNumberId = priv.whatsapp.phoneNumberId;
    if (!Object.keys(patch).length)
        return;
    await inboxRef(inbox.id).update((0, types_1.stripUndefined)({ ...patch, updatedAt: Date.now() }));
    await bindChannelPointers({ ...inbox, ...patch });
};
exports.bindInboxChannelsFromPrivate = bindInboxChannelsFromPrivate;
const saveSharedInbox = async (args) => {
    const credentialCompanyId = args.credentialCompanyId;
    const existingIdSnap = await (0, conversations_1.db)().ref((0, conversations_1.routingPath)(`inboxMembers/${credentialCompanyId}`)).once('value');
    const inboxId = args.inboxId || existingIdSnap.val() || (0, conversations_1.db)().ref().push().key;
    const previous = await (0, exports.inboxById)(inboxId);
    const now = Date.now();
    const fallbackCompanyId = args.fallbackCompanyId || previous?.fallbackCompanyId || credentialCompanyId;
    const memberCompanyIds = uniqueIds([
        credentialCompanyId,
        fallbackCompanyId,
        ...args.memberCompanyIds,
    ]);
    const priv = await (0, conversations_1.readPrivate)(credentialCompanyId);
    const inbox = {
        id: inboxId,
        credentialCompanyId,
        memberCompanyIds,
        fallbackCompanyId,
        whatsappLive: args.whatsappLive === undefined ? previous?.whatsappLive === true : args.whatsappLive === true,
        createdAt: previous?.createdAt || now,
        updatedAt: now,
        ...(args.name || previous?.name ? { name: args.name || previous?.name } : {}),
        ...(priv.gmail?.email ? { gmailAddress: priv.gmail.email.trim().toLowerCase() } : {}),
        ...(priv.whatsapp?.phoneNumberId ? { whatsappPhoneNumberId: priv.whatsapp.phoneNumberId } : {}),
    };
    const meta = { ...inbox };
    delete meta.id;
    await inboxRef(inboxId).update((0, types_1.stripUndefined)(meta));
    const previousMembers = new Set(previous?.memberCompanyIds || []);
    const nextMembers = new Set(memberCompanyIds);
    await Promise.all([
        ...memberCompanyIds.map(id => (0, conversations_1.db)().ref((0, conversations_1.routingPath)(`inboxMembers/${id}`)).set(inboxId)),
        ...Array.from(previousMembers)
            .filter(id => !nextMembers.has(id))
            .map(id => (0, conversations_1.db)().ref((0, conversations_1.routingPath)(`inboxMembers/${id}`)).remove()),
    ]);
    await bindChannelPointers(inbox);
    await (0, exports.backfillSharedContacts)(inbox);
    return inbox;
};
exports.saveSharedInbox = saveSharedInbox;
//# sourceMappingURL=inboxRouting.js.map