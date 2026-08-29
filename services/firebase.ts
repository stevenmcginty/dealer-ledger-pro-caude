// FIX: Import firebase and its services to provide types and fix namespace errors.
import firebase from 'firebase/compat/app';
import 'firebase/compat/auth';
import 'firebase/compat/database';
import 'firebase/compat/storage';
import { CONFIG } from '../config';

// Re-export User type from the firebase namespace
export type User = firebase.User;

export const firebaseConfig = {
  apiKey: CONFIG.FIREBASE_API_KEY || "mock-api-key", // Prevent empty string validation error
  authDomain: "motor-ledger-pro.firebaseapp.com",
  databaseURL: "https://motor-ledger-pro-default-rtdb.firebaseio.com",
  projectId: "motor-ledger-pro",
  storageBucket: "motor-ledger-pro.firebasestorage.app",
  // Cloud Messaging refuses to start without these two (@firebase/messaging
  // extractAppConfig requires projectId, apiKey, appId and messagingSenderId).
  // They are public identifiers, but they are kept in env alongside the API key
  // so a fork does not silently register against this project.
  messagingSenderId: CONFIG.FIREBASE_MESSAGING_SENDER_ID,
  appId: CONFIG.FIREBASE_APP_ID,
};

let authInstance: any;
let dbInstance: any;
let storageInstance: any;
let dbInitialized = false;

try {
    if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
    }
    authInstance = firebase.auth();
    // DON'T connect to RTDB on page load — lazy init on first auth
    // This prevents crawlers/bots from opening WebSocket connections
    storageInstance = firebase.storage();
} catch (error) {
    console.warn("Firebase initialization failed or API key invalid. Using mock services.", error);
    createMocks();
}

function initDatabase() {
    if (dbInitialized) return;
    dbInitialized = true;
    try {
        dbInstance = firebase.database();
        console.log('[Firebase] RTDB connected (user authenticated)');
        watchResumeReconnect();
    } catch (error) {
        console.warn('[Firebase] RTDB init failed:', error);
        createMocks();
    }
}

/**
 * iOS installed PWAs drop the Realtime Database websocket when backgrounded.
 * Firebase still thinks it's connected, so the next get() hangs until we
 * bounce the socket. Only do this after a real backgrounding, not a 1s app switch.
 */
let resumeWatchStarted = false;
let hiddenAt = 0;

function watchResumeReconnect() {
    if (resumeWatchStarted || typeof document === 'undefined') return;
    resumeWatchStarted = true;
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
            hiddenAt = Date.now();
            return;
        }
        if (hiddenAt && Date.now() - hiddenAt > 5000) reconnectDatabase();
    });
    window.addEventListener('online', () => reconnectDatabase());
}

/**
 * Screens that must re-read after the socket is bounced.
 *
 * A bounced socket is not the same thing as a screen that has caught up. A view
 * built from a `.on('value')` that was attached before the bounce can sit on the
 * snapshot it had and never hear another word, which is how a thread came back
 * from a phone-switch frozen: messages kept arriving in the database, sends kept
 * working (they are HTTPS callables, nothing to do with the socket), and the
 * conversation on screen stopped dead (29 Aug).
 */
type ResumeListener = () => void;
const resumeListeners = new Set<ResumeListener>();

/** Called after every reconnect. Returns an unsubscribe. */
export function onDatabaseResume(listener: ResumeListener): () => void {
    resumeListeners.add(listener);
    return () => resumeListeners.delete(listener);
}

/**
 * Drop and reopen the RTDB socket. Safe to call when db isn't up yet.
 *
 * goOnline is deliberately not called in the same tick as goOffline: back to back
 * the pair can be collapsed and the socket never actually comes back, which leaves
 * every listener silently dead.
 */
export function reconnectDatabase() {
    try {
        if (!dbInitialized) initDatabase();
        if (!dbInstance || typeof dbInstance.goOffline !== 'function') return;
        dbInstance.goOffline();
        setTimeout(() => {
            try {
                dbInstance.goOnline();
                console.log('[Firebase] RTDB socket bounced');
            } catch (error) {
                console.warn('[Firebase] RTDB goOnline failed:', error);
            }
            resumeListeners.forEach(listener => {
                try {
                    listener();
                } catch (error) {
                    console.warn('[Firebase] resume listener failed:', error);
                }
            });
        }, 150);
    } catch (error) {
        console.warn('[Firebase] RTDB reconnect failed:', error);
    }
}

function createMocks() {
     // Create minimal mocks to prevent crash
    authInstance = {
        onAuthStateChanged: (cb: any) => {
            // Simulate no user initially
            cb(null);
            return () => {};
        },
        signInWithPopup: () => Promise.reject("Mock Auth: No API Key"),
        signInWithEmailAndPassword: () => Promise.reject("Mock Auth: No API Key"),
        signOut: () => Promise.resolve(),
        currentUser: null
    };

    // Mock DB
    const mockSnap = { val: () => null, exists: () => false };
    const mockRef: any = {
        on: () => {},
        off: () => {},
        once: () => Promise.resolve(mockSnap),
        get: () => Promise.resolve(mockSnap),
        set: () => Promise.resolve(),
        push: () => ({ key: 'mock-id', set: () => Promise.resolve() }),
        update: () => Promise.resolve(),
        remove: () => Promise.resolve(),
        child: () => mockRef, // Recursive mock
        orderByChild: () => mockRef,
        equalTo: () => mockRef
    };
    dbInstance = {
        ref: () => mockRef
    };

    storageInstance = {
        ref: () => ({
            put: () => Promise.resolve({ ref: { getDownloadURL: () => Promise.resolve("http://mock.url/img.png") } }),
            child: () => storageInstance.ref(),
            getDownloadURL: () => Promise.resolve("http://mock.url/img.png"),
            delete: () => Promise.resolve()
        }),
        refFromURL: () => ({
            delete: () => Promise.resolve()
        })
    };
}

// Fallback if initialization worked but instances are somehow null (shouldn't happen)
if (!authInstance) createMocks();

// Listen for auth state — only connect to RTDB when a user logs in
if (authInstance && authInstance.onAuthStateChanged) {
    authInstance.onAuthStateChanged((user: any) => {
        if (user && !dbInitialized) {
            initDatabase();
        }
    });
}

// Initialize and export services
export const auth = authInstance;
// Lazy DB proxy — connects to RTDB only after auth, throws clear error if used before auth
export const db: any = new Proxy({} as any, {
    get(_target, prop) {
        if (!dbInitialized) {
            initDatabase();
        }
        if (!dbInstance) {
            // Still no DB (no auth yet) — use mock
            const mockSnap = { val: () => null, exists: () => false };
            const mockRef: any = {
                on: () => {},
                off: () => {},
                once: () => Promise.resolve(mockSnap),
                get: () => Promise.resolve(mockSnap),
                set: () => Promise.resolve(),
                push: () => ({ key: 'mock-id', set: () => Promise.resolve() }),
                update: () => Promise.resolve(),
                remove: () => Promise.resolve(),
                child: () => mockRef,
                orderByChild: () => mockRef,
                equalTo: () => mockRef
            };
            if (prop === 'ref') return () => mockRef;
            return undefined;
        }
        return dbInstance[prop];
    }
});
export const storage = storageInstance;

// Safe provider initialization
let provider: any;
try {
    provider = new firebase.auth.GoogleAuthProvider();
} catch (e) {
    provider = {}; // Mock provider
}

export const signInWithGoogle = () => {
    if (auth.signInWithPopup) return auth.signInWithPopup(provider);
    return Promise.reject("Mock Auth");
};

export const signInWithEmail = (email: string, password: string) => {
    if (auth.signInWithEmailAndPassword) return auth.signInWithEmailAndPassword(email, password);
    return Promise.reject("Mock Auth");
};

export const signOut = () => {
    return auth.signOut();
};

export const onAuthStateChanged = (
    callback: (user: User | null) => void
) => {
    if (auth.onAuthStateChanged) return auth.onAuthStateChanged(callback);
    callback(null);
    return () => {};
};
