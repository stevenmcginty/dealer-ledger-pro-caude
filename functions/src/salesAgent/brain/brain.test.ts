/**
 * Tests for brain guards, tone formatting, and prompt construction.
 * Run with:
 *   cd functions && npx tsc && node --test lib/salesAgent/brain/brain.test.js
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { capReply, softenDashes } from './index';
import { BOUNCE_NOTICE_PREFIX, buildContents, buildSystemPrompt } from './prompt';
import type { Conversation, SalesAgentSettings } from '../types';

describe('Brain reply formatting', () => {
    it('enforces concise 3-sentence limits on WhatsApp', () => {
        const text = 'First sentence. Second sentence. Third sentence. Fourth sentence that should be dropped.';
        const result = capReply(text, 'whatsapp');
        assert.equal(result, 'First sentence. Second sentence. Third sentence.');
    });

    it('softens em-dashes and en-dashes', () => {
        const input = 'We have the Focus—it is in great condition – recently serviced.';
        const cleaned = softenDashes(input);
        assert.equal(cleaned, 'We have the Focus, it is in great condition, recently serviced.');
    });

    it('allows multi-paragraph structured responses on email', () => {
        const emailText = [
            'Hi Harriet,',
            '',
            'Yes, the 2016 Focus ST-3 is still available here at the dealership.',
            '',
            'It comes with full service history with 5 stamps in the book and the MOT runs until March 2027. It also includes heated Recaro leather seats and sat nav.',
            '',
            'Would you like to arrange a viewing or test drive this week? Do mornings or afternoons suit you better?',
            '',
            'Regards,',
            'Dave',
            'Radlett Car Sales',
        ].join('\n');

        const result = capReply(emailText, 'email');
        assert.ok(result.includes('Hi Harriet,'));
        assert.ok(result.includes('full service history with 5 stamps'));
        assert.ok(result.includes('Regards,'));
        assert.ok(result.includes('Dave'));
        const paragraphs = result.split('\n\n');
        assert.ok(paragraphs.length >= 3, 'Expected at least 3 paragraphs');
    });
});

describe('System prompt generation', () => {
    const settings: SalesAgentSettings = {
        enabled: true,
        dealershipName: 'Radlett Car Sales',
        location: 'Radlett, Hertfordshire',
        websiteUrl: 'https://radlettcarsales.com',
        stockListUrl: 'https://radlettcarsales.com/used/cars/radlett/',
        openingHours: 'Mon-Fri 9-6',
        address: 'Watling St, Radlett',
        phone: '07710 525694',
        faqs: 'Warranty included on all cars. Finance available through Jigsaw and Close Brothers.',
        ownerAlertNumber: '+447710525694',
        ownerName: 'Steve',
        agentName: 'Dave',
        teamNames: 'Steve and Chris',
        priceFlexMode: 'hint',
        negotiationMaxDiscount: 300,
        replyDelaySeconds: [5, 15],
        channels: { whatsapp: true, sms: true, email: true },
        preferWhatsAppReply: true,
        emailAddress: 'radlettcars@gmail.com',
        signature: 'Steve, Radlett Car Sales',
        updatedAt: Date.now(),
    };

    const baseConv: Conversation = {
        id: 'conv-1',
        shortId: 10,
        companyId: 'company-1',
        channel: 'email',
        address: 'harriet@example.com',
        originChannel: 'email',
        contact: { firstName: 'Harriet', email: 'harriet@example.com' },
        mode: 'agent',
        stage: 'deal',
        escalated: false,
        priceRequests: 0,
        lastInboundAt: Date.now(),
        lastCustomerMessageAt: Date.now(),
        createdAt: Date.now(),
        updatedAt: Date.now(),
        unread: 0,
    };

    it('generates email-specific instructions when channel is email', () => {
        const prompt = buildSystemPrompt({ conversation: baseConv, settings });
        assert.ok(prompt.includes('EMAIL FORMAT'));
        assert.ok(prompt.includes('MULTI-QUESTION ENQUIRIES'));
        assert.ok(prompt.includes('SMARTER PART-EXCHANGE & FINANCE PROBING'));
        assert.ok(prompt.includes('DO NOT call ask_owner until you have BOTH the registration and approximate mileage'));
        assert.ok(prompt.includes('DEEP VEHICLE KNOWLEDGE'));
        assert.ok(prompt.includes('LOOK IT UP FIRST'));
        assert.ok(prompt.includes('NEVER NAME A COLLEAGUE'));
        assert.ok(!prompt.includes("I'll have Steve run a valuation"));
        assert.ok(!prompt.includes('check that slot with Steve'));
    });

    it('generates messaging-specific instructions when channel is whatsapp', () => {
        const prompt = buildSystemPrompt({
            conversation: { ...baseConv, channel: 'whatsapp', address: '+447700900123' },
            settings,
        });
        assert.ok(prompt.includes('MESSAGING FORMAT (WhatsApp / SMS)'));
        assert.ok(prompt.includes('1 to 3 short sentences max'));
    });

    it('instructs Dave to maintain generic politeness and always confirm to call before leaving when agreeing a time', () => {
        const prompt = buildSystemPrompt({ conversation: baseConv, settings });
        assert.ok(prompt.includes('Natural Politeness & Courtesy'));
        assert.ok(prompt.includes("That's fine"));
        assert.ok(prompt.includes('no problem at all'));
        assert.ok(prompt.includes('ALWAYS CONFIRM TO CALL BEFORE THEY LEAVE'));
        assert.ok(prompt.includes('call before you leave') || prompt.includes('call before they leave'));
        assert.ok(prompt.includes('pulled out front and ready'));
    });

    it('bakes in website, changing stock, opening hours and viewings strictly by appointment', () => {
        const prompt = buildSystemPrompt({ conversation: baseConv, settings });
        assert.ok(prompt.includes('DEALERSHIP KNOWLEDGE'));
        assert.ok(prompt.includes('stock is always changing'));
        assert.ok(prompt.includes('https://radlettcarsales.com'));
        assert.ok(prompt.includes('Mon-Fri 9-6'));
        assert.ok(prompt.includes('STRICLY BY APPOINTMENT') || prompt.includes('STRICLY') || prompt.includes('STRICTLY BY APPOINTMENT') || prompt.includes('strictly by appointment'));
        assert.ok(prompt.includes('give us a call before coming down') || prompt.includes('give us a call'));
    });

describe('inbox context', () => {
    const ctx = {
        thread: [],
        earlier: [
            { from: 'customer' as const, at: 1756100000000, subject: 'DD07BOX', text: 'Hi, I would like to reserve the Golf please.' },
            { from: 'owner' as const, at: 1756110000000, subject: 'Re: DD07BOX', text: 'Deposit received, thanks. It is yours.' },
        ],
        ownerStyle: [{ from: 'owner' as const, at: 1756000000000, subject: 'Re: Audi A3', text: 'Hi John, thanks for getting in touch. The A3 is still available and I can hold it for you until Saturday. Cheers, Steve' }],
    };

    it('feeds earlier emails and the buyer rule into the prompt', () => {
        const prompt = buildSystemPrompt({ conversation: baseConv, settings: settings, emailContext: ctx });
        assert.ok(prompt.includes('HOW STEVE WRITES'));
        assert.ok(prompt.includes('hold it for you until Saturday'));
        assert.ok(prompt.includes('they ARE the buyer of that car'));

        const contents = buildContents({ conversation: baseConv, history: [], inbound: { companyId: 'company-1', channel: 'email', address: 'harriet@example.com', text: 'Is the Golf still available?', providerId: 'm1', receivedAt: Date.now() }, settings: settings, emailContext: ctx });
        const first = contents[0].parts?.[0]?.text || '';
        assert.ok(first.startsWith('[Earlier emails between this customer and the desk'));
        assert.ok(first.includes('Steve, the owner, wrote'));
        assert.ok(first.includes('Deposit received'));
    });

    it('adds nothing when the inbox has nothing extra', () => {
        const empty = { thread: [], earlier: [], ownerStyle: [] };
        const prompt = buildSystemPrompt({ conversation: baseConv, settings: settings, emailContext: empty });
        assert.ok(!prompt.includes('INBOX HISTORY'));
        assert.ok(!prompt.includes('HOW STEVE WRITES'));
    });
});
    it('locks onto the car the lead identified and shows the email subject', () => {
        const conv = { ...baseConv, vehicleInterest: { stockId: '1793552', title: 'Mini Convertible 1.6 Cooper S Convertible', ledgerVehicleId: 'v1' } };
        const prompt = buildSystemPrompt({ conversation: conv, settings });
        assert.ok(prompt.includes('THE CAR IS ALREADY KNOWN'));
        assert.ok(prompt.includes('get_stock_item with id "1793552"'));
        assert.ok(!buildSystemPrompt({ conversation: baseConv, settings }).includes('THE CAR IS ALREADY KNOWN'));

        const contents = buildContents({ conversation: conv, history: [], settings, inbound: { companyId: 'company-1', channel: 'email', address: 'jackandtash@hotmail.com', text: 'Is the MINI CONVERTIBLE still available?', subject: 'Book A Test Drive - MINI CONVERTIBLE (LD12FZE) - Natasha', providerId: 'm2', receivedAt: Date.now() } });
        const last = contents[contents.length - 1].parts?.[0]?.text || '';
        assert.ok(last.startsWith('[Email subject: Book A Test Drive - MINI CONVERTIBLE (LD12FZE) - Natasha]'));
    });

    it('tells Dave the email is dead and skips bounce notices in the transcript', () => {
        const bounced = {
            ...baseConv,
            emailBounce: { address: 'jackandtash@hotmail.com', reason: 'address not found, or unable to receive mail', at: Date.now() },
            contact: { firstName: 'Natasha', email: 'jackandtash@hotmail.com', phone: '+447826555653' },
        };
        const prompt = buildSystemPrompt({ conversation: bounced, settings });
        assert.ok(prompt.includes('EMAIL BOUNCE'));
        assert.ok(prompt.includes('Do not write them an email'));
        assert.ok(prompt.includes('Delivery Status Notification'));

        const contents = buildContents({
            conversation: bounced,
            history: [
                { id: 'm1', direction: 'in', channel: 'email', from: 'owner', text: `${BOUNCE_NOTICE_PREFIX}Email bounced.`, createdAt: 1 },
                { id: 'm2', direction: 'in', channel: 'email', from: 'customer', text: 'Can I book Friday 12:00?', createdAt: 2 },
            ],
            settings,
            inbound: { companyId: 'company-1', channel: 'whatsapp', address: '+447826555653', text: 'Still on for Friday?', providerId: 'w1', receivedAt: Date.now() },
        });
        const blob = contents.map(c => (c.parts?.[0] as { text?: string })?.text || '').join('\n');
        assert.ok(!blob.includes('Email bounced.'));
        assert.ok(blob.includes('Can I book Friday 12:00?'));
    });

});
