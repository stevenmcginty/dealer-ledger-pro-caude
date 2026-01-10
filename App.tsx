
import React, { useState, useEffect } from 'react';
import { onAuthStateChanged, type User } from './services/firebase';
import LoginPage from './components/auth/LoginPage';
import LandingPage from './pages/LandingPage';
import LedgerCore from './LedgerCore';
import Spinner from './components/common/Spinner';
import { DataProvider } from './contexts/DataContext';
import { UIProvider } from './contexts/UIContext';

type LandingPageType = 'home' | 'pricing' | 'demo' | 'contact';

const App = () => {
    const [user, setUser] = useState<User | null>(null);
    const [authLoading, setAuthLoading] = useState(true);
    const [showLogin, setShowLogin] = useState(false);
    const [landingPage, setLandingPage] = useState<LandingPageType>('home');

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(user => {
            setUser(user);
            setAuthLoading(false);
            if (user) {
                setShowLogin(false);
            }
        });
        return () => unsubscribe();
    }, []);

    if (authLoading) {
        return <div className="bg-gray-950 flex items-center justify-center h-screen"><Spinner className="h-10 w-10 text-white" /></div>;
    }

    // Show login page when user clicks login from landing
    if (!user && showLogin) {
        return (
            <div className="relative">
                <button
                    onClick={() => setShowLogin(false)}
                    className="absolute top-4 left-4 z-50 px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
                >
                    &larr; Back to Home
                </button>
                <LoginPage />
            </div>
        );
    }

    // Show landing page for non-authenticated users
    if (!user) {
        return (
            <LandingPage
                onLogin={() => setShowLogin(true)}
                onNavigate={setLandingPage}
                currentPage={landingPage}
            />
        );
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
