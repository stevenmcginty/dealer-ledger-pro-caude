import React, { useState } from 'react';
import { useData } from '../../hooks/useData';
import { storage } from '../../services/firebase';
import Spinner from '../common/Spinner';
import { Alert, Button } from '../ui';
import { Panel, PanelSection } from './SettingsKit';

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
        setCheckStatus({ status: 'running', message: 'Starting the check…', step: '' });
        const testPath = `${companyId}/${userId}/health_check/test.txt`;
        const testRef = storage.ref(testPath);
        const testBlob = new Blob(['health-check'], { type: 'text/plain' });

        try {
            // 1. Write Test
            currentStep = 'write';
            setCheckStatus({ status: 'running', message: 'Testing upload…', step: currentStep });
            await testRef.put(testBlob);

            // 2. Read Test
            currentStep = 'read';
            setCheckStatus({ status: 'running', message: 'Testing download…', step: currentStep });
            await testRef.getDownloadURL();

            // 3. Cleanup
            currentStep = 'cleanup';
            setCheckStatus({ status: 'running', message: 'Removing the test file…', step: currentStep });
            await testRef.delete();

            setCheckStatus({ status: 'success', message: 'Storage rules are set up correctly. Uploads and downloads both work.' });

        } catch (error: any) {
            console.error("Firebase Health Check Failed:", error);
            let userMessage = `Something went wrong: ${error.message}`;
            if (error.code === 'storage/unauthorized') {
                if (currentStep === 'write') {
                    userMessage = "Upload was refused. The Storage rules aren't letting the app save files; check the 'allow write' line.";
                } else if (currentStep === 'read') {
                     userMessage = "Download was refused. The app could save a file but not read it back; check the 'allow read' line in the Storage rules.";
                }
            }
            setCheckStatus({ status: 'error', message: userMessage, step: currentStep });
        }
    };

    const isWorking = checkStatus.status === 'running';

    return (
        <Panel ariaLabel="Storage check">
            <PanelSection
                title="Storage check"
                description="Uploads a small test file, reads it back and deletes it, to prove the storage rules work."
                action={<Button variant="secondary" onClick={handleRunCheck} loading={isWorking}>Run check</Button>}
            >
                {checkStatus.status === 'running' && (
                    <p className="flex items-center gap-2 text-sm text-ink-2" role="status">
                        <Spinner className="h-4 w-4" /> {checkStatus.message}
                    </p>
                )}
                {checkStatus.status === 'success' && <Alert tone="success">{checkStatus.message}</Alert>}
                {checkStatus.status === 'error' && <Alert tone="danger">{checkStatus.message}</Alert>}
            </PanelSection>
        </Panel>
    );
};

export default FirebaseHealthCheckCard;
