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
    'image/jpeg,image/png,image/webp,video/mp4,video/3gpp,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt';

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
    if (mime === 'image/jpeg' || mime === 'image/jpg' || mime === 'image/png' || mime === 'image/webp') return 'image';
    if (mime === 'video/mp4' || mime === 'video/3gpp') return 'video';
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
    if (/\.(jpe?g|png|webp)$/.test(name)) return 'image';
    if (/\.(mp4|3gp)$/.test(name)) return 'video';
    if (/\.(pdf|docx?|xlsx?|pptx?|txt)$/.test(name)) return 'document';
    return null;
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
    if (classifyWhatsAppFile(file) !== 'image') return file;
    if (file.size <= IMAGE_COMPRESS_ABOVE && (await imageLongEdge(file)) <= IMAGE_LONG_EDGE) return file;

    let smallest: File | null = null;

    for (const quality of IMAGE_QUALITY_LADDER) {
        const shrunk = asJpeg(await compressImage(file, { maxWidth: IMAGE_LONG_EDGE, quality }), file.name);
        if (!smallest || shrunk.size < smallest.size) smallest = shrunk;
        if (shrunk.size <= MAX.image) return shrunk;
    }

    // Nothing helped — hand back whichever is smaller and let the size check refuse it.
    return smallest && smallest.size < file.size ? smallest : file;
};
