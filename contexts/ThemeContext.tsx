import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
    type ThemeMode, type ResolvedTheme,
    readThemeMode, writeThemeMode, resolveTheme, applyTheme, systemPrefersDark, SYSTEM_DARK_QUERY,
} from '../utils/themeMode';

interface ThemeContextState {
    /** What the user picked on this device. */
    mode: ThemeMode;
    /** What is showing now ('system' resolved against the OS setting). */
    resolved: ResolvedTheme;
    setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextState | undefined>(undefined);

export const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
    const [mode, setModeState] = useState<ThemeMode>(readThemeMode);
    const [systemDark, setSystemDark] = useState<boolean>(systemPrefersDark);

    // Follow the OS setting live, but only while the user has chosen 'system'.
    useEffect(() => {
        if (mode !== 'system' || typeof window.matchMedia !== 'function') return;
        const query = window.matchMedia(SYSTEM_DARK_QUERY);
        setSystemDark(query.matches);
        const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
        query.addEventListener('change', onChange);
        return () => query.removeEventListener('change', onChange);
    }, [mode]);

    const resolved = resolveTheme(mode, systemDark);

    useEffect(() => {
        applyTheme(resolved);
    }, [resolved]);

    const setMode = useCallback((next: ThemeMode) => {
        writeThemeMode(next);
        setModeState(next);
    }, []);

    const value = useMemo(() => ({ mode, resolved, setMode }), [mode, resolved, setMode]);

    return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useThemeMode = (): ThemeContextState => {
    const context = useContext(ThemeContext);
    if (!context) throw new Error('useThemeMode must be used within a ThemeProvider');
    return context;
};
