import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon } from '../icons';
import { MONTH_NAMES, addDays, addMonths, buildMonthGrid, isoToParts, mondayIndex, partsToIso, todayIso } from '../../utils/ukDate';

interface CalendarPopoverProps {
    id: string;
    /** The element the pop-up hangs off (the whole field). */
    anchorRef: React.RefObject<HTMLElement | null>;
    /** Committed value, 'YYYY-MM-DD' or ''. */
    selected: string;
    /** Date to open on when nothing is selected (e.g. a valid half-typed entry). */
    initialFocus: string;
    allowClear: boolean;
    onPick: (iso: string) => void;
    onClose: (reason: 'escape' | 'outside' | 'tab') => void;
}

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const WEEKDAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const PANEL_WIDTH = 296;
/** Phones get a wider panel so every day is a 48px target. */
const PHONE_PANEL_WIDTH = 400;
const panelWidth = (vw: number) => Math.min(vw < 640 ? PHONE_PANEL_WIDTH : PANEL_WIDTH, vw - EDGE * 2);
const GAP = 6;
const EDGE = 8;

const longLabel = (iso: string) => {
    const p = isoToParts(iso);
    if (!p) return iso;
    return `${WEEKDAY_NAMES[mondayIndex(iso)]} ${p.d} ${MONTH_NAMES[p.m - 1]} ${p.y}`;
};

const iconBtn = 'inline-flex h-12 w-12 md:[@media(pointer:fine)]:h-10 md:[@media(pointer:fine)]:w-10 items-center justify-center rounded-control text-ink-2 transition-colors duration-quick ease-out hover:bg-surface-2 hover:text-ink active:bg-surface-3';

// A Monday-first month calendar on the theme's surface, portalled to <body> and placed with position: fixed,
// so modals and overflow-hidden tables never clip it. Pattern follows InlineCategoryCombobox.
const CalendarPopover = ({ id, anchorRef, selected, initialFocus, allowClear, onPick, onClose }: CalendarPopoverProps) => {
    const today = useMemo(() => todayIso(), []);
    const start = isoToParts(selected) ? selected : isoToParts(initialFocus) ? initialFocus : today;

    const [cursor, setCursor] = useState(start); // the day that owns keyboard focus
    const [mode, setMode] = useState<'days' | 'months'>('days');
    const [view, setView] = useState(() => { const p = isoToParts(start)!; return { y: p.y, m: p.m }; });
    const [pos, setPos] = useState<{ top: number; left: number; above: boolean; width: number } | null>(null);
    const [shown, setShown] = useState(false);

    const panelRef = useRef<HTMLDivElement>(null);
    const focusCursorRef = useRef(true); // move DOM focus to the cursor day after the next render
    const onCloseRef = useRef(onClose);
    onCloseRef.current = onClose;

    const place = () => {
        const anchor = anchorRef.current;
        if (!anchor) return;
        const r = anchor.getBoundingClientRect();
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        if (r.bottom < 0 || r.top > vh) { onCloseRef.current('outside'); return; }
        const width = panelWidth(vw);
        const height = panelRef.current?.offsetHeight ?? 360;
        const roomBelow = vh - r.bottom - GAP - EDGE;
        const roomAbove = r.top - GAP - EDGE;
        const above = roomBelow < height && roomAbove > roomBelow;
        let top = above ? r.top - GAP - height : r.bottom + GAP;
        top = Math.max(EDGE, Math.min(top, vh - height - EDGE));
        let left = r.left;
        if (left + width > vw - EDGE) left = vw - width - EDGE;
        left = Math.max(EDGE, left);
        setPos(prev => (prev && prev.top === top && prev.left === left && prev.above === above && prev.width === width ? prev : { top, left, above, width }));
    };

    // First placement, then again once the real panel height is known.
    useLayoutEffect(() => { place(); });

    useEffect(() => {
        const raf = requestAnimationFrame(() => setShown(true));
        const reposition = () => place();
        const onPointerDown = (e: PointerEvent) => {
            const t = e.target as Node;
            if (panelRef.current?.contains(t) || anchorRef.current?.contains(t)) return;
            onCloseRef.current('outside');
        };
        window.addEventListener('scroll', reposition, true);
        window.addEventListener('resize', reposition);
        document.addEventListener('pointerdown', onPointerDown);
        return () => {
            cancelAnimationFrame(raf);
            window.removeEventListener('scroll', reposition, true);
            window.removeEventListener('resize', reposition);
            document.removeEventListener('pointerdown', onPointerDown);
        };
    }, []);

    useEffect(() => {
        if (!focusCursorRef.current || !pos) return;
        focusCursorRef.current = false;
        const target = panelRef.current?.querySelector<HTMLElement>(mode === 'days' ? `[data-iso="${cursor}"]` : '[data-month-current="true"]');
        target?.focus({ preventScroll: true });
    }, [cursor, mode, pos]);

    const grid = useMemo(() => buildMonthGrid(view.y, view.m), [view]);
    const selParts = isoToParts(selected);
    const todayParts = isoToParts(today)!;

    const moveCursor = (iso: string) => {
        const p = isoToParts(iso);
        if (!p) return;
        focusCursorRef.current = true;
        setCursor(iso);
        if (p.y !== view.y || p.m !== view.m) setView({ y: p.y, m: p.m });
    };

    const stepMonth = (delta: number) => {
        const next = addMonths(partsToIso({ y: view.y, m: view.m, d: 1 }), delta);
        const p = isoToParts(next)!;
        setView({ y: p.y, m: p.m });
        const c = isoToParts(cursor)!;
        setCursor(partsToIso({ y: p.y, m: p.m, d: Math.min(c.d, new Date(p.y, p.m, 0).getDate()) }));
    };

    const onGridKeyDown = (e: React.KeyboardEvent) => {
        const moves: Record<string, () => string> = {
            ArrowLeft: () => addDays(cursor, -1),
            ArrowRight: () => addDays(cursor, 1),
            ArrowUp: () => addDays(cursor, -7),
            ArrowDown: () => addDays(cursor, 7),
            Home: () => addDays(cursor, -mondayIndex(cursor)),
            End: () => addDays(cursor, 6 - mondayIndex(cursor)),
            PageUp: () => addMonths(cursor, e.shiftKey ? -12 : -1),
            PageDown: () => addMonths(cursor, e.shiftKey ? 12 : 1),
        };
        const move = moves[e.key];
        if (!move) return;
        e.preventDefault();
        moveCursor(move());
    };

    const onPanelKeyDown = (e: React.KeyboardEvent) => {
        // The pop-up owns its keys; never let them reach a parent form or page shortcut.
        e.stopPropagation();
        if (e.key === 'Escape') {
            e.preventDefault();
            if (mode === 'months') { focusCursorRef.current = true; setMode('days'); return; }
            onClose('escape');
        }
    };

    const onPanelBlur = (e: React.FocusEvent) => {
        const next = e.relatedTarget as Node | null;
        if (next && !panelRef.current?.contains(next) && !anchorRef.current?.contains(next)) onClose('tab');
    };

    const pickMonth = (m: number) => {
        const c = isoToParts(cursor)!;
        const d = Math.min(c.d, new Date(view.y, m, 0).getDate());
        setView({ y: view.y, m });
        focusCursorRef.current = true;
        setCursor(partsToIso({ y: view.y, m, d }));
        setMode('days');
    };

    const titleId = `${id}-calendar-title`;
    const monthLabel = `${MONTH_NAMES[view.m - 1]} ${view.y}`;

    return createPortal(
        <div
            ref={panelRef}
            id={`${id}-calendar`}
            role="dialog"
            aria-modal="false"
            aria-labelledby={titleId}
            onKeyDown={onPanelKeyDown}
            onBlur={onPanelBlur}
            style={{ position: 'fixed', top: pos?.top ?? -9999, left: pos?.left ?? -9999, width: pos?.width ?? `min(${PANEL_WIDTH}px, calc(100vw - ${EDGE * 2}px))` }}
            className={`z-[70] select-none rounded-card border border-line bg-surface p-3 text-ink shadow-e3 transition duration-quick ease-out motion-reduce:transition-none ${shown && pos ? 'opacity-100 translate-y-0' : `opacity-0 ${pos?.above ? 'translate-y-1' : '-translate-y-1'}`}`}
        >
            <div className="mb-2 flex items-center justify-between gap-1">
                <button
                    type="button"
                    className={iconBtn}
                    aria-label={mode === 'days' ? 'Previous month' : 'Previous year'}
                    onClick={() => (mode === 'days' ? stepMonth(-1) : setView(v => ({ ...v, y: v.y - 1 })))}
                >
                    <ChevronLeftIcon className="h-5 w-5" />
                </button>
                <button
                    type="button"
                    id={titleId}
                    aria-label={mode === 'days' ? `${monthLabel}. Choose month and year` : `${view.y}. Back to days`}
                    aria-expanded={mode === 'months'}
                    onClick={() => { focusCursorRef.current = true; setMode(m => (m === 'days' ? 'months' : 'days')); }}
                    className="inline-flex min-h-[48px] md:[@media(pointer:fine)]:min-h-[40px] items-center gap-1 rounded-control px-3 text-base font-semibold text-ink transition-colors duration-quick ease-out hover:bg-surface-2"
                >
                    {mode === 'days' ? monthLabel : view.y}
                    <ChevronDownIcon className={`h-4 w-4 text-ink-3 transition-transform duration-quick ease-out motion-reduce:transition-none ${mode === 'months' ? 'rotate-180' : ''}`} />
                </button>
                <button
                    type="button"
                    className={iconBtn}
                    aria-label={mode === 'days' ? 'Next month' : 'Next year'}
                    onClick={() => (mode === 'days' ? stepMonth(1) : setView(v => ({ ...v, y: v.y + 1 })))}
                >
                    <ChevronRightIcon className="h-5 w-5" />
                </button>
            </div>

            {mode === 'days' ? (
                <div role="grid" aria-labelledby={titleId} onKeyDown={onGridKeyDown}>
                    <div role="row" className="grid grid-cols-7 pb-1">
                        {WEEKDAYS.map((w, i) => (
                            <div key={w} role="columnheader" aria-label={WEEKDAY_NAMES[i]} className="py-1 text-center font-mono text-xs font-semibold uppercase tracking-[0.06em] text-ink-3">
                                {w}
                            </div>
                        ))}
                    </div>
                    {[0, 1, 2, 3, 4, 5].map(week => (
                        <div key={week} role="row" className="grid grid-cols-7 sm:gap-0.5">
                            {grid.slice(week * 7, week * 7 + 7).map(cell => {
                                const isSelected = cell.iso === selected;
                                const isToday = cell.iso === today;
                                const tone = isSelected
                                    ? 'bg-accent font-semibold text-on-accent hover:bg-accent-hover'
                                    : isToday
                                        ? 'font-semibold text-accent-text ring-1 ring-inset ring-accent/50 hover:bg-accent-soft'
                                        : cell.inMonth
                                            ? 'text-ink hover:bg-surface-2'
                                            : 'text-ink-3 hover:bg-surface-2 hover:text-ink-2';
                                return (
                                    <div key={cell.iso} role="gridcell" aria-selected={isSelected}>
                                        <button
                                            type="button"
                                            data-iso={cell.iso}
                                            tabIndex={cell.iso === cursor ? 0 : -1}
                                            aria-label={longLabel(cell.iso)}
                                            aria-current={isToday ? 'date' : undefined}
                                            onClick={() => onPick(cell.iso)}
                                            className={`num relative flex h-12 w-full md:[@media(pointer:fine)]:h-10 items-center justify-center rounded-control text-sm transition-colors duration-quick ease-out focus-visible:[outline-offset:-2px] ${tone}`}
                                        >
                                            {cell.day}
                                            {isToday && (
                                                <span aria-hidden className={`absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full ${isSelected ? 'bg-on-accent' : 'bg-accent'}`} />
                                            )}
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    ))}
                </div>
            ) : (
                <div className="grid grid-cols-3 gap-1.5 py-1">
                    {MONTH_NAMES.map((name, i) => {
                        const m = i + 1;
                        const isSelected = !!selParts && selParts.y === view.y && selParts.m === m;
                        const isThisMonth = todayParts.y === view.y && todayParts.m === m;
                        const isView = m === view.m;
                        return (
                            <button
                                key={name}
                                type="button"
                                data-month-current={isView ? 'true' : undefined}
                                aria-label={`${name} ${view.y}`}
                                aria-pressed={isSelected}
                                onClick={() => pickMonth(m)}
                                className={`h-12 rounded-control text-sm font-semibold transition-colors duration-quick ease-out ${
                                    isSelected
                                        ? 'bg-accent text-on-accent hover:bg-accent-hover'
                                        : isThisMonth
                                            ? 'text-accent-text ring-1 ring-inset ring-accent/50 hover:bg-accent-soft'
                                            : 'text-ink hover:bg-surface-2'
                                }`}
                            >
                                {name.slice(0, 3)}
                            </button>
                        );
                    })}
                </div>
            )}

            <div className="mt-2 flex items-center justify-between gap-2 border-t border-line pt-2">
                {allowClear ? (
                    <button
                        type="button"
                        onClick={() => onPick('')}
                        className="min-h-[48px] md:[@media(pointer:fine)]:min-h-[40px] rounded-control px-3 text-sm font-semibold text-ink-2 transition-colors duration-quick ease-out hover:bg-surface-2 hover:text-ink"
                    >
                        Clear
                    </button>
                ) : <span />}
                <button
                    type="button"
                    onClick={() => onPick(today)}
                    className="min-h-[48px] md:[@media(pointer:fine)]:min-h-[40px] rounded-control px-3 text-sm font-semibold text-accent-text transition-colors duration-quick ease-out hover:bg-accent-soft"
                >
                    Today
                </button>
            </div>
        </div>,
        document.body,
    );
};

export default CalendarPopover;
