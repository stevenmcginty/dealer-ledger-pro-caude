import React, { createContext, useState, useCallback, useEffect, useRef } from 'react';
import { View, ModalState, ModalType, APP_VIEWS } from '../types';

interface UIContextState {
    view: View;
    /** The car open on the Car page (/app/stock/<id>), or null on every other screen. */
    vehicleId: string | null;
    modal: ModalState;
    isAssistantOpen: boolean;
    /**
     * True while the Agent Inbox shows one thread on a phone. The shell hides the
     * bottom tab bar then, because the thread's reply bar takes its place. The
     * inbox sets it; leaving the inbox clears it.
     */
    inboxThreadOpen: boolean;
    /**
     * Go to a screen. `query` adds view-scoped URL params (e.g. { tab: 'bank' }
     * opens the Bank section of Expenses); other params such as ?mode= are kept.
     */
    setView: (view: View, query?: Record<string, string>) => void;
    /** Open the Car page for one car. Back returns to where you were (usually the stock list). */
    openVehicle: (id: string) => void;
    setInboxThreadOpen: (open: boolean) => void;
    openModal: (type: ModalType, data?: any) => void;
    closeModal: () => void;
    toggleAssistant: () => void;
}

export const UIContext = createContext<UIContextState | undefined>(undefined);

// FIX: Explicitly type UIProvider as a React Functional Component to ensure props (including children) are correctly typed.
interface UIProviderProps {
    children: React.ReactNode;
}

type Route = { view: View; vehicleId: string | null };

// Deep links look like /app/<view>, plus /app/stock/<id> for the Car page.
// Bare /app (or anything else) lands on the dashboard.
const getRouteFromPath = (): Route => {
    const match = window.location.pathname.match(/^\/app\/([^/]+)(?:\/([^/]+))?/);
    const segment = match?.[1];
    if (segment && (APP_VIEWS as string[]).includes(segment)) {
        const view = segment as View;
        const id = view === 'stock' && match?.[2] ? decodeURIComponent(match[2]) : null;
        return { view, vehicleId: id };
    }
    return { view: 'dashboard', vehicleId: null };
};

// View-scoped URL params belong to the screen being left, so they are dropped on
// navigation. Everything else in the query string (e.g. dev ?mode=screenshot) is kept.
const VIEW_PARAMS = ['tab'];
const searchFor = (query?: Record<string, string>): string => {
    const params = new URLSearchParams(window.location.search);
    VIEW_PARAMS.forEach(key => params.delete(key));
    if (query) Object.entries(query).forEach(([key, value]) => params.set(key, value));
    const search = params.toString();
    return search ? `?${search}` : '';
};

export const UIProvider: React.FC<UIProviderProps> = ({ children }) => {
    const [route, setRoute] = useState<Route>(getRouteFromPath);
    const [modal, setModal] = useState<ModalState>(null);
    const [isAssistantOpen, setIsAssistantOpen] = useState(false);
    const [inboxThreadOpen, setInboxThreadOpenState] = useState(false);

    // Tracks the current route without re-creating setView, so the same-view guard
    // and the popstate handler stay in sync with the state.
    const routeRef = useRef<Route>(route);
    const applyRoute = useCallback((next: Route) => {
        routeRef.current = next;
        setRoute(next);
        if (next.view !== 'agentInbox') setInboxThreadOpenState(false);
    }, []);

    // Keep the view in step with Back/Forward. App.tsx owns the coarse route
    // (landing/login/app); this handles view changes within /app/* — pushing a
    // new entry here would loop the history stack, so we only sync state.
    useEffect(() => {
        const handlePopState = () => {
            if (window.location.pathname.startsWith('/app')) {
                applyRoute(getRouteFromPath());
            }
        };
        window.addEventListener('popstate', handlePopState);
        return () => window.removeEventListener('popstate', handlePopState);
    }, [applyRoute]);

    const setView = useCallback((nextView: View, query?: Record<string, string>) => {
        // No history entry when the view isn't actually changing (active nav item,
        // or re-setting the view the URL already shows). From the Car page,
        // setView('stock') does change something: it goes back to the list.
        const current = routeRef.current;
        if (current.view === nextView && !current.vehicleId && !query) return;
        // Preserve the query string (e.g. dev ?mode=screenshot) across the push.
        // { dlp: true } marks entries the app pushed, so a Back button knows
        // there is an in-app page behind it to return to.
        window.history.pushState({ dlp: true }, '', `/app/${nextView}${searchFor(query)}`);
        applyRoute({ view: nextView, vehicleId: null });
    }, [applyRoute]);

    const openVehicle = useCallback((id: string) => {
        if (!id) return;
        const current = routeRef.current;
        if (current.view === 'stock' && current.vehicleId === id) return;
        window.history.pushState({ dlp: true }, '', `/app/stock/${encodeURIComponent(id)}${searchFor()}`);
        applyRoute({ view: 'stock', vehicleId: id });
    }, [applyRoute]);

    const setInboxThreadOpen = useCallback((open: boolean) => {
        setInboxThreadOpenState(open && routeRef.current.view === 'agentInbox');
    }, []);

    const openModal = useCallback((type: ModalType, data?: any) => {
        setModal({ type, data });
    }, []);

    const closeModal = useCallback(() => {
        setModal(null);
    }, []);

    const toggleAssistant = useCallback(() => {
        setIsAssistantOpen(prev => !prev);
    }, []);

    const value: UIContextState = {
        view: route.view,
        vehicleId: route.vehicleId,
        modal,
        isAssistantOpen,
        inboxThreadOpen,
        setView,
        openVehicle,
        setInboxThreadOpen,
        openModal,
        closeModal,
        toggleAssistant,
    };

    return (
        <UIContext.Provider value={value}>
            {children}
        </UIContext.Provider>
    );
};
