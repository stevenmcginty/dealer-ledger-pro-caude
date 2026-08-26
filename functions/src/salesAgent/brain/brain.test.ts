/**
 * Tests for brain guards, tone formatting, and prompt construction.
 * Run with:
 *   cd functions && npx tsc && node --test lib/salesAgent/brain/brain.test.js
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { capReply, softenDashes } from './index';
import { buildSystemPrompt } from './prompt';
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
});
