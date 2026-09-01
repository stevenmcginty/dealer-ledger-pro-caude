import { describe, expect, it } from 'vitest';
import { resolveContactCustomer, sendOutcomeMessage } from '../components/sales/SendDocumentPanel';

const CUSTOMERS = [
    { id: 'c1', name: 'John Smith' },
    { id: 'c2', name: 'Jane Doe' },
];

describe('resolveContactCustomer', () => {
    it('uses the id when it still names the customer on the document', () => {
        expect(resolveContactCustomer(CUSTOMERS, { customerId: 'c1', customerName: 'John Smith' }))
            .toEqual(CUSTOMERS[0]);
    });

    it('ignores an id left over from a name that was typed and then changed', () => {
        // The old bug: doc carries John's id but Jane's name, so John's record
        // got Jane's email address.
        expect(resolveContactCustomer(CUSTOMERS, { customerId: 'c1', customerName: 'Jane Doe' }))
            .toEqual(CUSTOMERS[1]);
    });

    it('returns null when the stale id names nobody on the document', () => {
        expect(resolveContactCustomer(CUSTOMERS, { customerId: 'c1', customerName: 'Sam New' }))
            .toBeNull();
    });

    it('falls back to the name when there is no id', () => {
        expect(resolveContactCustomer(CUSTOMERS, { customerName: 'jane doe' })).toEqual(CUSTOMERS[1]);
    });

    it('returns null for a blank name', () => {
        expect(resolveContactCustomer(CUSTOMERS, { customerName: '  ' })).toBeNull();
        expect(resolveContactCustomer(CUSTOMERS, {})).toBeNull();
    });
});

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
