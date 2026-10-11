import React, { useState } from 'react';
import { View } from '../../types';
import AppUpdateButton from '../common/AppUpdateButton';
import { cx } from '../ui/cx';
import { NavFlags, VIEW_META, badgeText, hrefFor, sidebarGroups } from './navModel';
import { ShellCounts } from './hooks';
import { ArrowLeftOnRectangleIcon, ChevronDownIcon, NavCarSolidIcon, NavChatSolidIcon, NavHomeSolidIcon, PlusIcon } from '../icons';
import LedgerCard from './LedgerCard';

interface SidebarProps {
    view: View;
    flags: NavFlags;
    counts: ShellCounts;
    addOpen: boolean;
    onNavigate: (view: View) => void;
    onToggleAdd: () => void;
    onLogout: () => void;
    addRef: React.Ref<HTMLButtonElement>;
}

const COLLAPSED_KEY = 'dlp.nav.collapsed';

const readCollapsed = (): string[] => {
    try {
        const raw = localStorage.getItem(COLLAPSED_KEY);
        return raw ? JSON.parse(raw) : ['workshop', 'reports'];
    } catch {
        return ['workshop', 'reports'];
    }
};

/** Solid twins for the items that have one; the rest thicken their stroke when active. */
const SOLID: Partial<Record<View, React.ComponentType<{ className?: string }>>> = {
    dashboard: NavHomeSolidIcon,
    stock: NavCarSolidIcon,
    agentInbox: NavChatSolidIcon,
};

const itemClass =
    'relative flex min-h-[40px] w-full items-center gap-3 rounded-control px-2.5 text-sm font-semibold no-underline ' +
    'transition-colors duration-quick ease-out focus-visible:outline-offset-[-1px]';

/**
 * Desktop navigation (>= 1024 px): a 248 px sidebar. Add at the top (N),
 * then Today and the groups Sell / Money / Workshop / Reports, then Settings
 * and the ledger at the foot.
 */
const Sidebar: React.FC<SidebarProps> = ({ view, flags, counts, addOpen, onNavigate, onToggleAdd, onLogout, addRef }) => {
    const [collapsed, setCollapsed] = useState<string[]>(readCollapsed);
    const groups = sidebarGroups(flags);

    const toggleGroup = (id: string) => {
        setCollapsed(prev => {
            const next = prev.includes(id) ? prev.filter(g => g !== id) : [...prev, id];
            try { localStorage.setItem(COLLAPSED_KEY, JSON.stringify(next)); } catch { /* private window */ }
            return next;
        });
    };

    const count = (v: View): React.ReactNode => {
        // Red only for things waiting on a person; plain counts are grey.
        if (v === 'agentInbox' && counts.inbox > 0) {
            return <span className="num ms-auto min-w-[22px] rounded-full bg-danger px-1.5 text-center text-xs font-semibold leading-5 text-on-danger">{badgeText(counts.inbox)}<span className="sr-only"> waiting</span></span>;
        }
        if (v === 'stock' && counts.stock > 0) {
            return <span className="num ms-auto min-w-[22px] rounded-full bg-surface-2 px-1.5 text-center text-xs font-semibold leading-5 text-ink-2">{badgeText(counts.stock)}<span className="sr-only"> cars</span></span>;
        }
        if (v === 'expenses' && counts.bankToCheck > 0) {
            return <span className="num ms-auto min-w-[22px] rounded-full bg-warning-soft px-1.5 text-center text-xs font-semibold leading-5 text-warning-ink">{badgeText(counts.bankToCheck)}<span className="sr-only"> bank lines to check</span></span>;
        }
        return null;
    };

    const item = (v: View) => {
        const { label, icon: Icon } = VIEW_META[v];
        const active = v === view;
        const Solid = SOLID[v];
        return (
            <li key={v}>
                <a
                    href={hrefFor(v)}
                    onClick={e => {
                        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
                        e.preventDefault();
                        onNavigate(v);
                    }}
                    aria-current={active ? 'page' : undefined}
                    className={cx(
                        itemClass,
                        active
                            ? 'bg-accent-soft text-accent-soft-ink'
                            : 'text-ink-2 hover:bg-surface-2 hover:text-ink active:bg-surface-3',
                    )}
                >
                    {active && Solid ? <Solid className="h-5 w-5 flex-none" /> : <Icon className={cx('h-5 w-5 flex-none', active && '[stroke-width:2]')} />}
                    <span className="min-w-0 flex-1 truncate">{label}</span>
                    {count(v)}
                </a>
            </li>
        );
    };

    return (
        <aside className="flex h-full w-[248px] flex-none flex-col border-e border-line bg-surface print:hidden">
            <div className="px-3 pb-1.5 pt-3">
                <button
                    ref={addRef}
                    type="button"
                    onClick={onToggleAdd}
                    aria-haspopup="dialog"
                    aria-expanded={addOpen}
                    aria-keyshortcuts="N"
                    className="flex min-h-[44px] w-full items-center gap-2.5 rounded-control bg-accent px-3 text-base font-semibold text-on-accent transition-[background-color,transform] duration-quick ease-out hover:bg-accent-hover active:scale-[.98] active:bg-accent-press"
                >
                    <PlusIcon className={cx('h-5 w-5 flex-none transition-transform duration-base ease-out', addOpen && 'rotate-45')} />
                    <span className="flex-1 text-start">Add</span>
                    <kbd aria-hidden="true" className="rounded-chip border border-current px-1.5 font-mono text-xs leading-5 opacity-80">N</kbd>
                </button>
            </div>

            <nav aria-label="Main" className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2.5 pb-3">
                <ul className="m-0 list-none p-0">{item('dashboard')}</ul>
                {groups.map(group => {
                    const holdsActive = group.views.includes(view);
                    const open = holdsActive || !collapsed.includes(group.id);
                    return (
                        <div key={group.id} className="mt-2">
                            <button
                                type="button"
                                onClick={() => toggleGroup(group.id)}
                                aria-expanded={open}
                                aria-controls={`side-${group.id}`}
                                disabled={holdsActive}
                                className="flex min-h-[32px] w-full items-center justify-between rounded-control px-2.5 font-mono text-xs font-semibold uppercase tracking-[0.08em] text-ink-3 transition-colors duration-quick hover:text-ink-2 disabled:cursor-default disabled:hover:text-ink-3"
                            >
                                {group.title}
                                <ChevronDownIcon className={cx('h-4 w-4 transition-transform duration-quick ease-out', !open && '-rotate-90 rtl:rotate-90')} />
                            </button>
                            {open && <ul id={`side-${group.id}`} className="m-0 mt-0.5 flex list-none flex-col gap-0.5 p-0">{group.views.map(item)}</ul>}
                        </div>
                    );
                })}
            </nav>

            <div className="flex flex-col gap-0.5 border-t border-line px-2.5 py-1.5">
                <ul className="m-0 list-none p-0">{item('settings')}</ul>
                <AppUpdateButton variant="nav" />
                <div className="mt-1 flex items-center gap-1 border-t border-line pt-2">
                    <div className="min-w-0 flex-1 ps-1"><LedgerCard compact /></div>
                    <button
                        type="button"
                        onClick={onLogout}
                        aria-label="Sign out"
                        title="Sign out"
                        className="grid h-10 w-10 flex-none place-items-center rounded-control text-ink-2 transition-colors duration-quick hover:bg-surface-2 hover:text-ink"
                    >
                        <ArrowLeftOnRectangleIcon className="h-5 w-5 rtl:-scale-x-100" />
                    </button>
                </div>
            </div>
        </aside>
    );
};

export default Sidebar;
