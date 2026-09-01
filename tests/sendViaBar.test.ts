import React from 'react';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import SendViaBar, { sendViaLabel } from '../components/salesAgent/SendViaBar';

describe('sendViaLabel', () => {
    it('names the three send routes in plain words', () => {
        expect(sendViaLabel('email')).toBe('Send by email');
        expect(sendViaLabel('whatsapp')).toBe('Send on WhatsApp');
        expect(sendViaLabel('both')).toBe('Send by email and WhatsApp');
    });
});

describe('SendViaBar', () => {
    it('shows Email, WhatsApp and Both when a mobile is on file', () => {
        const html = renderToStaticMarkup(
            React.createElement(SendViaBar, {
                value: 'both',
                onChange: () => undefined,
                emailOk: true,
                phone: '+447700900222',
                needsOpener: true,
            })
        );
        expect(html).toContain('Email');
        expect(html).toContain('WhatsApp');
        expect(html).toContain('Both');
        expect(html).toContain('they get the short opener now');
        expect(html).not.toContain('Add a mobile');
    });

    it('offers to add a mobile when the lead has none', () => {
        const html = renderToStaticMarkup(
            React.createElement(SendViaBar, {
                value: 'email',
                onChange: () => undefined,
                emailOk: true,
                onAddPhone: () => undefined,
            })
        );
        expect(html).toContain('Add a mobile to send WhatsApp');
        expect(html).toContain('disabled=""');
    });
});
