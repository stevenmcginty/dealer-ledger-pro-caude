"use strict";
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
exports.salesAgentOutboxTick = exports.sendNow = exports.enqueue = exports.randomDelayMs = void 0;
const functions = __importStar(require("firebase-functions/v1"));
const companyIds_1 = require("../utils/companyIds");
const conversations_1 = require("./conversations");
const gmail_1 = require("./channels/gmail");
const whatsapp_1 = require("./channels/whatsapp");
const twilio_1 = require("./channels/twilio");
const gmailAuth_1 = require("./gmailAuth");
const MAX_ATTEMPTS = 3;
// Resolved lazily: whatsapp.ts -> router.ts -> outbox.ts -> whatsapp.ts is a cycle,
// so at module-load time whatsappSender can still be undefined.
const senderFor = (channel) => ({ whatsapp: whatsapp_1.whatsappSender, sms: twilio_1.twilioSender, email: gmail_1.gmailSender }[channel]);
/** A reply that lands on the same second every time is a tell. */
const randomDelayMs = (window) => {
    const [min, max] = window;
    const low = Math.max(0, Math.min(min, max));
    const high = Math.max(low, Math.max(min, max));
    return Math.round((low + Math.random() * (high - low)) * 1000);
};
exports.randomDelayMs = randomDelayMs;
const enqueue = async (job) => {
    const ref = (0, conversations_1.db)().ref((0, conversations_1.agentPath)(job.companyId, 'outbox')).push();
    const stored = {
        ...job,
        id: ref.key,
        attempts: 0,
        createdAt: Date.now(),
    };
    // RTDB rejects undefined outright rather than skipping the key.
    await ref.set(Object.fromEntries(Object.entries(stored).filter(([, v]) => v !== undefined)));
    return stored.id;
};
exports.enqueue = enqueue;
/**
 * WhatsApp's 24-hour rule, enforced at the last possible moment.
 *
 * The router checks it too, but a job can sit in the queue for up to a minute and a
 * customer whose window closes in that minute would get a hard rejection from Meta
 * instead of a message. Checking here, where every send passes through, means the rule
 * cannot be missed by a caller that forgot about it.
 */
const applyWhatsAppWindow = async (job) => {
    if (job.channel !== 'whatsapp' || job.templateName)
        return job;
    const conversation = await (0, conversations_1.getConversation)(job.companyId, job.convId);
    if (job.media && !(0, whatsapp_1.withinCustomerServiceWindow)(conversation?.lastCustomerMessageAt)) {
        throw new Error('WhatsApp only accepts photos, videos and files within 24 hours of their last message.');
    }
    if ((0, whatsapp_1.withinCustomerServiceWindow)(conversation?.lastCustomerMessageAt))
        return job;
    console.warn(`Outbox ${job.id}: outside the 24h window, falling back to a template`);
    const fallback = (0, whatsapp_1.templateFallbackFor)(conversation?.contact?.firstName, conversation?.vehicleInterest?.title);
    return {
        ...job,
        ...fallback,
        // What the thread shows has to be what the customer got, not the words that
        // could not be sent.
        text: (0, whatsapp_1.renderFallbackTemplate)(fallback.templateParams || []),
    };
};
/**
 * Send one job now, skipping the queue.
 *
 * Used by the owner's REPLY command and the app's reply box, where somebody is sitting
 * there waiting and a human-feel delay would just look broken.
 */
const sendNow = async (job, from = 'agent') => {
    const prepared = await applyWhatsAppWindow(job);
    const sender = senderFor(prepared.channel);
    if (!sender)
        throw new Error(`No sender for channel ${prepared.channel}`);
    const { providerId } = await sender.send(prepared.companyId, {
        to: prepared.to,
        text: prepared.text,
        subject: prepared.subject,
        emailThreadId: prepared.emailThreadId,
        templateName: prepared.templateName,
        templateParams: prepared.templateParams,
        media: prepared.media,
    });
    const conversation = await (0, conversations_1.getConversation)(prepared.companyId, prepared.convId);
    if (conversation) {
        await (0, conversations_1.appendMessage)(prepared.companyId, conversation, {
            direction: 'out',
            channel: prepared.channel,
            text: prepared.text,
            from: prepared.from || from,
            providerId,
            subject: prepared.subject,
            createdAt: Date.now(),
            ...(prepared.media ? { media: prepared.media } : {}),
        });
        await (0, conversations_1.updateConversation)(prepared.companyId, conversation.id, { lastOutboundAt: Date.now() });
    }
    return { providerId };
};
exports.sendNow = sendNow;
const readDueJobs = async (companyId) => {
    const snap = await (0, conversations_1.db)().ref((0, conversations_1.agentPath)(companyId, 'outbox')).once('value');
    const all = (snap.val() || {});
    const now = Date.now();
    return Object.entries(all)
        .map(([id, job]) => ({ ...job, id }))
        .filter(job => (job.sendAfter || 0) <= now)
        .sort((a, b) => (a.sendAfter || 0) - (b.sendAfter || 0));
};
const drainCompany = async (companyId) => {
    const jobs = await readDueJobs(companyId);
    let sent = 0;
    let failed = 0;
    for (const job of jobs) {
        const attempts = (job.attempts || 0) + 1;
        try {
            await (0, exports.sendNow)({ ...job, attempts });
            await (0, conversations_1.db)().ref((0, conversations_1.agentPath)(companyId, `outbox/${job.id}`)).remove();
            sent++;
        }
        catch (error) {
            const message = error?.message || String(error);
            console.error(`Outbox ${job.id} attempt ${attempts} failed`, error);
            if (attempts >= MAX_ATTEMPTS) {
                await (0, conversations_1.db)().ref((0, conversations_1.agentPath)(companyId, `outbox/${job.id}`)).remove();
                failed++;
                // Imported here rather than at the top: alerts.ts sends through the same
                // channels this module drives, and the cycle only resolves at call time.
                const { sendOwnerAlert } = await Promise.resolve().then(() => __importStar(require('./alerts')));
                const conversation = await (0, conversations_1.getConversation)(companyId, job.convId);
                await sendOwnerAlert(companyId, 'error', conversation, `Could not deliver a ${job.channel} reply to ${job.to} after ${MAX_ATTEMPTS} tries: ${message}`);
            }
            else {
                await (0, conversations_1.db)().ref((0, conversations_1.agentPath)(companyId, `outbox/${job.id}`)).update({
                    attempts,
                    lastError: message,
                    // Back off a minute per attempt so a rate limit is not hammered.
                    sendAfter: Date.now() + attempts * 60000,
                });
            }
        }
    }
    return { sent, failed };
};
/**
 * Drain every company's queue.
 *
 * Also the housekeeping slot: the dedupe table would otherwise grow forever, and a
 * minute-by-minute job is the natural place to trim it.
 */
exports.salesAgentOutboxTick = functions
    // 2 GB because a queued video attachment is re-encoded here (channels/videoCompress.ts).
    .runWith({ timeoutSeconds: 300, memory: '2GB', secrets: gmailAuth_1.GMAIL_SECRETS })
    .pubsub.schedule('every 1 minutes')
    .onRun(async () => {
    const companyIds = await (0, companyIds_1.getCompanyIds)();
    let sent = 0;
    let failed = 0;
    for (const companyId of companyIds) {
        try {
            const settings = await (0, conversations_1.readSettings)(companyId);
            if (!settings.enabled)
                continue;
            const result = await drainCompany(companyId);
            sent += result.sent;
            failed += result.failed;
            // Cheap, and only worth doing once in a while.
            if (Math.random() < 0.02)
                await (0, conversations_1.pruneSeenProviderIds)(companyId);
        }
        catch (error) {
            console.error(`Outbox tick failed for company ${companyId}`, error);
        }
    }
    if (sent || failed)
        console.log(`Outbox: sent ${sent}, gave up on ${failed}`);
    return null;
});
//# sourceMappingURL=outbox.js.map