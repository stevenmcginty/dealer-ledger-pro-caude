
import React, { useState, useEffect } from 'react';
import { onAuthStateChanged, type User } from './services/firebase';
import LoginPage from './components/auth/LoginPage';
import LedgerCore from './LedgerCore';
import Spinner from './components/common/Spinner';
import { DataProvider } from './contexts/DataContext';
import { UIProvider } from './contexts/UIContext';

const App = () => {
    const [user, setUser] = useState<User | null>(null);
    const [authLoading, setAuthLoading] = useState(true);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(user => {
            setUser(user);
            setAuthLoading(false);
        });
        return () => unsubscribe();
    }, []);

    if (authLoading) {
        return <div className="bg-gray-950 flex items-center justify-center h-screen"><Spinner className="h-10 w-10 text-white" /></div>;
    }

    if (!user) {
        return <LoginPage />;
    }
    
    // If we have a user, DataProvider will handle the rest, including checking for/provisioning
    // the company, and managing all loading and error states internally.
    return (
        <DataProvider user={user}>
            <UIProvider>
                <LedgerCore />
            </UIProvider>
        </DataProvider>
    );
}

export default App;
