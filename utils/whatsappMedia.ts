/**
 * What Meta's Cloud API will actually take as a WhatsApp attachment.
 *
 * Images 5 MB, videos 16 MB, documents 100 MB on their side. We cap documents
 * at 16 MB so they fit the same storage rule as video.
 *
 * Nothing off a phone respects those numbers, so we get under them rather than
 * refuse. A photo is re-encoded here in the browser before it is uploaded; a
 * video is too big to touch on a canvas, so the original is uploaded (up to
 * 200 MB — see storage.rules) and ffmpeg re-encodes it in the function on the
 * way to Meta (functions/src/salesAgent/channels/videoCompress.ts). Only the
 * genuinely hopeless is refused.
 */

import type { WhatsAppMediaKind } from '../services/salesAgentService';
import { compressImage } from './helpers';

export const WHATSAPP_ACCEPT =
    'image/jpeg,image/png,image/webp,image/heic,image/heif,video/mp4,video/quicktime,video/3gpp,.jpg,.jpeg,.png,.webp,.heic,.heif,.mp4,.mov,.3gp,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt';

/** What Meta accepts, checked after any compression has happened. */
const MAX: Record<WhatsAppMediaKind, number> = {
    image: 5 * 1024 * 1024,
    video: 200 * 1024 * 1024,
    document: 16 * 1024 * 1024,
};

/**
 * What may be picked, checked before compression.
 *
 * A video is allowed far past Meta's 16 MB because the function shrinks it; a
 * photo past 64 MB is something a canvas will not decode anyway.
 */
const PICK_MAX: Record<WhatsAppMediaKind, number> = {
    image: 64 * 1024 * 1024,
    video: MAX.video,
    document: MAX.document,
};

/** Above this, or wider/taller than the long edge, a photo goes through the canvas. */
const IMAGE_COMPRESS_ABOVE = Math.round(4.5 * 1024 * 1024);
const IMAGE_LONG_EDGE = 1920;
const IMAGE_QUALITY_LADDER = [0.8, 0.6, 0.45];

export const classifyWhatsAppFile = (file: File): WhatsAppMediaKind | null => {
    const mime = (file.type || '').toLowerCase();
    if (
        mime === 'image/jpeg' || mime === 'image/jpg' || mime === 'image/png' || mime === 'image/webp'
        || mime === 'image/heic' || mime === 'image/heif'
    ) return 'image';
    if (mime === 'video/mp4' || mime === 'video/3gpp' || mime === 'video/quicktime' || mime.startsWith('video/')) return 'video';
    if (
        mime === 'application/pdf'
        || mime === 'text/plain'
        || mime === 'application/msword'
        || mime === 'application/vnd.ms-excel'
        || mime === 'application/vnd.ms-powerpoint'
        || mime.includes('officedocument')
        || mime.includes('msword')
        || mime.includes('spreadsheet')
        || mime.includes('presentation')
    ) return 'document';

    const name = file.name.toLowerCase();
    if (/\.(jpe?g|png|webp|heic|heif)$/.test(name)) return 'image';
    if (/\.(mp4|3gp|mov|qt)$/.test(name)) return 'video';
    if (/\.(pdf|docx?|xlsx?|pptx?|txt)$/.test(name)) return 'document';
    return null;
};

/** Phones often hand us an empty MIME. Storage rules need a real one. */
export const mimeForWhatsAppFile = (file: File): string => {
    const existing = (file.type || '').toLowerCase();
    if (existing === 'image/jpg') return 'image/jpeg';
    if (existing) return existing;

    const name = file.name.toLowerCase();
    if (/\.jpe?g$/.test(name)) return 'image/jpeg';
    if (/\.png$/.test(name)) return 'image/png';
    if (/\.webp$/.test(name)) return 'image/webp';
    if (/\.(heic|heif)$/.test(name)) return 'image/heic';
    if (/\.mp4$/.test(name)) return 'video/mp4';
    if (/\.(mov|qt)$/.test(name)) return 'video/quicktime';
    if (/\.3gp$/.test(name)) return 'video/3gpp';
    if (/\.pdf$/.test(name)) return 'application/pdf';
    if (/\.txt$/.test(name)) return 'text/plain';
    if (/\.docx$/.test(name)) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    if (/\.xlsx$/.test(name)) return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    if (/\.pptx$/.test(name)) return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
    if (/\.doc$/.test(name)) return 'application/msword';
    return existing;
};

export const coerceWhatsAppFile = (file: File): File => {
    const mime = mimeForWhatsAppFile(file);
    if (!mime || mime === file.type) return file;
    return new File([file], file.name, { type: mime, lastModified: file.lastModified });
};

/** Path inside the bucket, from a Firebase download URL. */
export const storagePathFromUrl = (url: string): string | null => {
    try {
        const parsed = new URL(url);
        const match = parsed.pathname.match(/\/o\/(.+)$/);
        if (match) return decodeURIComponent(match[1]);
    } catch {
        // Not a URL we can read.
    }
    return null;
};

export const isWhatsAppStoragePath = (path: string): boolean => {
    const parts = path.split('/').filter(Boolean);
    if (parts.length >= 3 && parts[1] === 'whatsapp') return true;
    if (parts.length >= 4 && parts[1] === 'salesAgent' && parts[2] === 'whatsapp') return true;
    if (parts.length >= 4 && parts[2] === 'whatsapp') return true;
    return false;
};

/**
 * Inbound photos used to be stored as `image-{wamid}`. That string is what a
 * broken <img> shows as its alt text, which is how the inbox looked like a
 * pile of dead links. A real name (V5C.pdf) is kept; a Meta id is not.
 */
export const friendlyWhatsAppMediaName = (kind: WhatsAppMediaKind, filename?: string): string => {
    const name = (filename || '').trim();
    const fallback = kind === 'image' ? 'Photo' : kind === 'video' ? 'Video' : 'File';
    if (!name) return fallback;
    if (/wamid/i.test(name)) return fallback;
    if (/^(image|video|document)-/i.test(name) && name.length > 40) return fallback;
    return name;
};

const describeAgainst = (file: File, caps: Record<WhatsAppMediaKind, number>): string | null => {
    const kind = classifyWhatsAppFile(file);
    if (!kind) {
        return 'WhatsApp will take a photo (JPEG/PNG), an MP4 video, or a PDF/Word/Excel file.';
    }
    if (file.size > caps[kind]) {
        const mb = Math.round(caps[kind] / (1024 * 1024));
        return kind === 'image'
            ? `That photo is over ${mb} MB, which WhatsApp will refuse.`
            : `That file is over ${mb} MB, which WhatsApp will refuse.`;
    }
    return null;
};

/** The final word, run on whatever is about to be uploaded. */
export const describeWhatsAppFileError = (file: File): string | null => describeAgainst(file, MAX);

/**
 * The word at the file picker, before anything has been shrunk. Kept separate so a
 * 90 MB video off a phone is accepted here and dealt with rather than turned away.
 */
export const describeWhatsAppPickError = (file: File): string | null => describeAgainst(file, PICK_MAX);

const imageLongEdge = (file: File): Promise<number> =>
    new Promise(resolve => {
        const img = new Image();
        const url = URL.createObjectURL(file);
        img.onload = () => {
            URL.revokeObjectURL(url);
            resolve(Math.max(img.naturalWidth, img.naturalHeight));
        };
        // A photo we cannot even measure is left alone; the size check has the last word.
        img.onerror = () => {
            URL.revokeObjectURL(url);
            resolve(0);
        };
        img.src = url;
    });

const asJpeg = (blob: Blob, name: string): File =>
    new File([blob], `${name.replace(/\.[^.]+$/, '')}.jpg`, { type: 'image/jpeg', lastModified: Date.now() });

/**
 * Get an attachment ready to upload.
 *
 * Photos only: quality comes down a step at a time until it is under Meta's 5 MB.
 * Video and documents are passed straight through — the function handles video.
 */
export const prepareWhatsAppFile = async (file: File): Promise<File> => {
    const ready = coerceWhatsAppFile(file);
    if (classifyWhatsAppFile(ready) !== 'image') return ready;
    if (ready.size <= IMAGE_COMPRESS_ABOVE && (await imageLongEdge(ready)) <= IMAGE_LONG_EDGE) {
        // HEIC cannot go to WhatsApp as-is; the canvas pass turns it into JPEG.
        const mime = (ready.type || '').toLowerCase();
        if (mime !== 'image/heic' && mime !== 'image/heif') return ready;
    }

    let smallest: File | null = null;

    for (const quality of IMAGE_QUALITY_LADDER) {
        const shrunk = asJpeg(await compressImage(ready, { maxWidth: IMAGE_LONG_EDGE, quality }), ready.name);
        if (!smallest || shrunk.size < smallest.size) smallest = shrunk;
        if (shrunk.size <= MAX.image) return shrunk;
    }

    // Nothing helped — hand back whichever is smaller and let the size check refuse it.
    return smallest && smallest.size < ready.size ? smallest : ready;
};
