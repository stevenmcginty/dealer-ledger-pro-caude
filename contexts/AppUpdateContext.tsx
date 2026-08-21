import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { compareAppVersion, updateButtonLabel, type UpdateStatus } from '../utils/appUpdate';

declare const __APP_VERSION__: string;
const BUILT_VERSION: string = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev';

const POLL_MS = 5 * 60 * 1000;
const VERSION_URL = '/version.json';

interface AppUpdateContextValue {
    status: UpdateStatus;
    needRefresh: boolean;
    builtVersion: string;
    checkForUpdate: () => Promise<void>;
    applyUpdate: () => Promise<void>;
}

const AppUpdateContext = createContext<AppUpdateContextValue>({
    status: 'idle',
    needRefresh: false,
    builtVersion: BUILT_VERSION,
    checkForUpdate: async () => {},
    applyUpdate: async () => {},
});

async function fetchRemoteVersion(): Promise<string | null> {
    try {
        const res = await fetch(`${VERSION_URL}?t=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) return null;
        const data = await res.json();
        return typeof data?.version === 'string' ? data.version : null;
    } catch {
        return null;
    }
}

async function pingServiceWorker(): Promise<void> {
    if (!('serviceWorker' in navigator)) return;
    try {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(reg => reg.update().catch(() => undefined)));
    } catch {
        // Ignore — version.json is the source of truth.
    }
}

/**
 * Wipe the PWA caches and drop the service worker, then reload. Leaves cookies
 * and Firebase auth alone — that's the point of the button versus "delete site data".
 */
export async function reloadOntoLatestBuild(): Promise<void> {
    try {
        const names = await caches.keys();
        await Promise.all(names.map(name => caches.delete(name)));
    } catch { /* fall through to reload */ }
    try {
        if ('serviceWorker' in navigator) {
            const regs = await navigator.serviceWorker.getRegistrations();
            await Promise.all(regs.map(reg => reg.unregister()));
        }
    } catch { /* ignore */ }
    window.location.reload();
}

export const AppUpdateProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [status, setStatus] = useState<UpdateStatus>('idle');
    const [needRefresh, setNeedRefresh] = useState(false);
    const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const compareAndSet = useCallback(async (): Promise<ReturnType<typeof compareAppVersion>> => {
        const remote = await fetchRemoteVersion();
        const result = compareAppVersion(remote, BUILT_VERSION);
        if (result === 'newer') setNeedRefresh(true);
        return result;
    }, []);

    const checkForUpdate = useCallback(async () => {
        if (idleTimerRef.current) {
            clearTimeout(idleTimerRef.current);
            idleTimerRef.current = null;
        }
        setStatus('checking');
        await pingServiceWorker();
        const result = await compareAndSet();
        if (result === 'newer') {
            setStatus('ready');
        } else {
            setStatus('up-to-date');
            idleTimerRef.current = setTimeout(() => setStatus('idle'), 3000);
        }
    }, [compareAndSet]);

    const applyUpdate = useCallback(async () => {
        setStatus('updating');
        await reloadOntoLatestBuild();
    }, []);

    useEffect(() => {
        let cancelled = false;
        const tick = async () => {
            if (cancelled) return;
            await pingServiceWorker();
            const result = await compareAndSet();
            if (cancelled) return;
            if (result === 'newer') setStatus('ready');
        };

        const initial = setTimeout(tick, 4000);
        const id = setInterval(tick, POLL_MS);
        const onVisible = () => {
            if (document.visibilityState === 'visible') tick();
        };
        document.addEventListener('visibilitychange', onVisible);

        return () => {
            cancelled = true;
            clearTimeout(initial);
            clearInterval(id);
            document.removeEventListener('visibilitychange', onVisible);
            if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
        };
    }, [compareAndSet]);

    return (
        <AppUpdateContext.Provider value={{ status, needRefresh, builtVersion: BUILT_VERSION, checkForUpdate, applyUpdate }}>
            {children}
        </AppUpdateContext.Provider>
    );
};

export const useAppUpdate = (): AppUpdateContextValue => useContext(AppUpdateContext);

export { updateButtonLabel };
