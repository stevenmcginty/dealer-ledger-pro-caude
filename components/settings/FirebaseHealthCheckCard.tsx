import React, { useState } from 'react';
import { useData } from '../../hooks/useData';
import { storage } from '../../services/firebase';
import Spinner from '../common/Spinner';
import { CheckCircleIcon, ExclamationTriangleIcon } from '../icons';

type HealthCheckStatus = {
    status: 'idle' | 'running' | 'success' | 'error';
    message: string;
    step?: 'write' | 'read' | 'cleanup' | '';
};

const FirebaseHealthCheckCard = () => {
    const { companyId, userId } = useData();
    const [checkStatus, setCheckStatus] = useState<HealthCheckStatus>({ status: 'idle', message: 'Not yet run.' });

    const handleRunCheck = async () => {
        if (!companyId || !userId) {
            setCheckStatus({ status: 'error', message: 'Could not get user or company ID.' });
            return;
        }

        let currentStep: HealthCheckStatus['step'] = 'write';
        setCheckStatus({ status: 'running', message: 'Starting health check...', step: '' });
        const testPath = `${companyId}/${userId}/health_check/test.txt`;
        const testRef = storage.ref(testPath);
        const testBlob = new Blob(['health-check'], { type: 'text/plain' });

        try {
            // 1. Write Test
            currentStep = 'write';
            setCheckStatus({ status: 'running', message: 'Testing write permissions...', step: currentStep });
            await testRef.put(testBlob);

            // 2. Read Test
            currentStep = 'read';
            setCheckStatus({ status: 'running', message: 'Testing read permissions...', step: currentStep });
            await testRef.getDownloadURL();

            // 3. Cleanup
            currentStep = 'cleanup';
            setCheckStatus({ status: 'running', message: 'Cleaning up test file...', step: currentStep });
            await testRef.delete();

            setCheckStatus({ status: 'success', message: 'Success! Your Firebase security rules are configured correctly.' });

        } catch (error: any) {
            console.error("Firebase Health Check Failed:", error);
            let userMessage = `An unexpected error occurred: ${error.message}`;
            if (error.code === 'storage/unauthorized') {
                if (currentStep === 'write') {
                    userMessage = "Write permission denied. Your rules are not allowing the app to upload files. Please ensure the 'allow write' line in your Storage Rules is correct.";
                } else if (currentStep === 'read') {
                     userMessage = "Read permission denied. The app could write a file but not read it back. Please check the 'allow read' line in your Storage Rules.";
                }
            }
            setCheckStatus({ status: 'error', message: userMessage, step: currentStep });
        }
    };
    
    const isWorking = checkStatus.status === 'running';

    return (
        <div className="bg-gray-800 p-6 rounded-lg shadow-lg">
            <h2 className="text-lg font-semibold text-white">Firebase Storage Health Check</h2>
            <p className="text-sm text-gray-400 mt-1">This tool tests if your storage security rules are configured correctly by attempting a test upload.</p>
            <div className="mt-4">
                <button 
                    onClick={handleRunCheck}
                    disabled={isWorking}
                    className="w-full inline-flex items-center justify-center gap-x-2 rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-500 disabled:opacity-50"
                >
                    {isWorking ? <Spinner className="h-5 w-5" /> : 'Run Health Check'}
                </button>
            </div>
            {checkStatus.status !== 'idle' && (
                <div className={`mt-4 p-3 rounded-lg flex items-center gap-3 ${
                    checkStatus.status === 'success' ? 'bg-green-900/50' :
                    checkStatus.status === 'error' ? 'bg-red-900/50' :
                    'bg-gray-700/50'
                }`}>
                    <div className="flex-shrink-0">
                        {checkStatus.status === 'running' && <Spinner className="h-5 w-5 text-brand-400" />}
                        {checkStatus.status === 'success' && <CheckCircleIcon className="h-5 w-5 text-green-400" />}
                        {checkStatus.status === 'error' && <ExclamationTriangleIcon className="h-5 w-5 text-red-400" />}
                    </div>
                    <p className="text-sm text-gray-300">{checkStatus.message}</p>
                </div>
            )}
        </div>
    );
};

export default FirebaseHealthCheckCard;
