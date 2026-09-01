import { describe, expect, it } from 'vitest';

import { isOwnCompanyDownloadUrl, objectPathFromDownloadUrl } from '../functions/src/salesAgent/mediaUrl';

const BUCKET = 'dealer-ledger-pro.appspot.com';
const COMPANY = 'company123';

const downloadUrl = (path: string, bucket = BUCKET) =>
    `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(path)}?alt=media&token=abc`;

describe('objectPathFromDownloadUrl', () => {
    it('reads the object path out of a Firebase download URL', () => {
        expect(objectPathFromDownloadUrl(downloadUrl('company123/user1/invoices/INV-1.pdf'), BUCKET))
            .toBe('company123/user1/invoices/INV-1.pdf');
    });

    it('refuses another bucket', () => {
        expect(objectPathFromDownloadUrl(downloadUrl('company123/x.pdf', 'someone-else.appspot.com'), BUCKET)).toBeNull();
    });

    it('refuses a host that is not Firebase Storage', () => {
        expect(objectPathFromDownloadUrl('https://evil.example.com/v0/b/' + BUCKET + '/o/x', BUCKET)).toBeNull();
    });

    it('refuses anything that is not https', () => {
        expect(objectPathFromDownloadUrl('http://169.254.169.254/computeMetadata/v1/', BUCKET)).toBeNull();
    });
});

describe('isOwnCompanyDownloadUrl', () => {
    it('accepts an invoice PDF in this company folder', () => {
        expect(isOwnCompanyDownloadUrl(downloadUrl('company123/user1/invoices/INV-1.pdf'), COMPANY, BUCKET)).toBe(true);
    });

    it('accepts WhatsApp media in this company folder', () => {
        expect(isOwnCompanyDownloadUrl(downloadUrl('company123/whatsapp/photo.jpg'), COMPANY, BUCKET)).toBe(true);
    });

    it('refuses another company folder', () => {
        expect(isOwnCompanyDownloadUrl(downloadUrl('company999/whatsapp/photo.jpg'), COMPANY, BUCKET)).toBe(false);
    });

    it('refuses the instance metadata endpoint', () => {
        expect(isOwnCompanyDownloadUrl('http://169.254.169.254/computeMetadata/v1/instance/service-accounts/default/token', COMPANY, BUCKET)).toBe(false);
    });

    it('refuses a path that climbs out of the company folder', () => {
        expect(isOwnCompanyDownloadUrl(downloadUrl('company123/../company999/x.pdf'), COMPANY, BUCKET)).toBe(false);
    });

    it('refuses junk', () => {
        expect(isOwnCompanyDownloadUrl('not a url', COMPANY, BUCKET)).toBe(false);
    });
});
