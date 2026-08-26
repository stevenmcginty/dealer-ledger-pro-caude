"use strict";
/**
 * SMS, via Twilio.
 *
 * The quiet channel: most people who text a dealership are answering a missed call, so
 * the traffic is low and the messages are short. There is no 24-hour window and no
 * template approval — an SMS just costs money, which is why the router only falls back
 * to it when there is no WhatsApp and no email.
 *
 * The webhook is public, so the signature check is the only thing standing between the
 * agent and anybody who can guess the URL. It is not optional: without an auth token to
 * check against, the request is refused rather than trusted.
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.salesAgentSmsWebhook = exports.twilioSender = exports.companyForTwilioNumber = exports.registerTwilioRouting = void 0;
const functions = __importStar(require("firebase-functions/v1"));
const twilio_1 = __importDefault(require("twilio"));
const conversations_1 = require("../conversations");
const types_1 = require("../types");
const router_1 = require("../router");
/**
 * Twilio's POST names the number that was texted, not the company. Written whenever the
 * Twilio credentials are saved.
 */
const registerTwilioRouting = async (toNumber, companyId) => {
    if (!toNumber)
        return;
    await (0, conversations_1.db)().ref((0, conversations_1.routingPath)(`twilioNumbers/${(0, types_1.rtdbKey)((0, types_1.toE164)(toNumber))}`)).set(companyId);
};
exports.registerTwilioRouting = registerTwilioRouting;
const companyForTwilioNumber = async (toNumber) => {
    if (!toNumber)
        return null;
    const snap = await (0, conversations_1.db)().ref((0, conversations_1.routingPath)(`twilioNumbers/${(0, types_1.rtdbKey)((0, types_1.toE164)(toNumber))}`)).once('value');
    return snap.val() || null;
};
exports.companyForTwilioNumber = companyForTwilioNumber;
exports.twilioSender = {
    send: async (companyId, job) => {
        const priv = await (0, conversations_1.readPrivate)(companyId);
        const config = priv.twilio;
        if (!config?.accountSid || !config?.authToken || !config?.fromNumber) {
            throw new Error('Twilio is not connected for this company');
        }
        const client = (0, twilio_1.default)(config.accountSid, config.authToken);
        const message = await client.messages.create({
            from: config.fromNumber,
            to: (0, types_1.toE164)(job.to),
            body: job.text,
        });
        return { providerId: message.sid };
    },
};
/**
 * The URL Twilio signed.
 *
 * Twilio hashes the exact URL it was configured with, so this has to reconstruct that
 * and not the internal one the container sees. Behind Google's front end the scheme
 * arrives in X-Forwarded-Proto; the host header is already the public one.
 */
const signedUrl = (req) => {
    const proto = (req.header('x-forwarded-proto') || 'https').split(',')[0].trim();
    return `${proto}://${req.header('host')}${req.originalUrl}`;
};
/**
 * Inbound SMS.
 *
 * Answers with empty TwiML: the reply is queued in the outbox with a human-feeling delay
 * rather than fired back in the webhook response, so an instant robotic answer never
 * gives the game away.
 */
exports.salesAgentSmsWebhook = functions
    .runWith({ timeoutSeconds: 120, memory: '512MB', secrets: conversations_1.BRAIN_SECRETS })
    .https.onRequest(async (req, res) => {
    const emptyTwiml = () => {
        res.set('Content-Type', 'text/xml');
        res.status(200).send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
    };
    if (req.method !== 'POST') {
        res.status(405).send('Method not allowed');
        return;
    }
    const params = (req.body || {});
    const to = params.To || '';
    const from = params.From || '';
    const companyId = await (0, exports.companyForTwilioNumber)(to);
    if (!companyId) {
        console.warn(`Twilio: no company registered for ${to}`);
        res.status(404).send('Unknown number');
        return;
    }
    const priv = await (0, conversations_1.readPrivate)(companyId);
    const authToken = priv.twilio?.authToken;
    if (!authToken) {
        console.error(`Twilio: no auth token stored for company ${companyId}, refusing unverified webhook`);
        res.status(401).send('Unverified');
        return;
    }
    const signature = req.header('x-twilio-signature') || '';
    if (!twilio_1.default.validateRequest(authToken, signature, signedUrl(req), params)) {
        console.error(`Twilio: bad signature on ${signedUrl(req)} for company ${companyId}`);
        res.status(403).send('Bad signature');
        return;
    }
    const inbound = {
        companyId,
        channel: 'sms',
        address: (0, types_1.toE164)(from),
        text: params.Body || '',
        providerId: params.MessageSid || `${from}:${Date.now()}`,
        receivedAt: Date.now(),
    };
    try {
        await (0, router_1.handleInbound)(inbound);
    }
    catch (error) {
        // Twilio retries on a non-2xx and a retry would fail the same way; the
        // providerId dedupe already covers genuine redeliveries.
        console.error(`Twilio: handling ${inbound.providerId} for company ${companyId} failed`, error);
    }
    emptyTwiml();
});
//# sourceMappingURL=twilio.js.map