import { describe, it, expect } from 'vitest';
import { compareAppVersion, updateButtonLabel } from '../utils/appUpdate';

describe('compareAppVersion', () => {
    it('treats a different remote sha as a newer build', () => {
        expect(compareAppVersion('abc', 'def')).toBe('newer');
    });

    it('treats a matching sha as current', () => {
        expect(compareAppVersion('abc', 'abc')).toBe('same');
    });

    it('returns unknown when the probe failed', () => {
        expect(compareAppVersion(null, 'abc')).toBe('unknown');
        expect(compareAppVersion(undefined, 'abc')).toBe('unknown');
        expect(compareAppVersion('', 'abc')).toBe('unknown');
    });
});

describe('updateButtonLabel', () => {
    it('matches the Kora OS / Forge wording', () => {
        expect(updateButtonLabel('idle')).toBe('Check for updates');
        expect(updateButtonLabel('checking')).toBe('Checking…');
        expect(updateButtonLabel('updating')).toBe('Updating…');
        expect(updateButtonLabel('up-to-date')).toBe('Up to date');
        expect(updateButtonLabel('ready')).toBe('Update available · Tap to install');
    });
});
