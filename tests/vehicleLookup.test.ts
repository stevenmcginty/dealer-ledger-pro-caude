import { describe, it, expect } from 'vitest';
import { describeLookupError, isPlausibleUkReg, normaliseReg } from '../services/vehicleLookup';

describe('normaliseReg', () => {
    it('strips spaces and punctuation, uppercases', () => {
        expect(normaliseReg('nd63 ljz')).toBe('ND63LJZ');
        expect(normaliseReg('ND-63-LJZ')).toBe('ND63LJZ');
    });
});

describe('isPlausibleUkReg', () => {
    it('accepts current-style plates', () => {
        expect(isPlausibleUkReg('ND63LJZ')).toBe(true);
        expect(isPlausibleUkReg('nd63 ljz')).toBe(true);
    });

    it('rejects empty or letter-only strings', () => {
        expect(isPlausibleUkReg('')).toBe(false);
        expect(isPlausibleUkReg('FORD')).toBe(false);
    });
});

describe('describeLookupError', () => {
    it('does not treat a missing Cloud Function as a missing vehicle record', () => {
        expect(describeLookupError({ code: 'functions/not-found', message: 'NOT FOUND' }, 'ND63LJZ'))
            .toBe('The vehicle lookup service is not available. Try again later.');
    });

    it('explains a blocked or dropped request', () => {
        expect(describeLookupError({ code: 'functions/unavailable', message: 'Failed to fetch' }))
            .toBe('Could not reach the vehicle lookup service. Check your connection and try again.');
        // CSP / CORS failures surface as HTTP status 0 → functions/internal + "internal"
        expect(describeLookupError({ code: 'functions/internal', message: 'internal' }))
            .toBe('Could not reach the vehicle lookup service. Check your connection and try again.');
    });

    it('asks for a sign-in when the callable is unauthenticated', () => {
        expect(describeLookupError({ code: 'functions/unauthenticated' }))
            .toBe('You need to be signed in to look up a registration.');
    });
});
