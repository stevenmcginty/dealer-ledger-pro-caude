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

import * as functions from 'firebase-functions/v1';
import twilio from 'twilio';

import { BRAIN_SECRETS, db, readPrivate, routingPath } from '../conversations';
import { readSendPrivate } from '../inboxRouting';
import { ChannelSender, InboundMessage, rtdbKey, toE164 } from '../types';
import { handleInbound } from '../router';

/**
 * Twilio's POST names the number that was texted, not the company. Written whenever the
 * Twilio credentials are saved.
 */
export const registerTwilioRouting = async (toNumber: string, companyId: string): Promise<void> => {
    if (!toNumber) return;
    await db().ref(routingPath(`twilioNumbers/${rtdbKey(toE164(toNumber))}`)).set(companyId);
};

export const companyForTwilioNumber = async (toNumber: string): Promise<string | null> => {
    if (!toNumber) return null;
    const snap = await db().ref(routingPath(`twilioNumbers/${rtdbKey(toE164(toNumber))}`)).once('value');
    return (snap.val() as string | null) || null;
};

export const twilioSender: ChannelSender = {
    send: async (companyId, job) => {
        const priv = await readSendPrivate(companyId);
        const config = priv.twilio;

        if (!config?.accountSid || !config?.authToken || !config?.fromNumber) {
            throw new Error('Twilio is not connected for this company');
        }

        const client = twilio(config.accountSid, config.authToken);
        const message = await client.messages.create({
            from: config.fromNumber,
            to: toE164(job.to),
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
const signedUrl = (req: functions.Request): string => {
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
export const salesAgentSmsWebhook = functions
    .runWith({ timeoutSeconds: 120, memory: '512MB', secrets: BRAIN_SECRETS })
    .https.onRequest(async (req, res) => {
        const emptyTwiml = () => {
            res.set('Content-Type', 'text/xml');
            res.status(200).send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
        };

        if (req.method !== 'POST') {
            res.status(405).send('Method not allowed');
            return;
        }

        const params = (req.body || {}) as Record<string, string>;
        const to = params.To || '';
        const from = params.From || '';

        const companyId = await companyForTwilioNumber(to);
        if (!companyId) {
            console.warn(`Twilio: no company registered for ${to}`);
            res.status(404).send('Unknown number');
            return;
        }

        const priv = await readPrivate(companyId);
        const authToken = priv.twilio?.authToken;

        if (!authToken) {
            console.error(`Twilio: no auth token stored for company ${companyId}, refusing unverified webhook`);
            res.status(401).send('Unverified');
            return;
        }

        const signature = req.header('x-twilio-signature') || '';
        if (!twilio.validateRequest(authToken, signature, signedUrl(req), params)) {
            console.error(`Twilio: bad signature on ${signedUrl(req)} for company ${companyId}`);
            res.status(403).send('Bad signature');
            return;
        }

        const inbound: InboundMessage = {
            companyId,
            channel: 'sms',
            address: toE164(from),
            text: params.Body || '',
            providerId: params.MessageSid || `${from}:${Date.now()}`,
            receivedAt: Date.now(),
        };

        try {
            await handleInbound(inbound);
        } catch (error) {
            // Twilio retries on a non-2xx and a retry would fail the same way; the
            // providerId dedupe already covers genuine redeliveries.
            console.error(`Twilio: handling ${inbound.providerId} for company ${companyId} failed`, error);
        }

        emptyTwiml();
    });
