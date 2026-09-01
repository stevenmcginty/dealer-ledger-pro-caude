import React from 'react';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ThreadMessage } from '../components/salesAgent/inboxMessages';
import type { AgentMessage } from '../services/salesAgentService';

const nigeText = `Sent from my iPhone regards nige

On 29 Aug 2026, at 06:49, radlett cars <radlettcars@gmail.com> wrote:

Hi Nigel

Please see the link below

https://www.poctra.org/lot/gASVEwAAAAAAAAACMDzkyODA

This is for my car was in the salvage auction. We don't have
the usual case when a car is written off, however, it obvious
because it doesn't look like this anymore.

*Regards,Steven McGintywww.radlettcarsales.com*

Tel: 07710525694`;

const msg = (over: Partial<AgentMessage>): AgentMessage => ({
    id: 'm1',
    direction: 'in',
    channel: 'whatsapp',
    text: nigeText,
    from: 'customer',
    createdAt: 1,
    ...over,
});

const htmlOf = (message: AgentMessage) =>
    renderToStaticMarkup(
        React.createElement(ThreadMessage, {
            message,
            agentName: 'Dave',
            selected: false,
            onToggleSelect: () => undefined,
            onDelete: () => undefined,
        })
    );

describe('ThreadMessage', () => {
    it('hides a pasted email on WhatsApp behind Quoted email', () => {
        const html = htmlOf(msg({ channel: 'whatsapp' }));
        expect(html).toContain('Sent from my iPhone regards nige');
        expect(html).toContain('Quoted email from radlett cars');
        expect(html).not.toContain('salvage auction');
        expect(html).not.toContain('poctra.org');
    });

    it('renders a WhatsApp that is really a desk email as a card', () => {
        const html = htmlOf(msg({
            channel: 'whatsapp',
            text: `Hi Steven

Is the 911 still for sale?

Yes it is still available. Would you like to come and see it or shall I send more details?

Thanks
Steven
Radlett Car Sales
07710 525694
www.radlettcarsales.com`,
        }));
        expect(html).toContain('Email');
        expect(html).toContain('Show more');
        expect(html).not.toContain('07710 525694');
    });

    it('does not show a Meta wamid as the photo label', () => {
        const html = htmlOf(msg({
            text: 'Back wheel',
            media: {
                kind: 'image',
                url: 'https://firebasestorage.googleapis.com/v0/b/motor-ledger-pro.firebasestorage.app/o/co%2Fwhatsapp%2Fphoto.jpg?alt=media&token=abc',
                filename: 'image-wamid.HBgMNDQ3NDYwNzI0NzY1FQIAEhgUM0EzNU',
            },
        }));
        expect(html).toContain('alt="Photo"');
        expect(html).toMatch(/referrerpolicy="no-referrer"/i);
        expect(html).toContain('Back wheel');
        expect(html).not.toContain('image-wamid');
        expect(html).not.toContain('HBgMNDQ3');
    });

    it('explains an unsupported WhatsApp instead of dumping [unsupported]', () => {
        const html = htmlOf(msg({ text: '[unsupported]' }));
        expect(html).toContain('WhatsApp did not pass this one');
        expect(html).toContain('photo album');
        expect(html).not.toContain('[unsupported]');
    });

    it('renders an email as a card, not a chat dump', () => {
        const html = htmlOf(msg({
            channel: 'email',
            subject: 'Porsche Boxster 3.2 986 S',
            fromAddress: 'nige@example.com',
        }));
        expect(html).toContain('Email');
        expect(html).toContain('Porsche Boxster 3.2 986 S');
        expect(html).toContain('nige@example.com');
        expect(html).toContain('Quoted email from radlett cars');
        expect(html).not.toContain('salvage auction');
    });
});
