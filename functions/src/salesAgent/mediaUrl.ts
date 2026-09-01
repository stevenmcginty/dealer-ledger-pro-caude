/**
 * What a caller is allowed to hand us as an attachment.
 *
 * Both send callables take a URL from the browser and then fetch it from inside
 * the function — Gmail reads the bytes to build the MIME part, WhatsApp reads
 * them to upload to Meta. An unchecked URL there is a server-side request the
 * caller chose: an internal metadata endpoint, another company's file, anything
 * reachable from the VPC. The bytes then leave in an email.
 *
 * So the only URLs accepted are Firebase Storage download URLs, on our own
 * bucket, under the calling company's own folder. Nothing else is fetched.
 */

import * as admin from 'firebase-admin';

const STORAGE_HOST = 'firebasestorage.googleapis.com';

/** Object path inside the bucket, from a Firebase download URL. Null if it is not one. */
export const objectPathFromDownloadUrl = (url: string, bucket: string): string | null => {
    let parsed: URL;
    try {
        parsed = new URL(url);
    } catch {
        return null;
    }
    if (parsed.protocol !== 'https:') return null;
    if (parsed.hostname.toLowerCase() !== STORAGE_HOST) return null;

    const match = parsed.pathname.match(/^\/v0\/b\/([^/]+)\/o\/(.+)$/);
    if (!match) return null;
    if (decodeURIComponent(match[1]) !== bucket) return null;

    try {
        return decodeURIComponent(match[2]);
    } catch {
        return null;
    }
};

/**
 * True when this URL points at a file the calling company owns.
 *
 * Every path we write starts with the company id — invoices live at
 * {companyId}/{userId}/invoices/, WhatsApp media at {companyId}/whatsapp/.
 * Anything that does not start there belongs to somebody else.
 */
export const isOwnCompanyDownloadUrl = (url: string, companyId: string, bucket: string): boolean => {
    const path = objectPathFromDownloadUrl(url, bucket);
    if (!path) return false;
    if (path.includes('..')) return false;
    const parts = path.split('/').filter(Boolean);
    return parts.length >= 2 && parts[0] === companyId;
};

/** The bucket this project actually writes to. Split out so the check above can be tested. */
export const ownBucketName = (): string => admin.storage().bucket().name;

/**
 * Refuse an attachment URL that is not ours, with wording Steve can act on.
 * Returns the URL unchanged when it is fine.
 */
export const assertOwnAttachmentUrl = (url: string, companyId: string): string => {
    if (!isOwnCompanyDownloadUrl(url, companyId, ownBucketName())) {
        throw new Error('That attachment is not a file on this account.');
    }
    return url;
};
