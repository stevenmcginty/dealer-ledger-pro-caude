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

import { ParsedLead } from './channels/leadParsers';
import {
    db,
    readPrivate,
    readSettings,
    routingPath,
} from './conversations';
import { matchEnquiryStockForCompany } from './stock/search';
import {
    Channel,
    Contact,
    Conversation,
    SalesAgentPrivate,
    SharedContactRef,
    SharedInbox,
    StockItem,
    normaliseAddress,
    rtdbKey,
    stripUndefined,
    toE164,
} from './types';

export type HomeReason = 'single' | 'existing' | 'owner' | 'fallback';

export interface HomeDecision {
    companyId: string;
    reason: HomeReason;
    convId?: string;
    ownerCompanyId?: string;
    stockItem?: StockItem;
}

const inboxRef = (inboxId: string, sub = '') =>
    db().ref(routingPath(`sharedInboxes/${inboxId}${sub ? `/${sub}` : ''}`));

const uniqueIds = (ids: string[]): string[] =>
    Array.from(new Set(ids.map(id => String(id || '').trim()).filter(Boolean)));

const asInbox = (id: string, raw: Partial<SharedInbox> | null): SharedInbox | null => {
    if (!raw?.credentialCompanyId) return null;

    const storedMembers = Array.isArray(raw.memberCompanyIds)
        ? raw.memberCompanyIds
        : raw.memberCompanyIds && typeof raw.memberCompanyIds === 'object'
            ? Object.values(raw.memberCompanyIds as Record<string, string>)
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

export const inboxById = async (inboxId: string): Promise<SharedInbox | null> => {
    if (!inboxId) return null;
    const snap = await inboxRef(inboxId).once('value');
    const raw = snap.val() as Partial<SharedInbox> | null;
    if (!raw) return null;
    return asInbox(inboxId, raw);
};

export const inboxForMember = async (companyId: string): Promise<SharedInbox | null> => {
    if (!companyId) return null;
    const snap = await db().ref(routingPath(`inboxMembers/${companyId}`)).once('value');
    const inboxId = snap.val() as string | null;
    return inboxId ? inboxById(inboxId) : null;
};

/**
 * Tokens for anything we send. A thread sitting in Chris's account still goes
 * out through Steve's connected Gmail / WhatsApp.
 */
export const credentialsCompanyId = async (homeCompanyId: string): Promise<string> => {
    const inbox = await inboxForMember(homeCompanyId);
    return inbox?.credentialCompanyId || homeCompanyId;
};

export const readSendPrivate = async (homeCompanyId: string): Promise<SalesAgentPrivate> =>
    readPrivate(await credentialsCompanyId(homeCompanyId));

/** Customer WhatsApp is off until the shared inbox is marked live. No inbox → old behaviour. */
export const isWhatsAppLiveFor = async (companyId: string): Promise<boolean> => {
    const inbox = await inboxForMember(companyId);
    if (!inbox) return true;
    return inbox.whatsappLive === true;
};

export const claimSharedProviderId = async (inboxId: string, providerId: string): Promise<boolean> => {
    if (!providerId) return true;
    const ref = inboxRef(inboxId, `seenProviderIds/${rtdbKey(providerId)}`);
    const result = await ref.transaction(current => (current === null ? Date.now() : undefined));
    return result.committed;
};

const writeSharedContact = async (
    inboxId: string,
    companyId: string,
    channel: Channel,
    address: string,
    convId: string
): Promise<void> => {
    if (!address) return;
    const key = rtdbKey(normaliseAddress(channel, address));
    await inboxRef(inboxId, `contactIndex/${key}`).set({ companyId, convId });
};

const lookupSharedContact = async (
    inboxId: string,
    channel: Channel,
    address: string
): Promise<SharedContactRef | null> => {
    if (!address) return null;
    const key = rtdbKey(normaliseAddress(channel, address));
    const snap = await inboxRef(inboxId, `contactIndex/${key}`).once('value');
    const val = snap.val() as SharedContactRef | null;
    return val?.companyId && val?.convId ? val : null;
};

const contactCandidates = (
    channel: Channel,
    address: string,
    contact: Contact
): Array<[Channel, string]> => {
    const candidates: Array<[Channel, string]> = [[channel, address]];
    if (contact.email) candidates.push(['email', contact.email]);
    if (contact.phone) {
        candidates.push(['whatsapp', contact.phone], ['sms', contact.phone]);
    }
    return candidates;
};

const findExistingSharedContact = async (
    inbox: SharedInbox,
    channel: Channel,
    address: string,
    contact: Contact
): Promise<SharedContactRef | null> => {
    for (const [candidateChannel, candidateAddress] of contactCandidates(channel, address, contact)) {
        const found = await lookupSharedContact(inbox.id, candidateChannel, candidateAddress);
        if (found && inbox.memberCompanyIds.includes(found.companyId)) return found;
    }
    return null;
};

export const mirrorConversationContacts = async (
    companyId: string,
    conversation: Conversation,
    channel: Channel,
    address: string
): Promise<void> => {
    const inbox = await inboxForMember(companyId);
    if (!inbox) return;

    const contact = conversation.contact || {};
    for (const [candidateChannel, candidateAddress] of contactCandidates(channel, address, contact)) {
        await writeSharedContact(inbox.id, companyId, candidateChannel, candidateAddress, conversation.id);
    }
};

/**
 * Pure placement rule. The IO wrapper below fills `existing` and `stockItem`.
 *
 * existing wins: once a customer has a thread, later WhatsApps and emails stay
 * on that ledger even if they then mention the other dealer's car.
 */
export const pickHomeCompany = (args: {
    inbox: SharedInbox | null;
    credentialCompanyId: string;
    existing: SharedContactRef | null;
    stockItem: StockItem | null;
}): HomeDecision => {
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

export const resolveConversationHome = async (args: {
    inbox: SharedInbox | null;
    credentialCompanyId: string;
    channel: Channel;
    address: string;
    contact: Contact;
    lead?: ParsedLead;
    text?: string;
}): Promise<HomeDecision> => {
    const { inbox, credentialCompanyId, channel, address, contact, lead, text } = args;

    const existing = inbox
        ? await findExistingSharedContact(inbox, channel, address, contact)
        : null;

    const stockItem = await matchEnquiryStockForCompany(credentialCompanyId, {
        stockId: lead?.vehicle?.stockId,
        reg: lead?.vehicle?.reg,
        title: lead?.vehicle?.title || lead?.vehicleHint,
        text,
    });

    return pickHomeCompany({ inbox, credentialCompanyId, existing, stockItem });
};

/**
 * Commands come from a personal mobile, not the shared business number. Each
 * member's `ownerAlertNumber` is tried so Chris's TAKE OVER hits Chris's #12.
 */
export const ownerCompanyForWhatsApp = async (
    inbox: SharedInbox | null,
    address: string,
    fallbackCompanyId: string
): Promise<string | null> => {
    const e164 = toE164(address);
    const companyIds = inbox ? inbox.memberCompanyIds : [fallbackCompanyId];

    for (const companyId of companyIds) {
        const settings = await readSettings(companyId);
        if (settings.ownerAlertNumber && toE164(settings.ownerAlertNumber) === e164) {
            return companyId;
        }
    }

    return null;
};

const bindChannelPointers = async (inbox: SharedInbox): Promise<void> => {
    if (inbox.gmailAddress) {
        const key = rtdbKey(inbox.gmailAddress.trim().toLowerCase());
        await db().ref(routingPath(`channelToInbox/gmail/${key}`)).set(inbox.id);
    }
    if (inbox.whatsappPhoneNumberId) {
        await db().ref(routingPath(`channelToInbox/whatsapp/${inbox.whatsappPhoneNumberId}`)).set(inbox.id);
    }
};

/**
 * After Gmail or WhatsApp tokens are saved on the credential company, point the
 * shared inbox at those channel ids so later inbound can find the group.
 */
export const bindInboxChannelsFromPrivate = async (companyId: string): Promise<void> => {
    const inbox = await inboxForMember(companyId);
    if (!inbox || inbox.credentialCompanyId !== companyId) return;

    const priv = await readPrivate(companyId);
    const patch: Partial<SharedInbox> = {};
    if (priv.gmail?.email) patch.gmailAddress = priv.gmail.email.trim().toLowerCase();
    if (priv.whatsapp?.phoneNumberId) patch.whatsappPhoneNumberId = priv.whatsapp.phoneNumberId;

    if (!Object.keys(patch).length) return;

    await inboxRef(inbox.id).update(stripUndefined({ ...patch, updatedAt: Date.now() }));
    await bindChannelPointers({ ...inbox, ...patch });
};

export const saveSharedInbox = async (args: {
    credentialCompanyId: string;
    memberCompanyIds: string[];
    fallbackCompanyId?: string;
    name?: string;
    whatsappLive?: boolean;
    inboxId?: string;
}): Promise<SharedInbox> => {
    const credentialCompanyId = args.credentialCompanyId;
    const existingIdSnap = await db().ref(routingPath(`inboxMembers/${credentialCompanyId}`)).once('value');
    const inboxId = args.inboxId || (existingIdSnap.val() as string | null) || db().ref().push().key as string;

    const previous = await inboxById(inboxId);
    const now = Date.now();

    const fallbackCompanyId = args.fallbackCompanyId || previous?.fallbackCompanyId || credentialCompanyId;
    const memberCompanyIds = uniqueIds([
        credentialCompanyId,
        fallbackCompanyId,
        ...args.memberCompanyIds,
    ]);

    const priv = await readPrivate(credentialCompanyId);

    const inbox: SharedInbox = {
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
    delete (meta as { id?: string }).id;
    await inboxRef(inboxId).update(stripUndefined(meta));

    const previousMembers = new Set(previous?.memberCompanyIds || []);
    const nextMembers = new Set(memberCompanyIds);

    await Promise.all([
        ...memberCompanyIds.map(id => db().ref(routingPath(`inboxMembers/${id}`)).set(inboxId)),
        ...Array.from(previousMembers)
            .filter(id => !nextMembers.has(id))
            .map(id => db().ref(routingPath(`inboxMembers/${id}`)).remove()),
    ]);

    await bindChannelPointers(inbox);
    return inbox;
};
