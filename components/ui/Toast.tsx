import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { CheckCircleIcon, ExclamationTriangleIcon, InformationCircleIcon, WhatsAppIcon, XMarkIcon } from '../icons';

type ToastVariant = 'success' | 'error' | 'info';

/** An optional second thing a toast can do besides being read and dismissed. */
export interface ToastAction {
    label: string;
    onClick: () => void;
}

interface ToastItem {
    id: number;
    variant: ToastVariant;
    message: string;
    action?: ToastAction;
}

/** A customer WhatsApp popup. Stays until Reply, Later or X. */
interface WhatsAppItem {
    id: number;
    /** Bumped when a newer message replaces this one, to replay the glow. */
    pulse: number;
    message: string;
    name: string;
    convId?: string;
    action?: ToastAction;
}

export interface WhatsAppToastOptions {
    /** A newer message for the same conversation replaces its popup. */
    convId?: string;
}

interface ToastContextState {
    success: (message: string) => void;
    error: (message: string) => void;
    info: (message: string, action?: ToastAction) => void;
    whatsapp: (message: string, action?: ToastAction, title?: string, opts?: WhatsAppToastOptions) => void;
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
const MAX_WHATSAPP = 3;

/**
 * "Jane Smith · WhatsApp" -> "Jane Smith". A bare "WhatsApp" (no customer
 * name on the push) falls back to a plain label.
 */
export const whatsAppName = (title?: string, fallback = 'WhatsApp message'): string =>
    (title || '').replace(/(^|\s*·\s*)WhatsApp\s*$/i, '').trim() || fallback;

// Drop-in and a green glow that pulses three times then settles. Only used
// behind `motion-safe:`, so reduced-motion gets the static card.
const WHATSAPP_KEYFRAMES = `
@keyframes wa-drop-in {
  from { opacity: 0; transform: translateY(-1.25rem) scale(0.96); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
@keyframes wa-glow {
  0% { box-shadow: 0 0 0 0 rgba(37, 211, 102, 0.75); }
  100% { box-shadow: 0 0 0 16px rgba(37, 211, 102, 0); }
}`;

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [toasts, setToasts] = useState<ToastItem[]>([]);
    const [waToasts, setWaToasts] = useState<WhatsAppItem[]>([]);
    const nextId = useRef(0);
    const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

    const dismiss = useCallback((id: number) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    }, []);

    const dismissWhatsApp = useCallback((id: number) => {
        setWaToasts(prev => prev.filter(t => t.id !== id));
    }, []);

    const show = useCallback((variant: ToastVariant, message: string, action?: ToastAction) => {
        const id = ++nextId.current;
        // Newest first: the container is a column-reverse stack, so the newest
        // toast renders closest to the bottom edge.
        setToasts(prev => [{ id, variant, message, action }, ...prev].slice(0, MAX_VISIBLE));
        timers.current.push(setTimeout(() => dismiss(id), DISMISS_AFTER_MS[variant]));
    }, [dismiss]);

    const showWhatsApp = useCallback((message: string, action?: ToastAction, title?: string, opts?: WhatsAppToastOptions) => {
        const pulse = ++nextId.current;
        const convId = opts?.convId || undefined;
        const name = whatsAppName(title);
        setWaToasts(prev => {
            // Same conversation: that popup takes the new text, moves to the
            // top and replays the glow, rather than stacking a second one.
            // Newest on top; the oldest drops off past three.
            const same = convId ? prev.find(t => t.convId === convId) : undefined;
            const item: WhatsAppItem = { id: same ? same.id : pulse, pulse, message, name, convId, action };
            return [item, ...prev.filter(t => t !== same)].slice(0, MAX_WHATSAPP);
        });
    }, []);

    useEffect(() => () => {
        timers.current.forEach(clearTimeout);
    }, []);

    const value: ToastContextState = {
        success: useCallback((message: string) => show('success', message), [show]),
        error: useCallback((message: string) => show('error', message), [show]),
        info: useCallback((message: string, action?: ToastAction) => show('info', message, action), [show]),
        whatsapp: showWhatsApp,
    };

    return (
        <ToastContext.Provider value={value}>
            {children}
            {/* Stacked bottom-right; on mobile it clears the floating bottom nav bar. */}
            <div className="fixed z-[70] bottom-28 right-4 md:bottom-6 flex flex-col-reverse gap-2.5 w-[calc(100%-2rem)] max-w-sm pointer-events-none print:hidden">
                {toasts.map(({ id, variant, message, action }) => {
                    const { icon: Icon, iconClass, borderClass, role } = VARIANT_STYLES[variant];
                    return (
                        <div
                            key={id}
                            role={role}
                            className={`animate-toast-in pointer-events-auto flex items-start gap-3 rounded-xl shadow-2xl shadow-black/50 px-4 py-3.5 transition-all bg-gray-800/95 backdrop-blur-sm border border-gray-700/60 border-l-4 ${borderClass}`}
                        >
                            <Icon className={`h-5 w-5 flex-shrink-0 mt-0.5 ${iconClass}`} />
                            <div className="flex-1 min-w-0">
                                <p className="text-sm text-gray-100 break-words leading-snug">{message}</p>
                                {action && (
                                    <button
                                        type="button"
                                        onClick={() => { action.onClick(); dismiss(id); }}
                                        className="mt-1.5 text-sm font-semibold text-brand-400 hover:text-brand-300 transition-colors"
                                    >
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

            {/* WhatsApp: the app is the only place these can be read, so they
                drop in at the top, glow, and stay until dealt with. Phone: full
                width at the top. Desktop: top-right, under the header. */}
            <style>{WHATSAPP_KEYFRAMES}</style>
            <div
                role="alert"
                aria-live="assertive"
                className="fixed z-[75] top-3 inset-x-3 md:inset-x-auto md:top-20 md:right-4 md:w-full md:max-w-md flex flex-col gap-3 pointer-events-none print:hidden"
            >
                {waToasts.map(({ id, pulse, message, name, action }) => (
                    <div key={id} className="relative pointer-events-auto motion-safe:animate-[wa-drop-in_0.35s_cubic-bezier(0.22,1,0.36,1)_both]">
                        <span
                            key={pulse}
                            aria-hidden="true"
                            className="absolute inset-0 rounded-2xl pointer-events-none motion-safe:animate-[wa-glow_1s_ease-out_3]"
                        />
                        <div className="relative overflow-hidden rounded-2xl bg-[#1f2c34] ring-2 ring-[#25d366] shadow-2xl shadow-black/60">
                            <div className="flex items-center gap-2 bg-[#25d366] px-4 py-2 text-white">
                                <WhatsAppIcon className="h-5 w-5 flex-shrink-0" />
                                <span className="text-sm font-bold tracking-wide">WhatsApp</span>
                                <span className="text-xs font-medium text-white/85">· now</span>
                                <button
                                    type="button"
                                    onClick={() => dismissWhatsApp(id)}
                                    aria-label="Dismiss WhatsApp message"
                                    className="ml-auto -mr-1 p-1 rounded-md text-white/90 hover:text-white hover:bg-white/15 transition-colors"
                                >
                                    <XMarkIcon className="h-4 w-4" />
                                </button>
                            </div>
                            <div className="px-4 pt-3 pb-3.5">
                                <p className="text-base font-semibold text-white truncate">{name}</p>
                                <p className="mt-1 text-sm text-gray-200 leading-snug break-words line-clamp-3">{message}</p>
                                <div className="mt-3 flex items-center gap-2">
                                    {action && (
                                        <button
                                            type="button"
                                            onClick={() => { action.onClick(); dismissWhatsApp(id); }}
                                            className="inline-flex items-center gap-1.5 rounded-lg bg-[#25d366] hover:bg-[#20ba5a] px-4 py-2 text-sm font-semibold text-white shadow-md shadow-[#25d366]/25 transition-colors active:scale-95"
                                        >
                                            <WhatsAppIcon className="h-4 w-4" />
                                            {action.label}
                                        </button>
                                    )}
                                    <button
                                        type="button"
                                        onClick={() => dismissWhatsApp(id)}
                                        className="rounded-lg px-4 py-2 text-sm font-semibold text-gray-300 hover:text-white hover:bg-white/10 transition-colors"
                                    >
                                        Later
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </ToastContext.Provider>
    );
};
