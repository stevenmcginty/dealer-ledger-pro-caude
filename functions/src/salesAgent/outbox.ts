/**
 * The delayed send queue.
 *
 * Replies are not sent from the webhook. They are queued with a send-after time twenty
 * to forty-five seconds out and drained by a job that runs every minute, for one reason:
 * an answer that arrives in under a second tells the customer they are talking to a
 * machine, and the whole point of this agent is that they are not.
 *
 * It is also the only place a send can be retried. A Graph API blip at 9pm should not
 * lose the enquiry — the job stays on the queue, keeps its attempt count, and gets two
 * more goes before it is given up on and Steve is told.
 */

import * as functions from 'firebase-functions/v1';

import { getCompanyIds } from '../utils/companyIds';
import {
    agentPath,
    appendMessage,
    db,
    getConversation,
    pruneSeenProviderIds,
    readSettings,
    updateConversation,
} from './conversations';
import { gmailSender } from './channels/gmail';
import { isSendBlockedError, renderFallbackTemplate, templateFallbackFor, whatsappSender, withinCustomerServiceWindow } from './channels/whatsapp';
import { labelEmailThread } from './channels/gmail';
import { twilioSender } from './channels/twilio';
import { GMAIL_SECRETS } from './gmailAuth';
import { Channel, ChannelSender, OutboxJob } from './types';

const MAX_ATTEMPTS = 3;

/** How often a job held behind a blocked account tries again. */
const HOLD_RETRY_MS = 15 * 60_000;

/** How long it is held before the message is too stale to be worth sending. */
const HOLD_LIMIT_MS = 48 * 3_600_000;

// Resolved lazily: whatsapp.ts -> router.ts -> outbox.ts -> whatsapp.ts is a cycle,
// so at module-load time whatsappSender can still be undefined.
const senderFor = (channel: Channel): ChannelSender | undefined =>
    ({ whatsapp: whatsappSender, sms: twilioSender, email: gmailSender } as Record<Channel, ChannelSender>)[channel];

export type NewOutboxJob = Omit<OutboxJob, 'id' | 'attempts' | 'createdAt'>;

/** A reply that lands on the same second every time is a tell. */
export const randomDelayMs = (window: [number, number]): number => {
    const [min, max] = window;
    const low = Math.max(0, Math.min(min, max));
    const high = Math.max(low, Math.max(min, max));
    return Math.round((low + Math.random() * (high - low)) * 1000);
};

export const enqueue = async (job: NewOutboxJob): Promise<string> => {
    const ref = db().ref(agentPath(job.companyId, 'outbox')).push();

    const stored: OutboxJob = {
        ...job,
        id: ref.key as string,
        attempts: 0,
        createdAt: Date.now(),
    };

    // RTDB rejects undefined outright rather than skipping the key.
    await ref.set(Object.fromEntries(Object.entries(stored).filter(([, v]) => v !== undefined)));
    return stored.id;
};

/**
 * WhatsApp's 24-hour rule, enforced at the last possible moment.
 *
 * The router checks it too, but a job can sit in the queue for up to a minute and a
 * customer whose window closes in that minute would get a hard rejection from Meta
 * instead of a message. Checking here, where every send passes through, means the rule
 * cannot be missed by a caller that forgot about it.
 */
/** "28 Aug at 8:06 am" — so the refusal below says exactly when the door shut. */
const whenTheyLastWrote = (at?: number): string =>
    at
        ? new Intl.DateTimeFormat('en-GB', {
            timeZone: 'Europe/London',
            day: 'numeric',
            month: 'short',
            hour: 'numeric',
            minute: '2-digit',
        }).format(new Date(at))
        : 'never';

const applyWhatsAppWindow = async (job: OutboxJob): Promise<OutboxJob> => {
    if (job.channel !== 'whatsapp' || job.templateName) return job;

    const conversation = await getConversation(job.companyId, job.convId);
    const lastAt = conversation?.lastCustomerMessageAt;

    if (job.media && !withinCustomerServiceWindow(lastAt)) {
        throw new Error('WhatsApp only accepts photos, videos and files within 24 hours of their last message.');
    }
    if (withinCustomerServiceWindow(lastAt)) return job;

    /**
     * Steve pressed "Me". The box above it promises the customer gets exactly his
     * words, and outside the window WhatsApp will not carry them. Substituting a
     * template here is the one thing we must not do: on 29 Aug he typed "Hello" and
     * "test" and a stranger's canned opener went out over his name, twice, telling the
     * customer her email had bounced when it had not. Refuse and say why. Dave's own
     * openers still fall back to a template below, because that is what they are for.
     */
    if (job.from === 'owner') {
        throw new Error(
            `WhatsApp will not carry your own words here: ${conversation?.contact?.firstName || 'they'} last messaged you on ${whenTheyLastWrote(lastAt)}, more than 24 hours ago, and Meta only allows an approved opener after that. `
            + 'Nothing was sent. Send the opener from the Dave side, or reply by email.'
        );
    }

    console.warn(`Outbox ${job.id}: outside the 24h window, falling back to a template`);

    const bounced = !!conversation?.emailBounce;
    const fallback = templateFallbackFor(
        conversation?.contact?.firstName,
        conversation?.vehicleInterest?.title
    );

    return {
        ...job,
        ...fallback,
        // What the thread shows has to be what the customer got, not the words that
        // could not be sent.
        text: renderFallbackTemplate(fallback.templateParams || [], { bounced }),
    };
};

/**
 * Send one job now, skipping the queue.
 *
 * Used by the owner's REPLY command and the app's reply box, where somebody is sitting
 * there waiting and a human-feel delay would just look broken.
 */
export const sendNow = async (
    job: OutboxJob,
    from: 'agent' | 'owner' = 'agent'
): Promise<{ providerId: string }> => {
    const prepared = await applyWhatsAppWindow(job);
    const sender = senderFor(prepared.channel);

    if (!sender) throw new Error(`No sender for channel ${prepared.channel}`);

    const { providerId, text: sentText } = await sender.send(prepared.companyId, {
        to: prepared.to,
        text: prepared.text,
        subject: prepared.subject,
        emailThreadId: prepared.emailThreadId,
        templateName: prepared.templateName,
        templateParams: prepared.templateParams,
        media: prepared.media,
    });

    const conversation = await getConversation(prepared.companyId, prepared.convId);
    if (conversation) {
        await appendMessage(prepared.companyId, conversation, {
            direction: 'out',
            channel: prepared.channel,
            text: sentText || prepared.text,
            from: prepared.from || from,
            providerId,
            // The provider took it. WhatsApp refines this to delivered/read on the
            // webhook; email and SMS stop here.
            ...(providerId ? { delivery: 'sent' as const, deliveryAt: Date.now() } : {}),
            subject: prepared.subject,
            createdAt: Date.now(),
            ...(prepared.media ? { media: prepared.media } : {}),
        });

        await updateConversation(prepared.companyId, conversation.id, { lastOutboundAt: Date.now() });

        // Steve works out of Gmail as much as out of the app. If this customer also has
        // an email thread, mark there that the conversation has moved to WhatsApp, so
        // he does not sit waiting on a reply to an email nobody is going to answer.
        if (prepared.channel === 'whatsapp' && conversation.emailThreadId) {
            const settings = await readSettings(prepared.companyId);
            await labelEmailThread(
                prepared.companyId,
                conversation.emailThreadId,
                `${settings.agentName || 'Dave'} · WhatsApp`,
                'whatsapp'
            );
        }
    }

    return { providerId };
};

const readDueJobs = async (companyId: string): Promise<OutboxJob[]> => {
    const snap = await db().ref(agentPath(companyId, 'outbox')).once('value');
    const all = (snap.val() || {}) as Record<string, OutboxJob>;
    const now = Date.now();

    return Object.entries(all)
        .map(([id, job]) => ({ ...job, id }))
        .filter(job => !job.gaveUp && (job.sendAfter || 0) <= now)
        .sort((a, b) => (a.sendAfter || 0) - (b.sendAfter || 0));
};

/**
 * Tell Steve, but only once per job.
 *
 * A blocked account is rechecked every quarter of an hour for days. Alerting on every
 * one of those would be its own outage.
 */
const alertOnce = async (companyId: string, job: OutboxJob, text: string): Promise<void> => {
    if (job.alertedAt) return;
    // Imported here rather than at the top: alerts.ts sends through the same
    // channels this module drives, and the cycle only resolves at call time.
    const { sendOwnerAlert } = await import('./alerts');
    const conversation = await getConversation(companyId, job.convId);
    await sendOwnerAlert(companyId, 'error', conversation, text);
    await db().ref(agentPath(companyId, `outbox/${job.id}`)).update({ alertedAt: Date.now() });
};

const drainCompany = async (companyId: string): Promise<{ sent: number; failed: number; held: number }> => {
    const jobs = await readDueJobs(companyId);
    let sent = 0;
    let failed = 0;
    let held = 0;

    for (const job of jobs) {
        const attempts = (job.attempts || 0) + 1;

        try {
            await sendNow({ ...job, attempts });
            await db().ref(agentPath(companyId, `outbox/${job.id}`)).remove();
            sent++;
        } catch (error: any) {
            const message = error?.message || String(error);
            const ref = db().ref(agentPath(companyId, `outbox/${job.id}`));

            // The door is shut: the app is blocked, the token is dead, or the opener is
            // still waiting on Meta. Three tries a minute apart cannot help, and binning
            // the message is how a reply to a customer was lost on 29 Aug. Park it and
            // keep knocking every quarter of an hour. The moment the account is put
            // right the queue drains itself, with nothing lost and nothing sent twice.
            if (isSendBlockedError(message)) {
                const age = Date.now() - (job.createdAt || Date.now());

                if (age > HOLD_LIMIT_MS) {
                    // Days old now. Sending it would be worse than not sending it, but it
                    // is still not ours to delete.
                    await ref.update({ gaveUp: true, blocked: true, lastError: message });
                    failed++;
                    await alertOnce(
                        companyId,
                        job,
                        `Gave up on a ${job.channel} message to ${job.to} after holding it ${Math.round(age / 3_600_000)}h: ${message}`
                    );
                    continue;
                }

                console.warn(`Outbox ${job.id} held (${Math.round(age / 60_000)}m waiting): ${message}`);
                await ref.update({ blocked: true, lastError: message, sendAfter: Date.now() + HOLD_RETRY_MS });
                held++;
                await alertOnce(companyId, job, `Holding a ${job.channel} message to ${job.to}: ${message}`);
                continue;
            }

            console.error(`Outbox ${job.id} attempt ${attempts} failed`, error);

            if (attempts >= MAX_ATTEMPTS) {
                // Kept, not deleted. A reply a customer is waiting on should not vanish
                // because the third try happened to land badly.
                await ref.update({ gaveUp: true, attempts, lastError: message });
                failed++;
                await alertOnce(
                    companyId,
                    job,
                    `Could not deliver a ${job.channel} reply to ${job.to} after ${MAX_ATTEMPTS} tries: ${message}`
                );
            } else {
                await ref.update({
                    attempts,
                    lastError: message,
                    // Back off a minute per attempt so a rate limit is not hammered.
                    sendAfter: Date.now() + attempts * 60_000,
                });
            }
        }
    }

    return { sent, failed, held };
};

/**
 * Drain every company's queue.
 *
 * Also the housekeeping slot: the dedupe table would otherwise grow forever, and a
 * minute-by-minute job is the natural place to trim it.
 */
export const salesAgentOutboxTick = functions
    // 2 GB because a queued video attachment is re-encoded here (channels/videoCompress.ts).
    .runWith({ timeoutSeconds: 300, memory: '2GB', secrets: GMAIL_SECRETS })
    .pubsub.schedule('every 1 minutes')
    .onRun(async () => {
        const companyIds = await getCompanyIds();
        let sent = 0;
        let failed = 0;
        let held = 0;

        for (const companyId of companyIds) {
            try {
                const settings = await readSettings(companyId);
                if (!settings.enabled) continue;

                const result = await drainCompany(companyId);
                sent += result.sent;
                failed += result.failed;
                held += result.held;

                // Cheap, and only worth doing once in a while.
                if (Math.random() < 0.02) await pruneSeenProviderIds(companyId);
            } catch (error) {
                console.error(`Outbox tick failed for company ${companyId}`, error);
            }
        }

        if (sent || failed || held) console.log(`Outbox: sent ${sent}, gave up on ${failed}, holding ${held}`);
        return null;
    });
