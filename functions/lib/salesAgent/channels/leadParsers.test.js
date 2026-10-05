"use strict";
/**
 * Parser tests, run with the Node test runner that ships with Node 20:
 *
 *   cd functions && npx tsc && node --test lib/salesAgent/channels/leadParsers.test.js
 *
 * The bodies below are the samples in docs/sales-agent/EMAIL_FORMATS.md. If a real
 * email stops parsing, add it here first — the point of this file is that the formats
 * doc and the code cannot drift apart silently.
 */
Object.defineProperty(exports, "__esModule", { value: true });
const node_assert_1 = require("node:assert");
const node_test_1 = require("node:test");
const leadParsers_1 = require("./leadParsers");
const SELF = 'radlettcars@gmail.com';
const email = (over) => (0, leadParsers_1.parseLeadEmail)({
    from: '',
    subject: '',
    text: '',
    selfEmail: SELF,
    ...over,
});
(0, node_test_1.describe)('From header', () => {
    (0, node_test_1.it)('splits a display name from the address', () => {
        node_assert_1.strict.deepEqual((0, leadParsers_1.parseFromHeader)('Paul Summerfield <PaulJSummerfield@hotmail.com>'), {
            name: 'Paul Summerfield',
            address: 'pauljsummerfield@hotmail.com',
        });
    });
    (0, node_test_1.it)('copes with a bare address', () => {
        node_assert_1.strict.equal((0, leadParsers_1.parseFromHeader)('sam_18cobb@hotmail.co.uk').address, 'sam_18cobb@hotmail.co.uk');
    });
    (0, node_test_1.it)('knows a platform robot from a customer', () => {
        node_assert_1.strict.equal((0, leadParsers_1.isNoReplyAddress)('dealer-leads@messages.cargurus.com'), true);
        node_assert_1.strict.equal((0, leadParsers_1.isNoReplyAddress)('noreply@cardealer5.co.uk'), true);
        node_assert_1.strict.equal((0, leadParsers_1.isNoReplyAddress)('noreply@partners.gumtree.com'), true);
        node_assert_1.strict.equal((0, leadParsers_1.isNoReplyAddress)('pauljsummerfield@hotmail.com'), false);
    });
});
(0, node_test_1.describe)('CarGurus lead submission', () => {
    const body = [
        '### You have a new customer lead for your 2001 Porsche Boxster 3.2 S 2dr Tiptronic S ###',
        '*Name:* paul summerfield',
        '*Email:* pauljsummerfield@hotmail.com',
        '*Phone number:* 07471 075500',
        '*Postcode:* N3 1PS',
        "*Customer comments:* I'm interested in this 2001 Porsche Boxster and I'd like to know if it's still available. I prefer to be contacted by: Email I prefer to be contacted by: Email (CarGurus deal rating: N/A / Is from deliverable listing: No)",
        '| Reg: BC02YDG Reg. date: 01 Jul 2002 Vehicle: 2001 Porsche Boxster 3.2 S 2dr Tiptronic S Stock number: 1924223 Listing price: £10,995 ...',
    ].join('\n');
    const lead = email({
        from: 'CarGurus <dealer-leads@messages.cargurus.com>',
        subject: 'Lead submission from CarGurus',
        text: body,
    });
    (0, node_test_1.it)('is a CarGurus enquiry', () => {
        node_assert_1.strict.equal(lead.source, 'CarGurus');
        node_assert_1.strict.equal(lead.kind, 'enquiry');
        node_assert_1.strict.equal((0, leadParsers_1.crmLeadSource)(lead.source), 'CarGurus');
    });
    (0, node_test_1.it)('pulls the customer out and tidies the name', () => {
        node_assert_1.strict.equal(lead.name, 'Paul Summerfield');
        node_assert_1.strict.equal(lead.firstName, 'Paul');
        node_assert_1.strict.equal(lead.email, 'pauljsummerfield@hotmail.com');
        node_assert_1.strict.equal(lead.phone, '+447471075500');
        node_assert_1.strict.equal(lead.postcode, 'N3 1PS');
    });
    (0, node_test_1.it)('strips the CarGurus boilerplate off the comments', () => {
        node_assert_1.strict.equal(lead.message, "I'm interested in this 2001 Porsche Boxster and I'd like to know if it's still available.");
        node_assert_1.strict.equal(lead.preferredContact, 'email');
    });
    (0, node_test_1.it)('reads the vehicle, the stock number and the reg', () => {
        node_assert_1.strict.equal(lead.vehicle?.stockId, '1924223');
        node_assert_1.strict.equal(lead.vehicle?.reg, 'BC02YDG');
        node_assert_1.strict.equal(lead.vehicle?.title, '2001 Porsche Boxster 3.2 S 2dr Tiptronic S');
        node_assert_1.strict.equal(lead.vehicle?.price, 10995);
    });
    (0, node_test_1.it)('answers the customer, never dealer-leads@', () => {
        node_assert_1.strict.equal(lead.contactable, true);
        node_assert_1.strict.deepEqual(lead.replyTo, { channel: 'email', address: 'pauljsummerfield@hotmail.com' });
        node_assert_1.strict.equal(lead.replyTargets.some(t => t.address.includes('cargurus')), false);
        node_assert_1.strict.deepEqual(lead.replyTargets.map(t => t.channel), ['email', 'whatsapp', 'sms']);
    });
});
(0, node_test_1.describe)('CarGurus phone lead', () => {
    const lead = email({
        from: 'dealer-leads@messages.cargurus.com',
        subject: 'Phone Lead from CarGurus',
        text: 'You received a call.\nPhone: 07712 000229\nDuration: 1 minutes, 15 seconds\n',
    });
    (0, node_test_1.it)('is a phone lead with a number and a duration', () => {
        node_assert_1.strict.equal(lead.kind, 'phone_lead');
        node_assert_1.strict.equal(lead.phone, '+447712000229');
        node_assert_1.strict.equal(lead.callDurationSeconds, 75);
        node_assert_1.strict.equal(lead.message, '');
    });
    (0, node_test_1.it)('can only be answered on the phone', () => {
        node_assert_1.strict.deepEqual(lead.replyTargets.map(t => t.channel), ['whatsapp', 'sms']);
    });
});
(0, node_test_1.describe)('Cazoo enquiry', () => {
    const body = [
        'New sales lead',
        'Vauxhall Astra GTC',
        'BV17OSY Listed at £4,995',
        '           Question',
        'Call Sam ( tel:07840143700 )',
        'Email Sam ( sam_18cobb@hotmail.co.uk )',
        'Customer message',
        "Hi, is this still available? I'm interested! Thanks",
        'Would you take a px with cash back?',
        'The buyer wants to know if the vehicle has any damages.',
        'Enquiry type',
        '           Question',
        'Customer details',
        'Sam Cobb',
        ' ( tel: )',
        'sam_18cobb@hotmail.co.uk',
        'View vehicle advert ( https://www.cazoo.co.uk/car-78833512/ )',
        'CorrelationID: 8f2c1d40-aaaa-bbbb-cccc-000011112222',
    ].join('\n');
    const lead = email({
        from: 'Cazoo <dealerleads@info.cazoo.co.uk>',
        subject: 'Enquiry - Vauxhall Astra GTC BV17OSY - Sam',
        text: body,
    });
    (0, node_test_1.it)('maps to the Motors.co.uk CRM source', () => {
        node_assert_1.strict.equal(lead.source, 'Cazoo');
        node_assert_1.strict.equal((0, leadParsers_1.crmLeadSource)(lead.source), 'Motors.co.uk');
    });
    (0, node_test_1.it)('takes the vehicle and reg from the subject', () => {
        node_assert_1.strict.equal(lead.vehicle?.reg, 'BV17OSY');
        node_assert_1.strict.equal(lead.vehicle?.title, 'Vauxhall Astra GTC');
        node_assert_1.strict.equal(lead.vehicle?.price, 4995);
        node_assert_1.strict.equal(lead.vehicle?.url, 'https://www.cazoo.co.uk/car-78833512/');
    });
    (0, node_test_1.it)('takes the customer from the body', () => {
        node_assert_1.strict.equal(lead.name, 'Sam Cobb');
        node_assert_1.strict.equal(lead.email, 'sam_18cobb@hotmail.co.uk');
        node_assert_1.strict.equal(lead.phone, '+447840143700');
        node_assert_1.strict.equal(lead.enquiryType, 'Question');
    });
    (0, node_test_1.it)('keeps the whole customer message and flags the part-exchange', () => {
        node_assert_1.strict.match(lead.message, /is this still available/i);
        node_assert_1.strict.match(lead.message, /damages/i);
        node_assert_1.strict.equal(lead.flags?.partEx, 'Would you take a px with cash back?');
    });
    (0, node_test_1.it)('carries the CorrelationID so the duplicate sends collapse', () => {
        node_assert_1.strict.equal(lead.correlationId, '8f2c1d40-aaaa-bbbb-cccc-000011112222');
    });
});
(0, node_test_1.describe)('Cazoo test-drive enquiry with no words', () => {
    const lead = email({
        from: 'dealerleads@info.cazoo.co.uk',
        subject: 'Enquiry - Ford Focus ST AB12CDE - Jo',
        text: [
            'New sales lead',
            'Ford Focus ST',
            'AB12CDE Listed at £9,995',
            'Customer message',
            '',
            'Enquiry type',
            '           Test drive',
            'Customer details',
            'Jo Bloggs',
            ' ( tel: )',
            'jo.bloggs@example.com',
        ].join('\n'),
    });
    (0, node_test_1.it)('says what the customer wanted even though they typed nothing', () => {
        node_assert_1.strict.equal(lead.enquiryType, 'Test drive');
        node_assert_1.strict.equal(lead.flags?.testDrive, true);
        node_assert_1.strict.equal(lead.message, 'Wants a test drive of the Ford Focus ST');
    });
    (0, node_test_1.it)('falls back to email when Cazoo hid the number', () => {
        node_assert_1.strict.equal(lead.phone, undefined);
        node_assert_1.strict.deepEqual(lead.replyTargets, [{ channel: 'email', address: 'jo.bloggs@example.com' }]);
    });
});
(0, node_test_1.describe)('Gumtree missed call', () => {
    const lead = email({
        from: 'noreply@partners.gumtree.com',
        subject: 'You just missed a lead',
        text: 'You just missed a lead.\nYou can reach the customer on 077 9350 5141.\nCall back +447793505141',
    });
    (0, node_test_1.it)('is a missed call with a callable number', () => {
        node_assert_1.strict.equal(lead.kind, 'missed_call');
        node_assert_1.strict.equal(lead.phone, '+447793505141');
        node_assert_1.strict.equal(lead.contactable, true);
    });
});
(0, node_test_1.describe)('Car Dealer 5 website enquiry', () => {
    const html = `
        <html><body>
          <a href="https://radlettcarsales.com/used/cars/1546657/"><img src="x.jpg"></a>
          <h2>BMW Z4 2.0i M Sport Roadster</h2>
          <h3>£6,495</h3>
          <table class="personal-info">
            <tr><td>Name:</td><td>Simon Fletcher</td></tr>
            <tr><td>Phone:</td><td><a href="tel:07123456789">07123 456789</a></td></tr>
            <tr><td>Email:</td><td><a href="mailto:simon.fletcher@example.co.uk">simon.fletcher@example.co.uk</a></td></tr>
            <tr><td>Message:</td><td>Is this still for sale and can I come and see it Saturday?</td></tr>
            <tr><td>GDPR Contact:</td><td>Email, Phone</td></tr>
          </table>
        </body></html>`;
    const lead = email({
        from: 'noreply@cardealer5.co.uk',
        subject: 'Enquiry - BMW Z4 (EA59ODK) - Simon',
        text: 'Please use an HTML viewer to read this message.',
        html,
    });
    (0, node_test_1.it)('is a Website lead read out of the HTML', () => {
        node_assert_1.strict.equal(lead.source, 'Website');
        node_assert_1.strict.equal(lead.kind, 'enquiry');
        node_assert_1.strict.equal(lead.name, 'Simon Fletcher');
        node_assert_1.strict.equal(lead.email, 'simon.fletcher@example.co.uk');
        node_assert_1.strict.equal(lead.phone, '+447123456789');
        node_assert_1.strict.equal(lead.message, 'Is this still for sale and can I come and see it Saturday?');
        node_assert_1.strict.equal(lead.preferredContact, 'email');
    });
    (0, node_test_1.it)('reads the stock id from the listing link and the reg from the subject', () => {
        node_assert_1.strict.equal(lead.vehicle?.stockId, '1546657');
        node_assert_1.strict.equal(lead.vehicle?.title, 'BMW Z4 2.0i M Sport Roadster');
        node_assert_1.strict.equal(lead.vehicle?.price, 6495);
        node_assert_1.strict.equal(lead.vehicle?.reg, 'EA59ODK');
    });
});
(0, node_test_1.describe)('Car Dealer 5 reservation emails', () => {
    (0, node_test_1.it)('treats a successful reservation as a reservation the agent may answer', () => {
        const lead = email({
            from: 'noreply@cardealer5.co.uk',
            subject: 'Vehicle Reservation Successful - Radlett Cars',
            text: 'Customer: Finlay Douglas\nEmail: finlay.douglas@example.com\nPhone: 07700 900123\nReg: EA59ODK\nAmount: £99',
        });
        node_assert_1.strict.equal(lead.kind, 'reservation');
        node_assert_1.strict.equal(lead.name, 'Finlay Douglas');
        node_assert_1.strict.equal(lead.vehicle?.reg, 'EA59ODK');
        node_assert_1.strict.equal(lead.contactable, true);
    });
    (0, node_test_1.it)('reads the customer out of a receipt addressed to them, not about them', () => {
        const lead = email({
            from: 'noreply@cardealer5.co.uk',
            to: 'jamie.sanderson@example.com',
            subject: 'Vehicle Reservation Successful - Radlett Cars',
            text: 'Hi Jamie Sanderson,\nThank you for reserving our PORSCHE BOXSTER with the registration number K50ATR\nWe will get back to you swiftly during our working hours. Call us on 07700 900123.',
        });
        node_assert_1.strict.equal(lead.kind, 'reservation');
        node_assert_1.strict.equal(lead.name, 'Jamie Sanderson');
        node_assert_1.strict.equal(lead.email, 'jamie.sanderson@example.com');
        node_assert_1.strict.equal(lead.vehicle?.reg, 'K50ATR');
        node_assert_1.strict.deepEqual(lead.replyTo, { channel: 'email', address: 'jamie.sanderson@example.com' });
    });
    (0, node_test_1.it)('does not mistake the dealership copy for the customer', () => {
        const lead = email({
            from: 'noreply@cardealer5.co.uk',
            to: 'Radlett Cars <radlettcars@gmail.com>',
            subject: 'Vehicle Reservation Successful - Radlett Cars',
            text: 'Hi Jamie Sanderson,\nThank you for reserving our PORSCHE BOXSTER with the registration number K50ATR\nCall us on 07700 900123.',
        });
        node_assert_1.strict.equal(lead.email, undefined);
        node_assert_1.strict.equal(lead.name, 'Jamie Sanderson');
    });
    (0, node_test_1.it)('never invents a question the customer did not ask', () => {
        const lead = email({
            from: 'noreply@cardealer5.co.uk',
            to: 'jamie.sanderson@example.com',
            subject: 'Vehicle Reservation Successful - Radlett Cars',
            text: 'Hi Jamie Sanderson,\nThank you for reserving our PORSCHE BOXSTER with the registration number K50ATR',
        });
        node_assert_1.strict.equal((0, leadParsers_1.messageOrDefault)(lead, 'Porsche Boxster 3.2 986 S'), '[Website receipt: reserved the Porsche Boxster 3.2 986 S (K50ATR). No message from the customer.]');
    });
    (0, node_test_1.it)('leaves a failed payment for Steve alone', () => {
        const lead = email({
            from: 'noreply@cardealer5.co.uk',
            subject: 'Payment Failed - Reservation #4471',
            text: 'Customer: Finlay Douglas\nEmail: finlay.douglas@example.com\nThe payment did not go through.',
        });
        node_assert_1.strict.equal(lead.kind, 'reservation');
        node_assert_1.strict.equal(lead.paymentFailed, true);
        node_assert_1.strict.equal(lead.contactable, false);
        node_assert_1.strict.deepEqual(lead.replyTargets, []);
    });
});
(0, node_test_1.describe)('Direct customer email', () => {
    const lead = email({
        from: 'Harriet Doyle <harriet.doyle@example.org>',
        subject: 'Porsche',
        text: 'Hi, is the Boxster still for sale? My number is 07700 900456.\n\nOn 25 Aug 2026, at 09:12, Radlett wrote:\n> old quoted stuff',
    });
    (0, node_test_1.it)('is a Direct enquiry answerable on both routes', () => {
        node_assert_1.strict.equal(lead.source, 'Direct');
        node_assert_1.strict.equal((0, leadParsers_1.crmLeadSource)(lead.source), 'Other');
        node_assert_1.strict.equal(lead.name, 'Harriet Doyle');
        node_assert_1.strict.equal(lead.email, 'harriet.doyle@example.org');
        node_assert_1.strict.equal(lead.phone, '+447700900456');
        node_assert_1.strict.deepEqual(lead.replyTargets.map(t => t.channel), ['email', 'whatsapp', 'sms']);
    });
    (0, node_test_1.it)('keeps a vehicle hint for the fuzzy stock match', () => {
        node_assert_1.strict.match(lead.vehicleHint || '', /Porsche/);
    });
});
(0, node_test_1.describe)('things that must never become a lead', () => {
    (0, node_test_1.it)('drops the Cazoo reservation-request phish', () => {
        const lead = email({
            from: 'Finlay Douglas <finlay.douglas@gmx.co.uk>',
            subject: 'Reservation request from Cazoo',
            text: [
                'Book test drive: Yes',
                'Is still for sale? No',
                'Service history: No',
                'Reserve this vehicle: No',
                'Requested more photos: No',
                'Customer: Tariro Muswera',
                'View the request: https://cazoo-reservations.example.tk/r/98812',
            ].join('\n'),
        });
        node_assert_1.strict.equal(lead.kind, 'ignore');
        node_assert_1.strict.equal(lead.ignoreReason, 'phishing:cazoo_reservation_request');
        node_assert_1.strict.equal(lead.contactable, false);
    });
    (0, node_test_1.it)('drops the checkbox template even without the giveaway subject', () => {
        const lead = email({
            from: 'someone@gmx.co.uk',
            subject: 'Vehicle',
            text: 'Book test drive: Yes\nIs still for sale? No\nReserve this vehicle: No\nCustomer: Tariro Muswera',
        });
        node_assert_1.strict.equal(lead.kind, 'ignore');
        node_assert_1.strict.equal(lead.ignoreReason, 'phishing:cazoo_reservation_request');
    });
    (0, node_test_1.it)('drops an off-platform link with no way to answer', () => {
        node_assert_1.strict.equal((0, leadParsers_1.looksLikeSpam)('Click here: https://bit.ly/abc123 to see your offer', undefined, SELF), true);
        const lead = email({
            from: 'offers@some-random-host.xyz',
            subject: 'Your vehicle enquiry',
            text: 'Please review the enquiry at https://some-random-host.xyz/lead/9912',
        });
        node_assert_1.strict.equal(lead.kind, 'ignore');
        node_assert_1.strict.equal(lead.ignoreReason, 'spam:off_platform_link_no_contact');
    });
    (0, node_test_1.it)('does not mistake a real customer with a link in their signature for spam', () => {
        node_assert_1.strict.equal((0, leadParsers_1.looksLikeSpam)('Is the Boxster available? Call me on 07700 900456.\n--\nwww.myshop.co.uk', undefined, SELF), false);
    });
    (0, node_test_1.it)('drops generic marketing that is not about a car', () => {
        const lead = email({
            from: 'leads@seo-boost.example',
            subject: 'Grow your dealership traffic',
            text: 'We help car dealers rank on Google. Unsubscribe at the bottom of this mailing list email.',
        });
        node_assert_1.strict.equal(lead.kind, 'ignore');
        node_assert_1.strict.equal(lead.ignoreReason, 'spam:not_car_related');
        node_assert_1.strict.equal((0, leadParsers_1.isSalesDeskRelevant)('Grow your dealership traffic', 'We help car dealers rank on Google'), false);
        node_assert_1.strict.equal((0, leadParsers_1.isGenericMarketing)('Grow your dealership', 'unsubscribe from this mailing list'), true);
    });
    (0, node_test_1.it)('keeps a plain customer email about a car', () => {
        const lead = email({
            from: 'Sam Cobb <sam@hotmail.co.uk>',
            subject: 'Porsche',
            text: 'Hi, is the Boxster still available? Can I come for a viewing Saturday?',
        });
        node_assert_1.strict.equal(lead.kind, 'enquiry');
        node_assert_1.strict.equal(lead.source, 'Direct');
        node_assert_1.strict.equal((0, leadParsers_1.isSalesDeskRelevant)('Porsche', 'is the Boxster still available?'), true);
    });
    (0, node_test_1.it)('keeps a short hours question to the sales desk', () => {
        const lead = email({
            from: 'jo@gmail.com',
            subject: 'Saturday',
            text: 'Are you open Saturday morning?',
        });
        node_assert_1.strict.equal(lead.kind, 'enquiry');
    });
    (0, node_test_1.it)('reads the car off a BCA purchase title and never makes it a customer', () => {
        const collection = email({
            from: 'Bristol Stock Controllers <BristolStockControllers@bca.com>',
            subject: 'Fw: SV66 OAS - Collection',
            text: 'Please advise when you would like to collect your vehicle.',
        });
        node_assert_1.strict.equal(collection.kind, 'supplier');
        node_assert_1.strict.equal(collection.vehicle?.reg, 'SV66OAS');
        node_assert_1.strict.equal(collection.contactable, false);
        const invoice = email({
            from: 'British Car Auctions <donotreply@bca-group.com>',
            subject: 'Copy of Invoice BW/1215852',
            text: 'BCA Buy Online Invoice Email 2 Text\nDear Customer,\nPlease email bcabuyersupport@bca.com',
        });
        node_assert_1.strict.equal(invoice.kind, 'supplier');
        node_assert_1.strict.equal(invoice.vehicle, undefined);
        node_assert_1.strict.equal(invoice.replyTargets.length, 0);
        node_assert_1.strict.deepEqual((0, leadParsers_1.bcaInvoiceVehicle)('WD7 7HU\nBW3S1J/U089BW BJ64 JBU PEUGEOT RCZ 1.6 TH R C13  AS SEEN BLACK\nODOMETER:52916'), { reg: 'BJ64JBU', title: 'Peugeot RCZ 1.6 TH R C13' });
    });
    (0, node_test_1.it)('drops the newsletters, the finance payouts and its own sent mail', () => {
        node_assert_1.strict.equal(email({ from: 'marketing@cargurus.com', subject: 'News' }).kind, 'ignore');
        node_assert_1.strict.equal(email({ from: 'sales@cardealer5.co.uk', subject: 'Newsletter' }).kind, 'ignore');
        node_assert_1.strict.equal(email({ from: 'payouts@jigsawfinance.com', subject: 'Payout' }).kind, 'ignore');
        node_assert_1.strict.equal(email({ from: 'noreply@facebookmail.com', subject: 'Hi' }).kind, 'ignore');
        node_assert_1.strict.equal(email({ from: 'BCA <BCA@news.bca.co.uk>', subject: 'Your weekend event is here' }).kind, 'ignore');
        node_assert_1.strict.equal(email({ from: SELF, subject: 'Re: Porsche' }).kind, 'ignore');
        node_assert_1.strict.equal(email({ from: 'dealer-leads@messages.cargurus.com', subject: 'Lead Intelligence: weekly' }).kind, 'ignore');
    });
});
(0, node_test_1.describe)('CarGurus chat-bot lead (HTML only, transcript comments)', () => {
    const html = [
        '<html><body><table><tr><td><h3>You have a new customer lead for your 2003 Porsche Boxster 3.2 S [260] 2dr Tiptronic S</h3></td></tr>',
        '<tr><td><b>Name:</b> Harsha Peerthy</td></tr>',
        '<tr><td><b>Email:</b> <a href="mailto:harshapeerthy@hotmail.co.uk">harshapeerthy@hotmail.co.uk</a></td></tr>',
        '<tr><td><b>Postcode:</b></td></tr>',
        '<tr><td><b>Customer comments:</b> Comments: Harsha would like to review the features of this vehicle Transcript: (Consumer): Regarding this 2003 Porsche Boxster (ID #9965793). (Agent): Welcome to CarGurus messaging service. (Consumer): Vehicle details (Agent): Great! (Consumer): 3 (Agent): Can I have your full name? (Consumer): Harsha Peerthy (Agent): Contact preference? (Consumer): Email or sms (Consumer): 1) 3) (Consumer): harshapeerthy@hotmail.co.uk (Consumer): Does it have a full service history? (Consumer): 2) (CarGurus deal rating: N/A / Is from deliverable listing: No)</td></tr>',
        '<tr><td>Reg: K50ATR Reg. date: 30 May 2003 Vehicle: 2003 Porsche Boxster 3.2 S [260] 2dr Tiptronic S Stock number: 1924213 Listing price: £8,995 CarGurus Instant Market Value: N/A</td></tr>',
        '</table></body></html>',
    ].join('');
    const lead = email({
        from: 'dealer-leads@messages.cargurus.com',
        subject: 'Lead submission from CarGurus',
        text: '',
        html,
        selfEmail: 'radlettcars@gmail.com',
    });
    (0, node_test_1.it)('finds the customer and the car with no text part', () => {
        node_assert_1.strict.equal(lead.kind, 'enquiry');
        node_assert_1.strict.equal(lead.name, 'Harsha Peerthy');
        node_assert_1.strict.equal(lead.email, 'harshapeerthy@hotmail.co.uk');
        node_assert_1.strict.equal(lead.contactable, true);
        node_assert_1.strict.deepEqual(lead.replyTo, { channel: 'email', address: 'harshapeerthy@hotmail.co.uk' });
        node_assert_1.strict.equal(lead.vehicle?.stockId, '1924213');
        node_assert_1.strict.equal(lead.vehicle?.reg, 'K50ATR');
        node_assert_1.strict.equal(lead.vehicle?.title, '2003 Porsche Boxster 3.2 S [260] 2dr Tiptronic S');
    });
    (0, node_test_1.it)('boils the transcript down to what the customer wants', () => {
        node_assert_1.strict.equal(lead.message, 'Harsha would like to review the features of this vehicle. In their words: "Does it have a full service history?"');
    });
});
(0, node_test_1.describe)('Delivery failure (bounce)', () => {
    const dsn = {
        from: 'Mail Delivery Subsystem <mailer-daemon@googlemail.com>',
        subject: 'Delivery Status Notification (Failure)',
        failedRecipient: 'jackandtash@hotmail.com',
        text: [
            "Your message wasn't delivered to jackandtash@hotmail.com because the address couldn't be found, or is unable to receive mail.",
            '',
            'The response from the remote server was:',
            '550 5.1.1 RESOLVER.ADR.RecipNotFound; Recipient not found by SMTP address lookup',
        ].join('\n'),
        selfEmail: SELF,
    };
    (0, node_test_1.it)('is a bounce, not a customer', () => {
        node_assert_1.strict.equal((0, leadParsers_1.isDeliveryFailure)(dsn), true);
        const lead = (0, leadParsers_1.parseLeadEmail)(dsn);
        node_assert_1.strict.equal(lead.kind, 'bounce');
        node_assert_1.strict.equal(lead.contactable, false);
        node_assert_1.strict.equal(lead.email, 'jackandtash@hotmail.com');
        node_assert_1.strict.equal(lead.bounceReason, 'address not found, or unable to receive mail');
        node_assert_1.strict.equal(lead.replyTargets.length, 0);
    });
    (0, node_test_1.it)('does not treat a customer mentioning a bounce as a DSN', () => {
        const lead = (0, leadParsers_1.parseLeadEmail)({
            from: 'Natasha <natasha@gmail.com>',
            subject: 'Mini convertible',
            text: 'Hi, did my last email bounce? I still want the Mini on Friday.',
            selfEmail: SELF,
        });
        node_assert_1.strict.equal(lead.kind, 'enquiry');
        node_assert_1.strict.equal(lead.email, 'natasha@gmail.com');
    });
});
(0, node_test_1.describe)('Car Dealer 5 mail that is not a lead', () => {
    (0, node_test_1.it)('drops the weekly "Your 5-Time Last Week" report instead of making "Last week at a glance" a car', () => {
        const lead = email({
            from: 'Car Dealer 5 Ltd <noreply@cardealer5.co.uk>',
            subject: 'Your 5-Time Last Week',
            text: 'To view the message, please use an HTML compatible email viewer!',
            html: '<html><body><h1>Your 5-Time Last Week</h1><h2>Last week at a glance</h2><p>9 LEADS RECEIVED</p><p>Top vehicle last week TOYOTA YARIS</p></body></html>',
        });
        node_assert_1.strict.equal(lead.kind, 'ignore');
        node_assert_1.strict.equal(lead.ignoreReason, 'cardealer5_report');
        node_assert_1.strict.equal(lead.vehicle, undefined);
    });
});
(0, node_test_1.describe)('Car Dealer 5 "Cargurus Vehicle Enquiry" (HTML behind a stub text part)', () => {
    const lead = email({
        from: 'noreply@cardealer5.co.uk',
        subject: 'Cargurus Vehicle Enquiry',
        text: 'To view the message, please use an HTML compatible email viewer!',
        html: '<html><body><p>Lead ID: 52680</p><p>Source: Cargurus</p><p>Customer: Alex Sample</p><p>Email: alex.sample@example.com</p><p>Phone: 07700 900123</p><p>Vehicle: 2017 Vauxhall GTC</p><p>Registration: BV17OSY</p><p>Price: 4995</p><p>Message:</p><p>I’m interested in this 2017 Vauxhall GTC and I’d like to know if it’s still available. I prefer to be contacted by: Call (CarGurus deal rating: N/A / Is from deliverable listing: No)</p></body></html>',
    });
    (0, node_test_1.it)('reads the car and its reg out of the HTML', () => {
        node_assert_1.strict.equal(lead.kind, 'enquiry');
        node_assert_1.strict.equal(lead.source, 'CarGurus');
        node_assert_1.strict.equal(lead.vehicle?.reg, 'BV17OSY');
        node_assert_1.strict.equal(lead.vehicle?.title, '2017 Vauxhall GTC');
        node_assert_1.strict.equal(lead.vehicle?.price, 4995);
    });
    (0, node_test_1.it)('answers the customer, with the CarGurus boilerplate taken off', () => {
        node_assert_1.strict.equal(lead.name, 'Alex Sample');
        node_assert_1.strict.equal(lead.email, 'alex.sample@example.com');
        node_assert_1.strict.equal(lead.phone, '+447700900123');
        node_assert_1.strict.equal(lead.replyTo.address, 'alex.sample@example.com');
        node_assert_1.strict.equal(lead.message, 'I’m interested in this 2017 Vauxhall GTC and I’d like to know if it’s still available.');
        node_assert_1.strict.equal(lead.preferredContact, 'phone');
    });
});
(0, node_test_1.describe)('the cd5 lead forwarder (one sender, a different customer every time)', () => {
    const FORWARDER = 'Radlett Cars <d1917-radlettcarsales-com@mg.cd5.uk>';
    const vehicleBlock = (year, reg, title, stockId) => `<div>Vehicle</div><div>${year} ${reg}</div><div>${title}</div><div>Stock #${stockId}</div><div>Price</div><div>£8,495</div>`;
    (0, node_test_1.it)('is never the customer or a reply address', () => {
        node_assert_1.strict.equal((0, leadParsers_1.isNoReplyAddress)('d1917-radlettcarsales-com@mg.cd5.uk'), true);
        node_assert_1.strict.equal((0, leadParsers_1.isNoReplyAddress)('reply+msg_abc123@replies.comms.cd5.uk'), true);
    });
    (0, node_test_1.it)('makes the customer in the body the contact, and reads the car from the stock block', () => {
        const lead = email({
            from: FORWARDER,
            subject: 'New website enquiry - Jo Sample - MINI Hatchback',
            text: [
                'New website enquiry',
                '',
                'Lead #57122',
                'Customer: Jo Sample',
                'Email: jo.sample@example.com',
                'Phone: 07700 900456',
                'Enquiry type: Cargurus',
                'Message: I’m interested in this 2015 MINI Hatchback and I’d like to know if it’s still available. (CarGurus IMV: £9,997 / Deal rating: Great Deal / Is from deliverable listing: No)',
                '',
                'Open lead: https://dealers.cardealer5.co.uk/leads/57122',
                'Reply email: reply+msg_abc123@replies.comms.cd5.uk',
            ].join('\n'),
            html: `<html><body><p>Jo is interested in your MINI Hatchback.</p><p>Preferred contact: Email</p>${vehicleBlock('2015', 'YN64GUF', 'MINI Hatchback', '1854362')}</body></html>`,
        });
        node_assert_1.strict.equal(lead.kind, 'enquiry');
        node_assert_1.strict.equal(lead.source, 'CarGurus');
        node_assert_1.strict.equal(lead.name, 'Jo Sample');
        node_assert_1.strict.equal(lead.email, 'jo.sample@example.com');
        node_assert_1.strict.equal(lead.replyTo.address, 'jo.sample@example.com');
        node_assert_1.strict.equal(lead.phone, '+447700900456');
        node_assert_1.strict.deepEqual(lead.vehicle, { title: 'MINI Hatchback', reg: 'YN64GUF', stockId: '1854362' });
        node_assert_1.strict.equal(lead.message, 'I’m interested in this 2015 MINI Hatchback and I’d like to know if it’s still available.');
        node_assert_1.strict.equal(lead.preferredContact, 'email');
    });
    (0, node_test_1.it)('keeps the part-exchange car out of vehicle.reg: it is the customer\'s own', () => {
        const lead = email({
            from: FORWARDER,
            subject: 'Part Exchange | radlettcarsales.com',
            text: [
                'New website enquiry',
                '',
                'Lead #75279',
                'Customer: Dee Sample',
                'Email: dee.sample@example.com',
                'Phone: 07700 900789',
                'Enquiry type: Part Exchange',
                '',
                'Open lead: https://dealers.cardealer5.co.uk/leads/75279',
                '',
                'Enquiry details',
                'Interested in: Part Exchange',
                'Make: Audi',
                'Model: A5',
                'Registration: RJ16CRU',
                'Year: 2016',
                'Mileage: 88000 Miles',
                'Desired value: 6000',
                'Part exchange requested: Yes',
                'Part exchange vehicle: BMW X1 SUV 1.5 X1 xDrive25e M Sport (2022)',
                'Part exchange vehicle URL: https://www.radlettcarsales.com/cars/bmw/x1/1.5-x1-xdrive25e-m-sport/1848608/',
            ].join('\n'),
        });
        node_assert_1.strict.equal(lead.email, 'dee.sample@example.com');
        node_assert_1.strict.equal(lead.vehicle?.stockId, '1848608');
        node_assert_1.strict.equal(lead.vehicle?.title, 'BMW X1 SUV 1.5 X1 xDrive25e M Sport');
        node_assert_1.strict.notEqual(lead.vehicle?.reg, 'RJ16CRU');
        node_assert_1.strict.match(lead.flags?.partEx || '', /RJ16CRU/);
        node_assert_1.strict.match(lead.message, /part-exchange valuation against the BMW X1/);
    });
});
(0, node_test_1.describe)('findReg only reads plates written in capitals', () => {
    (0, node_test_1.it)('does not turn ordinary words into plates', () => {
        node_assert_1.strict.equal((0, leadParsers_1.findReg)('The DJI Mini 5 V2 Pro is back in stock'), undefined);
        node_assert_1.strict.equal((0, leadParsers_1.findReg)('the Z4 and the Boxster'), undefined);
    });
    (0, node_test_1.it)('still reads a real plate', () => {
        node_assert_1.strict.equal((0, leadParsers_1.findReg)('Re: BMW S1000R SK15 WNA'), 'SK15WNA');
    });
    (0, node_test_1.it)('platform fields keep reading the plate in any case', () => {
        const lead = email({
            from: 'Cazoo <noreply@info.cazoo.co.uk>',
            subject: 'Enquiry - Vauxhall Astra GTC bv17osy - Sam',
            text: 'Customer message\nIs it still available?\nCustomer details\nSam Cobb',
        });
        node_assert_1.strict.equal(lead.vehicle?.reg, 'BV17OSY');
    });
});
//# sourceMappingURL=leadParsers.test.js.map