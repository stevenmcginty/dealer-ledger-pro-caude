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
});
