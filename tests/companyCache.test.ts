import { describe, it, expect, beforeEach } from 'vitest';
import { readCachedCompanyId, writeCachedCompanyId, clearCachedCompanyId } from '../utils/companyCache';
import { readFileSync } from 'fs';

describe('company id cache', () => {
    beforeEach(() => {
        clearCachedCompanyId('user-1');
        clearCachedCompanyId('user-2');
    });

    it('round-trips a company id per user', () => {
        writeCachedCompanyId('user-1', 'company-a');
        expect(readCachedCompanyId('user-1')).toBe('company-a');
        expect(readCachedCompanyId('user-2')).toBeNull();
    });

    it('clears one user without touching another', () => {
        writeCachedCompanyId('user-1', 'company-a');
        writeCachedCompanyId('user-2', 'company-b');
        clearCachedCompanyId('user-1');
        expect(readCachedCompanyId('user-1')).toBeNull();
        expect(readCachedCompanyId('user-2')).toBe('company-b');
    });
});

describe('service worker fetch policy', () => {
    const source = readFileSync('public/sw.js', 'utf8');

    it('does not intercept cross-origin requests (Firebase long-poll)', () => {
        expect(source).toMatch(/url\.origin !== self\.location\.origin/);
    });

    it('only caches hashed /assets/ files on this origin', () => {
        expect(source).toMatch(/pathname\.startsWith\('\/assets\/'\)/);
    });
});
