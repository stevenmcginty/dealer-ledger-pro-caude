import { describe, expect, it } from 'vitest';
import { classifyWhatsAppFile, describeWhatsAppFileError } from '../utils/whatsappMedia';

const file = (name: string, type: string, size = 1000): File =>
    new File([new Uint8Array(size)], name, { type });

describe('classifyWhatsAppFile', () => {
    it('accepts jpeg, mp4 and pdf', () => {
        expect(classifyWhatsAppFile(file('a.jpg', 'image/jpeg'))).toBe('image');
        expect(classifyWhatsAppFile(file('clip.mp4', 'video/mp4'))).toBe('video');
        expect(classifyWhatsAppFile(file('spec.pdf', 'application/pdf'))).toBe('document');
    });

    it('rejects a type WhatsApp will not send', () => {
        expect(classifyWhatsAppFile(file('x.gif', 'image/gif'))).toBeNull();
        expect(describeWhatsAppFileError(file('x.gif', 'image/gif'))).toMatch(/JPEG/);
    });

    it('rejects an oversized video', () => {
        const big = file('clip.mp4', 'video/mp4', 17 * 1024 * 1024);
        expect(describeWhatsAppFileError(big)).toMatch(/16 MB/);
    });
});
