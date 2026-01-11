"use strict";
/**
 * Gmail OAuth Token Management
 * Handles code exchange and token refresh securely on the server side
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.getValidAccessToken = exports.refreshGmailToken = exports.exchangeGmailCode = void 0;
const functions = __importStar(require("firebase-functions"));
// Get secrets from environment
const getClientCredentials = () => {
    const clientId = process.env.GMAIL_CLIENT_ID || functions.config().gmail?.client_id;
    const clientSecret = process.env.GMAIL_CLIENT_SECRET || functions.config().gmail?.client_secret;
    if (!clientId || !clientSecret) {
        throw new Error('Gmail OAuth credentials not configured');
    }
    return { clientId, clientSecret };
};
/**
 * Exchange authorization code for access/refresh tokens
 * Called from client after user completes OAuth flow
 */
exports.exchangeGmailCode = functions.https.onCall(async (data, context) => {
    // Verify authenticated
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }
    const { code, redirectUri } = data;
    if (!code || !redirectUri) {
        throw new functions.https.HttpsError('invalid-argument', 'Missing code or redirectUri');
    }
    try {
        const { google } = await Promise.resolve().then(() => __importStar(require('googleapis')));
        const { clientId, clientSecret } = getClientCredentials();
        const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
        const { tokens } = await oauth2Client.getToken(code);
        if (!tokens.access_token) {
            throw new Error('No access token received');
        }
        // Get user's email address
        oauth2Client.setCredentials(tokens);
        const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
        const userInfo = await oauth2.userinfo.get();
        return {
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token,
            expiresIn: tokens.expiry_date ? Math.floor((tokens.expiry_date - Date.now()) / 1000) : 3600,
            expiryDate: tokens.expiry_date,
            email: userInfo.data.email
        };
    }
    catch (error) {
        console.error('Error exchanging Gmail code:', error);
        throw new functions.https.HttpsError('internal', error.message || 'Failed to exchange code');
    }
});
/**
 * Refresh access token using refresh token
 * Called when access token expires
 */
exports.refreshGmailToken = functions.https.onCall(async (data, context) => {
    // Verify authenticated
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }
    const { refreshToken } = data;
    if (!refreshToken) {
        throw new functions.https.HttpsError('invalid-argument', 'Missing refresh token');
    }
    try {
        const { google } = await Promise.resolve().then(() => __importStar(require('googleapis')));
        const { clientId, clientSecret } = getClientCredentials();
        const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
        oauth2Client.setCredentials({ refresh_token: refreshToken });
        const { credentials } = await oauth2Client.refreshAccessToken();
        if (!credentials.access_token) {
            throw new Error('Failed to refresh access token');
        }
        return {
            accessToken: credentials.access_token,
            expiresIn: credentials.expiry_date ? Math.floor((credentials.expiry_date - Date.now()) / 1000) : 3600,
            expiryDate: credentials.expiry_date
        };
    }
    catch (error) {
        console.error('Error refreshing Gmail token:', error);
        throw new functions.https.HttpsError('internal', error.message || 'Failed to refresh token');
    }
});
/**
 * Internal function to get valid access token for a company
 * Refreshes if expired
 */
const getValidAccessToken = async (companyId, db) => {
    try {
        const settingsRef = db.ref(`companies/${companyId}/crmSettings`);
        const snapshot = await settingsRef.once('value');
        const settings = snapshot.val();
        if (!settings?.gmailConnected || !settings?.gmailAccessToken) {
            return null;
        }
        // Check if token is expired (with 5 min buffer)
        const now = Date.now();
        const expiry = settings.gmailTokenExpiry || 0;
        const buffer = 5 * 60 * 1000;
        if (now >= expiry - buffer) {
            // Token expired, try to refresh
            if (!settings.gmailRefreshToken) {
                console.log(`Company ${companyId}: No refresh token available`);
                return null;
            }
            try {
                const { google } = await Promise.resolve().then(() => __importStar(require('googleapis')));
                const { clientId, clientSecret } = getClientCredentials();
                const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
                oauth2Client.setCredentials({ refresh_token: settings.gmailRefreshToken });
                const { credentials } = await oauth2Client.refreshAccessToken();
                if (credentials.access_token) {
                    // Update stored tokens
                    await settingsRef.update({
                        gmailAccessToken: credentials.access_token,
                        gmailTokenExpiry: credentials.expiry_date || (Date.now() + 3600 * 1000),
                        updatedAt: Date.now()
                    });
                    return credentials.access_token;
                }
            }
            catch (refreshError) {
                console.error(`Company ${companyId}: Failed to refresh token`, refreshError);
                // Mark Gmail as disconnected
                await settingsRef.update({
                    gmailConnected: false,
                    updatedAt: Date.now()
                });
                return null;
            }
        }
        return settings.gmailAccessToken;
    }
    catch (error) {
        console.error(`Error getting access token for company ${companyId}:`, error);
        return null;
    }
};
exports.getValidAccessToken = getValidAccessToken;
//# sourceMappingURL=oauth.js.map