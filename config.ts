// Configuration loaded from environment variables
// Create a .env.local file with your actual keys (see .env.example)

export const CONFIG = {
  // Firebase Configuration
  FIREBASE_API_KEY: import.meta.env.VITE_FIREBASE_API_KEY || '',

  // Google Integration
  GOOGLE_CLIENT_ID: import.meta.env.VITE_GOOGLE_CLIENT_ID || '',

  // Admin Privileges
  ADMIN_EMAIL: import.meta.env.VITE_ADMIN_EMAIL || '',
  ADMIN_UID: import.meta.env.VITE_ADMIN_UID || '',
};
