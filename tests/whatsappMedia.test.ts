import { describe, expect, it } from 'vitest';
import {
    classifyWhatsAppFile,
    describeWhatsAppFileError,
    describeWhatsAppPickError,
    prepareWhatsAppFile,
} from '../utils/whatsappMedia';

/**
 * Only `size` is ever read, so it is faked rather than allocated — a real 250 MB
 * Uint8Array per case is minutes of test time for nothing.
 */
const file = (name: string, type: string, size = 1000): File => {
    const made = new File([new Uint8Array(Math.min(size, 1024))], name, { type });
    Object.defineProperty(made, 'size', { value: size });
    return made;
};

describe('classifyWhatsAppFile', () => {
    it('accepts jpeg, mp4 and pdf', () => {
        expect(classifyWhatsAppFile(file('a.jpg', 'image/jpeg'))).toBe('image');
        expect(classifyWhatsAppFile(file('clip.mp4', 'video/mp4'))).toBe('video');
        expect(classifyWhatsAppFile(file('spec.pdf', 'application/pdf'))).toBe('document');
    });

    it('rejects a type WhatsApp will not send', () => {
        expect(classifyWhatsAppFile(file('x.gif', 'image/gif'))).toBeNull();
        expect(describeWhatsAppFileError(file('x.gif', 'image/gif'))).toMatch(/JPEG/);
        expect(describeWhatsAppPickError(file('x.gif', 'image/gif'))).toMatch(/JPEG/);
    });
});

describe('describeWhatsAppPickError', () => {
    it('takes a phone video far past Meta\'s 16 MB, because the function shrinks it', () => {
        expect(describeWhatsAppPickError(file('clip.mp4', 'video/mp4', 90 * 1024 * 1024))).toBeNull();
    });

    it('refuses a video past the 200 MB upload cap', () => {
        expect(describeWhatsAppPickError(file('clip.mp4', 'video/mp4', 250 * 1024 * 1024))).toMatch(/200 MB/);
    });

    it('takes a photo over 5 MB, because it is compressed before upload', () => {
        expect(describeWhatsAppPickError(file('a.jpg', 'image/jpeg', 12 * 1024 * 1024))).toBeNull();
    });

    it('still refuses a document past 16 MB', () => {
        expect(describeWhatsAppPickError(file('spec.pdf', 'application/pdf', 17 * 1024 * 1024))).toMatch(/16 MB/);
    });
});

describe('describeWhatsAppFileError', () => {
    it('is the final word on a photo that would not compress', () => {
        expect(describeWhatsAppFileError(file('a.jpg', 'image/jpeg', 6 * 1024 * 1024))).toMatch(/5 MB/);
        expect(describeWhatsAppFileError(file('a.jpg', 'image/jpeg', 4 * 1024 * 1024))).toBeNull();
    });

    it('lets the uploaded video through up to 200 MB', () => {
        expect(describeWhatsAppFileError(file('clip.mp4', 'video/mp4', 90 * 1024 * 1024))).toBeNull();
        expect(describeWhatsAppFileError(file('clip.mp4', 'video/mp4', 250 * 1024 * 1024))).toMatch(/200 MB/);
    });
});

describe('prepareWhatsAppFile', () => {
    it('passes a video straight through — the function re-encodes it', async () => {
        const clip = file('clip.mp4', 'video/mp4', 90 * 1024 * 1024);
        expect(await prepareWhatsAppFile(clip)).toBe(clip);
    });

    it('passes a document straight through', async () => {
        const spec = file('spec.pdf', 'application/pdf', 2 * 1024 * 1024);
        expect(await prepareWhatsAppFile(spec)).toBe(spec);
    });
});
