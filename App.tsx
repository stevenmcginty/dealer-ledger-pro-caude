
import React, { useState, useEffect } from 'react';
import { onAuthStateChanged, type User } from './services/firebase';
import LoginPage from './components/auth/LoginPage';
import LandingPage from './pages/LandingPage';
import LedgerCore from './LedgerCore';
import Spinner from './components/common/Spinner';
import { DataProvider } from './contexts/DataContext';
import { UIProvider } from './contexts/UIContext';

type LandingPageType = 'home' | 'pricing' | 'demo' | 'contact';
type Route = 'landing' | 'login' | 'app';

const getInitialRoute = (): Route => {
    const path = window.location.pathname;
    if (path === '/app' || path.startsWith('/app/')) return 'app';
    if (path === '/login') return 'login';
    return 'landing';
};

const App = () => {
    const [user, setUser] = useState<User | null>(null);
    const [authLoading, setAuthLoading] = useState(true);
    const [route, setRoute] = useState<Route>(getInitialRoute);
    const [landingPage, setLandingPage] = useState<LandingPageType>('home');

    // Handle browser back/forward
    useEffect(() => {
        const handlePopState = () => {
            setRoute(getInitialRoute());
        };
        window.addEventListener('popstate', handlePopState);
        return () => window.removeEventListener('popstate', handlePopState);
    }, []);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(user => {
            setUser(user);
            setAuthLoading(false);
        });
        return () => unsubscribe();
    }, []);

    const navigate = (newRoute: Route) => {
        const path = newRoute === 'landing' ? '/' : newRoute === 'login' ? '/login' : '/app';
        window.history.pushState({}, '', path);
        setRoute(newRoute);
    };

    const handleLogin = () => {
        navigate('login');
    };

    const handleBackToLanding = () => {
        navigate('landing');
    };

    // Auto-redirect logged-in users to app (especially useful on mobile)
    useEffect(() => {
        if (!authLoading && user && route === 'landing') {
            navigate('app');
        }
    }, [authLoading, user, route]);

    if (authLoading) {
        return <div className="bg-gray-950 flex items-center justify-center h-screen"><Spinner className="h-10 w-10 text-white" /></div>;
    }

    // Landing page - only for non-logged-in users
    if (route === 'landing') {
        // If logged in, redirect to app
        if (user) {
            navigate('app');
            return null;
        }
        return (
            <LandingPage
                onLogin={handleLogin}
                onNavigate={setLandingPage}
                currentPage={landingPage}
            />
        );
    }

    // Login page
    if (route === 'login') {
        // If already logged in, redirect to app
        if (user) {
            navigate('app');
            return null;
        }
        return (
            <div className="relative">
                <button
                    onClick={handleBackToLanding}
                    className="absolute top-4 left-4 z-50 px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
                >
                    &larr; Back to Home
                </button>
                <LoginPage />
            </div>
        );
    }

    // App route - requires authentication
    if (route === 'app') {
        if (!user) {
            // Not logged in, show login
            return (
                <div className="relative">
                    <button
                        onClick={handleBackToLanding}
                        className="absolute top-4 left-4 z-50 px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
                    >
                        &larr; Back to Home
                    </button>
                    <LoginPage />
                </div>
            );
        }

        return (
            <DataProvider user={user}>
                <UIProvider>
                    <LedgerCore />
                </UIProvider>
            </DataProvider>
        );
    }

    return null;
}

export default App;
