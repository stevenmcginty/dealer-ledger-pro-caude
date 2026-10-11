import React, { useState } from 'react';
import { auth } from '../../services/firebase';
import * as dataService from '../../services/dataService';
import { CONFIG } from '../../config';
import { Alert, Button, Input } from '../ui';
import SessionInfoCard from './SessionInfoCard';
import FirebaseHealthCheckCard from './FirebaseHealthCheckCard';
import { Panel, PanelSection } from './SettingsKit';

const AdminProvisioning = () => {
    const [newUserUid, setNewUserUid] = useState('');
    const [newUserEmail, setNewUserEmail] = useState('');
    const [status, setStatus] = useState<'idle' | 'running' | 'success' | 'error'>('idle');
    const [message, setMessage] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const adminUser = auth.currentUser;
        if (!adminUser || !newUserUid.trim() || !newUserEmail.trim()) {
            setStatus('error');
            setMessage('Admin user not found or fields are empty.');
            return;
        }

        setStatus('running');
        setMessage('Provisioning new account...');

        try {
            await dataService.provisionAccountForNewUser(adminUser, newUserUid.trim(), newUserEmail.trim());
            setStatus('success');
            setMessage(`Created a new business account for ${newUserEmail}.`);
            setNewUserUid('');
            setNewUserEmail('');
        } catch (error: any) {
            console.error("Provisioning failed:", error);
            setStatus('error');
            setMessage(`Couldn't create the account: ${error.message}`);
        } finally {
            setTimeout(() => setStatus('idle'), 5000);
        }
    };

    return (
        <Panel ariaLabel="Admin">
            <PanelSection
                title="Admin: add a business"
                description="Create a separate business account for a user you have already made in Firebase Authentication."
            >
                <form onSubmit={handleSubmit} className="space-y-4">
                    <Input
                        id="newUserUid"
                        label="New user's UID"
                        value={newUserUid}
                        onChange={e => setNewUserUid(e.target.value)}
                        placeholder="Paste the UID from the Firebase console"
                        required
                        className="font-mono"
                    />
                    <Input
                        id="newUserEmail"
                        type="email"
                        label="New user's email"
                        value={newUserEmail}
                        onChange={e => setNewUserEmail(e.target.value)}
                        placeholder="user@example.com"
                        required
                    />
                    <div className="flex justify-end">
                        <Button type="submit" loading={status === 'running'} className="w-full sm:w-auto">Add business</Button>
                    </div>
                </form>
                {status !== 'idle' && status !== 'running' && (
                    <Alert tone={status === 'success' ? 'success' : 'danger'} className="mt-4">{message}</Alert>
                )}
            </PanelSection>
        </Panel>
    );
};

/** Settings > Diagnostics: who you are signed in as, a storage check, and admin tools. */
const DiagnosticsPage = () => {
    const isAdmin = auth.currentUser?.email === CONFIG.ADMIN_EMAIL;
    return (
        <div className="space-y-6">
            <SessionInfoCard />
            <FirebaseHealthCheckCard />
            {isAdmin && <AdminProvisioning />}
        </div>
    );
};

export default DiagnosticsPage;
