// FIX: Import firebase and its services to provide types and fix namespace errors.
import firebase from 'firebase/compat/app';
import 'firebase/compat/auth';
import 'firebase/compat/database';
import 'firebase/compat/storage';
import { CONFIG } from '../config';

// Re-export User type from the firebase namespace
export type User = firebase.User;

export const firebaseConfig = {
  apiKey: CONFIG.FIREBASE_API_KEY,
  authDomain: "motor-ledger-pro.firebaseapp.com",
  databaseURL: "https://motor-ledger-pro-default-rtdb.firebaseio.com",
  projectId: "motor-ledger-pro",
  storageBucket: "motor-ledger-pro.firebasestorage.app",
};

// Initialize Firebase
if (!firebase.apps.length) {
    try {
        firebase.initializeApp(firebaseConfig);
    } catch (error) {
        console.error("Firebase Initialization Error:", error);
    }
}

// Initialize and export services
export const auth = firebase.auth();
export const db = firebase.database();
export const storage = firebase.storage();
const provider = new firebase.auth.GoogleAuthProvider();

export const signInWithGoogle = () => {
    return auth.signInWithPopup(provider);
};

export const signInWithEmail = (email: string, password: string) => {
    return auth.signInWithEmailAndPassword(email, password);
};

export const signOut = () => {
    return auth.signOut();
};

export const onAuthStateChanged = (
    callback: (user: User | null) => void
) => {
    return auth.onAuthStateChanged(callback);
};