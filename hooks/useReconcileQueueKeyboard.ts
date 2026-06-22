import { useCallback, useEffect, useRef, useState } from 'react';

export interface QueueKeyboardActions {
    /** Enter — accept the focused row's primary suggestion (then the row leaves the list and focus naturally lands on the next). */
    onAccept: (index: number) => void;
    /** c — open the focused row's inline category picker. */
    onCategorise: (index: number) => void;
    /** 0 / 2 / v — set or toggle the focused row's VAT rate. rate undefined = toggle. */
    onVat: (index: number, rate?: number) => void;
    /** t — commit the focused row as an own-account Transfer. */
    onTransfer: (index: number) => void;
    /** m — open the advanced Match modal for the focused row. */
    onMatch: (index: number) => void;
    /** n — start a new manual transaction. */
    onAddNew: () => void;
    /** u — undo the most recent commit. */
    onUndo: () => void;
}

interface UseReconcileQueueKeyboardOptions {
    enabled: boolean;
    itemCount: number;
    actions: QueueKeyboardActions;
}

const isTypingTarget = (t: EventTarget | null): boolean => {
    const el = t as HTMLElement | null;
    if (!el || !el.tagName) return false;
    return el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA' || el.isContentEditable;
};

/**
 * Keyboard fast-flow for the statement reconciler. Owns a focusedIndex over the visible
 * (unreconciled) queue and a window-level keydown listener that is active only while `enabled`.
 *
 * Engagement is opt-in: focusedIndex starts at -1 and command keys are inert until the user
 * presses j/k/arrow (or the component focuses a row on click) — so the global listener never
 * fires a commit before the user has deliberately entered the queue. Typing inside any input
 * (including the category combobox) is ignored so those controls own their own keys.
 *
 * Auto-advance is implicit: committing a row removes it from the list, so the element at the
 * same index becomes the next unreconciled row. We only clamp focusedIndex when the list shrinks.
 */
export function useReconcileQueueKeyboard({ enabled, itemCount, actions }: UseReconcileQueueKeyboardOptions) {
    const [focusedIndex, setFocusedIndex] = useState(-1);
    const [showLegend, setShowLegend] = useState(false);
    const rowRefs = useRef<Map<number, HTMLElement>>(new Map());
    const actionsRef = useRef(actions);
    actionsRef.current = actions;

    const registerRow = useCallback((index: number, el: HTMLElement | null) => {
        if (el) rowRefs.current.set(index, el);
        else rowRefs.current.delete(index);
    }, []);

    // Clamp against list size changes (rows leave on commit / list re-filters on snapshot).
    useEffect(() => {
        setFocusedIndex(prev => {
            if (itemCount === 0) return -1;
            if (prev < 0) return -1;
            return Math.min(prev, itemCount - 1);
        });
    }, [itemCount]);

    // Keep the focused row in view.
    useEffect(() => {
        if (focusedIndex < 0) return;
        rowRefs.current.get(focusedIndex)?.scrollIntoView({ block: 'nearest' });
    }, [focusedIndex]);

    useEffect(() => {
        if (!enabled) return;
        const handler = (e: KeyboardEvent) => {
            if (isTypingTarget(e.target)) return; // inputs/combobox own their keys

            if (e.key === '?') { e.preventDefault(); setShowLegend(s => !s); return; }

            const max = itemCount - 1;
            switch (e.key) {
                case 'j':
                case 'ArrowDown':
                    e.preventDefault();
                    setFocusedIndex(i => Math.min((i < 0 ? -1 : i) + 1, max));
                    break;
                case 'k':
                case 'ArrowUp':
                    e.preventDefault();
                    setFocusedIndex(i => (i <= 0 ? 0 : i - 1));
                    break;
                case 'Enter':
                    if (focusedIndex >= 0) { e.preventDefault(); actionsRef.current.onAccept(focusedIndex); }
                    break;
                case 'c':
                case 'C':
                    if (focusedIndex >= 0) { e.preventDefault(); actionsRef.current.onCategorise(focusedIndex); }
                    break;
                case '0':
                    if (focusedIndex >= 0) { e.preventDefault(); actionsRef.current.onVat(focusedIndex, 0); }
                    break;
                case '2':
                    if (focusedIndex >= 0) { e.preventDefault(); actionsRef.current.onVat(focusedIndex, 20); }
                    break;
                case 'v':
                case 'V':
                    if (focusedIndex >= 0) { e.preventDefault(); actionsRef.current.onVat(focusedIndex); }
                    break;
                case 't':
                case 'T':
                    if (focusedIndex >= 0) { e.preventDefault(); actionsRef.current.onTransfer(focusedIndex); }
                    break;
                case 'm':
                case 'M':
                    if (focusedIndex >= 0) { e.preventDefault(); actionsRef.current.onMatch(focusedIndex); }
                    break;
                case 'n':
                case 'N':
                    e.preventDefault();
                    actionsRef.current.onAddNew();
                    break;
                case 'u':
                case 'U':
                    e.preventDefault();
                    actionsRef.current.onUndo();
                    break;
                default:
                    break;
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [enabled, itemCount, focusedIndex]);

    return { focusedIndex, setFocusedIndex, registerRow, showLegend, setShowLegend };
}
