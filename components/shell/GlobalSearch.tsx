import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { View } from '../../types';
import { useData } from '../../hooks/useData';
import { useUI } from '../../hooks/useUI';
import Plate from '../ui/Plate';
import { cx } from '../ui/cx';
import { NavFlags, VIEW_META, isHiddenView } from './navModel';
import { ChevronLeftIcon, MagnifyingGlassIcon, UsersIcon, XMarkIcon } from '../icons';

/*
 * One search for the whole app, in the header (spec 4.2 Search): screens,
 * cars and people. Plates match with or without the space. Results wait
 * 200 ms after the last key.
 */

type Result =
    | { kind: 'screen'; id: string; view: View }
    | { kind: 'car'; id: string; vehicleId: string; reg: string; title: string; meta: string }
    | { kind: 'person'; id: string; leadId: string; name: string; meta: string };

const squash = (s: string) => s.toLowerCase().replace(/\s+/g, '');

const useDebounced = (value: string, ms: number) => {
    const [v, setV] = useState(value);
    useEffect(() => {
        const t = setTimeout(() => setV(value), ms);
        return () => clearTimeout(t);
    }, [value, ms]);
    return v;
};

const useResults = (query: string, flags: NavFlags): { groups: Array<{ title: string; items: Result[] }>; flat: Result[] } => {
    const { vehicles, leads } = useData();
    return useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return { groups: [], flat: [] };
        const qs = squash(q);

        const screens: Result[] = (Object.keys(VIEW_META) as View[])
            .filter(v => v !== 'leadDetail' && !isHiddenView(v, flags) && !(v === 'vat' && !flags.isVatRegistered))
            .filter(v => `${VIEW_META[v].label} ${VIEW_META[v].keywords || ''}`.toLowerCase().includes(q))
            .slice(0, 4)
            .map(v => ({ kind: 'screen', id: `screen-${v}`, view: v }));

        const cars: Result[] = flags.isServiceBusiness
            ? []
            : vehicles
                .filter(v => {
                    const hay = `${v.make || ''} ${v.model || ''}`.toLowerCase();
                    return squash(v.reg || '').includes(qs) || hay.includes(q) || (v.stockNumber || '').toLowerCase().replace(/^#/, '') === q.replace(/^#/, '');
                })
                .slice(0, 6)
                .map(v => ({
                    kind: 'car',
                    id: `car-${v.id}`,
                    vehicleId: v.id,
                    reg: v.reg || '',
                    title: [v.make, v.model].filter(Boolean).join(' ') || 'Car',
                    meta: [v.stockNumber ? `#${v.stockNumber.replace(/^#/, '')}` : '', v.status === 'Sold' ? 'Sold' : v.status === 'Deposit Paid' ? 'Reserved' : 'In stock'].filter(Boolean).join(' · '),
                }));

        const people: Result[] = leads
            .filter(l => {
                const hay = `${l.firstName || ''} ${l.lastName || ''} ${l.email || ''}`.toLowerCase();
                return hay.includes(q) || (!!l.phone && squash(l.phone).includes(qs));
            })
            .slice(0, 5)
            .map(l => ({
                kind: 'person',
                id: `person-${l.id}`,
                leadId: l.id,
                name: `${l.firstName || ''} ${l.lastName || ''}`.trim() || l.email || 'Lead',
                meta: [l.phone, l.vehicleOfInterest].filter(Boolean).join(' · ') || l.email || '',
            }));

        const groups = [
            { title: 'Cars', items: cars },
            { title: 'People', items: people },
            { title: 'Screens', items: screens },
        ].filter(g => g.items.length > 0);
        return { groups, flat: groups.flatMap(g => g.items) };
    }, [query, flags, vehicles, leads]);
};

interface SearchBodyProps {
    flags: NavFlags;
    variant: 'field' | 'overlay';
    inputRef?: React.RefObject<HTMLInputElement | null>;
    onClose?: () => void;
}

const SearchBody: React.FC<SearchBodyProps> = ({ flags, variant, inputRef, onClose }) => {
    const { setView, openVehicle } = useUI();
    const { setSelectedLeadId } = useData();
    const [text, setText] = useState('');
    const [focused, setFocused] = useState(false);
    const [active, setActive] = useState(0);
    const query = useDebounced(text, 200);
    const { groups, flat } = useResults(query, flags);
    const listId = useId();
    const ownRef = useRef<HTMLInputElement>(null);
    const ref = inputRef || ownRef;

    useEffect(() => setActive(0), [query]);
    useEffect(() => {
        if (variant === 'overlay') ref.current?.focus();
    }, [variant, ref]);

    const choose = (r: Result) => {
        if (r.kind === 'screen') setView(r.view);
        if (r.kind === 'car') openVehicle(r.vehicleId);
        if (r.kind === 'person') { setSelectedLeadId(r.leadId); setView('leadDetail'); }
        setText('');
        ref.current?.blur();
        onClose?.();
    };

    const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'ArrowDown') { e.preventDefault(); setActive(i => Math.min(flat.length - 1, i + 1)); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(i => Math.max(0, i - 1)); }
        else if (e.key === 'Enter' && flat[active]) { e.preventDefault(); choose(flat[active]); }
        else if (e.key === 'Escape') {
            e.preventDefault();
            if (text) setText('');
            else { ref.current?.blur(); onClose?.(); }
        }
    };

    const showList = variant === 'overlay' ? !!query.trim() : focused && !!query.trim();
    const optionId = (r: Result) => `${listId}-${r.id}`;

    const results = showList ? (
        <div
            className={cx(
                variant === 'field'
                    ? 'absolute end-0 top-[calc(100%+6px)] z-dropdown max-h-[min(70vh,32rem)] w-[28rem] overflow-y-auto rounded-card border border-line bg-surface py-1 shadow-e3'
                    : 'flex-1 overflow-y-auto pb-6',
            )}
        >
            <p className="sr-only" role="status">{flat.length === 0 ? 'No results' : `${flat.length} results`}</p>
            {flat.length === 0 ? (
                <p className="px-4 py-6 text-base text-ink-2">Nothing matches “{query.trim()}”. Try a reg, a surname or a screen name.</p>
            ) : (
                <ul id={listId} role="listbox" aria-label="Search results" className="m-0 list-none p-0">
                    {groups.map(group => (
                        <li key={group.title} role="presentation">
                            <p className="px-4 pb-1 pt-3 font-mono text-xs font-semibold uppercase tracking-[0.08em] text-ink-3">{group.title}</p>
                            <ul role="presentation" className="m-0 list-none p-0">
                                {group.items.map(r => {
                                    const idx = flat.indexOf(r);
                                    const isActive = idx === active;
                                    return (
                                        <li
                                            key={r.id}
                                            id={optionId(r)}
                                            role="option"
                                            aria-selected={isActive}
                                            onMouseDown={e => e.preventDefault()}
                                            onClick={() => choose(r)}
                                            onMouseEnter={() => setActive(idx)}
                                            className={cx('flex min-h-[56px] cursor-pointer items-center gap-3 px-4 py-2 lg:min-h-[48px]', isActive ? 'bg-surface-2' : '')}
                                        >
                                            {r.kind === 'car' && (
                                                <>
                                                    <Plate reg={r.reg || '—'} size="sm" />
                                                    <span className="min-w-0 flex-1">
                                                        <span className="block truncate text-base font-semibold text-ink">{r.title}</span>
                                                        <span className="num block truncate text-sm text-ink-3">{r.meta}</span>
                                                    </span>
                                                </>
                                            )}
                                            {r.kind === 'person' && (
                                                <>
                                                    <span className="grid h-8 w-8 flex-none place-items-center rounded-full bg-surface-2 text-ink-2"><UsersIcon className="h-5 w-5" /></span>
                                                    <span className="min-w-0 flex-1">
                                                        <span className="block truncate text-base font-semibold text-ink">{r.name}</span>
                                                        {r.meta && <span className="block truncate text-sm text-ink-3">{r.meta}</span>}
                                                    </span>
                                                </>
                                            )}
                                            {r.kind === 'screen' && (() => {
                                                const Icon = VIEW_META[r.view].icon;
                                                return (
                                                    <>
                                                        <span className="grid h-8 w-8 flex-none place-items-center rounded-control bg-surface-2 text-ink-2"><Icon className="h-5 w-5" /></span>
                                                        <span className="min-w-0 flex-1 truncate text-base font-semibold text-ink">{VIEW_META[r.view].label}</span>
                                                    </>
                                                );
                                            })()}
                                        </li>
                                    );
                                })}
                            </ul>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    ) : null;

    const field = (
        <label
            className={cx(
                'flex min-h-[48px] items-center gap-2 rounded-control border border-transparent bg-surface-2 ps-3 pe-1 text-ink-3',
                'transition-[background-color,border-color,box-shadow] duration-quick ease-out',
                'focus-within:border-focus focus-within:bg-surface focus-within:shadow-[0_0_0_1px_rgb(var(--c-focus))]',
                variant === 'field' ? 'min-h-[44px] w-80' : 'min-w-0 flex-1',
            )}
        >
            <MagnifyingGlassIcon className="h-5 w-5 flex-none" />
            <input
                ref={ref}
                type="search"
                value={text}
                onChange={e => setText(e.target.value)}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                onKeyDown={onKeyDown}
                placeholder="Search cars, people, screens"
                aria-label="Search"
                role="combobox"
                aria-expanded={showList}
                aria-controls={showList ? listId : undefined}
                aria-activedescendant={showList && flat[active] ? optionId(flat[active]) : undefined}
                aria-keyshortcuts="/"
                autoComplete="off"
                className="h-11 min-w-0 flex-1 appearance-none border-0 bg-transparent text-base text-ink placeholder:text-ink-3 placeholder:opacity-100 focus-visible:outline-none [&::-webkit-search-cancel-button]:hidden"
            />
            {text ? (
                <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => { setText(''); ref.current?.focus(); }} aria-label="Clear search" className="grid h-10 w-10 flex-none place-items-center rounded-control text-ink-2 hover:bg-surface-3 hover:text-ink">
                    <XMarkIcon className="h-5 w-5" />
                </button>
            ) : variant === 'field' ? (
                <kbd aria-hidden="true" className="me-2 rounded-chip border border-line-strong px-1.5 font-mono text-xs leading-5 text-ink-2">/</kbd>
            ) : null}
        </label>
    );

    if (variant === 'field') {
        return <div className="relative">{field}{results}</div>;
    }

    return (
        <div role="dialog" aria-modal="true" aria-label="Search" className="anim-fade-in fixed inset-0 z-dialog flex flex-col bg-bg" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
            <div className="flex flex-none items-center gap-1 border-b border-line bg-surface py-2 pe-3 ps-1">
                <button type="button" onClick={onClose} aria-label="Close search" className="grid h-12 w-12 flex-none place-items-center rounded-control text-ink-2 hover:bg-surface-2 hover:text-ink">
                    <ChevronLeftIcon className="h-6 w-6 rtl:-scale-x-100" />
                </button>
                {field}
            </div>
            {results || (
                <p className="px-5 py-6 text-base text-ink-2">Find a car by reg, make or stock number, a customer by name or phone, or jump to a screen.</p>
            )}
        </div>
    );
};

export default SearchBody;
