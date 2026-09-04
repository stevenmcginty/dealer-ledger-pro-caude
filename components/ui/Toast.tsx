import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { CheckCircleIcon, ExclamationTriangleIcon, InformationCircleIcon, WhatsAppIcon, XMarkIcon } from '../icons';

type ToastVariant = 'success' | 'error' | 'info' | 'whatsapp';

/** An optional second thing a toast can do besides being read and dismissed. */
export interface ToastAction {
    label: string;
    onClick: () => void;
}

interface ToastItem {
    id: number;
    variant: ToastVariant;
    message: string;
    title?: string;
    action?: ToastAction;
}

interface ToastContextState {
    success: (message: string) => void;
    error: (message: string) => void;
    info: (message: string, action?: ToastAction) => void;
    whatsapp: (message: string, action?: ToastAction, title?: string) => void;
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
    whatsapp: 6500,
};

const VARIANT_STYLES: Record<ToastVariant, { icon: React.ComponentType<{ className?: string }>; iconClass: string; borderClass: string; role: string }> = {
    success: { icon: CheckCircleIcon, iconClass: 'text-emerald-400', borderClass: 'border-l-emerald-500', role: 'status' },
    error: { icon: ExclamationTriangleIcon, iconClass: 'text-red-400', borderClass: 'border-l-red-500', role: 'alert' },
    info: { icon: InformationCircleIcon, iconClass: 'text-brand-400', borderClass: 'border-l-brand-500', role: 'status' },
    whatsapp: { icon: WhatsAppIcon, iconClass: 'text-[#25d366]', borderClass: 'border-l-[#25d366]', role: 'status' },
};

const MAX_VISIBLE = 4;

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [toasts, setToasts] = useState<ToastItem[]>([]);
    const nextId = useRef(0);
    const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

    const dismiss = useCallback((id: number) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    }, []);

    const show = useCallback((variant: ToastVariant, message: string, action?: ToastAction, title?: string) => {
        const id = ++nextId.current;
        // Newest first: the container is a column-reverse stack, so the newest
        // toast renders closest to the bottom edge.
        setToasts(prev => [{ id, variant, message, action, title }, ...prev].slice(0, MAX_VISIBLE));
        timers.current.push(setTimeout(() => dismiss(id), DISMISS_AFTER_MS[variant]));
    }, [dismiss]);

    useEffect(() => () => {
        timers.current.forEach(clearTimeout);
    }, []);

    const value: ToastContextState = {
        success: useCallback((message: string) => show('success', message), [show]),
        error: useCallback((message: string) => show('error', message), [show]),
        info: useCallback((message: string, action?: ToastAction) => show('info', message, action), [show]),
        whatsapp: useCallback((message: string, action?: ToastAction, title?: string) => show('whatsapp', message, action, title), [show]),
    };

    return (
        <ToastContext.Provider value={value}>
            {children}
            {/* Stacked bottom-right; on mobile it clears the floating bottom nav bar. */}
            <div className="fixed z-[70] bottom-28 right-4 md:bottom-6 flex flex-col-reverse gap-2.5 w-[calc(100%-2rem)] max-w-sm pointer-events-none print:hidden">
                {toasts.map(({ id, variant, message, title, action }) => {
                    const isWa = variant === 'whatsapp';
                    const { icon: Icon, iconClass, borderClass, role } = VARIANT_STYLES[variant];
                    return (
                        <div
                            key={id}
                            role={role}
                            className={`animate-toast-in pointer-events-auto flex items-start gap-3 rounded-xl shadow-2xl shadow-black/50 px-4 py-3.5 transition-all ${
                                isWa
                                    ? 'bg-[#1f2c34] border border-[#25d366]/40 border-l-4 border-l-[#25d366] ring-1 ring-[#25d366]/20'
                                    : `bg-gray-800/95 backdrop-blur-sm border border-gray-700/60 border-l-4 ${borderClass}`
                            }`}
                        >
                            {isWa ? (
                                <div className="h-8 w-8 rounded-full bg-[#25d366] flex items-center justify-center flex-shrink-0 text-white shadow-md shadow-[#25d366]/30 mt-0.5">
                                    <WhatsAppIcon className="h-4 w-4" />
                                </div>
                            ) : (
                                <Icon className={`h-5 w-5 flex-shrink-0 mt-0.5 ${iconClass}`} />
                            )}
                            <div className="flex-1 min-w-0">
                                {isWa && (
                                    <div className="flex items-center gap-1.5 text-xs font-bold text-[#25d366] uppercase tracking-wider mb-0.5">
                                        <span>{title || 'WhatsApp Message'}</span>
                                    </div>
                                )}
                                <p className="text-sm text-gray-100 break-words leading-snug">{message}</p>
                                {action && (
                                    <button
                                        type="button"
                                        onClick={() => { action.onClick(); dismiss(id); }}
                                        className={
                                            isWa
                                                ? 'mt-2 inline-flex items-center gap-1.5 rounded-lg bg-[#25d366] hover:bg-[#20ba5a] px-3 py-1 text-xs font-semibold text-white shadow-md shadow-[#25d366]/25 transition-colors active:scale-95'
                                                : 'mt-1.5 text-sm font-semibold text-brand-400 hover:text-brand-300 transition-colors'
                                        }
                                    >
                                        {isWa && <WhatsAppIcon className="h-3 w-3" />}
                                        {action.label}
                                    </button>
                                )}
                            </div>
                            <button
                                type="button"
                                onClick={() => dismiss(id)}
                                aria-label="Dismiss notification"
                                className="p-0.5 -m-0.5 rounded-md text-gray-400 hover:text-white transition-colors"
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
