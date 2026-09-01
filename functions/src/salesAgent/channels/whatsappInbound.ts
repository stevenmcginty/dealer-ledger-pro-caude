/**
 * Turn a WhatsApp Cloud API inbound payload into the text we store.
 *
 * Not everything is text. A voice note or a photo still needs to reach the brain as
 * something, or the customer gets silence — a placeholder lets the agent say "I can't
 * play voice notes, what were you after?" rather than nothing at all.
 *
 * Reactions are the exception: Meta sends the actual emoji on `reaction.emoji`, and
 * omits it when they tap the same emoji again to remove it. The default `[type]`
 * fallback used to store `[reaction]` and throw the emoji away.
 *
 * `unsupported` is Meta saying the Cloud API cannot represent the message. The
 * usual case in coexistence is a photo album sent as one tap: webhook 1 is
 * type=unsupported (error 131051), then each photo arrives on its own. View-once
 * and polls do the same. We store `[unsupported]` so the inbox can show a notice,
 * and we do not ask Dave to reply to it.
 */

export interface WhatsAppInboundSource {
    type: string;
    text?: { body: string };
    button?: { text?: string };
    interactive?: { button_reply?: { title?: string }; list_reply?: { title?: string } };
    image?: { caption?: string };
    video?: { caption?: string };
    document?: { caption?: string; filename?: string };
    reaction?: { message_id?: string; emoji?: string };
}

export const WHATSAPP_PLACEHOLDER_RE =
    /^\[(photo|video|document|voice note|sticker|location|contact card|unsupported|button|selection|order)\]$/i;

export const isWhatsAppPlaceholderText = (text: string): boolean =>
    WHATSAPP_PLACEHOLDER_RE.test((text || '').trim());

export const whatsappInboundText = (message: WhatsAppInboundSource): string => {
    switch (message.type) {
        case 'text': return message.text?.body || '';
        case 'button': return message.button?.text || '[button]';
        case 'interactive':
            return message.interactive?.button_reply?.title || message.interactive?.list_reply?.title || '[selection]';
        case 'audio':
        case 'voice': return '[voice note]';
        case 'image': return message.image?.caption || '[photo]';
        case 'video': return message.video?.caption || '[video]';
        case 'document': return message.document?.caption || message.document?.filename || '[document]';
        case 'location': return '[location]';
        case 'sticker': return '[sticker]';
        case 'contacts': return '[contact card]';
        case 'reaction': return message.reaction?.emoji || '';
        case 'unsupported': return '[unsupported]';
        default: return `[${message.type}]`;
    }
};

/**
 * True when this inbound should sit in the thread but not trigger Dave.
 *
 * A captionless photo is already on screen for Steve. Asking the model to
 * answer `[photo]` is how we got "empty reply from agent" on Marco's album.
 * A caption that is a real sentence still goes through.
 */
export const inboundNeedsNoReply = (message: WhatsAppInboundSource): boolean => {
    switch (message.type) {
        case 'unsupported':
        case 'audio':
        case 'voice':
        case 'sticker':
        case 'location':
        case 'contacts':
        case 'reaction':
            return true;
        case 'image':
            return !message.image?.caption?.trim();
        case 'video':
            return !message.video?.caption?.trim();
        case 'document':
            return !message.document?.caption?.trim();
        default:
            return false;
    }
};

const extensionFor = (kind: 'image' | 'video' | 'document', mime: string): string => {
    const m = mime.toLowerCase();
    if (m.includes('png')) return 'png';
    if (m.includes('webp')) return 'webp';
    if (m.includes('gif')) return 'gif';
    if (m.includes('mp4')) return 'mp4';
    if (m.includes('quicktime') || m.includes('mov')) return 'mov';
    if (m.includes('pdf')) return 'pdf';
    if (kind === 'image') return 'jpg';
    if (kind === 'video') return 'mp4';
    return 'bin';
};

/** MIME we write on the Storage object, so the browser will paint it. */
export const inboundMediaMime = (kind: 'image' | 'video' | 'document', raw?: string): string => {
    const mime = (raw || '').toLowerCase().split(';')[0].trim();
    if (mime === 'image/jpg') return 'image/jpeg';
    if (mime.startsWith('image/') || mime.startsWith('video/') || mime === 'application/pdf') return mime;
    if (kind === 'image') return 'image/jpeg';
    if (kind === 'video') return 'video/mp4';
    return mime || 'application/octet-stream';
};

/** Short name for the inbox. Never the Meta wamid — that is what the broken alt text was. */
export const inboundMediaFileName = (
    kind: 'image' | 'video' | 'document',
    mime?: string,
    given?: string
): string => {
    const cleaned = (given || '').replace(/[^\w.\-]+/g, '_');
    if (cleaned && !/wamid/i.test(cleaned)) return cleaned;
    return `${kind}.${extensionFor(kind, inboundMediaMime(kind, mime))}`;
};
