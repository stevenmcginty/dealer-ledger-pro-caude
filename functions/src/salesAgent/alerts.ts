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

import {
    agentPath,
    db,
    readSettings,
} from './conversations';
import { sanitiseTemplateParam, sendWhatsAppTemplate, sendWhatsAppText } from './channels/whatsapp';
import { sendOwnerPush, sendPushToCompanyAndInbox } from './push';
import { Conversation, OwnerAlert, OwnerAlertKind, SalesAgentSettings, stripUndefined } from './types';

/** Approved template used when Steve has not messaged the number for over 24 hours. */
export const OWNER_ALERT_TEMPLATE = 'owner_alert';

/** Set by the router every time a message arrives from the owner's number. */
export const recordOwnerInbound = async (companyId: string): Promise<void> => {
    await db().ref(agentPath(companyId, 'ownerLastInboundAt')).set(Date.now());
};

const ownerLastInboundAt = async (companyId: string): Promise<number> => {
    const snap = await db().ref(agentPath(companyId, 'ownerLastInboundAt')).once('value');
    return (snap.val() as number | null) || 0;
};

/**
 * Meta treats Steve like any other customer: free text to his number is only allowed
 * within 24 hours of him messaging in. Outside that, the alert has to go as an approved
 * template with the whole message squeezed into one parameter.
 */
const deliver = async (companyId: string, text: string, agentName: string): Promise<void> => {
    const settings = await readSettings(companyId);
    const to = settings.ownerAlertNumber;

    if (!to) throw new Error('No ownerAlertNumber is set');

    const lastInbound = await ownerLastInboundAt(companyId);
    if (Date.now() - lastInbound < 24 * 3_600_000) {
        await sendWhatsAppText(companyId, to, text);
        return;
    }

    await sendWhatsAppTemplate(companyId, to, OWNER_ALERT_TEMPLATE, [
        sanitiseTemplateParam(`${agentName}: ${text}`),
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
export const sendOwnerAlert = async (
    companyId: string,
    kind: OwnerAlertKind,
    conversation: Conversation | null,
    text: string,
    push?: OwnerAlert['push']
): Promise<void> => {
    const ref = db().ref(agentPath(companyId, 'ownerAlerts')).push();

    const alert: OwnerAlert = {
        id: ref.key as string,
        kind,
        convId: conversation?.id || '',
        shortId: conversation?.shortId || 0,
        text,
        ...(push ? { push } : {}),
        sentAt: Date.now(),
    };

    let settings: SalesAgentSettings | null = null;
    const skipWhatsApp = kind === 'inbound';

    try {
        settings = await readSettings(companyId);
        if (!skipWhatsApp) {
            await deliver(companyId, text, settings.agentName || 'Dave');
            alert.deliveredVia = 'whatsapp';
        } else {
            alert.deliveredVia = 'none';
        }
    } catch (error: any) {
        console.error(`Owner alert (${kind}) for company ${companyId} could not be delivered`, error);
        alert.deliveredVia = 'none';
        alert.error = error?.message || String(error);
    }

    const fanOut = kind === 'new_conversation' || kind === 'inbound' || kind === 'escalation';
    const pushedTo = fanOut
        ? await sendPushToCompanyAndInbox(companyId, settings, alert)
        : await sendOwnerPush(companyId, settings, alert);
    if (pushedTo > 0) {
        alert.pushedTo = pushedTo;
        if (alert.deliveredVia !== 'whatsapp') alert.deliveredVia = 'push';
    }

    try {
        await ref.set(stripUndefined(alert));
    } catch (error) {
        console.error(`Owner alert (${kind}) for company ${companyId} could not be recorded`, error);
    }
};

/**
 * A direct message to Steve that is not an alert — the confirmation after a command.
 * He has just messaged in by definition, so the window is open and free text is fine.
 */
export const sendOwnerText = async (companyId: string, text: string): Promise<void> => {
    try {
        const settings = await readSettings(companyId);
        if (!settings.ownerAlertNumber) return;
        await sendWhatsAppText(companyId, settings.ownerAlertNumber, text);
    } catch (error) {
        console.error(`Could not reply to the owner for company ${companyId}`, error);
    }
};

/** Every alert opens with the short id, because that is the handle for every command. */
export const alertPrefix = (conversation: Conversation | null): string =>
    conversation ? `#${conversation.shortId} ` : '';

/** How a customer is named in an alert: their name if we have one, their address if not. */
export const describeCustomer = (conversation: Conversation): string => {
    const name = [conversation.contact?.firstName, conversation.contact?.lastName]
        .filter(Boolean)
        .join(' ')
        .trim();

    return name || conversation.address;
};
