"use strict";
/**
 * Telling Steve.
 *
 * Every alert goes to one WhatsApp number and every alert carries "#<shortId>", because
 * the reply to an alert is a command: he reads "#12 New WhatsApp enquiry..." and types
 * "TAKE OVER 12" back into the same chat.
 *
 * Nothing in here is allowed to throw. An alert is a notification about work that has
 * already happened — if the ping fails, the customer has still been answered and the
 * conversation is still on the screen in the app, so a failure is logged and recorded
 * against the alert rather than being allowed to take the caller down with it.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.describeCustomer = exports.alertPrefix = exports.sendOwnerText = exports.sendOwnerAlert = exports.recordOwnerInbound = exports.OWNER_ALERT_TEMPLATE = void 0;
const conversations_1 = require("./conversations");
const whatsapp_1 = require("./channels/whatsapp");
const push_1 = require("./push");
const types_1 = require("./types");
/** Approved template used when Steve has not messaged the number for over 24 hours. */
exports.OWNER_ALERT_TEMPLATE = 'owner_alert';
/** Set by the router every time a message arrives from the owner's number. */
const recordOwnerInbound = async (companyId) => {
    await (0, conversations_1.db)().ref((0, conversations_1.agentPath)(companyId, 'ownerLastInboundAt')).set(Date.now());
};
exports.recordOwnerInbound = recordOwnerInbound;
const ownerLastInboundAt = async (companyId) => {
    const snap = await (0, conversations_1.db)().ref((0, conversations_1.agentPath)(companyId, 'ownerLastInboundAt')).once('value');
    return snap.val() || 0;
};
/**
 * Meta treats Steve like any other customer: free text to his number is only allowed
 * within 24 hours of him messaging in. Outside that, the alert has to go as an approved
 * template with the whole message squeezed into one parameter.
 */
const deliver = async (companyId, text, agentName) => {
    const settings = await (0, conversations_1.readSettings)(companyId);
    const to = settings.ownerAlertNumber;
    if (!to)
        throw new Error('No ownerAlertNumber is set');
    const lastInbound = await ownerLastInboundAt(companyId);
    if (Date.now() - lastInbound < 24 * 3600000) {
        await (0, whatsapp_1.sendWhatsAppText)(companyId, to, text);
        return;
    }
    await (0, whatsapp_1.sendWhatsAppTemplate)(companyId, to, exports.OWNER_ALERT_TEMPLATE, [
        (0, whatsapp_1.sanitiseTemplateParam)(`${agentName}: ${text}`),
    ]);
};
/**
 * Send an alert and keep a record of it either way.
 *
 * The stored OwnerAlert is what the app's alert list reads, so an alert that could not
 * be delivered still shows up there — a silent failure would leave Steve believing
 * nothing had happened.
 *
 * Web push goes out alongside WhatsApp rather than instead of it, and it is attempted
 * even when the WhatsApp leg threw: the two channels fail for unrelated reasons, and
 * the whole point of the push is that it reaches the phone Steve is actually holding.
 */
const sendOwnerAlert = async (companyId, kind, conversation, text) => {
    const ref = (0, conversations_1.db)().ref((0, conversations_1.agentPath)(companyId, 'ownerAlerts')).push();
    const alert = {
        id: ref.key,
        kind,
        convId: conversation?.id || '',
        shortId: conversation?.shortId || 0,
        text,
        sentAt: Date.now(),
    };
    let settings = null;
    const skipWhatsApp = kind === 'inbound';
    try {
        settings = await (0, conversations_1.readSettings)(companyId);
        if (!skipWhatsApp) {
            await deliver(companyId, text, settings.agentName || 'Dave');
            alert.deliveredVia = 'whatsapp';
        }
        else {
            alert.deliveredVia = 'none';
        }
    }
    catch (error) {
        console.error(`Owner alert (${kind}) for company ${companyId} could not be delivered`, error);
        alert.deliveredVia = 'none';
        alert.error = error?.message || String(error);
    }
    const fanOut = kind === 'new_conversation' || kind === 'inbound' || kind === 'escalation';
    const pushedTo = fanOut
        ? await (0, push_1.sendPushToCompanyAndInbox)(companyId, settings, alert)
        : await (0, push_1.sendOwnerPush)(companyId, settings, alert);
    if (pushedTo > 0) {
        alert.pushedTo = pushedTo;
        if (alert.deliveredVia !== 'whatsapp')
            alert.deliveredVia = 'push';
    }
    try {
        await ref.set((0, types_1.stripUndefined)(alert));
    }
    catch (error) {
        console.error(`Owner alert (${kind}) for company ${companyId} could not be recorded`, error);
    }
};
exports.sendOwnerAlert = sendOwnerAlert;
/**
 * A direct message to Steve that is not an alert — the confirmation after a command.
 * He has just messaged in by definition, so the window is open and free text is fine.
 */
const sendOwnerText = async (companyId, text) => {
    try {
        const settings = await (0, conversations_1.readSettings)(companyId);
        if (!settings.ownerAlertNumber)
            return;
        await (0, whatsapp_1.sendWhatsAppText)(companyId, settings.ownerAlertNumber, text);
    }
    catch (error) {
        console.error(`Could not reply to the owner for company ${companyId}`, error);
    }
};
exports.sendOwnerText = sendOwnerText;
/** Every alert opens with the short id, because that is the handle for every command. */
const alertPrefix = (conversation) => conversation ? `#${conversation.shortId} ` : '';
exports.alertPrefix = alertPrefix;
/** How a customer is named in an alert: their name if we have one, their address if not. */
const describeCustomer = (conversation) => {
    const name = [conversation.contact?.firstName, conversation.contact?.lastName]
        .filter(Boolean)
        .join(' ')
        .trim();
    return name || conversation.address;
};
exports.describeCustomer = describeCustomer;
//# sourceMappingURL=alerts.js.map