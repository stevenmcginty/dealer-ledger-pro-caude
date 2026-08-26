/**
 * Running the agent from a WhatsApp chat.
 *
 * Steve is under a car most of the day. The alerts arrive on his phone and the controls
 * have to be there too, so anything he sends from his own number is read as a command
 * rather than as a customer message. The short id in every alert is the handle: "#12 New
 * WhatsApp enquiry..." is answered with "TAKE OVER 12".
 *
 * One shortcut matters more than the rest: when the agent has asked him a question and
 * only one conversation is waiting, a bare reply with no command word is taken as the
 * answer to it. Nobody types "ANSWER 12" while walking across a forecourt.
 */

import {
    agentPath,
    convIdForShortId,
    db,
    getConversation,
    listConversations,
    updateConversation,
} from './conversations';
import { sendOwnerText } from './alerts';
import { sendNow } from './outbox';
import { indexStock } from './stock';
import { answerPendingQuestion, approveDraft, needsApproval } from './router';
import { Conversation, OutboxJob, SalesAgentSettings } from './types';

const HELP = [
    'Commands:',
    'TAKE OVER 12 — you handle it, the agent goes quiet',
    'RESUME 12 — hand it back to the agent',
    'REPLY 12 your message — send that to the customer',
    'TELL 12 your message — the agent says it in its own words',
    'ANSWER 12 your answer — answer what the agent asked',
    'SEND 12 — send the email the agent drafted',
    'STATUS — what is open',
    'PAUSE ALL / RESUME ALL — the master switch',
    'STOCK — re-index the website now',
].join('\n');

const ago = (timestamp?: number): string => {
    if (!timestamp) return 'never';
    const minutes = Math.round((Date.now() - timestamp) / 60_000);
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.round(minutes / 60);
    if (hours < 48) return `${hours}h ago`;
    return `${Math.round(hours / 24)}d ago`;
};

const describe = (conversation: Conversation): string => {
    const name = [conversation.contact?.firstName, conversation.contact?.lastName]
        .filter(Boolean).join(' ').trim() || conversation.address;

    const waiting = conversation.pendingQuestion ? ' · WAITING ON YOU' : '';
    return `#${conversation.shortId} ${name} · ${conversation.channel} · ${conversation.mode} · ${conversation.stage} · ${ago(conversation.lastInboundAt)}${waiting}`;
};

/** Turn "#12" or "12" into the conversation it points at. */
const resolve = async (companyId: string, shortId: string): Promise<Conversation | null> => {
    const n = Number(String(shortId).replace('#', ''));
    if (!Number.isFinite(n)) return null;

    const convId = await convIdForShortId(companyId, n);
    if (!convId) return null;

    return getConversation(companyId, convId);
};

const setEnabled = async (companyId: string, enabled: boolean): Promise<void> => {
    await db().ref(agentPath(companyId, 'settings')).update({ enabled, updatedAt: Date.now() });
};

/** Send something to the customer as Steve, right now. */
const replyAsOwner = async (companyId: string, conversation: Conversation, text: string): Promise<void> => {
    const job: OutboxJob = {
        id: 'owner-reply',
        companyId,
        convId: conversation.id,
        channel: conversation.channel,
        to: conversation.address,
        text,
        subject: conversation.emailSubject,
        emailThreadId: conversation.emailThreadId,
        sendAfter: Date.now(),
        attempts: 0,
        createdAt: Date.now(),
    };

    await sendNow(job, 'owner');
};

/**
 * Read one message from Steve and do what it says.
 *
 * Nothing here throws at the caller: a command that fails still has to answer him, or
 * he is left staring at a chat that swallowed what he typed.
 */
export const handleOwnerCommand = async (
    companyId: string,
    settings: SalesAgentSettings,
    raw: string
): Promise<void> => {
    const text = (raw || '').trim();
    if (!text) return;

    try {
        const upper = text.toUpperCase();

        if (upper === 'PAUSE ALL') {
            await setEnabled(companyId, false);
            await sendOwnerText(companyId, 'Agent paused. Nothing will be answered until you send RESUME ALL.');
            return;
        }

        if (upper === 'RESUME ALL') {
            await setEnabled(companyId, true);
            await sendOwnerText(companyId, 'Agent back on.');
            return;
        }

        if (upper === 'STOCK') {
            await sendOwnerText(companyId, 'Re-indexing stock now, back in a couple of minutes.');
            try {
                const meta = await indexStock(companyId);
                await sendOwnerText(companyId, `Stock index done: ${meta.availableCount} available of ${meta.count}${meta.errors.length ? ` (${meta.errors.length} errors)` : ''}.`);
            } catch (e) {
                await sendOwnerText(companyId, `Stock re-index failed: ${(e as Error).message}`);
            }
            return;
        }

        if (upper === 'STATUS') {
            const conversations = (await listConversations(companyId))
                .filter(c => c.stage !== 'closed')
                .slice(0, 10);

            const waiting = conversations.filter(c => c.pendingQuestion).length;
            const header = `Agent is ${settings.enabled ? 'ON' : 'PAUSED'}. ${conversations.length} open` +
                (waiting ? `, ${waiting} waiting on you.` : '.');

            await sendOwnerText(
                companyId,
                conversations.length ? `${header}\n${conversations.map(describe).join('\n')}` : header
            );
            return;
        }

        const takeOver = text.match(/^TAKE\s*OVER\s+#?(\d+)\s*$/i);
        if (takeOver) {
            const conversation = await resolve(companyId, takeOver[1]);
            if (!conversation) return sendOwnerText(companyId, `No conversation #${takeOver[1]}.`);

            // Taking it over means the agent's words are not wanted, so a draft waiting on
            // approval goes in the bin rather than sitting there to be sent by accident.
            const hadDraft = !!conversation.pendingDraft;
            await updateConversation(companyId, conversation.id, { mode: 'human', pendingDraft: null });
            await sendOwnerText(
                companyId,
                `#${conversation.shortId} is yours. The agent has gone quiet on it.` +
                (hadDraft ? ' Its draft reply has been thrown away.' : '')
            );
            return;
        }

        const resume = text.match(/^RESUME\s+#?(\d+)\s*$/i);
        if (resume) {
            const conversation = await resolve(companyId, resume[1]);
            if (!conversation) return sendOwnerText(companyId, `No conversation #${resume[1]}.`);

            await updateConversation(companyId, conversation.id, { mode: 'agent' });
            await sendOwnerText(companyId, `#${conversation.shortId} handed back to the agent.`);
            return;
        }

        const reply = text.match(/^REPLY\s+#?(\d+)\s+([\s\S]+)$/i);
        if (reply) {
            const conversation = await resolve(companyId, reply[1]);
            if (!conversation) return sendOwnerText(companyId, `No conversation #${reply[1]}.`);

            try {
                await replyAsOwner(companyId, conversation, reply[2].trim());
                // Sending by hand means Steve is on it; the agent talking over him would
                // be worse than it staying quiet.
                await updateConversation(companyId, conversation.id, { mode: 'human' });
                await sendOwnerText(companyId, `Sent to #${conversation.shortId}. It is in your hands now — RESUME ${conversation.shortId} to give it back.`);
            } catch (error: any) {
                await sendOwnerText(companyId, `Could not send to #${conversation.shortId}: ${error?.message || 'unknown error'}`);
            }
            return;
        }

        // REPLY sends Steve's words as they are. TELL hands the substance to the agent
        // and lets it do the wording, which is what he wants most of the time: he knows
        // the cambelt was done at 80k, he does not want to type the sentence.
        const tell = text.match(/^(?:TELL|DAVE)\s+#?(\d+)\s+([\s\S]+)$/i);
        if (tell) {
            const conversation = await resolve(companyId, tell[1]);
            if (!conversation) return sendOwnerText(companyId, `No conversation #${tell[1]}.`);

            await deliverInstruction(companyId, settings, conversation, tell[2].trim());
            return;
        }

        // The whole of Draft & Approve on a forecourt: read the alert, type three
        // characters and a number.
        const send = text.match(/^(?:SEND|APPROVE|OK)\s+#?(\d+)\s*$/i);
        if (send) {
            const conversation = await resolve(companyId, send[1]);
            if (!conversation) return sendOwnerText(companyId, `No conversation #${send[1]}.`);

            try {
                const { name } = await approveDraft(companyId, conversation.id);
                await sendOwnerText(companyId, `Sent to ${name}.`);
            } catch (error: any) {
                await sendOwnerText(companyId, `Could not send #${conversation.shortId}: ${error?.message || 'unknown error'}`);
            }
            return;
        }

        const answer = text.match(/^ANSWER\s+#?(\d+)\s+([\s\S]+)$/i);
        if (answer) {
            const conversation = await resolve(companyId, answer[1]);
            if (!conversation) return sendOwnerText(companyId, `No conversation #${answer[1]}.`);

            await deliverAnswer(companyId, settings, conversation, answer[2].trim());
            return;
        }

        // No command word. If exactly one conversation is waiting on him, this is the
        // answer to it — anything else would be guessing.
        const open = await listConversations(companyId);
        const waiting = open.filter(c => c.pendingQuestion);

        if (waiting.length === 1) {
            await deliverAnswer(companyId, settings, waiting[0], text);
            return;
        }

        if (waiting.length > 1) {
            await sendOwnerText(
                companyId,
                `${waiting.length} conversations are waiting on you, so say which:\n` +
                waiting.map(c => `ANSWER ${c.shortId} — ${c.pendingQuestion?.question || ''}`).join('\n')
            );
            return;
        }

        // Nothing was asked, but one draft is sitting there waiting on him: a bare reply
        // to that alert is what he wants said differently, not a new command.
        const drafts = open.filter(c => c.pendingDraft);
        if (drafts.length === 1) {
            await deliverInstruction(companyId, settings, drafts[0], text);
            return;
        }

        await sendOwnerText(companyId, HELP);
    } catch (error: any) {
        console.error(`Owner command failed for company ${companyId}: "${text}"`, error);
        await sendOwnerText(companyId, `That did not work: ${error?.message || 'unknown error'}`);
    }
};

/**
 * Hand the agent something to say. Nothing is pending, so there is no reply to read back
 * to Steve yet — it goes out on the usual delay like any other agent message.
 *
 * On an email in approval mode nothing goes out at all: the rewording lands as a fresh
 * draft, and the alert carrying it is the reply to this.
 */
const deliverInstruction = async (
    companyId: string,
    settings: SalesAgentSettings,
    conversation: Conversation,
    instruction: string
): Promise<void> => {
    try {
        await answerPendingQuestion(companyId, conversation.id, instruction);

        const agent = settings.agentName || 'Dave';
        await sendOwnerText(
            companyId,
            needsApproval(conversation, settings)
                ? `${agent} is redrafting that — the new one is coming for you to approve.`
                : `${agent} will phrase that and send it.`
        );
    } catch (error: any) {
        await sendOwnerText(companyId, `Could not pass that on to #${conversation.shortId}: ${error?.message || 'unknown error'}`);
    }
};

const deliverAnswer = async (
    companyId: string,
    settings: SalesAgentSettings,
    conversation: Conversation,
    answer: string
): Promise<void> => {
    const question = conversation.pendingQuestion?.question;

    try {
        const { reply } = await answerPendingQuestion(companyId, conversation.id, answer);
        const where = `#${conversation.shortId}${question ? ` (${question})` : ''}`;

        await sendOwnerText(
            companyId,
            !reply
                ? `Noted against #${conversation.shortId}. The agent had nothing to add.`
                : needsApproval(conversation, settings)
                    // The draft alert carries the wording, so repeating it here would be
                    // the same paragraph twice on his phone.
                    ? `Passed on to ${where}. ${settings.agentName || 'Dave'} has drafted the reply for you to approve.`
                    : `Passed on to ${where}. The agent is saying: ${reply}`
        );
    } catch (error: any) {
        await sendOwnerText(companyId, `Could not pass that on to #${conversation.shortId}: ${error?.message || 'unknown error'}`);
    }
};
