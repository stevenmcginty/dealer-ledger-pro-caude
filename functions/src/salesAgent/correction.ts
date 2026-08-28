/**
 * "Wrong car."
 *
 * The shared inbox places a thread by working out which advert the enquiry is
 * about. When the enquiry says almost nothing — "is this still available", no
 * reg, no stock number — that guess can land on a car that sold months ago, and
 * once it has, everything downstream is wrong: the thread sits on the wrong
 * ledger, Dave quotes the wrong price, and the dealer who actually owns the car
 * never sees the lead.
 *
 * This is the one button that fixes all of it. Steve says which car it really
 * is, in his own words, and:
 *   1. the thread is re-pinned to that car,
 *   2. if the car belongs to another ledger on the shared inbox, the whole
 *      conversation moves there — messages, lead history, indexes and all,
 *   3. the bad draft is binned,
 *   4. what he said is kept as a lesson and read back into the prompt from then
 *      on, and
 *   5. Dave writes the reply again, on the ledger that now owns it.
 *
 * Moving a thread is the only place in this codebase where a conversation
 * changes company, so it is done here, once, carefully, and nowhere else.
 */

import * as functions from 'firebase-functions/v1';

import { labelEmailThread } from './channels/gmail';
import {
    BRAIN_SECRETS,
    agentPath,
    allocateShortId,
    db,
    findOrCreateLead,
    getConversation,
    indexContact,
    readSettings,
    requireInboxAccess,
    routingPath,
    updateConversation,
} from './conversations';
import { inboxForMember, credentialsCompanyId } from './inboxRouting';
import { recordLesson } from './lessons';
import { draftNow, discardDraft, ledgerLabelName } from './router';
import { matchEnquiryStock, readStock, describeStockItem } from './stock/search';
import {
    Channel,
    Contact,
    Conversation,
    SharedInbox,
    StockItem,
    normaliseAddress,
    rtdbKey,
    stripUndefined,
} from './types';

export interface CorrectionResult {
    ok: true;
    /** The car the thread is now pinned to, if the note named one we hold. */
    vehicle?: { stockId: string; title: string; ownerCompanyId?: string; status: string };
    /** True when the thread was moved to another ledger. */
    moved: boolean;
    /** Where it went, and what that dealer is called, when it moved. */
    toCompanyId?: string;
    toName?: string;
    /** The thread's id after the move — the client has to follow it. */
    convId: string;
    companyId: string;
    /** False when the receiving ledger has the agent switched off. */
    redrafted: boolean;
    /** One sentence for the toast, written here so the UI does not have to guess. */
    message: string;
}

/**
 * The part of a correction that names a car.
 *
 * People correct by contrast — "it's the black Boxster, not the Taycan" — and
 * feeding that whole sentence to the matcher is how you get handed the Taycan
 * straight back. Everything from the first negation onwards is dropped.
 */
export const positivePartOfNote = (note: string): string => {
    const cut = note.split(/\b(?:not|isn'?t|is not|rather than|instead of)\b/i)[0];
    return (cut || note).trim();
};

/**
 * Which car Steve means. `stockId` is taken as given; otherwise the note is put
 * through the same matcher the router uses, minus the car it already got wrong,
 * so "another Porsche" cannot resolve back to the Porsche being complained about.
 */
export const carFromCorrection = (
    items: StockItem[],
    note: string,
    stockId?: string,
    excludeStockId?: string
): StockItem | null => {
    if (stockId) return items.find(item => item.id === stockId) || null;

    const text = positivePartOfNote(note);
    if (!text) return null;

    const candidates = excludeStockId ? items.filter(item => item.id !== excludeStockId) : items;
    return matchEnquiryStock(candidates, { text });
};

/** Every address this customer is known by, so no index is left pointing at the old home. */
const addressesOf = (conversation: Conversation): Array<[Channel, string]> => {
    const contact: Contact = conversation.contact || {};
    const out: Array<[Channel, string]> = [[conversation.channel, conversation.address]];
    if (contact.email) out.push(['email', contact.email]);
    if (contact.phone) out.push(['whatsapp', contact.phone], ['sms', contact.phone]);
    return out.filter(([, address]) => !!address);
};

/**
 * Move a whole conversation to another ledger.
 *
 * The node is copied wholesale rather than rebuilt field by field: the messages,
 * the delivery receipts on them and the media links all have to survive, and a
 * hand-written copy is exactly the kind of thing that silently drops a key when
 * the shape changes. What is rewritten is only what is genuinely per-company —
 * the id, the short id and the CRM lead — plus every index that pointed at the
 * old home.
 *
 * Returns the id the thread has on its new ledger.
 */
export const moveConversationHome = async (
    fromCompanyId: string,
    toCompanyId: string,
    convId: string,
    inbox: SharedInbox | null
): Promise<string> => {
    const sourceRef = db().ref(agentPath(fromCompanyId, `conversations/${convId}`));
    const snap = await sourceRef.once('value');
    if (!snap.exists()) throw new Error(`Conversation ${convId} not found`);

    const raw = snap.val() as Conversation & Record<string, unknown>;
    const targetRef = db().ref(agentPath(toCompanyId, 'conversations')).push();
    const newId = targetRef.key as string;

    const shortId = await allocateShortId(toCompanyId);
    const leadId = await findOrCreateLead(
        toCompanyId,
        raw.contact || {},
        raw.originChannel === 'email' ? 'Website' : 'Other',
        raw.vehicleInterest?.title
    );

    const moved = {
        ...raw,
        id: newId,
        companyId: toCompanyId,
        shortId,
        contact: { ...(raw.contact || {}), ...(leadId ? { leadId } : {}) },
        movedFrom: { companyId: fromCompanyId, convId, at: Date.now() },
        updatedAt: Date.now(),
    };

    await targetRef.set(stripUndefined(moved));
    await db().ref(agentPath(toCompanyId, `shortIds/${shortId}`)).set(newId);

    // Indexes, in the order that keeps the thread reachable throughout: point the
    // new home at it first, then the shared inbox, then let go of the old one.
    for (const [channel, address] of addressesOf(raw)) {
        await indexContact(toCompanyId, channel, address, newId);
    }

    if (inbox) {
        for (const [channel, address] of addressesOf(raw)) {
            const key = rtdbKey(normaliseAddress(channel, address));
            await db()
                .ref(routingPath(`sharedInboxes/${inbox.id}/contactIndex/${key}`))
                .set({ companyId: toCompanyId, convId: newId });
        }
    }

    // Delivery receipts arrive knowing only the provider's id and look the message
    // up here, so the pointers have to travel with the messages.
    const outboundSnap = await db().ref(agentPath(fromCompanyId, 'outboundIndex')).once('value');
    const outbound = (outboundSnap.val() || {}) as Record<string, { convId?: string; messageId?: string; at?: number }>;
    const carried: Record<string, unknown> = {};
    const dropped: Record<string, null> = {};
    Object.entries(outbound).forEach(([key, value]) => {
        if (value?.convId !== convId) return;
        carried[key] = { ...value, convId: newId };
        dropped[key] = null;
    });
    if (Object.keys(carried).length) {
        await db().ref(agentPath(toCompanyId, 'outboundIndex')).update(stripUndefined(carried));
        await db().ref(agentPath(fromCompanyId, 'outboundIndex')).update(dropped);
    }

    for (const [channel, address] of addressesOf(raw)) {
        const key = rtdbKey(normaliseAddress(channel, address));
        await db().ref(agentPath(fromCompanyId, `contactIndex/${key}`)).remove();
    }
    await db().ref(agentPath(fromCompanyId, `shortIds/${raw.shortId}`)).remove();
    await sourceRef.remove();

    // The Gmail label is how either dealer tells whose lead it is from the mailbox
    // itself, so it has to follow the thread. Best effort; a label is not worth
    // failing a move over.
    if (raw.emailThreadId) {
        try {
            const settings = await readSettings(toCompanyId);
            await labelEmailThread(toCompanyId, raw.emailThreadId, ledgerLabelName(settings), 'ledger');
        } catch (error) {
            console.warn(`Could not relabel ${raw.emailThreadId} after moving it`, (error as Error).message);
        }
    }

    return newId;
};

/** What a ledger is called when we have to say it out loud. */
const ledgerName = async (companyId: string): Promise<string> => {
    const settings = await readSettings(companyId);
    return (settings.ownerName || '').trim() || (settings.dealershipName || '').trim() || 'the other ledger';
};

/**
 * Put Dave right about which car a thread is about, and act on it.
 *
 * Everything here is best-effort in one direction only: if no car can be found
 * the correction is still recorded, the wrong car is still unpinned and the bad
 * draft is still binned. Leaving a thread pinned to a car Steve has just said is
 * wrong would be worse than leaving it pinned to nothing.
 */
export const correctThreadVehicle = async (args: {
    companyId: string;
    convId: string;
    note: string;
    stockId?: string;
    by?: string;
}): Promise<CorrectionResult> => {
    const { companyId, convId, note, stockId, by } = args;

    const conversation = await getConversation(companyId, convId);
    if (!conversation) throw new Error(`Conversation ${convId} not found`);

    const inbox = await inboxForMember(companyId);
    const credentialCompany = await credentialsCompanyId(companyId);

    // The credential company's index is the one that carries the whole website,
    // other dealers' cars included, so it is the only place a correction can find
    // a car that is not on this ledger.
    const stock = await readStock(credentialCompany);
    const wasTitle = conversation.vehicleInterest?.title;
    const car = carFromCorrection(stock, note, stockId, conversation.vehicleInterest?.stockId);

    const ownerCompanyId = car?.ownerCompanyId;
    const willMove =
        !!car &&
        !!ownerCompanyId &&
        ownerCompanyId !== companyId &&
        !!inbox &&
        inbox.memberCompanyIds.includes(ownerCompanyId);

    const vehicleInterest = car
        ? {
            stockId: car.id,
            title: car.title,
            ...(car.ledgerVehicleId ? { ledgerVehicleId: car.ledgerVehicleId } : {}),
            ...(car.ownerCompanyId ? { ownerCompanyId: car.ownerCompanyId } : {}),
        }
        : null;

    // Bin the draft first: it was written about the wrong car, and if the thread is
    // about to move it must not travel with it.
    await discardDraft(companyId, convId).catch(() => ({ had: false }));

    await updateConversation(companyId, convId, {
        vehicleInterest,
        // A correction is a fact about this thread, not a passing note, so it goes
        // where the prompt already reads from.
        summary: [
            conversation.summary || '',
            `The desk corrected the car on this thread: ${note.trim()}${car ? ` It is the ${describeStockItem(car)}.` : ''}`,
        ].filter(Boolean).join(' '),
        ...(car ? {} : { escalated: true, escalationReason: 'The car on this thread was wrong and could not be identified' }),
    });

    const lesson = {
        note: note.trim(),
        convId,
        ...(by ? { by } : {}),
        ...(wasTitle ? { was: wasTitle } : {}),
        ...(car ? { corrected: car.title } : {}),
        ...(willMove ? { movedTo: ownerCompanyId } : {}),
    };
    await recordLesson(companyId, lesson);

    let homeCompanyId = companyId;
    let homeConvId = convId;
    let toName: string | undefined;

    if (willMove && ownerCompanyId) {
        homeConvId = await moveConversationHome(companyId, ownerCompanyId, convId, inbox);
        homeCompanyId = ownerCompanyId;
        toName = await ledgerName(ownerCompanyId);
        await updateConversation(homeCompanyId, homeConvId, {
            routing: {
                inboxId: inbox?.id || '',
                reason: 'corrected',
                ownerCompanyId,
            },
        });
        // The receiving ledger learns it too — it is their car and their lead.
        await recordLesson(ownerCompanyId, { ...lesson, convId: homeConvId });
    }

    // Redraft on whichever ledger now owns it, unless that dealer has the agent off.
    const homeSettings = await readSettings(homeCompanyId);
    let redrafted = false;
    if (homeSettings.enabled) {
        try {
            const result = await draftNow(homeCompanyId, homeConvId, true);
            redrafted = result.drafted;
        } catch (error) {
            console.warn(`Could not redraft ${homeConvId} after a correction`, (error as Error).message);
        }
    }

    const agent = homeSettings.agentName || 'Dave';
    const message = !car
        ? `Noted, and ${agent} will remember it. No car on the site matched that, so this thread is flagged for you.`
        : willMove
            ? `Moved to ${toName}'s ledger and pinned to the ${car.title}.${redrafted ? ` ${agent} is writing it again.` : ''}`
            : `Pinned to the ${car.title}.${redrafted ? ` ${agent} is writing it again.` : ''}`;

    return {
        ok: true,
        ...(car ? { vehicle: { stockId: car.id, title: car.title, ownerCompanyId: car.ownerCompanyId, status: car.status } } : {}),
        moved: willMove,
        ...(willMove ? { toCompanyId: homeCompanyId, toName } : {}),
        convId: homeConvId,
        companyId: homeCompanyId,
        redrafted,
        message,
    };
};

/**
 * The Agent Inbox's "Wrong car" button.
 *
 * Mounts the brain and Gmail secrets because the redraft at the end of it is a
 * full agent turn on the receiving ledger.
 */
export const salesAgentCorrectThread = functions
    .runWith({ secrets: [...BRAIN_SECRETS, 'GMAIL_CLIENT_ID', 'GMAIL_CLIENT_SECRET'], timeoutSeconds: 300, memory: '1GB' })
    .https.onCall(async (data, context) => {
        const companyId = await requireInboxAccess(context, data?.companyId);
        const convId = String(data?.convId || '');
        const note = String(data?.note || '').trim();
        const stockId = String(data?.stockId || '').trim();

        if (!convId) throw new functions.https.HttpsError('invalid-argument', 'No conversation was given.');
        if (!note) throw new functions.https.HttpsError('invalid-argument', 'Tell Dave what the right car is.');

        try {
            return await correctThreadVehicle({
                companyId,
                convId,
                note,
                ...(stockId ? { stockId } : {}),
                ...(context.auth?.uid ? { by: context.auth.uid } : {}),
            });
        } catch (error: any) {
            throw new functions.https.HttpsError('internal', error?.message || 'That correction could not be applied.');
        }
    });
