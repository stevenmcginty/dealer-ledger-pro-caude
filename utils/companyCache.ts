const storageKey = (uid: string) => `mlp.companyId.${uid}`;

const memory: Record<string, string> = {};

const store = {
    getItem(key: string): string | null {
        try {
            if (typeof localStorage !== 'undefined') return localStorage.getItem(key);
        } catch { /* private mode */ }
        return memory[key] ?? null;
    },
    setItem(key: string, value: string): void {
        memory[key] = value;
        try {
            if (typeof localStorage !== 'undefined') localStorage.setItem(key, value);
        } catch { /* private mode */ }
    },
    removeItem(key: string): void {
        delete memory[key];
        try {
            if (typeof localStorage !== 'undefined') localStorage.removeItem(key);
        } catch { /* private mode */ }
    },
};

/** Last known company for this Firebase user. Lets the PWA open without a live RTDB round-trip. */
export const readCachedCompanyId = (uid: string): string | null => {
    if (!uid) return null;
    const value = store.getItem(storageKey(uid));
    return value || null;
};

export const writeCachedCompanyId = (uid: string, companyId: string): void => {
    if (!uid || !companyId) return;
    store.setItem(storageKey(uid), companyId);
};

export const clearCachedCompanyId = (uid: string): void => {
    if (!uid) return;
    store.removeItem(storageKey(uid));
};
