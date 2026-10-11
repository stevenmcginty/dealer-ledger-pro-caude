import React from 'react';
import { Notification } from '../../types';
import NotificationBell from '../nav/NotificationBell';
import { cx } from '../ui/cx';
import { Breakpoint } from './hooks';
import { NavFlags } from './navModel';
import SearchBody from './GlobalSearch';
import { ChevronLeftIcon, MagnifyingGlassIcon } from '../icons';

interface AppHeaderProps {
    bp: Breakpoint;
    title: string;
    subtitle?: string;
    flags: NavFlags;
    notifications: Notification[];
    /** Shows a Back button before the title (the Car page). */
    onBack?: () => void;
    backLabel?: string;
    /** Phone and tablet: open the full-screen search. */
    onOpenSearch: () => void;
    /** Desktop: the inline search field, so "/" can focus it. */
    searchRef: React.RefObject<HTMLInputElement | null>;
}

const iconBtn =
    'grid h-12 w-12 flex-none place-items-center rounded-control text-ink-2 transition-colors duration-quick ease-out hover:bg-surface-2 hover:text-ink active:bg-surface-3';

/**
 * The slim header: where you are, then Search and Alerts. Nothing else; the
 * create button is Add, app updates are a banner.
 */
const AppHeader: React.FC<AppHeaderProps> = ({ bp, title, subtitle, flags, notifications, onBack, backLabel, onOpenSearch, searchRef }) => {
    const desktop = bp === 'desktop';
    return (
        <header
            className={cx(
                'flex flex-none items-center gap-1 border-b border-line bg-surface print:hidden',
                desktop ? 'h-16 pe-4 ps-6' : 'min-h-[64px] pe-1 ps-4',
                onBack && !desktop && 'ps-1',
            )}
        >
            {onBack && (
                <button type="button" onClick={onBack} className={cx(iconBtn, desktop && '-ms-3')} aria-label={backLabel || 'Back'} title={backLabel || 'Back'}>
                    <ChevronLeftIcon className="h-6 w-6 rtl:-scale-x-100" />
                </button>
            )}
            <div className="min-w-0 flex-1">
                <h1 className={cx('truncate font-bold leading-tight text-ink', desktop ? 'text-2xl tracking-[-0.01em]' : 'text-xl')}>{title}</h1>
                {subtitle && !desktop && <p className="truncate text-sm leading-snug text-ink-3">{subtitle}</p>}
            </div>
            {desktop ? (
                <div className="me-1">
                    <SearchBody flags={flags} variant="field" inputRef={searchRef} />
                </div>
            ) : (
                <button type="button" onClick={onOpenSearch} className={iconBtn} aria-label="Search" title="Search" aria-keyshortcuts="/">
                    <MagnifyingGlassIcon className="h-6 w-6" />
                </button>
            )}
            <NotificationBell notifications={notifications} />
        </header>
    );
};

export default AppHeader;
