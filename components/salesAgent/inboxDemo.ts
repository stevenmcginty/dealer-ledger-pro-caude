/**
 * Screenshot-mode fixtures so the inbox can be opened without Firebase.
 * Not used in production.
 */

import type { AgentMessage, Conversation } from '../../services/salesAgentService';

const now = 1_725_000_000_000;

const nigeWhatsApp = `Sent from my iPhone regards nige

On 29 Aug 2026, at 06:49, radlett cars <radlettcars@gmail.com> wrote:

Hi Nigel

Please see the link below

https://www.poctra.org/lot/gASVEwAAAAAAAAACMDzkyODA

This is for my car was in the salvage auction. We don't have
the usual case when a car is written off, however, it obvious
because it doesn't look like this anymore.

In regards to Your car, I should imagine somewhere between
depending on condition. If you require any further informatio
to contact me

*Regards,Steven McGintywww.radlettcarsales.com*

Tel: 07710525694`;

export const DEMO_CONVERSATIONS: Conversation[] = [
    {
        id: 'nige-wa',
        shortId: 14,
        companyId: 'demo-company',
        channel: 'whatsapp',
        address: '+447710525694',
        originChannel: 'email',
        contact: { firstName: 'Nigel', lastName: 'Hart', phone: '+447710525694', email: 'nige@example.com', leadId: 'lead-nige' },
        mode: 'human',
        stage: 'vehicle',
        vehicleInterest: { title: 'Porsche Boxster 3.2 986 S' },
        escalated: false,
        pendingDraft: {
            id: 'd1',
            text: "Hi, I'm just checking on the Porsche Boxster. It's still available — would you like to come and see it?",
            createdAt: now + 40_000,
            source: 'agent',
            customerText: 'Is the car still available?',
        },
        priceRequests: 0,
        summary: 'Is the car still available?',
        lastInboundAt: now + 30_000,
        lastOutboundAt: now + 10_000,
        lastCustomerMessageAt: now + 30_000,
        createdAt: now,
        updatedAt: now + 40_000,
        unread: 1,
        emailSubject: 'Porsche Boxster 3.2 986 S',
    },
    {
        id: 'nige-em',
        shortId: 15,
        companyId: 'demo-company',
        channel: 'email',
        address: 'nige@example.com',
        originChannel: 'email',
        contact: { firstName: 'Nigel', lastName: 'Hart', phone: '+447710525694', email: 'nige@example.com', leadId: 'lead-nige' },
        mode: 'human',
        stage: 'vehicle',
        vehicleInterest: { title: 'Porsche Boxster 3.2 986 S' },
        escalated: false,
        priceRequests: 0,
        summary: 'Please see the link below',
        lastInboundAt: now,
        lastOutboundAt: now + 5_000,
        lastCustomerMessageAt: now,
        createdAt: now,
        updatedAt: now + 5_000,
        unread: 0,
        emailSubject: 'Porsche Boxster 3.2 986 S',
        emailThreadId: 'thread-nige',
    },
    {
        id: 'barry-wa',
        shortId: 12,
        companyId: 'demo-company',
        channel: 'whatsapp',
        address: '+447700900111',
        originChannel: 'whatsapp',
        contact: { firstName: 'Barry', phone: '+447700900111' },
        mode: 'agent',
        stage: 'timing',
        vehicleInterest: { title: 'Ford Focus ST-3' },
        escalated: false,
        priceRequests: 0,
        summary: 'Saturday morning if that still works',
        lastInboundAt: now - 3_600_000,
        lastOutboundAt: now - 3_500_000,
        lastCustomerMessageAt: now - 3_600_000,
        createdAt: now - 86_400_000,
        updatedAt: now - 3_500_000,
        unread: 0,
    },
    {
        id: 'pat-em',
        shortId: 9,
        companyId: 'demo-company',
        channel: 'email',
        address: 'pat@example.com',
        originChannel: 'email',
        contact: { firstName: 'Pat', lastName: 'Doyle', email: 'pat@example.com' },
        mode: 'agent',
        stage: 'deal',
        vehicleInterest: { title: 'Mazda MX-5 2.0 Sport' },
        escalated: false,
        priceRequests: 0,
        summary: 'Would you take a part exchange?',
        lastInboundAt: now - 8_000_000,
        lastOutboundAt: now - 7_900_000,
        lastCustomerMessageAt: now - 8_000_000,
        createdAt: now - 172_000_000,
        updatedAt: now - 7_900_000,
        unread: 0,
        emailSubject: 'MX-5 still for sale?',
    },
];

export const DEMO_MESSAGES: Record<string, AgentMessage[]> = {
    'nige-wa': [
        {
            id: 'w1',
            direction: 'out',
            channel: 'whatsapp',
            text: 'Hi Nigel, thanks for enquiring about the Porsche Boxster. It\'s still available. Would you like any more details, or to arrange a viewing or test drive?',
            from: 'agent',
            createdAt: now + 10_000,
            delivery: 'read',
        },
        {
            id: 'w2',
            direction: 'in',
            channel: 'whatsapp',
            text: nigeWhatsApp,
            from: 'customer',
            createdAt: now + 20_000,
        },
        {
            id: 'w3',
            direction: 'in',
            channel: 'whatsapp',
            text: 'Is the car still available?',
            from: 'customer',
            createdAt: now + 30_000,
        },
    ],
    'nige-em': [
        {
            id: 'e1',
            direction: 'in',
            channel: 'email',
            subject: 'Porsche Boxster 3.2 986 S',
            fromAddress: 'nige@example.com',
            text: `Hi

Please see the link below

https://www.poctra.org/lot/gASVEwAAAAAAAAACMDzkyODA

This is for my car was in the salvage auction. We don't have the usual case when a car is written off, however, it obvious because it doesn't look like this anymore.

In regards to Your car, I should imagine somewhere between depending on condition. If you require any further information please contact me

Regards
Nigel`,
            from: 'customer',
            createdAt: now,
        },
        {
            id: 'e2',
            direction: 'out',
            channel: 'email',
            subject: 'Re: Porsche Boxster 3.2 986 S',
            text: `Hi Nigel,

Thanks for the photos and the Poctra link. The Boxster is still here.

Would you like to come and see it, or shall I send over a few more details first?

Regards
Dave
Radlett Car Sales`,
            from: 'agent',
            createdAt: now + 5_000,
            delivery: 'sent',
        },
        {
            id: 'e3',
            direction: 'in',
            channel: 'email',
            subject: 'Re: Porsche Boxster 3.2 986 S',
            fromAddress: 'nige@example.com',
            text: nigeWhatsApp,
            from: 'customer',
            createdAt: now + 25_000,
        },
    ],
    'barry-wa': [
        {
            id: 'b1',
            direction: 'in',
            channel: 'whatsapp',
            text: 'Hi, is the Focus ST still about?',
            from: 'customer',
            createdAt: now - 3_700_000,
        },
        {
            id: 'b2',
            direction: 'out',
            channel: 'whatsapp',
            text: 'Yes Barry, it\'s here. Would Saturday morning suit you for a look?',
            from: 'agent',
            createdAt: now - 3_550_000,
            delivery: 'read',
        },
        {
            id: 'b3',
            direction: 'in',
            channel: 'whatsapp',
            text: 'Saturday morning if that still works',
            from: 'customer',
            createdAt: now - 3_600_000,
        },
    ],
    'pat-em': [
        {
            id: 'p1',
            direction: 'in',
            channel: 'email',
            subject: 'MX-5 still for sale?',
            fromAddress: 'pat@example.com',
            text: 'Hello, would you take a part exchange against the MX-5?',
            from: 'customer',
            createdAt: now - 8_000_000,
        },
        {
            id: 'p2',
            direction: 'out',
            channel: 'email',
            subject: 'Re: MX-5 still for sale?',
            text: `Hi Pat,

Yes we take part exchange. If you send the registration and a rough mileage I can take a look.

Regards
Dave
Radlett Car Sales`,
            from: 'agent',
            createdAt: now - 7_900_000,
            delivery: 'sent',
        },
    ],
};
