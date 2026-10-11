import React, { useMemo, useState } from 'react';
import { View } from '../../types';
import AppUpdateButton from '../common/AppUpdateButton';
import { cx } from '../ui/cx';
import { NavFlags, VIEW_META, badgeText, hrefFor, moreGroups } from './navModel';
import { ShellCounts } from './hooks';
import { ArrowLeftOnRectangleIcon, ChevronRightIcon, MagnifyingGlassIcon, XMarkIcon } from '../icons';
import LedgerCard from './LedgerCard';

interface MoreContentProps {
    view: View;
    flags: NavFlags;
    counts: ShellCounts;
    onNavigate: (view: View) => void;
    onLogout: () => void;
}

const rowClass =
    'flex min-h-[56px] w-full items-center gap-3 border-b border-line px-4 text-start text-ink no-underline ' +
    'transition-colors duration-quick ease-out hover:bg-surface-2 active:bg-surface-3 focus-visible:outline-offset-[-3px]';

const eyebrow = 'px-1 pb-1.5 font-mono text-xs font-semibold uppercase tracking-[0.08em] text-ink-3';

/**
 * The More screen (phone) and More panel (tablet): every screen that is not a
 * tab, grouped as in the sidebar, with a filter on top and Account at the foot.
 */
const MoreContent: React.FC<MoreContentProps> = ({ view, flags, counts, onNavigate, onLogout }) => {
    const [query, setQuery] = useState('');

    const groups = useMemo(() => {
        const q = query.trim().toLowerCase();
        const base = [
            ...moreGroups(flags),
            { id: 'account', title: 'Account', views: ['settings' as View] },
        ];
        if (!q) return base;
        return base
            .map(g => ({
                ...g,
                views: g.views.filter(v => `${VIEW_META[v].label} ${VIEW_META[v].keywords || ''}`.toLowerCase().includes(q)),
            }))
            .filter(g => g.views.length > 0);
    }, [flags, query]);

    const meta = (v: View): React.ReactNode => {
        if (v === 'expenses' && counts.bankToCheck > 0) {
            return (
                <span className="num rounded-full bg-warning-soft px-2 text-xs font-semibold leading-6 text-warning-ink">
                    {badgeText(counts.bankToCheck)}
                    <span className="sr-only"> bank lines to check</span>
                </span>
            );
        }
        return null;
    };

    const link = (v: View) => {
        const { label, icon: Icon } = VIEW_META[v];
        const active = v === view;
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
                    className={cx(rowClass, active && 'bg-accent-soft text-accent-soft-ink hover:bg-accent-soft')}
                >
                    <Icon className={cx('h-6 w-6 flex-none', active ? 'text-accent-soft-ink' : 'text-ink-2')} />
                    <span className="min-w-0 flex-1 truncate text-base font-semibold">{label}</span>
                    {meta(v)}
                    <ChevronRightIcon className="h-5 w-5 flex-none text-ink-3 rtl:-scale-x-100" />
                </a>
            </li>
        );
    };

    return (
        <div className="flex flex-col gap-5">
            <label className="flex min-h-[48px] items-center gap-2 rounded-control border border-transparent bg-surface-2 ps-3 pe-1 text-ink-3 transition-[background-color,border-color,box-shadow] duration-quick ease-out focus-within:border-focus focus-within:bg-surface focus-within:shadow-[0_0_0_1px_rgb(var(--c-focus))]">
                <MagnifyingGlassIcon className="h-5 w-5 flex-none" />
                <input
                    type="search"
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    placeholder="Find a screen"
                    aria-label="Find a screen"
                    className="h-11 min-w-0 flex-1 appearance-none border-0 bg-transparent text-base text-ink placeholder:text-ink-3 placeholder:opacity-100 focus-visible:outline-none [&::-webkit-search-cancel-button]:hidden"
                />
                {query && (
                    <button type="button" onClick={() => setQuery('')} aria-label="Clear" className="grid h-10 w-10 flex-none place-items-center rounded-control text-ink-2 hover:bg-surface-3 hover:text-ink">
                        <XMarkIcon className="h-5 w-5" />
                    </button>
                )}
            </label>

            {!query && <LedgerCard />}

            {groups.map(group => (
                <section key={group.id} aria-labelledby={`more-${group.id}`}>
                    <h2 id={`more-${group.id}`} className={eyebrow}>{group.title}</h2>
                    <ul className="m-0 list-none overflow-hidden rounded-card border border-line bg-surface p-0 [&>li:last-child>*]:border-b-0">
                        {group.views.map(link)}
                        {group.id === 'account' && (
                            <>
                                <li><AppUpdateButton variant="menu" /></li>
                                <li>
                                    <button type="button" onClick={onLogout} className={rowClass}>
                                        <ArrowLeftOnRectangleIcon className="h-6 w-6 flex-none text-ink-2 rtl:-scale-x-100" />
                                        <span className="min-w-0 flex-1 truncate text-base font-semibold">Sign out</span>
                                    </button>
                                </li>
                            </>
                        )}
                    </ul>
                </section>
            ))}

            {groups.length === 0 && (
                <p className="px-1 text-base text-ink-2">
                    No screen called “{query.trim()}”. Try a shorter word, or
                    {' '}
                    <button type="button" className="font-semibold text-accent-text underline underline-offset-2" onClick={() => onNavigate('settings')}>
                        open Settings
                    </button>.
                </p>
            )}
        </div>
    );
};

export default MoreContent;
