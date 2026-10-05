"use strict";
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
exports.salesAgentCorrectThread = exports.correctThreadVehicle = exports.moveConversationHome = exports.parseCorrectionInput = exports.carFromCorrection = exports.positivePartOfNote = void 0;
const functions = __importStar(require("firebase-functions/v1"));
const gmail_1 = require("./channels/gmail");
const conversations_1 = require("./conversations");
const inboxRouting_1 = require("./inboxRouting");
const lessons_1 = require("./lessons");
const router_1 = require("./router");
const leadParsers_1 = require("./channels/leadParsers");
const search_1 = require("./stock/search");
const types_1 = require("./types");
/**
 * The part of a correction that names a car.
 *
 * People correct by contrast — "it's the black Boxster, not the Taycan" — and
 * feeding that whole sentence to the matcher is how you get handed the Taycan
 * straight back. Everything from the first negation onwards is dropped.
 */
const positivePartOfNote = (note) => {
    const cut = note.split(/\b(?:not|isn'?t|is not|rather than|instead of)\b/i)[0];
    return (cut || note).trim();
};
exports.positivePartOfNote = positivePartOfNote;
/**
 * Which car Steve means. `stockId` is taken as given; otherwise the note is put
 * through the same strict matcher the router uses, minus the car it already got
 * wrong, so "another Porsche" cannot resolve back to the Porsche being
 * complained about.
 */
const carFromCorrection = (items, note, stockId, excludeStockId) => {
    if (stockId)
        return items.find(item => item.id === stockId) || null;
    const text = (0, exports.positivePartOfNote)(note);
    if (!text)
        return null;
    const candidates = excludeStockId ? items.filter(item => item.id !== excludeStockId) : items;
    return (0, search_1.matchNamedStock)(candidates, text);
};
exports.carFromCorrection = carFromCorrection;
/**
 * The callable's arguments, checked. At least one way of saying which car is
 * needed: a stock car, a ledger car, "No car", a title typed in, or a note.
 * Throws invalid-argument otherwise.
 */
const parseCorrectionInput = (data) => {
    const raw = (data && typeof data === 'object' ? data : {});
    const text = (value) => (typeof value === 'string' ? value.trim() : '');
    const input = {
        note: text(raw.note),
        ...(text(raw.stockId) ? { stockId: text(raw.stockId) } : {}),
        ...(text(raw.ledgerVehicleId) ? { ledgerVehicleId: text(raw.ledgerVehicleId) } : {}),
        ...(text(raw.vehicleCompanyId) ? { vehicleCompanyId: text(raw.vehicleCompanyId) } : {}),
        ...(raw.noCar === true ? { noCar: true } : {}),
        ...(text(raw.freeTitle) ? { freeTitle: text(raw.freeTitle) } : {}),
    };
    if (!input.note && !input.stockId && !input.ledgerVehicleId && !input.noCar && !input.freeTitle) {
        throw new functions.https.HttpsError('invalid-argument', 'Pick a car, or choose No car.');
    }
    return input;
};
exports.parseCorrectionInput = parseCorrectionInput;
/** "YA08 MLL" or "ya08mll" typed as the whole title, or a plate in capitals inside it. */
const regInTitle = (title) => {
    const whole = title.replace(/\s+/g, '').toUpperCase();
    if (/^(?:[A-Z]{2}[0-9]{2}[A-Z]{3}|[A-Z][0-9]{1,3}[A-Z]{3}|[A-Z]{3}[0-9]{1,3}[A-Z])$/.test(whole))
        return whole;
    return (0, leadParsers_1.findReg)(title);
};
/** A ledger car as the thread stores it, for one that is not in the stock index (a sold car). */
const pinFromLedgerVehicle = async (vehicleCompanyId, ledgerVehicleId) => {
    const snap = await (0, conversations_1.db)().ref(`companies/${vehicleCompanyId}/vehicles/${ledgerVehicleId}`).once('value');
    const vehicle = snap.val();
    if (!vehicle)
        return null;
    const reg = String(vehicle.reg || '').replace(/\s+/g, '').toUpperCase();
    const title = [vehicle.year, vehicle.make, vehicle.model]
        .map(part => String(part ?? '').trim())
        .filter(Boolean)
        .join(' ') || reg || 'Vehicle';
    return { title, ...(reg ? { reg } : {}), ledgerVehicleId, ownerCompanyId: vehicleCompanyId };
};
/** Every address this customer is known by, so no index is left pointing at the old home. */
const addressesOf = (conversation) => {
    const contact = conversation.contact || {};
    const out = [[conversation.channel, conversation.address]];
    if (contact.email)
        out.push(['email', contact.email]);
    if (contact.phone)
        out.push(['whatsapp', contact.phone], ['sms', contact.phone]);
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
const moveConversationHome = async (fromCompanyId, toCompanyId, convId, inbox) => {
    const sourceRef = (0, conversations_1.db)().ref((0, conversations_1.agentPath)(fromCompanyId, `conversations/${convId}`));
    const snap = await sourceRef.once('value');
    if (!snap.exists())
        throw new Error(`Conversation ${convId} not found`);
    const raw = snap.val();
    const targetRef = (0, conversations_1.db)().ref((0, conversations_1.agentPath)(toCompanyId, 'conversations')).push();
    const newId = targetRef.key;
    const shortId = await (0, conversations_1.allocateShortId)(toCompanyId);
    const leadId = await (0, conversations_1.findOrCreateLead)(toCompanyId, raw.contact || {}, raw.originChannel === 'email' ? 'Website' : 'Other', raw.vehicleInterest?.title);
    const moved = {
        ...raw,
        id: newId,
        companyId: toCompanyId,
        shortId,
        contact: { ...(raw.contact || {}), ...(leadId ? { leadId } : {}) },
        movedFrom: { companyId: fromCompanyId, convId, at: Date.now() },
        updatedAt: Date.now(),
    };
    await targetRef.set((0, types_1.stripUndefined)(moved));
    await (0, conversations_1.db)().ref((0, conversations_1.agentPath)(toCompanyId, `shortIds/${shortId}`)).set(newId);
    // Indexes, in the order that keeps the thread reachable throughout: point the
    // new home at it first, then the shared inbox, then let go of the old one.
    for (const [channel, address] of addressesOf(raw)) {
        await (0, conversations_1.indexContact)(toCompanyId, channel, address, newId);
    }
    if (inbox) {
        for (const [channel, address] of addressesOf(raw)) {
            const key = (0, types_1.rtdbKey)((0, types_1.normaliseAddress)(channel, address));
            await (0, conversations_1.db)()
                .ref((0, conversations_1.routingPath)(`sharedInboxes/${inbox.id}/contactIndex/${key}`))
                .set({ companyId: toCompanyId, convId: newId });
        }
    }
    // Delivery receipts arrive knowing only the provider's id and look the message
    // up here, so the pointers have to travel with the messages.
    const outboundSnap = await (0, conversations_1.db)().ref((0, conversations_1.agentPath)(fromCompanyId, 'outboundIndex')).once('value');
    const outbound = (outboundSnap.val() || {});
    const carried = {};
    const dropped = {};
    Object.entries(outbound).forEach(([key, value]) => {
        if (value?.convId !== convId)
            return;
        carried[key] = { ...value, convId: newId };
        dropped[key] = null;
    });
    if (Object.keys(carried).length) {
        await (0, conversations_1.db)().ref((0, conversations_1.agentPath)(toCompanyId, 'outboundIndex')).update((0, types_1.stripUndefined)(carried));
        await (0, conversations_1.db)().ref((0, conversations_1.agentPath)(fromCompanyId, 'outboundIndex')).update(dropped);
    }
    for (const [channel, address] of addressesOf(raw)) {
        const key = (0, types_1.rtdbKey)((0, types_1.normaliseAddress)(channel, address));
        await (0, conversations_1.db)().ref((0, conversations_1.agentPath)(fromCompanyId, `contactIndex/${key}`)).remove();
    }
    await (0, conversations_1.db)().ref((0, conversations_1.agentPath)(fromCompanyId, `shortIds/${raw.shortId}`)).remove();
    await sourceRef.remove();
    // The Gmail label is how either dealer tells whose lead it is from the mailbox
    // itself, so it has to follow the thread. Best effort; a label is not worth
    // failing a move over.
    if (raw.emailThreadId) {
        try {
            const settings = await (0, conversations_1.readSettings)(toCompanyId);
            await (0, gmail_1.labelEmailThread)(toCompanyId, raw.emailThreadId, (0, router_1.ledgerLabelName)(settings), 'ledger');
        }
        catch (error) {
            console.warn(`Could not relabel ${raw.emailThreadId} after moving it`, error.message);
        }
    }
    return newId;
};
exports.moveConversationHome = moveConversationHome;
/** What a ledger is called when we have to say it out loud. */
const ledgerName = async (companyId) => {
    const settings = await (0, conversations_1.readSettings)(companyId);
    return (settings.ownerName || '').trim() || (settings.dealershipName || '').trim() || 'the other ledger';
};
/**
 * Put Dave right about which car a thread is about, and act on it.
 *
 * The desk says which car in one of five ways, most explicit first: a car from
 * the stock index (`stockId`), a car on a ledger (`ledgerVehicleId`, for one that
 * has sold and left the index), "No car" (`noCar`), a title typed in by hand
 * (`freeTitle`), or a note in its own words. Whichever it is, the pick is
 * stamped `carSetByOwner` so nothing automatic moves it again.
 *
 * Everything here is best-effort in one direction only: if no car can be found
 * the correction is still recorded, the wrong car is still unpinned and the bad
 * draft is still binned. Leaving a thread pinned to a car Steve has just said is
 * wrong would be worse than leaving it pinned to nothing.
 */
const correctThreadVehicle = async (args) => {
    const { companyId, convId, by } = args;
    const note = (args.note || '').trim();
    const conversation = await (0, conversations_1.getConversation)(companyId, convId);
    if (!conversation)
        throw new Error(`Conversation ${convId} not found`);
    const inbox = await (0, inboxRouting_1.inboxForMember)(companyId);
    const credentialCompany = await (0, inboxRouting_1.credentialsCompanyId)(companyId);
    const wasTitle = conversation.vehicleInterest?.title;
    // The credential company's index is the one that carries the whole website,
    // other dealers' cars included, so it is the only place a correction can find
    // a car that is not on this ledger.
    let car = null;
    let vehicleInterest = null;
    /** True when the desk asked for a car and none could be found: the thread is flagged. */
    let unidentified = false;
    if (args.stockId) {
        car = (0, exports.carFromCorrection)(await (0, search_1.readStock)(credentialCompany), note, args.stockId);
        unidentified = !car;
    }
    else if (args.ledgerVehicleId) {
        const vehicleCompanyId = args.vehicleCompanyId || companyId;
        if (vehicleCompanyId !== companyId && !inbox?.memberCompanyIds.includes(vehicleCompanyId)) {
            throw new Error('That car is not on a ledger this inbox shares.');
        }
        const stock = await (0, search_1.readStock)(credentialCompany);
        car = stock.find(item => item.id === `ledger-${args.ledgerVehicleId}`
            || (item.ledgerVehicleId === args.ledgerVehicleId && item.ownerCompanyId === vehicleCompanyId)) || null;
        if (!car) {
            vehicleInterest = await pinFromLedgerVehicle(vehicleCompanyId, args.ledgerVehicleId);
            if (!vehicleInterest)
                throw new Error('That car was not found on the ledger.');
        }
    }
    else if (args.noCar) {
        vehicleInterest = null;
    }
    else if (args.freeTitle) {
        const reg = regInTitle(args.freeTitle);
        vehicleInterest = { title: args.freeTitle, ...(reg ? { reg } : {}) };
    }
    else {
        car = (0, exports.carFromCorrection)(await (0, search_1.readStock)(credentialCompany), note, undefined, conversation.vehicleInterest?.stockId);
        unidentified = !car;
    }
    if (car)
        vehicleInterest = (0, search_1.pinFromStock)(car);
    // A typed title or "No car" stays on this ledger; only a real car can move it.
    const ownerCompanyId = args.noCar || args.freeTitle ? undefined : vehicleInterest?.ownerCompanyId;
    const willMove = !!ownerCompanyId &&
        ownerCompanyId !== companyId &&
        !!inbox &&
        inbox.memberCompanyIds.includes(ownerCompanyId);
    const pinnedTitle = vehicleInterest?.title || '';
    const fact = car
        ? `It is the ${(0, search_1.describeStockItem)(car)}.`
        : vehicleInterest
            ? `It is the ${pinnedTitle}${vehicleInterest.reg && !pinnedTitle.includes(vehicleInterest.reg) ? ` (reg ${vehicleInterest.reg})` : ''}.`
            : args.noCar ? 'It is not about any one car.' : '';
    // Bin the draft first: it was written about the wrong car, and if the thread is
    // about to move it must not travel with it.
    await (0, router_1.discardDraft)(companyId, convId).catch(() => ({ had: false }));
    await (0, conversations_1.updateConversation)(companyId, convId, {
        vehicleInterest,
        carSetByOwner: Date.now(),
        // A correction is a fact about this thread, not a passing note, so it goes
        // where the prompt already reads from.
        summary: [
            conversation.summary || '',
            `The desk corrected the car on this thread:${note ? ` ${note}` : ''}${fact ? ` ${fact}` : ''}`,
        ].filter(Boolean).join(' '),
        ...(unidentified ? { escalated: true, escalationReason: 'The car on this thread was wrong and could not be identified' } : {}),
    });
    // Only words are a lesson. A pick from the list teaches Dave nothing new.
    const lesson = note
        ? {
            note,
            convId,
            ...(by ? { by } : {}),
            ...(wasTitle ? { was: wasTitle } : {}),
            ...(pinnedTitle ? { corrected: pinnedTitle } : {}),
            ...(willMove ? { movedTo: ownerCompanyId } : {}),
        }
        : null;
    if (lesson)
        await (0, lessons_1.recordLesson)(companyId, lesson);
    let homeCompanyId = companyId;
    let homeConvId = convId;
    let toName;
    if (willMove && ownerCompanyId) {
        homeConvId = await (0, exports.moveConversationHome)(companyId, ownerCompanyId, convId, inbox);
        homeCompanyId = ownerCompanyId;
        toName = await ledgerName(ownerCompanyId);
        await (0, conversations_1.updateConversation)(homeCompanyId, homeConvId, {
            routing: {
                inboxId: inbox?.id || '',
                reason: 'corrected',
                ownerCompanyId,
            },
        });
        // The receiving ledger learns it too — it is their car and their lead.
        if (lesson)
            await (0, lessons_1.recordLesson)(ownerCompanyId, { ...lesson, convId: homeConvId });
    }
    // Redraft on whichever ledger now owns it, unless that dealer has the agent off.
    const homeSettings = await (0, conversations_1.readSettings)(homeCompanyId);
    let redrafted = false;
    if (homeSettings.enabled) {
        try {
            const result = await (0, router_1.draftNow)(homeCompanyId, homeConvId, true);
            redrafted = result.drafted;
        }
        catch (error) {
            console.warn(`Could not redraft ${homeConvId} after a correction`, error.message);
        }
    }
    const agent = homeSettings.agentName || 'Dave';
    const again = redrafted ? ` ${agent} is writing it again.` : '';
    const message = unidentified
        ? `Noted, and ${agent} will remember it. No car on the site matched that, so this thread is flagged for you.`
        : !vehicleInterest
            ? `Set to no car.${again}`
            : willMove
                ? `Moved to ${toName}'s ledger and pinned to the ${pinnedTitle}.${again}`
                : `Pinned to the ${pinnedTitle}.${again}`;
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
exports.correctThreadVehicle = correctThreadVehicle;
/**
 * The Agent Inbox's car picker ("Wrong car").
 *
 * Takes `{ companyId, convId, note?, stockId?, ledgerVehicleId?, vehicleCompanyId?,
 * noCar?, freeTitle? }`; at least one of note / stockId / ledgerVehicleId / noCar /
 * freeTitle. Mounts the brain and Gmail secrets because the redraft at the end of
 * it is a full agent turn on the receiving ledger.
 */
exports.salesAgentCorrectThread = functions
    .runWith({ secrets: [...conversations_1.BRAIN_SECRETS, 'GMAIL_CLIENT_ID', 'GMAIL_CLIENT_SECRET'], timeoutSeconds: 300, memory: '1GB' })
    .https.onCall(async (data, context) => {
    const companyId = await (0, conversations_1.requireInboxAccess)(context, data?.companyId);
    const convId = String(data?.convId || '');
    if (!convId)
        throw new functions.https.HttpsError('invalid-argument', 'No conversation was given.');
    const input = (0, exports.parseCorrectionInput)(data);
    try {
        return await (0, exports.correctThreadVehicle)({
            companyId,
            convId,
            ...input,
            ...(context.auth?.uid ? { by: context.auth.uid } : {}),
        });
    }
    catch (error) {
        throw new functions.https.HttpsError('internal', error?.message || 'That correction could not be applied.');
    }
});
//# sourceMappingURL=correction.js.map