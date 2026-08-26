// Configuration loaded from environment variables
// Create a .env.local file with your actual keys (see .env.example)

export const CONFIG = {
  // Firebase Configuration
  FIREBASE_API_KEY: import.meta.env.VITE_FIREBASE_API_KEY || '',

  // Cloud Messaging (web push). All three are needed before a browser can
  // register for Dave's alerts; without them push reports itself unavailable
  // and nothing else changes. Sender id and app id come from Firebase console
  // -> Project settings -> General; the VAPID key from Cloud Messaging ->
  // Web Push certificates.
  FIREBASE_MESSAGING_SENDER_ID: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
  FIREBASE_APP_ID: import.meta.env.VITE_FIREBASE_APP_ID || '',
  FIREBASE_VAPID_KEY: import.meta.env.VITE_FIREBASE_VAPID_KEY || '',

  // Google Integration
  GOOGLE_CLIENT_ID: import.meta.env.VITE_GOOGLE_CLIENT_ID || '',

  // Admin Privileges
  ADMIN_EMAIL: import.meta.env.VITE_ADMIN_EMAIL || '',
  ADMIN_UID: import.meta.env.VITE_ADMIN_UID || '',
};
