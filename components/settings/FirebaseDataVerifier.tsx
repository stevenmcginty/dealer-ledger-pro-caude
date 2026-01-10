import React, { useState } from 'react';
import firebase from 'firebase/compat/app';
import 'firebase/compat/database';
import { db, auth } from '../../services/firebase';
import { linkNewUser } from '../../services/dataService';
import { useData } from '../../hooks/useData';
import Spinner from '../common/Spinner';
import { CheckCircleIcon, ExclamationTriangleIcon } from '../icons';

type VerificationStatus = 'idle' | 'running' | 'complete';
interface VerificationResult {
    userPathFound: boolean;
    userCompanyIdValue: string | null;
    companyUserPathFound: boolean;
    diagnosis: string;
}

interface FirebaseDataVerifierProps {
    onFixSuccess?: () => void;
}


const FirebaseDataVerifier = ({ onFixSuccess }: FirebaseDataVerifierProps) => {
    const { userId } = useData();
    const [status, setStatus] = useState<VerificationStatus>('idle');
    const [results, setResults] = useState<VerificationResult | null>(null);
    const [fixStatus, setFixStatus] = useState<'idle' | 'running' | 'success' | 'error'>('idle');
    const [fixMessage, setFixMessage] = useState('');

    const handleVerify = async () => {
        if (!userId) {
             setResults({ userPathFound: false, userCompanyIdValue: null, companyUserPathFound: false, diagnosis: "Could not determine current User ID. Please sign out and sign in again." });
             setStatus('complete');
             return;
        }
        setStatus('running');
        setResults(null);
        setFixStatus('idle');
        setFixMessage('');

        try {
            const userRef = db.ref(`users/${userId}`);
            const userSnap = await userRef.get();
    
            const userPathFound = userSnap.exists() && !!userSnap.val().companyId;
            const userCompanyIdValue = userPathFound ? userSnap.val().companyId : null;
            
            let companyUserPathFound = false;
            if (userCompanyIdValue) {
                const companyUserRef = db.ref(`companies/${userCompanyIdValue}/users/${userId}`);
                const companyUserSnap = await companyUserRef.get();
                companyUserPathFound = companyUserSnap.exists();
            }
    
            let diagnosis = '';
            if (userPathFound && companyUserPathFound) {
                diagnosis = "All data links appear to be correct. If you are still seeing this screen, the issue may be with your Firebase Security Rules not being published correctly.";
            } else if (!userPathFound) {
                diagnosis = "Your user record is missing its `companyId`. This is expected for new accounts created from the Firebase console. Use the 'Attempt to Fix' button to create a new company and link your account.";
            } else { // userPathFound is true, but companyUserPathFound is false
                diagnosis = "Your user ID is not listed under your company's list of users. This is preventing security rules from granting access. Use the 'Attempt to Fix' button below to repair the link.";
            }
            
            setResults({ userPathFound, userCompanyIdValue, companyUserPathFound, diagnosis });

        } catch (error: any) {
            console.error("Verification failed unexpectedly:", error);
            setResults({ userPathFound: false, userCompanyIdValue: null, companyUserPathFound: false, diagnosis: `A network or unexpected error occurred: ${error.message}` });
        } finally {
            setStatus('complete');
        }
    };

    const handleFixData = async () => {
        const user = auth.currentUser;
        if (!user) {
            setFixStatus('error');
            setFixMessage('Could not get current user to perform fix.');
            return;
        }
        setFixStatus('running');
        setFixMessage('Attempting to provision or repair account link...');
    
        try {
            await linkNewUser();
            
            setFixStatus('success');
            setFixMessage('Data link verified/repaired successfully! Reloading...');
            setTimeout(() => {
                if (onFixSuccess) {
                    onFixSuccess();
                } else {
                    window.location.reload();
                }
            }, 1500);
        } catch (error: any) {
            console.error("Failed to fix data inconsistency:", error);
            setFixStatus('error');
            setFixMessage(`Failed to fix data: ${error.message}`);
        }
    };
    
    const ResultRow = ({ label, path, found }: { label: string; path: string; found: boolean }) => (
        <li className="flex items-center justify-between p-3 bg-gray-900/50 rounded-md">
            <div>
                <p className="font-semibold text-white">{label}</p>
                <p className="text-xs text-gray-500 font-mono">{path}</p>
            </div>
            <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold ${found ? 'bg-green-800 text-green-200' : 'bg-red-800 text-red-200'}`}>
                {found ? 'FOUND' : 'NOT FOUND'}
            </span>
        </li>
    );
    
    const needsFix = results && (!results.userPathFound || !results.companyUserPathFound);
    const canAttemptFix = needsFix;

    return (
        <div className="bg-gray-800 p-6 rounded-lg shadow-lg">
            <h2 className="text-lg font-semibold text-white">Firebase Data Verifier</h2>
            <p className="text-sm text-gray-400 mt-1">This tool checks the Realtime Database records your security rules depend on to diagnose permission errors.</p>
            <div className="mt-4">
                <button onClick={handleVerify} disabled={status === 'running'} className="w-full inline-flex items-center justify-center gap-x-2 rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-500 disabled:opacity-50">
                    {status === 'running' ? <Spinner className="h-5 w-5" /> : 'Run Verification'}
                </button>
            </div>
            {results && status === 'complete' && (
                <div className="mt-4 space-y-4">
                    <ul className="space-y-2">
                        <ResultRow label="User-to-Company Link" path={`/users/${userId}/companyId`} found={results.userPathFound} />
                        <ResultRow label="Company-to-User Link" path={`/companies/{companyId}/users/${userId}`} found={results.companyUserPathFound} />
                    </ul>
                    <div className={`p-3 rounded-lg ${!needsFix ? 'bg-green-900/50' : 'bg-yellow-900/50'}`}>
                        <p className="font-bold text-white">Diagnosis</p>
                        <p className="text-sm text-gray-300 mt-1">{results.diagnosis}</p>
                        {needsFix && (
                            <div className="mt-4">
                                <button onClick={handleFixData} disabled={!canAttemptFix || fixStatus === 'running'} className="w-full inline-flex items-center justify-center gap-x-2 rounded-md bg-orange-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-orange-500 disabled:opacity-50 disabled:cursor-not-allowed">
                                    {fixStatus === 'running' ? <Spinner className="h-5 w-5" /> : 'Attempt to Fix Data'}
                                </button>
                                {fixStatus === 'success' && <p className="text-green-400 text-sm mt-2 text-center">{fixMessage}</p>}
                                {fixStatus === 'error' && <p className="text-red-400 text-sm mt-2 text-center">{fixMessage}</p>}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default FirebaseDataVerifier;