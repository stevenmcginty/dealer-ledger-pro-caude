/**
 * What Meta's Cloud API will actually take as a WhatsApp attachment.
 *
 * Images 5 MB, videos 16 MB, documents 100 MB on their side. We cap documents
 * at 16 MB so they fit the same storage rule as video.
 */

import type { WhatsAppMediaKind } from '../services/salesAgentService';

export const WHATSAPP_ACCEPT =
    'image/jpeg,image/png,image/webp,video/mp4,video/3gpp,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt';

const MAX: Record<WhatsAppMediaKind, number> = {
    image: 5 * 1024 * 1024,
    video: 16 * 1024 * 1024,
    document: 16 * 1024 * 1024,
};

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

export const describeWhatsAppFileError = (file: File): string | null => {
    const kind = classifyWhatsAppFile(file);
    if (!kind) {
        return 'WhatsApp will take a photo (JPEG/PNG), an MP4 video, or a PDF/Word/Excel file.';
    }
    if (file.size > MAX[kind]) {
        const mb = Math.round(MAX[kind] / (1024 * 1024));
        return kind === 'image'
            ? `That photo is over ${mb} MB, which WhatsApp will refuse.`
            : `That file is over ${mb} MB, which WhatsApp will refuse.`;
    }
    return null;
};
