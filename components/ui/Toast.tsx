import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './primitives.css';
import { CheckIcon, ExclamationCircleIcon, InformationCircleIcon, WhatsAppIcon, XMarkIcon } from '../icons';

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
    /** Past-tense result. Pass an action for Undo. */
    success: (message: string, action?: ToastAction) => void;
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

// Six seconds for all (paused on hover or focus), so Undo is reachable by
// keyboard before the toast goes.
const DISMISS_AFTER_MS: Record<ToastVariant, number> = {
    success: 6000,
    info: 6000,
    error: 6000,
};

// Inverse card (ink on surface flips per theme); the status dot uses the
// soft/ink pair, which reads on both the dark light-theme toast and the light
// dark-theme one.
const VARIANT_STYLES: Record<ToastVariant, { icon: React.ComponentType<{ className?: string }>; dot: string; role: 'status' | 'alert' }> = {
    success: { icon: CheckIcon, dot: 'bg-success-soft text-success-ink', role: 'status' },
    error: { icon: ExclamationCircleIcon, dot: 'bg-danger-soft text-danger-ink', role: 'alert' },
    info: { icon: InformationCircleIcon, dot: 'bg-info-soft text-info-ink', role: 'status' },
};

/** How long a toast takes to leave (matches --dur-2). */
const LEAVE_MS = 160;

const MAX_VISIBLE = 4;
const MAX_WHATSAPP = 3;

/**
 * "Jane Smith · WhatsApp" -> "Jane Smith". A bare "WhatsApp" (no customer
 * name on the push) falls back to a plain label.
 */
export const whatsAppName = (title?: string, fallback = 'WhatsApp message'): string =>
    (title || '').replace(/(^|\s*·\s*)WhatsApp\s*$/i, '').trim() || fallback;

export interface ToastProps {
    variant?: ToastVariant;
    message: React.ReactNode;
    action?: ToastAction;
    /** Shows the X. */
    onDismiss?: () => void;
    /** Plays the leave animation. */
    leaving?: boolean;
    className?: string;
}

/**
 * The toast card on its own: an inverse bar with a status dot, the message,
 * one action and a close button. ToastProvider shows these for you; render
 * one directly only for a preview.
 */
export const Toast: React.FC<ToastProps & Omit<React.HTMLAttributes<HTMLDivElement>, 'role'>> = ({
    variant = 'success', message, action, onDismiss, leaving, className, ...rest
}) => {
    const { icon: Icon, dot, role } = VARIANT_STYLES[variant];
    return (
        <div
            role={role}
            {...rest}
            className={`${leaving ? 'fl-toast-out' : 'fl-toast-in'} pointer-events-auto flex items-center gap-3 rounded-control bg-ink py-1 pe-0 ps-3.5 text-sm leading-5 text-surface shadow-e3 ${className ?? ''}`}
        >
            <span className={`grid h-[22px] w-[22px] flex-none place-items-center rounded-full ${dot}`} aria-hidden="true">
                <Icon className="h-3.5 w-3.5" />
            </span>
            <p className="min-w-0 flex-1 break-words py-2">{message}</p>
            {action && (
                <button
                    type="button"
                    onClick={action.onClick}
                    className="min-h-[48px] min-w-[48px] flex-none rounded-chip px-2.5 text-sm font-bold underline decoration-1 underline-offset-[3px] hover:decoration-2 focus-visible:outline-surface"
                >
                    {action.label}
                </button>
            )}
            {onDismiss && (
                <button
                    type="button"
                    onClick={onDismiss}
                    aria-label="Dismiss notification"
                    className="group/x grid h-12 w-12 flex-none place-items-center rounded-control text-surface/70 hover:text-surface focus-visible:outline-surface focus-visible:outline-offset-[-3px]"
                >
                    <span className="grid h-9 w-9 place-items-center rounded-chip transition-colors duration-quick ease-out group-hover/x:bg-surface/10">
                        <XMarkIcon className="h-[18px] w-[18px]" />
                    </span>
                </button>
            )}
        </div>
    );
};

/** One toast. Owns its timer so hover or focus can pause it. */
const ToastCard: React.FC<{ item: ToastItem; onDismiss: (id: number) => void }> = ({ item, onDismiss }) => {
    const { id, variant, message, action } = item;
    const [leaving, setLeaving] = useState(false);
    const remaining = useRef(DISMISS_AFTER_MS[variant]);
    const startedAt = useRef(0);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const leave = useCallback(() => {
        if (timer.current) clearTimeout(timer.current);
        setLeaving(true);
        timer.current = setTimeout(() => onDismiss(id), LEAVE_MS);
    }, [id, onDismiss]);

    const run = useCallback(() => {
        startedAt.current = Date.now();
        timer.current = setTimeout(leave, remaining.current);
    }, [leave]);

    const pause = () => {
        if (leaving || !timer.current) return;
        clearTimeout(timer.current);
        timer.current = null;
        remaining.current = Math.max(1500, remaining.current - (Date.now() - startedAt.current));
    };
    const resume = () => { if (!leaving && !timer.current) run(); };

    useEffect(() => {
        run();
        return () => { if (timer.current) clearTimeout(timer.current); };
    }, [run]);

    return (
        <Toast
            variant={variant}
            message={message}
            action={action && { label: action.label, onClick: () => { action.onClick(); leave(); } }}
            onDismiss={leave}
            leaving={leaving}
            onMouseEnter={pause}
            onMouseLeave={resume}
            onFocus={pause}
            onBlur={resume}
        />
    );
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [toasts, setToasts] = useState<ToastItem[]>([]);
    const [waToasts, setWaToasts] = useState<WhatsAppItem[]>([]);
    const nextId = useRef(0);

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
    }, []);

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

    const value: ToastContextState = {
        success: useCallback((message: string, action?: ToastAction) => show('success', message, action), [show]),
        error: useCallback((message: string) => show('error', message), [show]),
        info: useCallback((message: string, action?: ToastAction) => show('info', message, action), [show]),
        whatsapp: showWhatsApp,
    };

    // Both regions live straight under <body> and opt out of a modal's inert
    // background, so a toast raised from inside a sheet is still seen, heard
    // and tappable.
    const regions = (
        <>
            {/* Phone: centred above the bottom tab bar. Desktop: bottom-right. */}
            <div
                data-modal-exempt=""
                aria-live="polite"
                className="pointer-events-none fixed inset-x-4 bottom-[calc(7rem+env(safe-area-inset-bottom))] z-toast mx-auto flex max-w-[420px] flex-col-reverse gap-2 md:inset-x-auto md:bottom-6 md:end-6 md:mx-0 md:w-[420px] print:hidden"
            >
                {toasts.map(item => <ToastCard key={item.id} item={item} onDismiss={dismiss} />)}
            </div>

            {/* WhatsApp: the app is the only place these can be read, so they
                drop in at the top, glow, and stay until dealt with. Phone: full
                width at the top. Desktop: top-right, under the header. */}
            <div
                data-modal-exempt=""
                role="alert"
                aria-live="assertive"
                className="pointer-events-none fixed inset-x-3 top-[calc(0.75rem+env(safe-area-inset-top))] z-toast flex flex-col gap-3 md:inset-x-auto md:end-4 md:top-20 md:w-full md:max-w-md print:hidden"
            >
                {waToasts.map(({ id, pulse, message, name, action }) => (
                    <div key={id} className="fl-drop-in pointer-events-auto relative">
                        <span key={pulse} aria-hidden="true" className="fl-glow pointer-events-none absolute inset-0 rounded-card" />
                        <div className="relative overflow-hidden rounded-card border border-line bg-surface shadow-e3 ring-2 ring-success">
                            <div className="flex items-center gap-2 border-b border-line bg-success-soft py-1 pe-0 ps-4 text-success-ink">
                                <WhatsAppIcon className="h-[18px] w-[18px] flex-none" />
                                <span className="text-sm font-bold">WhatsApp</span>
                                <span className="text-xs font-semibold opacity-80">· now</span>
                                <button
                                    type="button"
                                    onClick={() => dismissWhatsApp(id)}
                                    aria-label="Dismiss WhatsApp message"
                                    className="-my-1 ms-auto grid h-12 w-12 place-items-center rounded-control transition-colors duration-quick ease-out hover:bg-success/15"
                                >
                                    <XMarkIcon className="h-[18px] w-[18px]" />
                                </button>
                            </div>
                            <div className="px-4 pb-3.5 pt-3">
                                <p className="truncate text-base font-bold text-ink">{name}</p>
                                <p className="mt-1 line-clamp-3 break-words text-sm leading-5 text-ink-2">{message}</p>
                                <div className="mt-3 flex items-center gap-2">
                                    {action && (
                                        <button
                                            type="button"
                                            onClick={() => { action.onClick(); dismissWhatsApp(id); }}
                                            className="inline-flex min-h-[48px] items-center gap-2 rounded-control bg-success px-4 text-sm font-semibold text-surface transition-[background-color,transform] duration-quick ease-out hover:bg-success-ink active:scale-[.97]"
                                        >
                                            <WhatsAppIcon className="h-4 w-4" />
                                            {action.label}
                                        </button>
                                    )}
                                    <button
                                        type="button"
                                        onClick={() => dismissWhatsApp(id)}
                                        className="min-h-[48px] rounded-control px-4 text-sm font-semibold text-ink-2 transition-colors duration-quick ease-out hover:bg-surface-2 hover:text-ink"
                                    >
                                        Later
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </>
    );

    return (
        <ToastContext.Provider value={value}>
            {children}
            {typeof document !== 'undefined' ? createPortal(regions, document.body) : regions}
        </ToastContext.Provider>
    );
};
