import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { CheckCircleIcon, ExclamationTriangleIcon, InformationCircleIcon, XMarkIcon } from '../icons';

type ToastVariant = 'success' | 'error' | 'info';

interface ToastItem {
    id: number;
    variant: ToastVariant;
    message: string;
}

interface ToastContextState {
    success: (message: string) => void;
    error: (message: string) => void;
    info: (message: string) => void;
}

export const ToastContext = createContext<ToastContextState | undefined>(undefined);

export const useToast = (): ToastContextState => {
    const context = useContext(ToastContext);
    if (context === undefined) {
        throw new Error('useToast must be used within a ToastProvider');
    }
    return context;
};

const DISMISS_AFTER_MS: Record<ToastVariant, number> = {
    success: 4000,
    info: 4000,
    error: 6000,
};

const VARIANT_STYLES: Record<ToastVariant, { icon: React.ComponentType<{ className?: string }>; iconClass: string; borderClass: string; role: string }> = {
    success: { icon: CheckCircleIcon, iconClass: 'text-emerald-400', borderClass: 'border-l-emerald-500', role: 'status' },
    error: { icon: ExclamationTriangleIcon, iconClass: 'text-red-400', borderClass: 'border-l-red-500', role: 'alert' },
    info: { icon: InformationCircleIcon, iconClass: 'text-brand-400', borderClass: 'border-l-brand-500', role: 'status' },
};

const MAX_VISIBLE = 4;

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [toasts, setToasts] = useState<ToastItem[]>([]);
    const nextId = useRef(0);
    const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

    const dismiss = useCallback((id: number) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    }, []);

    const show = useCallback((variant: ToastVariant, message: string) => {
        const id = ++nextId.current;
        // Newest first: the container is a column-reverse stack, so the newest
        // toast renders closest to the bottom edge.
        setToasts(prev => [{ id, variant, message }, ...prev].slice(0, MAX_VISIBLE));
        timers.current.push(setTimeout(() => dismiss(id), DISMISS_AFTER_MS[variant]));
    }, [dismiss]);

    useEffect(() => () => {
        timers.current.forEach(clearTimeout);
    }, []);

    const value: ToastContextState = {
        success: useCallback((message: string) => show('success', message), [show]),
        error: useCallback((message: string) => show('error', message), [show]),
        info: useCallback((message: string) => show('info', message), [show]),
    };

    return (
        <ToastContext.Provider value={value}>
            {children}
            {/* Stacked bottom-right; on mobile it clears the floating bottom nav bar. */}
            <div className="fixed z-[70] bottom-28 right-4 md:bottom-6 flex flex-col-reverse gap-2 w-[calc(100%-2rem)] max-w-sm pointer-events-none print:hidden">
                {toasts.map(({ id, variant, message }) => {
                    const { icon: Icon, iconClass, borderClass, role } = VARIANT_STYLES[variant];
                    return (
                        <div
                            key={id}
                            role={role}
                            className={`animate-toast-in pointer-events-auto flex items-start gap-3 bg-gray-800/95 backdrop-blur-sm border border-gray-700/60 border-l-4 ${borderClass} rounded-xl shadow-2xl shadow-black/40 px-4 py-3`}
                        >
                            <Icon className={`h-5 w-5 flex-shrink-0 mt-0.5 ${iconClass}`} />
                            <p className="flex-1 text-sm text-gray-200 break-words">{message}</p>
                            <button
                                type="button"
                                onClick={() => dismiss(id)}
                                aria-label="Dismiss notification"
                                className="p-0.5 -m-0.5 rounded-md text-gray-500 hover:text-white transition-colors"
                            >
                                <XMarkIcon className="h-4 w-4" />
                            </button>
                        </div>
                    );
                })}
            </div>
        </ToastContext.Provider>
    );
};
