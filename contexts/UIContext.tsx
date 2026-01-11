import React, { createContext, useState, useCallback } from 'react';
import { View, ModalState, ModalType } from '../types';

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
    const getInitialView = (): View => {
        const path = window.location.pathname.substring(1);
        const validViews: string[] = ['stock', 'expenses', 'vat', 'sales', 'dashboard'];
        if (validViews.includes(path)) {
            return path as View;
        }
        return 'dashboard';
    };

    const [view, setView] = useState<View>(getInitialView);
    const [modal, setModal] = useState<ModalState>(null);
    const [isAssistantOpen, setIsAssistantOpen] = useState(false);
    const [canvasUploadTriggerFn, setCanvasUploadTriggerFn] = useState<(() => void) | null>(null);

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
