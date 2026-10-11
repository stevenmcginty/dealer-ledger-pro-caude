import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ExpenseCategory } from '../../types';
import { PlusIcon, ChevronDownIcon, MagnifyingGlassIcon } from '../icons';

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

    const optionClass = (active: boolean) =>
        `flex w-full items-center gap-2.5 rounded-control px-3 text-start text-sm transition-colors duration-quick ease-out ${active ? 'bg-accent-soft text-accent-soft-ink shadow-[inset_0_0_0_1px_rgb(var(--c-accent))]' : 'text-ink hover:bg-surface-2'}`;
    const addLabel = <span className="truncate">{onAddCategory ? 'Add' : 'Use'} &ldquo;{trimmed}&rdquo;</span>;

    return (
        <div className={`relative ${className}`}>
            <button
                ref={triggerRef}
                type="button"
                onClick={() => (open ? doClose() : doOpen())}
                aria-haspopup="listbox"
                aria-expanded={open}
                className="flex min-h-[40px] w-full items-center justify-between gap-2 rounded-control border border-line-strong bg-surface pe-2 ps-3 text-sm text-ink transition-colors duration-quick ease-out hover:border-ink-2 [@media(pointer:coarse)]:min-h-[48px]"
            >
                <span className={`truncate ${value ? 'text-ink' : 'text-ink-3'}`}>{value || placeholder}</span>
                <ChevronDownIcon className="h-4 w-4 flex-shrink-0 text-ink-3" />
            </button>

            {open && large && createPortal(
                // Phone: a bottom sheet. Wider screens: a dialog near the top.
                <div className="fixed inset-0 z-dialog flex items-end justify-center bg-scrim sm:items-start sm:p-6">
                    <div
                        ref={panelRef}
                        role="dialog"
                        aria-modal="true"
                        aria-label="Choose a category"
                        className="flex max-h-[85dvh] w-full flex-col overflow-hidden rounded-t-sheet border border-line bg-surface pb-[env(safe-area-inset-bottom)] shadow-e3 sm:mt-[6vh] sm:max-w-3xl sm:rounded-card sm:pb-0"
                    >
                        <div className="flex items-center gap-2 border-b border-line p-3">
                            <label className="flex min-h-[48px] min-w-0 flex-1 items-center gap-2 rounded-control border border-line-strong bg-surface px-3 text-ink-3 focus-within:border-focus focus-within:shadow-[0_0_0_1px_rgb(var(--c-focus))]">
                                <MagnifyingGlassIcon className="h-5 w-5 flex-none" />
                                <input
                                    ref={inputRef}
                                    value={search}
                                    onChange={e => { setSearch(e.target.value); setHighlight(0); }}
                                    onKeyDown={onInputKeyDown}
                                    aria-label="Search categories"
                                    placeholder={onAddCategory ? 'Search or add a category' : 'Search categories'}
                                    className="min-w-0 flex-1 border-0 bg-transparent py-2 text-base text-ink placeholder:text-ink-3 focus-visible:outline-none"
                                />
                            </label>
                            <button
                                type="button"
                                onClick={doClose}
                                className="min-h-[48px] flex-none rounded-control border border-line-strong bg-surface px-4 text-sm font-semibold text-ink transition-colors duration-quick ease-out hover:bg-surface-2"
                            >
                                Close
                            </button>
                        </div>
                        <ul className="grid grid-cols-2 gap-1.5 overflow-y-auto p-3 sm:grid-cols-3" role="listbox" aria-label="Categories">
                            {canAdd && (
                                <li className="col-span-2 sm:col-span-3">
                                    <button
                                        type="button"
                                        onMouseEnter={() => setHighlight(filtered.length)}
                                        onClick={addNew}
                                        className={`${optionClass(highlight === filtered.length)} min-h-[48px] border border-dashed border-line-strong font-semibold text-accent-text`}
                                    >
                                        <PlusIcon className="h-4 w-4 flex-shrink-0" />
                                        {addLabel}
                                    </button>
                                </li>
                            )}
                            {filtered.map((c, i) => (
                                <li key={c.id}>
                                    <button
                                        type="button"
                                        onMouseEnter={() => setHighlight(i)}
                                        onClick={() => choose(c.name)}
                                        className={`${optionClass(highlight === i)} min-h-[48px]`}
                                    >
                                        <span className={`h-3 w-3 flex-shrink-0 rounded-full ${c.color || 'bg-ink-3'}`} />
                                        <span className="truncate">{c.name}</span>
                                    </button>
                                </li>
                            ))}
                            {filtered.length === 0 && !canAdd && (
                                <li className="col-span-2 px-3 py-6 text-center text-sm text-ink-3 sm:col-span-3">No category called that</li>
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
                    className="z-dropdown overflow-hidden rounded-card border border-line bg-surface shadow-e2"
                >
                    <div className="border-b border-line p-2">
                        <input
                            ref={inputRef}
                            value={search}
                            onChange={e => { setSearch(e.target.value); setHighlight(0); }}
                            onKeyDown={onInputKeyDown}
                            aria-label="Search categories"
                            placeholder={onAddCategory ? 'Search or add' : 'Search'}
                            className="min-h-[40px] w-full rounded-control border border-line-strong bg-surface px-3 text-base text-ink placeholder:text-ink-3 focus-visible:border-focus focus-visible:shadow-[0_0_0_1px_rgb(var(--c-focus))] focus-visible:outline-none"
                        />
                    </div>
                    <ul className="max-h-60 space-y-0.5 overflow-y-auto p-1" role="listbox" aria-label="Categories">
                        {filtered.map((c, i) => (
                            <li key={c.id}>
                                <button
                                    type="button"
                                    onMouseEnter={() => setHighlight(i)}
                                    onClick={() => choose(c.name)}
                                    className={`${optionClass(highlight === i)} min-h-[40px] [@media(pointer:coarse)]:min-h-[48px]`}
                                >
                                    <span className={`h-3 w-3 flex-shrink-0 rounded-full ${c.color || 'bg-ink-3'}`} />
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
                                    className={`${optionClass(highlight === filtered.length)} min-h-[40px] font-semibold text-accent-text [@media(pointer:coarse)]:min-h-[48px]`}
                                >
                                    <PlusIcon className="h-4 w-4 flex-shrink-0" />
                                    {addLabel}
                                </button>
                            </li>
                        )}
                        {filtered.length === 0 && !canAdd && (
                            <li className="px-3 py-2 text-sm text-ink-3">No category called that</li>
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
