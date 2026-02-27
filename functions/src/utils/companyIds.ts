/**
 * Utility to get company IDs without downloading all company data.
 * Uses Firebase REST API with shallow=true to only retrieve keys.
 * This avoids downloading the entire /companies tree (1.1MB+) on every function invocation.
 */

import * as admin from 'firebase-admin';

export const getCompanyIds = async (): Promise<string[]> => {
    const dbUrl = admin.app().options.databaseURL;
    if (!dbUrl) return [];

    const credential = admin.app().options.credential;
    if (!credential) return [];

    try {
        const token = await credential.getAccessToken();
        const url = `${dbUrl}/companies.json?shallow=true`;

        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token.access_token}` }
        });

        if (!response.ok) {
            console.error(`Shallow read failed: ${response.status}`);
            return [];
        }

        const data = await response.json();
        return data ? Object.keys(data) : [];
    } catch (error) {
        console.error('Failed to get company IDs:', error);
        return [];
    }
};
