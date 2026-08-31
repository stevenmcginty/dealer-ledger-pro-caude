import { describe, expect, it } from 'vitest';
import { isLongEmailBody, looksLikeForwardedEmail, splitQuotedEmail } from '../utils/emailQuote';

const NIGE = `Sent from my iPhone regards nige

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

describe('splitQuotedEmail', () => {
    it('cuts an Apple Mail reply at On … wrote', () => {
        const split = splitQuotedEmail(NIGE);
        expect(split.body).toBe('Sent from my iPhone regards nige');
        expect(split.quotedFrom).toBe('radlett cars');
        expect(split.quoted).toMatch(/^Hi Nigel/);
        expect(split.quoted).toContain('salvage auction');
        expect(split.body).not.toContain('poctra.org');
    });

    it('cuts a Gmail On-wrote line', () => {
        const split = splitQuotedEmail(
            'Is the Boxster still for sale?\n\nOn Mon, 25 Aug 2026 at 09:12 Steve McGinty <radlettcars@gmail.com> wrote:\n\n> still available'
        );
        expect(split.body).toBe('Is the Boxster still for sale?');
        expect(split.quoted).toContain('still available');
    });

    it('cuts Outlook Original Message', () => {
        const split = splitQuotedEmail('Thanks\n\n-----Original Message-----\nFrom: Dave\nHi');
        expect(split.body).toBe('Thanks');
        expect(split.quoted).toContain('From: Dave');
    });

    it('leaves a plain WhatsApp with no quote whole', () => {
        const split = splitQuotedEmail('Is the car still available?');
        expect(split.body).toBe('Is the car still available?');
        expect(split.quoted).toBeNull();
    });
});

describe('looksLikeForwardedEmail', () => {
    it('treats the Nige paste as an email, not chat', () => {
        const split = splitQuotedEmail(NIGE);
        expect(looksLikeForwardedEmail(split.quoted)).toBe(true);
    });

    it('does not collapse a short quoted reply', () => {
        expect(looksLikeForwardedEmail('> ok thanks')).toBe(false);
    });
});

describe('isLongEmailBody', () => {
    it('flags a wall of salvage-auction text', () => {
        const split = splitQuotedEmail(NIGE);
        expect(isLongEmailBody(split.quoted || '')).toBe(true);
        expect(isLongEmailBody('Hi, still available?')).toBe(false);
    });
});
