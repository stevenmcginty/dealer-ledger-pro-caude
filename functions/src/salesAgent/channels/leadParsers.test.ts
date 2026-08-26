/**
 * Parser tests, run with the Node test runner that ships with Node 20:
 *
 *   cd functions && npx tsc && node --test lib/salesAgent/channels/leadParsers.test.js
 *
 * The bodies below are the samples in docs/sales-agent/EMAIL_FORMATS.md. If a real
 * email stops parsing, add it here first — the point of this file is that the formats
 * doc and the code cannot drift apart silently.
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { crmLeadSource, isGenericMarketing, isNoReplyAddress, isSalesDeskRelevant, looksLikeSpam, parseFromHeader, parseLeadEmail } from './leadParsers';

const SELF = 'radlettcars@gmail.com';

const email = (over: Partial<Parameters<typeof parseLeadEmail>[0]>) => parseLeadEmail({
    from: '',
    subject: '',
    text: '',
    selfEmail: SELF,
    ...over,
});

describe('From header', () => {
    it('splits a display name from the address', () => {
        assert.deepEqual(parseFromHeader('Paul Summerfield <PaulJSummerfield@hotmail.com>'), {
            name: 'Paul Summerfield',
            address: 'pauljsummerfield@hotmail.com',
        });
    });

    it('copes with a bare address', () => {
        assert.equal(parseFromHeader('sam_18cobb@hotmail.co.uk').address, 'sam_18cobb@hotmail.co.uk');
    });

    it('knows a platform robot from a customer', () => {
        assert.equal(isNoReplyAddress('dealer-leads@messages.cargurus.com'), true);
        assert.equal(isNoReplyAddress('noreply@cardealer5.co.uk'), true);
        assert.equal(isNoReplyAddress('noreply@partners.gumtree.com'), true);
        assert.equal(isNoReplyAddress('pauljsummerfield@hotmail.com'), false);
    });
});

describe('CarGurus lead submission', () => {
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

    it('is a CarGurus enquiry', () => {
        assert.equal(lead.source, 'CarGurus');
        assert.equal(lead.kind, 'enquiry');
        assert.equal(crmLeadSource(lead.source), 'CarGurus');
    });

    it('pulls the customer out and tidies the name', () => {
        assert.equal(lead.name, 'Paul Summerfield');
        assert.equal(lead.firstName, 'Paul');
        assert.equal(lead.email, 'pauljsummerfield@hotmail.com');
        assert.equal(lead.phone, '+447471075500');
        assert.equal(lead.postcode, 'N3 1PS');
    });

    it('strips the CarGurus boilerplate off the comments', () => {
        assert.equal(
            lead.message,
            "I'm interested in this 2001 Porsche Boxster and I'd like to know if it's still available."
        );
        assert.equal(lead.preferredContact, 'email');
    });

    it('reads the vehicle, the stock number and the reg', () => {
        assert.equal(lead.vehicle?.stockId, '1924223');
        assert.equal(lead.vehicle?.reg, 'BC02YDG');
        assert.equal(lead.vehicle?.title, '2001 Porsche Boxster 3.2 S 2dr Tiptronic S');
        assert.equal(lead.vehicle?.price, 10995);
    });

    it('answers the customer, never dealer-leads@', () => {
        assert.equal(lead.contactable, true);
        assert.deepEqual(lead.replyTo, { channel: 'email', address: 'pauljsummerfield@hotmail.com' });
        assert.equal(lead.replyTargets.some(t => t.address.includes('cargurus')), false);
        assert.deepEqual(
            lead.replyTargets.map(t => t.channel),
            ['email', 'whatsapp', 'sms']
        );
    });
});

describe('CarGurus phone lead', () => {
    const lead = email({
        from: 'dealer-leads@messages.cargurus.com',
        subject: 'Phone Lead from CarGurus',
        text: 'You received a call.\nPhone: 07712 000229\nDuration: 1 minutes, 15 seconds\n',
    });

    it('is a phone lead with a number and a duration', () => {
        assert.equal(lead.kind, 'phone_lead');
        assert.equal(lead.phone, '+447712000229');
        assert.equal(lead.callDurationSeconds, 75);
        assert.equal(lead.message, '');
    });

    it('can only be answered on the phone', () => {
        assert.deepEqual(lead.replyTargets.map(t => t.channel), ['whatsapp', 'sms']);
    });
});

describe('Cazoo enquiry', () => {
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

    it('maps to the Motors.co.uk CRM source', () => {
        assert.equal(lead.source, 'Cazoo');
        assert.equal(crmLeadSource(lead.source), 'Motors.co.uk');
    });

    it('takes the vehicle and reg from the subject', () => {
        assert.equal(lead.vehicle?.reg, 'BV17OSY');
        assert.equal(lead.vehicle?.title, 'Vauxhall Astra GTC');
        assert.equal(lead.vehicle?.price, 4995);
        assert.equal(lead.vehicle?.url, 'https://www.cazoo.co.uk/car-78833512/');
    });

    it('takes the customer from the body', () => {
        assert.equal(lead.name, 'Sam Cobb');
        assert.equal(lead.email, 'sam_18cobb@hotmail.co.uk');
        assert.equal(lead.phone, '+447840143700');
        assert.equal(lead.enquiryType, 'Question');
    });

    it('keeps the whole customer message and flags the part-exchange', () => {
        assert.match(lead.message, /is this still available/i);
        assert.match(lead.message, /damages/i);
        assert.equal(lead.flags?.partEx, 'Would you take a px with cash back?');
    });

    it('carries the CorrelationID so the duplicate sends collapse', () => {
        assert.equal(lead.correlationId, '8f2c1d40-aaaa-bbbb-cccc-000011112222');
    });
});

describe('Cazoo test-drive enquiry with no words', () => {
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

    it('says what the customer wanted even though they typed nothing', () => {
        assert.equal(lead.enquiryType, 'Test drive');
        assert.equal(lead.flags?.testDrive, true);
        assert.equal(lead.message, 'Wants a test drive of the Ford Focus ST');
    });

    it('falls back to email when Cazoo hid the number', () => {
        assert.equal(lead.phone, undefined);
        assert.deepEqual(lead.replyTargets, [{ channel: 'email', address: 'jo.bloggs@example.com' }]);
    });
});

describe('Gumtree missed call', () => {
    const lead = email({
        from: 'noreply@partners.gumtree.com',
        subject: 'You just missed a lead',
        text: 'You just missed a lead.\nYou can reach the customer on 077 9350 5141.\nCall back +447793505141',
    });

    it('is a missed call with a callable number', () => {
        assert.equal(lead.kind, 'missed_call');
        assert.equal(lead.phone, '+447793505141');
        assert.equal(lead.contactable, true);
    });
});

describe('Car Dealer 5 website enquiry', () => {
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

    it('is a Website lead read out of the HTML', () => {
        assert.equal(lead.source, 'Website');
        assert.equal(lead.kind, 'enquiry');
        assert.equal(lead.name, 'Simon Fletcher');
        assert.equal(lead.email, 'simon.fletcher@example.co.uk');
        assert.equal(lead.phone, '+447123456789');
        assert.equal(lead.message, 'Is this still for sale and can I come and see it Saturday?');
        assert.equal(lead.preferredContact, 'email');
    });

    it('reads the stock id from the listing link and the reg from the subject', () => {
        assert.equal(lead.vehicle?.stockId, '1546657');
        assert.equal(lead.vehicle?.title, 'BMW Z4 2.0i M Sport Roadster');
        assert.equal(lead.vehicle?.price, 6495);
        assert.equal(lead.vehicle?.reg, 'EA59ODK');
    });
});

describe('Car Dealer 5 reservation emails', () => {
    it('treats a successful reservation as a reservation the agent may answer', () => {
        const lead = email({
            from: 'noreply@cardealer5.co.uk',
            subject: 'Vehicle Reservation Successful - Radlett Cars',
            text: 'Customer: Finlay Douglas\nEmail: finlay.douglas@example.com\nPhone: 07700 900123\nReg: EA59ODK\nAmount: £99',
        });

        assert.equal(lead.kind, 'reservation');
        assert.equal(lead.name, 'Finlay Douglas');
        assert.equal(lead.vehicle?.reg, 'EA59ODK');
        assert.equal(lead.contactable, true);
    });

    it('leaves a failed payment for Steve alone', () => {
        const lead = email({
            from: 'noreply@cardealer5.co.uk',
            subject: 'Payment Failed - Reservation #4471',
            text: 'Customer: Finlay Douglas\nEmail: finlay.douglas@example.com\nThe payment did not go through.',
        });

        assert.equal(lead.kind, 'reservation');
        assert.equal(lead.paymentFailed, true);
        assert.equal(lead.contactable, false);
        assert.deepEqual(lead.replyTargets, []);
    });
});

describe('Direct customer email', () => {
    const lead = email({
        from: 'Harriet Doyle <harriet.doyle@example.org>',
        subject: 'Porsche',
        text: 'Hi, is the Boxster still for sale? My number is 07700 900456.\n\nOn 25 Aug 2026, at 09:12, Radlett wrote:\n> old quoted stuff',
    });

    it('is a Direct enquiry answerable on both routes', () => {
        assert.equal(lead.source, 'Direct');
        assert.equal(crmLeadSource(lead.source), 'Other');
        assert.equal(lead.name, 'Harriet Doyle');
        assert.equal(lead.email, 'harriet.doyle@example.org');
        assert.equal(lead.phone, '+447700900456');
        assert.deepEqual(lead.replyTargets.map(t => t.channel), ['email', 'whatsapp', 'sms']);
    });

    it('keeps a vehicle hint for the fuzzy stock match', () => {
        assert.match(lead.vehicleHint || '', /Porsche/);
    });
});

describe('things that must never become a lead', () => {
    it('drops the Cazoo reservation-request phish', () => {
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

        assert.equal(lead.kind, 'ignore');
        assert.equal(lead.ignoreReason, 'phishing:cazoo_reservation_request');
        assert.equal(lead.contactable, false);
    });

    it('drops the checkbox template even without the giveaway subject', () => {
        const lead = email({
            from: 'someone@gmx.co.uk',
            subject: 'Vehicle',
            text: 'Book test drive: Yes\nIs still for sale? No\nReserve this vehicle: No\nCustomer: Tariro Muswera',
        });

        assert.equal(lead.kind, 'ignore');
        assert.equal(lead.ignoreReason, 'phishing:cazoo_reservation_request');
    });

    it('drops an off-platform link with no way to answer', () => {
        assert.equal(looksLikeSpam('Click here: https://bit.ly/abc123 to see your offer', undefined, SELF), true);

        const lead = email({
            from: 'offers@some-random-host.xyz',
            subject: 'Your vehicle enquiry',
            text: 'Please review the enquiry at https://some-random-host.xyz/lead/9912',
        });

        assert.equal(lead.kind, 'ignore');
        assert.equal(lead.ignoreReason, 'spam:off_platform_link_no_contact');
    });

    it('does not mistake a real customer with a link in their signature for spam', () => {
        assert.equal(
            looksLikeSpam('Is the Boxster available? Call me on 07700 900456.\n--\nwww.myshop.co.uk', undefined, SELF),
            false
        );
    });

    it('drops generic marketing that is not about a car', () => {
        const lead = email({
            from: 'leads@seo-boost.example',
            subject: 'Grow your dealership traffic',
            text: 'We help car dealers rank on Google. Unsubscribe at the bottom of this mailing list email.',
        });
        assert.equal(lead.kind, 'ignore');
        assert.equal(lead.ignoreReason, 'spam:not_car_related');
        assert.equal(isSalesDeskRelevant('Grow your dealership traffic', 'We help car dealers rank on Google'), false);
        assert.equal(isGenericMarketing('Grow your dealership', 'unsubscribe from this mailing list'), true);
    });

    it('keeps a plain customer email about a car', () => {
        const lead = email({
            from: 'Sam Cobb <sam@hotmail.co.uk>',
            subject: 'Porsche',
            text: 'Hi, is the Boxster still available? Can I come for a viewing Saturday?',
        });
        assert.equal(lead.kind, 'enquiry');
        assert.equal(lead.source, 'Direct');
        assert.equal(isSalesDeskRelevant('Porsche', 'is the Boxster still available?'), true);
    });

    it('keeps a short hours question to the sales desk', () => {
        const lead = email({
            from: 'jo@gmail.com',
            subject: 'Saturday',
            text: 'Are you open Saturday morning?',
        });
        assert.equal(lead.kind, 'enquiry');
    });

    it('drops the newsletters, the finance payouts and its own sent mail', () => {
        assert.equal(email({ from: 'marketing@cargurus.com', subject: 'News' }).kind, 'ignore');
        assert.equal(email({ from: 'sales@cardealer5.co.uk', subject: 'Newsletter' }).kind, 'ignore');
        assert.equal(email({ from: 'payouts@jigsawfinance.com', subject: 'Payout' }).kind, 'ignore');
        assert.equal(email({ from: 'noreply@facebookmail.com', subject: 'Hi' }).kind, 'ignore');
        assert.equal(email({ from: SELF, subject: 'Re: Porsche' }).kind, 'ignore');
        assert.equal(
            email({ from: 'dealer-leads@messages.cargurus.com', subject: 'Lead Intelligence: weekly' }).kind,
            'ignore'
        );
    });
});
