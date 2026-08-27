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
    (0, node_test_1.it)('instructs Dave to maintain generic politeness and always confirm to call before leaving when agreeing a time', () => {
        const prompt = (0, prompt_1.buildSystemPrompt)({ conversation: baseConv, settings });
        node_assert_1.strict.ok(prompt.includes('Natural Politeness & Courtesy'));
        node_assert_1.strict.ok(prompt.includes("That's fine"));
        node_assert_1.strict.ok(prompt.includes('no problem at all'));
        node_assert_1.strict.ok(prompt.includes('ALWAYS CONFIRM TO CALL BEFORE THEY LEAVE'));
        node_assert_1.strict.ok(prompt.includes('call before you leave') || prompt.includes('call before they leave'));
        node_assert_1.strict.ok(prompt.includes('pulled out front and ready'));
    });
    (0, node_test_1.it)('bakes in website, changing stock, opening hours and viewings strictly by appointment', () => {
        const prompt = (0, prompt_1.buildSystemPrompt)({ conversation: baseConv, settings });
        node_assert_1.strict.ok(prompt.includes('DEALERSHIP KNOWLEDGE'));
        node_assert_1.strict.ok(prompt.includes('stock is always changing'));
        node_assert_1.strict.ok(prompt.includes('https://radlettcarsales.com'));
        node_assert_1.strict.ok(prompt.includes('Mon-Fri 9-6'));
        node_assert_1.strict.ok(prompt.includes('STRICLY BY APPOINTMENT') || prompt.includes('STRICLY') || prompt.includes('STRICTLY BY APPOINTMENT') || prompt.includes('strictly by appointment'));
        node_assert_1.strict.ok(prompt.includes('give us a call before coming down') || prompt.includes('give us a call'));
    });
    (0, node_test_1.describe)('inbox context', () => {
        const ctx = {
            thread: [],
            earlier: [
                { from: 'customer', at: 1756100000000, subject: 'DD07BOX', text: 'Hi, I would like to reserve the Golf please.' },
                { from: 'owner', at: 1756110000000, subject: 'Re: DD07BOX', text: 'Deposit received, thanks. It is yours.' },
            ],
            ownerStyle: [{ from: 'owner', at: 1756000000000, subject: 'Re: Audi A3', text: 'Hi John, thanks for getting in touch. The A3 is still available and I can hold it for you until Saturday. Cheers, Steve' }],
        };
        (0, node_test_1.it)('feeds earlier emails and the buyer rule into the prompt', () => {
            const prompt = (0, prompt_1.buildSystemPrompt)({ conversation: baseConv, settings: settings, emailContext: ctx });
            node_assert_1.strict.ok(prompt.includes('HOW STEVE WRITES'));
            node_assert_1.strict.ok(prompt.includes('hold it for you until Saturday'));
            node_assert_1.strict.ok(prompt.includes('they ARE the buyer of that car'));
            const contents = (0, prompt_1.buildContents)({ conversation: baseConv, history: [], inbound: { companyId: 'company-1', channel: 'email', address: 'harriet@example.com', text: 'Is the Golf still available?', providerId: 'm1', receivedAt: Date.now() }, settings: settings, emailContext: ctx });
            const first = contents[0].parts?.[0]?.text || '';
            node_assert_1.strict.ok(first.startsWith('[Earlier emails between this customer and the desk'));
            node_assert_1.strict.ok(first.includes('Steve, the owner, wrote'));
            node_assert_1.strict.ok(first.includes('Deposit received'));
        });
        (0, node_test_1.it)('adds nothing when the inbox has nothing extra', () => {
            const empty = { thread: [], earlier: [], ownerStyle: [] };
            const prompt = (0, prompt_1.buildSystemPrompt)({ conversation: baseConv, settings: settings, emailContext: empty });
            node_assert_1.strict.ok(!prompt.includes('INBOX HISTORY'));
            node_assert_1.strict.ok(!prompt.includes('HOW STEVE WRITES'));
        });
    });
    (0, node_test_1.it)('locks onto the car the lead identified and shows the email subject', () => {
        const conv = { ...baseConv, vehicleInterest: { stockId: '1793552', title: 'Mini Convertible 1.6 Cooper S Convertible', ledgerVehicleId: 'v1' } };
        const prompt = (0, prompt_1.buildSystemPrompt)({ conversation: conv, settings });
        node_assert_1.strict.ok(prompt.includes('THE CAR IS ALREADY KNOWN'));
        node_assert_1.strict.ok(prompt.includes('get_stock_item with id "1793552"'));
        node_assert_1.strict.ok(!(0, prompt_1.buildSystemPrompt)({ conversation: baseConv, settings }).includes('THE CAR IS ALREADY KNOWN'));
        const contents = (0, prompt_1.buildContents)({ conversation: conv, history: [], settings, inbound: { companyId: 'company-1', channel: 'email', address: 'jackandtash@hotmail.com', text: 'Is the MINI CONVERTIBLE still available?', subject: 'Book A Test Drive - MINI CONVERTIBLE (LD12FZE) - Natasha', providerId: 'm2', receivedAt: Date.now() } });
        const last = contents[contents.length - 1].parts?.[0]?.text || '';
        node_assert_1.strict.ok(last.startsWith('[Email subject: Book A Test Drive - MINI CONVERTIBLE (LD12FZE) - Natasha]'));
    });
    (0, node_test_1.it)('tells Dave the email is dead and skips bounce notices in the transcript', () => {
        const bounced = {
            ...baseConv,
            emailBounce: { address: 'jackandtash@hotmail.com', reason: 'address not found, or unable to receive mail', at: Date.now() },
            contact: { firstName: 'Natasha', email: 'jackandtash@hotmail.com', phone: '+447826555653' },
        };
        const prompt = (0, prompt_1.buildSystemPrompt)({ conversation: bounced, settings });
        node_assert_1.strict.ok(prompt.includes('EMAIL BOUNCE'));
        node_assert_1.strict.ok(prompt.includes('Do not write them an email'));
        node_assert_1.strict.ok(prompt.includes('Delivery Status Notification'));
        const contents = (0, prompt_1.buildContents)({
            conversation: bounced,
            history: [
                { id: 'm1', direction: 'in', channel: 'email', from: 'owner', text: `${prompt_1.BOUNCE_NOTICE_PREFIX}Email bounced.`, createdAt: 1 },
                { id: 'm2', direction: 'in', channel: 'email', from: 'customer', text: 'Can I book Friday 12:00?', createdAt: 2 },
            ],
            settings,
            inbound: { companyId: 'company-1', channel: 'whatsapp', address: '+447826555653', text: 'Still on for Friday?', providerId: 'w1', receivedAt: Date.now() },
        });
        const blob = contents.map(c => c.parts?.[0]?.text || '').join('\n');
        node_assert_1.strict.ok(!blob.includes('Email bounced.'));
        node_assert_1.strict.ok(blob.includes('Can I book Friday 12:00?'));
    });
});
//# sourceMappingURL=brain.test.js.map