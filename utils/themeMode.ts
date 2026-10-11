/**
 * Light / dark / system theme, saved per device (localStorage), not per company.
 * The company's brand colour is separate: businessDetails.theme (theme-<name> on <html>).
 *
 * index.html runs an inline copy of read + resolve + apply before first paint;
 * keep the key, values and default in step with it.
 */
export type ThemeMode = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_MODE_KEY = 'dlp.themeMode';
export const DEFAULT_THEME_MODE: ThemeMode = 'dark';

/** Browser bar colour per theme: the --c-bg value of each. */
const META_THEME_COLOR: Record<ResolvedTheme, string> = { dark: '#0B1117', light: '#F1F3F5' };

const isThemeMode = (value: unknown): value is ThemeMode =>
    value === 'system' || value === 'light' || value === 'dark';

export const readThemeMode = (): ThemeMode => {
    try {
        if (typeof localStorage !== 'undefined') {
            const stored = localStorage.getItem(THEME_MODE_KEY);
            if (isThemeMode(stored)) return stored;
        }
    } catch { /* private mode */ }
    return DEFAULT_THEME_MODE;
};

export const writeThemeMode = (mode: ThemeMode): void => {
    try {
        if (typeof localStorage !== 'undefined') localStorage.setItem(THEME_MODE_KEY, mode);
    } catch { /* private mode */ }
};

export const resolveTheme = (mode: ThemeMode, systemPrefersDark: boolean): ResolvedTheme =>
    mode === 'system' ? (systemPrefersDark ? 'dark' : 'light') : mode;

export const SYSTEM_DARK_QUERY = '(prefers-color-scheme: dark)';

export const systemPrefersDark = (): boolean =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(SYSTEM_DARK_QUERY).matches;

/** Stamp the resolved theme on <html> (drives the --c-* tokens) and the browser bar colour. */
export const applyTheme = (resolved: ResolvedTheme): void => {
    if (typeof document === 'undefined') return;
    document.documentElement.setAttribute('data-theme', resolved);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', META_THEME_COLOR[resolved]);
};
