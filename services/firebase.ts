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
};

let authInstance: any;
let dbInstance: any;
let storageInstance: any;

try {
    if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
    }
    authInstance = firebase.auth();
    dbInstance = firebase.database();
    storageInstance = firebase.storage();
} catch (error) {
    console.warn("Firebase initialization failed or API key invalid. Using mock services.", error);
    createMocks();
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
    const mockRef = {
        on: () => {},
        off: () => {},
        once: () => Promise.resolve({ val: () => null, exists: () => false }),
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
            getDownloadURL: () => Promise.resolve("http://mock.url/img.png")
        })
    };
}

// Fallback if initialization worked but instances are somehow null (shouldn't happen)
if (!authInstance) createMocks();

// Initialize and export services
export const auth = authInstance;
export const db = dbInstance;
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
