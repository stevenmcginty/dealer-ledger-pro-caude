import { readFileSync } from 'fs';
import { describe, it, expect } from 'vitest';

describe('Firebase hosting CSP', () => {
    const firebaseJson = JSON.parse(readFileSync('firebase.json', 'utf8'));
    const csp = firebaseJson.hosting.headers
        .flatMap((entry: { headers: Array<{ key: string; value: string }> }) => entry.headers)
        .find((header: { key: string }) => header.key === 'Content-Security-Policy')?.value as string | undefined;

    it('is present on hosting responses', () => {
        expect(csp).toBeTruthy();
    });

    it('allows Cloud Function callables used by vehicle lookup', () => {
        // Look up posts to https://us-central1-motor-ledger-pro.cloudfunctions.net/lookupVehicleByReg
        expect(csp).toMatch(/connect-src[^;]*https:\/\/\*\.cloudfunctions\.net/);
    });

    it('allows the service worker to import the Cloud Messaging SDK', () => {
        // importScripts() inside sw.js is governed by script-src of the policy
        // served with sw.js itself. Blocking gstatic silently kills web push.
        expect(csp).toMatch(/script-src[^;]*https:\/\/www\.gstatic\.com/);
    });

    it('covers every host public/sw.js imports at run time', () => {
        const sw = readFileSync('public/sw.js', 'utf8');
        const origins = [...sw.matchAll(/'(https:\/\/[^'\s]+)'/g)]
            .map(match => new URL(match[1]).origin);
        const scriptSrc = /script-src([^;]*)/.exec(csp || '')?.[1] || '';

        expect(origins.length).toBeGreaterThan(0);
        origins.forEach(origin => expect(scriptSrc).toContain(origin));
    });
});
