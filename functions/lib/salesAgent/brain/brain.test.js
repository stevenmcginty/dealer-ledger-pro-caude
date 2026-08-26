"use strict";
/**
 * Tests for brain guards, tone formatting, and prompt construction.
 * Run with:
 *   cd functions && npx tsc && node --test lib/salesAgent/brain/brain.test.js
 */
Object.defineProperty(exports, "__esModule", { value: true });
const node_assert_1 = require("node:assert");
const node_test_1 = require("node:test");
const index_1 = require("./index");
const prompt_1 = require("./prompt");
(0, node_test_1.describe)('Brain reply formatting', () => {
    (0, node_test_1.it)('enforces concise 3-sentence limits on WhatsApp', () => {
        const text = 'First sentence. Second sentence. Third sentence. Fourth sentence that should be dropped.';
        const result = (0, index_1.capReply)(text, 'whatsapp');
        node_assert_1.strict.equal(result, 'First sentence. Second sentence. Third sentence.');
    });
    (0, node_test_1.it)('softens em-dashes and en-dashes', () => {
        const input = 'We have the Focus—it is in great condition – recently serviced.';
        const cleaned = (0, index_1.softenDashes)(input);
        node_assert_1.strict.equal(cleaned, 'We have the Focus, it is in great condition, recently serviced.');
    });
    (0, node_test_1.it)('allows multi-paragraph structured responses on email', () => {
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
        const result = (0, index_1.capReply)(emailText, 'email');
        node_assert_1.strict.ok(result.includes('Hi Harriet,'));
        node_assert_1.strict.ok(result.includes('full service history with 5 stamps'));
        node_assert_1.strict.ok(result.includes('Regards,'));
        node_assert_1.strict.ok(result.includes('Dave'));
        const paragraphs = result.split('\n\n');
        node_assert_1.strict.ok(paragraphs.length >= 3, 'Expected at least 3 paragraphs');
    });
});
(0, node_test_1.describe)('System prompt generation', () => {
    const settings = {
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
    const baseConv = {
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
    (0, node_test_1.it)('generates email-specific instructions when channel is email', () => {
        const prompt = (0, prompt_1.buildSystemPrompt)({ conversation: baseConv, settings });
        node_assert_1.strict.ok(prompt.includes('EMAIL FORMAT'));
        node_assert_1.strict.ok(prompt.includes('MULTI-QUESTION ENQUIRIES'));
        node_assert_1.strict.ok(prompt.includes('SMARTER PART-EXCHANGE & FINANCE PROBING'));
        node_assert_1.strict.ok(prompt.includes('DO NOT call ask_owner until you have BOTH the registration and approximate mileage'));
        node_assert_1.strict.ok(prompt.includes('DEEP VEHICLE KNOWLEDGE'));
        node_assert_1.strict.ok(prompt.includes('LOOK IT UP FIRST'));
        node_assert_1.strict.ok(prompt.includes('NEVER NAME A COLLEAGUE'));
        node_assert_1.strict.ok(!prompt.includes("I'll have Steve run a valuation"));
        node_assert_1.strict.ok(!prompt.includes('check that slot with Steve'));
    });
    (0, node_test_1.it)('generates messaging-specific instructions when channel is whatsapp', () => {
        const prompt = (0, prompt_1.buildSystemPrompt)({
            conversation: { ...baseConv, channel: 'whatsapp', address: '+447700900123' },
            settings,
        });
        node_assert_1.strict.ok(prompt.includes('MESSAGING FORMAT (WhatsApp / SMS)'));
        node_assert_1.strict.ok(prompt.includes('1 to 3 short sentences max'));
    });
});
//# sourceMappingURL=brain.test.js.map