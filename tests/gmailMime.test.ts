import { describe, expect, it } from 'vitest';
import { buildMime } from '../functions/src/salesAgent/channels/gmail';

const BASE = {
    fromName: 'Radlett Cars',
    fromEmail: 'radlettcars@gmail.com',
    to: 'customer@example.com',
    subject: 'Your invoice #12345',
    body: 'Hi Jo, your invoice is attached.',
};

describe('buildMime', () => {
    it('stays a plain text message with no attachment', () => {
        const mime = buildMime(BASE);
        expect(mime).toContain('Content-Type: text/plain; charset="UTF-8"');
        expect(mime).not.toContain('multipart/mixed');
        expect(mime).toContain('Subject: Your invoice #12345');
        expect(mime).toContain('Hi Jo, your invoice is attached.');
        expect(mime).toContain('From: Radlett Cars <radlettcars@gmail.com>');
    });

    it('wraps an attachment in multipart/mixed and round-trips the bytes', () => {
        const bytes = Buffer.from('%PDF-1.4 not really a pdf but plenty of bytes for line wrapping '.repeat(20));
        const mime = buildMime({
            ...BASE,
            attachment: { filename: 'Sales-Invoice-12345.pdf', data: bytes, mime: 'application/pdf' },
        });

        expect(mime).toContain('Content-Type: multipart/mixed; boundary=');

        const boundaryMatch = mime.match(/boundary="([^"]+)"/);
        expect(boundaryMatch).not.toBeNull();
        const boundary = boundaryMatch![1];

        const parts = mime.split(`--${boundary}`);
        // [preamble, text part, attachment part, terminator]
        expect(parts.length).toBe(4);
        expect(mime.endsWith(`--${boundary}--`)).toBe(true);

        expect(parts[1]).toContain('Content-Type: text/plain; charset="UTF-8"');
        expect(parts[1]).toContain('Hi Jo, your invoice is attached.');

        expect(parts[2]).toContain('Content-Type: application/pdf; name="Sales-Invoice-12345.pdf"');
        expect(parts[2]).toContain('Content-Disposition: attachment; filename="Sales-Invoice-12345.pdf"');

        const base64 = parts[2].split('\r\n\r\n')[1].trim();
        // No line longer than RFC 2045's 76 characters.
        for (const line of base64.split('\r\n')) expect(line.length).toBeLessThanOrEqual(76);

        expect(Buffer.from(base64.replace(/\r\n/g, ''), 'base64')).toEqual(bytes);
    });

    it('same bytes in, same message out (stable boundary)', () => {
        const data = Buffer.from('identical bytes');
        const a = buildMime({ ...BASE, attachment: { filename: 'a.pdf', data } });
        const b = buildMime({ ...BASE, attachment: { filename: 'a.pdf', data } });
        expect(a).toBe(b);
    });

    it('keeps the In-Reply-To threading headers on a reply', () => {
        const mime = buildMime({ ...BASE, inReplyTo: '<msg-1@example.com>' });
        expect(mime).toContain('In-Reply-To: <msg-1@example.com>');
        expect(mime).toContain('References: <msg-1@example.com>');
    });
});
