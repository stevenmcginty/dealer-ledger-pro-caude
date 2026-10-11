import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Notification, View } from '../../types';
import { useUI } from '../../hooks/useUI';
import { useData } from '../../hooks/useData';
import UpdateBanner from '../common/UpdateBanner';
import { cx } from '../ui/cx';
import AddMenu from './AddMenu';
import AppHeader from './AppHeader';
import BottomTabs from './BottomTabs';
import SearchBody from './GlobalSearch';
import MoreContent from './MoreContent';
import NavRail from './NavRail';
import Sidebar from './Sidebar';
import { isTypingTarget, useBreakpoint, useFocusTrap, useShellCounts } from './hooks';
import { NavFlags, titleFor } from './navModel';
import { XMarkIcon } from '../icons';

interface AppShellProps {
    children: React.ReactNode;
    notifications: Notification[];
    onLogout: () => void;
    className?: string;
}

const todayLine = (): string =>
    new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });

/**
 * The app frame (spec 2.2): bottom tabs on phones, a rail on tablets, a
 * sidebar on desktops; one Add menu; a slim header with Search and Alerts.
 * Views render as children, untouched.
 */
const AppShell: React.FC<AppShellProps> = ({ children, notifications, onLogout, className }) => {
    const { view, vehicleId, setView, modal, inboxThreadOpen } = useUI();
    const { businessDetails, vehicles, isServiceBusiness, isVatRegistered } = useData();
    const bp = useBreakpoint();
    const counts = useShellCounts();
    const flags: NavFlags = { isServiceBusiness, isVatRegistered };

    const [addOpen, setAddOpen] = useState(false);
    const [moreOpen, setMoreOpen] = useState(false);
    const [searchOpen, setSearchOpen] = useState(false);
    const addRef = useRef<HTMLButtonElement>(null);
    const searchRef = useRef<HTMLInputElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);

    // Any navigation (a tab, Back, a link inside a page) closes the overlays.
    useEffect(() => {
        setMoreOpen(false);
        setAddOpen(false);
    }, [view, vehicleId]);
    // The More panel only exists beside the rail; the screen only on phones.
    useEffect(() => {
        if (bp === 'desktop') setMoreOpen(false);
        setAddOpen(false);
    }, [bp]);

    const navigate = useCallback((next: View) => {
        setMoreOpen(false);
        setAddOpen(false);
        setView(next);
    }, [setView]);

    const toggleAdd = () => {
        setMoreOpen(false);
        setAddOpen(open => !open);
    };
    const toggleMore = () => {
        setAddOpen(false);
        setMoreOpen(open => !open);
    };

    // N opens Add, / goes to search: anywhere, unless typing or a dialog is up.
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (isTypingTarget(e) || modal || searchOpen) return;
            if ((e.key === 'n' || e.key === 'N') && !addOpen) {
                e.preventDefault();
                setMoreOpen(false);
                setAddOpen(true);
            } else if (e.key === '/' && !addOpen) {
                e.preventDefault();
                if (bp === 'desktop') searchRef.current?.focus();
                else setSearchOpen(true);
            }
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [modal, searchOpen, addOpen, bp]);

    const closeMore = useCallback(() => setMoreOpen(false), []);
    useFocusTrap(panelRef, bp === 'tablet' && moreOpen, closeMore);

    // Title, and the Car page's Back.
    const car = vehicleId ? vehicles.find(v => v.id === vehicleId) : undefined;
    const onCarPage = view === 'stock' && !!vehicleId;
    const title = bp === 'phone' && moreOpen
        ? 'More'
        : onCarPage
            ? (car ? [car.make, car.model].filter(Boolean).join(' ') || car.reg : 'Car')
            : titleFor(view);
    const business = businessDetails?.name || 'Dealer Ledger';
    const subtitle = onCarPage
        ? car?.reg
        : view === 'dashboard' && !moreOpen ? `${todayLine()} · ${business}` : business;
    const goBack = () => {
        // Back to the page we came from when the app put it there; else the list.
        if (window.history.state?.dlp) window.history.back();
        else setView('stock');
    };

    const fullBleed = view === 'agentInbox';
    // The inbox has its own header on phones; inside a thread its reply bar replaces the tabs.
    const showHeader = !(bp === 'phone' && fullBleed && !moreOpen);
    const showTabs = !(bp === 'phone' && fullBleed && inboxThreadOpen && !moreOpen);

    const header = showHeader && (
        <AppHeader
            bp={bp}
            title={title}
            subtitle={subtitle}
            flags={flags}
            notifications={notifications}
            onBack={onCarPage && !(bp === 'phone' && moreOpen) ? goBack : undefined}
            backLabel="Back to stock"
            onOpenSearch={() => setSearchOpen(true)}
            searchRef={searchRef}
        />
    );

    return (
        <div className={cx('flex h-[100dvh] overflow-hidden bg-bg text-ink print:hidden', className)}>
            {bp === 'desktop' && (
                <Sidebar
                    view={view}
                    flags={flags}
                    counts={counts}
                    addOpen={addOpen}
                    onNavigate={navigate}
                    onToggleAdd={toggleAdd}
                    onLogout={onLogout}
                    addRef={addRef}
                />
            )}
            {bp === 'tablet' && (
                <NavRail
                    view={view}
                    flags={flags}
                    counts={counts}
                    addOpen={addOpen}
                    moreOpen={moreOpen}
                    onNavigate={navigate}
                    onToggleAdd={toggleAdd}
                    onToggleMore={toggleMore}
                    addRef={addRef}
                />
            )}

            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                {/* min-w-0 is load-bearing: without it the column grows to its content's
                    min-content width and the overflow-hidden frame clips it. */}
                <div className="relative flex min-h-0 flex-1 flex-col">
                    <UpdateBanner />
                    {header}
                    <div className="relative min-h-0 flex-1">
                        <main
                            id="main"
                            className={fullBleed ? 'h-full min-h-0 overflow-hidden' : 'h-full overflow-y-auto overscroll-contain'}
                        >
                            <div className={fullBleed ? 'h-full min-h-0' : 'mx-auto max-w-7xl px-4 pb-10 pt-4 md:px-6 md:pt-6'}>
                                {children}
                            </div>
                        </main>
                        {bp === 'phone' && moreOpen && (
                            <section
                                id="more-screen"
                                aria-label="More"
                                className="anim-fade-in absolute inset-0 z-sticky overflow-y-auto overscroll-contain bg-bg px-4 pb-8 pt-4"
                            >
                                <MoreContent view={view} flags={flags} counts={counts} onNavigate={navigate} onLogout={onLogout} />
                            </section>
                        )}
                    </div>
                    {bp === 'phone' && (
                        <AddMenu open={addOpen} onClose={() => setAddOpen(false)} variant="sheet" anchorRef={addRef} />
                    )}
                </div>

                {bp === 'phone' && showTabs && (
                    <BottomTabs
                        view={view}
                        flags={flags}
                        counts={counts}
                        addOpen={addOpen}
                        moreOpen={moreOpen}
                        onNavigate={navigate}
                        onToggleAdd={toggleAdd}
                        onToggleMore={toggleMore}
                        addRef={addRef}
                    />
                )}
            </div>

            {bp !== 'phone' && (
                <AddMenu
                    open={addOpen}
                    onClose={() => setAddOpen(false)}
                    variant="popover"
                    anchorRef={addRef}
                    placement={bp === 'tablet' ? 'end' : 'below'}
                />
            )}

            {bp === 'tablet' && moreOpen && (
                <>
                    <div className="anim-fade-in fixed inset-y-0 end-0 start-[84px] z-sheet bg-scrim" onClick={closeMore} aria-hidden="true" />
                    <div
                        id="more-panel"
                        ref={panelRef}
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="more-panel-title"
                        className="anim-panel-in fixed inset-y-0 start-[84px] z-sheet flex w-[320px] flex-col border-e border-line bg-bg shadow-e3"
                    >
                        <div className="flex flex-none items-center justify-between border-b border-line bg-surface py-2 pe-1 ps-4">
                            <h2 id="more-panel-title" className="text-xl font-bold text-ink">More</h2>
                            <button
                                type="button"
                                onClick={closeMore}
                                aria-label="Close"
                                className="grid h-12 w-12 place-items-center rounded-control text-ink-2 transition-colors duration-quick hover:bg-surface-2 hover:text-ink"
                            >
                                <XMarkIcon className="h-6 w-6" />
                            </button>
                        </div>
                        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-6 pt-4">
                            <MoreContent view={view} flags={flags} counts={counts} onNavigate={navigate} onLogout={onLogout} />
                        </div>
                    </div>
                </>
            )}

            {searchOpen && bp !== 'desktop' && <SearchBody flags={flags} variant="overlay" onClose={() => setSearchOpen(false)} />}
        </div>
    );
};

export default AppShell;
