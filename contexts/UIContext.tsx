import React, { createContext, useState, useCallback, useEffect, useRef } from 'react';
import { View, ModalState, ModalType, APP_VIEWS } from '../types';

interface UIContextState {
    view: View;
    modal: ModalState;
    isAssistantOpen: boolean;
    setView: (view: View) => void;
    openModal: (type: ModalType, data?: any) => void;
    closeModal: () => void;
    toggleAssistant: () => void;
    triggerCanvasUpload: () => void;
    setCanvasUploadTrigger: (fn: (() => void) | null) => void;
}

export const UIContext = createContext<UIContextState | undefined>(undefined);

// FIX: Explicitly type UIProvider as a React Functional Component to ensure props (including children) are correctly typed.
interface UIProviderProps {
    children: React.ReactNode;
}

export const UIProvider: React.FC<UIProviderProps> = ({ children }) => {
    // Deep links look like /app/<view>; bare /app (or anything else) lands on the dashboard.
    const getViewFromPath = (): View => {
        const match = window.location.pathname.match(/^\/app\/([^/]+)/);
        const segment = match?.[1];
        if (segment && (APP_VIEWS as string[]).includes(segment)) {
            return segment as View;
        }
        return 'dashboard';
    };

    const [view, setCurrentView] = useState<View>(getViewFromPath);
    const [modal, setModal] = useState<ModalState>(null);
    const [isAssistantOpen, setIsAssistantOpen] = useState(false);
    const [canvasUploadTriggerFn, setCanvasUploadTriggerFn] = useState<(() => void) | null>(null);

    // Tracks the current view without re-creating setView, so the same-view guard
    // and the popstate handler stay in sync with the state.
    const viewRef = useRef<View>(view);
    const applyView = useCallback((nextView: View) => {
        viewRef.current = nextView;
        setCurrentView(nextView);
    }, []);

    // Keep the view in step with Back/Forward. App.tsx owns the coarse route
    // (landing/login/app); this handles view changes within /app/* — pushing a
    // new entry here would loop the history stack, so we only sync state.
    useEffect(() => {
        const handlePopState = () => {
            if (window.location.pathname.startsWith('/app')) {
                applyView(getViewFromPath());
            }
        };
        window.addEventListener('popstate', handlePopState);
        return () => window.removeEventListener('popstate', handlePopState);
    }, [applyView]);

    const setView = useCallback((nextView: View) => {
        // No history entry when the view isn't actually changing (active nav item,
        // or re-setting the view the URL already shows).
        if (viewRef.current === nextView) return;
        // Preserve any query string (e.g. dev ?mode=screenshot) across the push.
        window.history.pushState({}, '', `/app/${nextView}${window.location.search}`);
        applyView(nextView);
    }, [applyView]);

    const openModal = useCallback((type: ModalType, data?: any) => {
        setModal({ type, data });
    }, []);

    const closeModal = useCallback(() => {
        setModal(null);
    }, []);

    const toggleAssistant = useCallback(() => {
        setIsAssistantOpen(prev => !prev);
    }, []);

    const triggerCanvasUpload = useCallback(() => {
        if (canvasUploadTriggerFn) {
            canvasUploadTriggerFn();
        }
    }, [canvasUploadTriggerFn]);

    const setCanvasUploadTrigger = useCallback((fn: (() => void) | null) => {
        setCanvasUploadTriggerFn(() => fn);
    }, []);

    const value: UIContextState = {
        view,
        modal,
        isAssistantOpen,
        setView,
        openModal,
        closeModal,
        toggleAssistant,
        triggerCanvasUpload,
        setCanvasUploadTrigger,
    };

    return (
        <UIContext.Provider value={value}>
            {children}
        </UIContext.Provider>
    );
};
