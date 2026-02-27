
import React, { useState, useEffect, useRef, useCallback, lazy, Suspense } from 'react';
import { onAuthStateChanged, signOut, type User } from './services/firebase';
import LoginPage from './components/auth/LoginPage';
import LandingPage from './pages/LandingPage';
import LedgerCore from './LedgerCore';
import Spinner from './components/common/Spinner';
import { DataProvider } from './contexts/DataContext';
import { UIProvider } from './contexts/UIContext';

const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

// Lazy load demo video page
const DemoVideoPage = lazy(() => import('./pages/DemoVideoPage'));

type LandingPageType = 'home' | 'pricing' | 'demo' | 'contact';
type Route = 'landing' | 'login' | 'app' | 'demo-video';

const getInitialRoute = (): Route => {
    const path = window.location.pathname;
    const searchParams = new URLSearchParams(window.location.search);
    if (searchParams.get('mode') === 'screenshot') return 'app';

    if (path === '/demo-video') return 'demo-video';
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

    // Auto-logout after 30 minutes of inactivity
    const inactivityTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const resetInactivityTimer = useCallback(() => {
        if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
        if (!user) return;
        inactivityTimer.current = setTimeout(() => {
            console.log('[App] Logging out due to 30 minutes of inactivity');
            signOut();
        }, INACTIVITY_TIMEOUT_MS);
    }, [user]);

    useEffect(() => {
        if (!user) return;

        const events = ['mousedown', 'keydown', 'touchstart', 'scroll', 'mousemove'];
        const handler = () => resetInactivityTimer();

        events.forEach(e => window.addEventListener(e, handler, { passive: true }));
        resetInactivityTimer(); // start the timer

        return () => {
            events.forEach(e => window.removeEventListener(e, handler));
            if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
        };
    }, [user, resetInactivityTimer]);

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

    // Demo video page - no auth required
    if (route === 'demo-video') {
        return (
            <Suspense fallback={<div className="bg-gray-950 flex items-center justify-center h-screen"><Spinner className="h-10 w-10 text-white" /></div>}>
                <DemoVideoPage />
            </Suspense>
        );
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

    // App route - requires authentication (or screenshot mode)
    if (route === 'app') {
        const isScreenshotMode = new URLSearchParams(window.location.search).get('mode') === 'screenshot';

        if (!user && !isScreenshotMode) {
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

        // In screenshot mode, use a mock user if not logged in
        const appUser = user || (isScreenshotMode ? { uid: 'demo', email: 'demo@example.com' } as any : null);

        if (!appUser) return null;

        return (
            <DataProvider user={appUser}>
                <UIProvider>
                    <LedgerCore />
                </UIProvider>
            </DataProvider>
        );
    }

    return null;
}

export default App;
