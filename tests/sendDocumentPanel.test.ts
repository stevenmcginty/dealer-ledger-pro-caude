import { describe, expect, it } from 'vitest';
import { sendOutcomeMessage } from '../components/sales/SendDocumentPanel';

describe('sendOutcomeMessage', () => {
    it('names the channel the document went out on', () => {
        expect(sendOutcomeMessage('whatsapp', undefined, 'jo@example.com', '07700 900123'))
            .toBe('Sent on WhatsApp to 07700 900123.');
        expect(sendOutcomeMessage('email', undefined, 'jo@example.com', '07700 900123'))
            .toBe('Emailed to jo@example.com.');
        expect(sendOutcomeMessage('email+whatsapp', undefined, 'jo@example.com', '07700 900123'))
            .toBe('Emailed to jo@example.com, and a WhatsApp nudge went out.');
    });

    it('says when the WhatsApp half of the pair was held back', () => {
        const message = sendOutcomeMessage(
            'email',
            'WhatsApp opener is still awaiting Meta approval (usually a few minutes for a new template). Try again shortly.',
            'jo@example.com',
            '07700 900123'
        );
        expect(message).toContain('Emailed to jo@example.com.');
        expect(message).toContain('The WhatsApp nudge did not go');
        expect(message).toContain('awaiting Meta approval');
    });
});
