
import { User } from '../services/firebase';

export interface DemoData {
    user: User;
    // Add other contexts as needed
}

// Mock User
const mockUser: User = {
    uid: 'demo-user-123',
    email: 'demo@dealerledger.pro',
    displayName: 'Demo Dealer',
    emailVerified: true,
    isAnonymous: false,
    metadata: {
        creationTime: new Date().toISOString(),
        lastSignInTime: new Date().toISOString(),
    },
    providerData: [],
    refreshToken: '',
    tenantId: null,
    delete: async () => {},
    getIdToken: async () => 'mock-token',
    getIdTokenResult: async () => ({
        authTime: new Date().toISOString(),
        expirationTime: new Date().toISOString(),
        issuedAtTime: new Date().toISOString(),
        signInProvider: 'google',
        signInSecondFactor: null,
        token: 'mock-token',
        claims: {}
    }),
    reload: async () => {},
    toJSON: () => ({}),
    phoneNumber: null,
    photoURL: null,
};

// We will inject data into localStorage for the app to pick up
// Since the app uses Firebase, normally we'd need to mock the firebase calls.
// However, looking at the code, `LedgerCore` loads data.
// If the app relies heavily on real Firebase, we might need to mock the DataContext.

export const setupDemoData = () => {
    // We can't easily mock Firebase guts here without a complex mock provider.
    // However, if we want "Screenshots", we might need to rely on the UI rendering
    // blank states OR we mock the DataContext provider in App.tsx.
    console.log("Setting up demo data...");
};

export const getMockUser = () => mockUser;
