import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { resolveTheme, readThemeMode, writeThemeMode, THEME_MODE_KEY, type ThemeMode } from '../utils/themeMode';

describe('resolveTheme', () => {
    const cases: [ThemeMode, boolean, 'light' | 'dark'][] = [
        ['system', true, 'dark'],
        ['system', false, 'light'],
        ['light', true, 'light'],
        ['light', false, 'light'],
        ['dark', true, 'dark'],
        ['dark', false, 'dark'],
    ];
    it.each(cases)('mode %s with system dark=%s resolves to %s', (mode, systemDark, expected) => {
        expect(resolveTheme(mode, systemDark)).toBe(expected);
    });
});

describe('readThemeMode / writeThemeMode', () => {
    let data: Record<string, string>;
    const g = globalThis as { localStorage?: unknown };

    beforeEach(() => {
        data = {};
        g.localStorage = {
            getItem: (key: string) => (key in data ? data[key] : null),
            setItem: (key: string, value: string) => { data[key] = String(value); },
            removeItem: (key: string) => { delete data[key]; },
        };
    });

    afterEach(() => {
        delete g.localStorage;
    });

    it('defaults to dark when nothing is stored', () => {
        expect(readThemeMode()).toBe('dark');
    });

    it('falls back to dark for an invalid stored value', () => {
        data[THEME_MODE_KEY] = 'sepia';
        expect(readThemeMode()).toBe('dark');
    });

    it('round-trips each valid mode under dlp.themeMode', () => {
        for (const mode of ['system', 'light', 'dark'] as ThemeMode[]) {
            writeThemeMode(mode);
            expect(data['dlp.themeMode']).toBe(mode);
            expect(readThemeMode()).toBe(mode);
        }
    });

    it('defaults to dark when localStorage throws', () => {
        g.localStorage = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
        expect(() => writeThemeMode('light')).not.toThrow();
        expect(readThemeMode()).toBe('dark');
    });

    it('defaults to dark when localStorage does not exist', () => {
        delete g.localStorage;
        expect(readThemeMode()).toBe('dark');
    });
});
