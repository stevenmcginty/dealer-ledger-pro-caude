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
        default: return `[${message.type}]`;
    }
};
