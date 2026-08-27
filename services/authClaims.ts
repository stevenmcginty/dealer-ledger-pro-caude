/**
 * Make sure the signed-in user's ID token carries the `companyId` claim that
 * storage.rules checks (see functions/src/auth/claims.ts). Users who signed up
 * before the claim existed get it set on first sign-in here, then the token is
 * refreshed so the very next upload is allowed.
 */

import firebase from 'firebase/compat/app';
import { getFunctions, httpsCallable } from 'firebase/functions';
import type { User } from './firebase';

export const ensureCompanyClaim = async (user: User): Promise<void> => {
    try {
        const result = await user.getIdTokenResult();
        if (result.claims?.companyId) return;
        const refresh = httpsCallable(getFunctions(firebase.app()), 'refreshAuthClaims', { timeout: 20000 });
        const { data } = await refresh({});
        if ((data as { companyId?: string | null })?.companyId) await user.getIdToken(true);
    } catch (error) {
        // Not fatal: the app still works, uploads just fail until the next token refresh.
        console.warn('[authClaims] could not refresh company claim', error);
    }
};
