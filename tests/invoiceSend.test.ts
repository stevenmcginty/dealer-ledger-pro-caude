import { describe, expect, it } from 'vitest';
import { planInvoiceSend } from '../functions/src/salesAgent/invoiceSend';

describe('planInvoiceSend', () => {
    it('WhatsApp with a live thread sends the document', () => {
        expect(planInvoiceSend({ via: 'whatsapp', hasEmail: true, hasPhone: true, windowOpen: true }))
            .toEqual({ action: 'whatsapp-document' });
    });

    it('WhatsApp with a cold thread falls back to email plus a nudge', () => {
        expect(planInvoiceSend({ via: 'whatsapp', hasEmail: true, hasPhone: true, windowOpen: false }))
            .toEqual({ action: 'email', nudgeWhatsApp: true });
    });

    it('refuses a cold WhatsApp with no email anywhere to fall back to', () => {
        const plan = planInvoiceSend({ via: 'whatsapp', hasEmail: false, hasPhone: true, windowOpen: false });
        expect(plan.action).toBe('refuse');
        if (plan.action === 'refuse') {
            expect(plan.reason).toContain('no email');
        }
    });

    it('refuses WhatsApp with no number on file', () => {
        const plan = planInvoiceSend({ via: 'whatsapp', hasEmail: true, hasPhone: false, windowOpen: true });
        expect(plan.action).toBe('refuse');
    });

    it('email sends by email, nudge or not', () => {
        expect(planInvoiceSend({ via: 'email', hasEmail: true, hasPhone: true, windowOpen: false }))
            .toEqual({ action: 'email', nudgeWhatsApp: false });
    });

    it('refuses email with no address on file', () => {
        const plan = planInvoiceSend({ via: 'email', hasEmail: false, hasPhone: true, windowOpen: true });
        expect(plan.action).toBe('refuse');
    });

    /**
     * The fabricated-window trap: a thread findOrCreateConversation just opened
     * for this send must count as COLD. Its lastCustomerMessageAt is 0 (reset by
     * sendInvoiceDocument), so the window computed from it is shut and this plan
     * is the one that runs — Meta would reject a document otherwise (code 131047).
     */
    it('treats a brand-new thread as a closed window', () => {
        const lastCustomerMessageAt = 0; // what sendInvoiceDocument leaves on a new thread
        const windowOpen = lastCustomerMessageAt > 0
            && Date.now() - lastCustomerMessageAt < 24 * 3_600_000;
        expect(planInvoiceSend({ via: 'whatsapp', hasEmail: true, hasPhone: true, windowOpen }))
            .toEqual({ action: 'email', nudgeWhatsApp: true });
    });
});
