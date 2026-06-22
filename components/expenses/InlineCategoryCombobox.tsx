import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ExpenseCategory } from '../../types';
import { PlusIcon, ChevronDownIcon } from '../icons';

export interface CategoryComboboxHandle {
    open: () => void;
    close: () => void;
    isOpen: () => boolean;
}

interface InlineCategoryComboboxProps {
    categories: Pick<ExpenseCategory, 'id' | 'name' | 'color'>[];
    value?: string;
    /** Category names ordered most-recently-used first; floated to the top of the list. */
    recentFirst?: string[];
    onSelect: (name: string) => void;
    /** Persist a brand-new category. Omit for free-form lists (e.g. income) where the typed name is just used as-is. */
    onAddCategory?: (name: string) => void;
    /** Allow choosing a typed value not in the list without persisting it (free-form, e.g. income categories). */
    allowCustom?: boolean;
    /** Open as a big centered modal with a multi-column grid instead of a small anchored dropdown. */
    large?: boolean;
    placeholder?: string;
    className?: string;
}

// A compact, inline category picker: a trigger button that opens a searchable list in a portal
// (so the dropdown is never clipped by the reconciler table's overflow). Selecting a category
// fires onSelect immediately — the row commits in place with no modal.
const InlineCategoryCombobox = forwardRef<CategoryComboboxHandle, InlineCategoryComboboxProps>(({
    categories, value, recentFirst = [], onSelect, onAddCategory, allowCustom = false, large = false, placeholder = 'Categorise…', className = '',
}, ref) => {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');
    const [highlight, setHighlight] = useState(0);
    const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);

    const triggerRef = useRef<HTMLButtonElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const computePosition = useCallback(() => {
        const el = triggerRef.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        const width = Math.max(r.width, 240);
        const estHeight = 300;
        const below = r.bottom + 4;
        const placeAbove = below + estHeight > window.innerHeight && r.top > estHeight;
        const top = placeAbove ? Math.max(8, r.top - estHeight - 4) : below;
        let left = r.left;
        if (left + width > window.innerWidth - 8) left = Math.max(8, window.innerWidth - width - 8);
        setPos({ top, left, width });
    }, []);

    const doOpen = useCallback(() => { computePosition(); setSearch(''); setHighlight(0); setOpen(true); }, [computePosition]);
    const doClose = useCallback(() => setOpen(false), []);

    useImperativeHandle(ref, () => ({
        open: doOpen,
        close: doClose,
        isOpen: () => open,
    }), [doOpen, doClose, open]);

    useEffect(() => {
        if (!open) return;
        const raf = requestAnimationFrame(() => inputRef.current?.focus());
        const reposition = () => computePosition();
        window.addEventListener('scroll', reposition, true);
        window.addEventListener('resize', reposition);
        const onDocMouseDown = (e: MouseEvent) => {
            const target = e.target as Node;
            if (panelRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
            setOpen(false);
        };
        document.addEventListener('mousedown', onDocMouseDown);
        return () => {
            cancelAnimationFrame(raf);
            window.removeEventListener('scroll', reposition, true);
            window.removeEventListener('resize', reposition);
            document.removeEventListener('mousedown', onDocMouseDown);
        };
    }, [open, computePosition]);

    const ordered = useMemo(() => {
        const byName = new Map(categories.map(c => [c.name, c]));
        const seen = new Set<string>();
        const out: typeof categories = [];
        recentFirst.forEach(n => { const c = byName.get(n); if (c && !seen.has(n)) { out.push(c); seen.add(n); } });
        categories.forEach(c => { if (!seen.has(c.name)) { out.push(c); seen.add(c.name); } });
        return out;
    }, [categories, recentFirst]);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return ordered;
        return ordered.filter(c => c.name.toLowerCase().includes(q));
    }, [ordered, search]);

    const trimmed = search.trim();
    const exactExists = useMemo(() => categories.some(c => c.name.toLowerCase() === trimmed.toLowerCase()), [categories, trimmed]);
    const canAdd = trimmed !== '' && !exactExists && (!!onAddCategory || allowCustom);
    const optionCount = filtered.length + (canAdd ? 1 : 0);

    const choose = (name: string) => { onSelect(name); setOpen(false); setSearch(''); };
    const addNew = () => { if (!trimmed) return; if (onAddCategory) onAddCategory(trimmed); onSelect(trimmed); setOpen(false); setSearch(''); };

    const onInputKeyDown = (e: React.KeyboardEvent) => {
        // The combobox owns its keys while focused; never let them bubble to the queue's global handler.
        e.stopPropagation();
        if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight(h => Math.min(h + 1, optionCount - 1)); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight(h => Math.max(h - 1, 0)); }
        else if (e.key === 'Enter') {
            e.preventDefault();
            if (canAdd && highlight === filtered.length) addNew();
            else if (filtered[highlight]) choose(filtered[highlight].name);
            else if (canAdd) addNew();
        } else if (e.key === 'Escape') { e.preventDefault(); setOpen(false); triggerRef.current?.focus(); }
    };

    return (
        <div className={`relative ${className}`}>
            <button
                ref={triggerRef}
                type="button"
                onClick={() => (open ? doClose() : doOpen())}
                aria-haspopup="listbox"
                aria-expanded={open}
                className="w-full inline-flex items-center justify-between gap-1 px-2 py-1.5 rounded-md bg-gray-700 text-xs text-white ring-1 ring-inset ring-gray-600 hover:ring-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
                <span className={`truncate ${value ? 'text-white' : 'text-gray-400'}`}>{value || placeholder}</span>
                <ChevronDownIcon className="h-4 w-4 text-gray-400 flex-shrink-0" />
            </button>

            {open && large && createPortal(
                <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm sm:p-6">
                    <div
                        ref={panelRef}
                        className="mt-[6vh] flex max-h-[84vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-gray-800 shadow-2xl ring-1 ring-black/40 border border-gray-700"
                    >
                        <div className="flex items-center gap-2 border-b border-gray-700 p-3">
                            <input
                                ref={inputRef}
                                value={search}
                                onChange={e => { setSearch(e.target.value); setHighlight(0); }}
                                onKeyDown={onInputKeyDown}
                                placeholder={onAddCategory ? 'Search or add a category…' : 'Search categories…'}
                                className="w-full bg-gray-900 text-white text-base rounded-md px-3 py-2.5 ring-1 ring-inset ring-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-500"
                            />
                            <button
                                type="button"
                                onClick={doClose}
                                className="flex-shrink-0 rounded-md px-3 py-2.5 text-sm text-gray-300 ring-1 ring-inset ring-gray-700 hover:bg-gray-700 hover:text-white"
                            >
                                Close
                            </button>
                        </div>
                        <ul className="grid grid-cols-2 gap-1.5 overflow-y-auto p-3 sm:grid-cols-3" role="listbox">
                            {canAdd && (
                                <li className="sm:col-span-3">
                                    <button
                                        type="button"
                                        onMouseEnter={() => setHighlight(filtered.length)}
                                        onClick={addNew}
                                        className={`flex w-full items-center gap-2 rounded-md px-3 py-2.5 text-left text-sm ${highlight === filtered.length ? 'bg-brand-600 text-white' : 'text-brand-300 ring-1 ring-inset ring-gray-700 hover:bg-gray-700'}`}
                                    >
                                        <PlusIcon className="h-4 w-4 flex-shrink-0" />
                                        <span className="truncate">{onAddCategory ? 'Add' : 'Use'} &ldquo;{trimmed}&rdquo;</span>
                                    </button>
                                </li>
                            )}
                            {filtered.map((c, i) => (
                                <li key={c.id}>
                                    <button
                                        type="button"
                                        onMouseEnter={() => setHighlight(i)}
                                        onClick={() => choose(c.name)}
                                        className={`flex w-full items-center gap-2 rounded-md px-3 py-2.5 text-left text-sm ${highlight === i ? 'bg-brand-600 text-white' : 'text-gray-200 hover:bg-gray-700'}`}
                                    >
                                        <span className={`h-3 w-3 rounded-full flex-shrink-0 ${c.color || 'bg-gray-500'}`} />
                                        <span className="truncate">{c.name}</span>
                                    </button>
                                </li>
                            ))}
                            {filtered.length === 0 && !canAdd && (
                                <li className="px-3 py-6 text-center text-sm text-gray-500 sm:col-span-3">No matching categories</li>
                            )}
                        </ul>
                    </div>
                </div>,
                document.body,
            )}

            {open && !large && pos && createPortal(
                <div
                    ref={panelRef}
                    style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.width }}
                    className="z-[60] rounded-lg bg-gray-800 shadow-2xl ring-1 ring-black/40 border border-gray-700 overflow-hidden"
                >
                    <div className="p-2 border-b border-gray-700">
                        <input
                            ref={inputRef}
                            value={search}
                            onChange={e => { setSearch(e.target.value); setHighlight(0); }}
                            onKeyDown={onInputKeyDown}
                            placeholder={onAddCategory ? 'Search or add…' : 'Search…'}
                            className="w-full bg-gray-900 text-white text-sm rounded-md px-2 py-1.5 ring-1 ring-inset ring-gray-700 focus:outline-none focus:ring-brand-500"
                        />
                    </div>
                    <ul className="max-h-60 overflow-y-auto py-1" role="listbox">
                        {filtered.map((c, i) => (
                            <li key={c.id}>
                                <button
                                    type="button"
                                    onMouseEnter={() => setHighlight(i)}
                                    onClick={() => choose(c.name)}
                                    className={`w-full text-left flex items-center gap-2 px-3 py-1.5 text-sm ${highlight === i ? 'bg-brand-600 text-white' : 'text-gray-200 hover:bg-gray-700'}`}
                                >
                                    <span className={`h-3 w-3 rounded-full flex-shrink-0 ${c.color || 'bg-gray-500'}`} />
                                    <span className="truncate">{c.name}</span>
                                </button>
                            </li>
                        ))}
                        {canAdd && (
                            <li>
                                <button
                                    type="button"
                                    onMouseEnter={() => setHighlight(filtered.length)}
                                    onClick={addNew}
                                    className={`w-full text-left flex items-center gap-2 px-3 py-1.5 text-sm ${highlight === filtered.length ? 'bg-brand-600 text-white' : 'text-brand-300 hover:bg-gray-700'}`}
                                >
                                    <PlusIcon className="h-4 w-4 flex-shrink-0" />
                                    <span className="truncate">{onAddCategory ? 'Add' : 'Use'} &ldquo;{trimmed}&rdquo;</span>
                                </button>
                            </li>
                        )}
                        {filtered.length === 0 && !canAdd && (
                            <li className="px-3 py-2 text-xs text-gray-500">No matching categories</li>
                        )}
                    </ul>
                </div>,
                document.body,
            )}
        </div>
    );
});

InlineCategoryCombobox.displayName = 'InlineCategoryCombobox';

export default InlineCategoryCombobox;
