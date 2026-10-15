/**
 * Gmail-style swipe on one inbox row: drag it left or right with a finger and
 * a red Delete panel shows behind it. Let go far enough (or flick) and the row
 * slides off, folds away, then calls onDelete. Touch and pen only — a mouse
 * does nothing here, desktop keeps the delete in the thread header.
 *
 * With `enabled` false the row renders the same but does not swipe.
 *
 * Carries the Tailwind `group` so `group-last:` inside the row still knows
 * which row is last in its section.
 */

import React, { useEffect, useRef, useState } from 'react';
import { TrashIcon } from '../../icons';
import { lockAxis, pastThreshold, releaseOutcome, releaseVelocity, type SwipeAxis } from '../../../utils/swipeToDelete';

const SLIDE_MS = 180;
const COLLAPSE_MS = 180;
const SPRING_MS = 200;
/** A click straight after a sideways drag is the drag ending, not a tap. */
const SWALLOW_CLICK_MS = 400;

type Side = 'left' | 'right' | null;

interface Drag {
    id: number;
    x: number;
    y: number;
    axis: SwipeAxis;
    dx: number;
    samples: Array<{ x: number; t: number }>;
}

const prefersReducedMotion = (): boolean =>
    typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const buzz = () => {
    try {
        navigator.vibrate?.(10);
    } catch {
        // Not every phone lets a page vibrate.
    }
};

const SwipeToDelete: React.FC<{ enabled: boolean; onDelete: () => void; children: React.ReactNode }> = ({ enabled, onDelete, children }) => {
    const wrapRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);
    const drag = useRef<Drag | null>(null);
    const timers = useRef<number[]>([]);
    const removing = useRef(false);
    const deleted = useRef(false);
    const swallowUntil = useRef(0);
    const onDeleteRef = useRef(onDelete);
    onDeleteRef.current = onDelete;

    /** Which edge the red panel is showing on (swipe right reveals the left edge). */
    const [side, setSide] = useState<Side>(null);
    const [armed, setArmed] = useState(false);
    const sideRef = useRef<Side>(null);
    const armedRef = useRef(false);

    const later = (fn: () => void, ms: number) => {
        timers.current.push(window.setTimeout(fn, ms));
    };

    const showSide = (next: Side) => {
        if (sideRef.current === next) return;
        sideRef.current = next;
        setSide(next);
    };

    const showArmed = (next: boolean) => {
        if (armedRef.current === next) return;
        armedRef.current = next;
        setArmed(next);
        if (next) buzz();
    };

    const moveTo = (dx: number, ms = 0) => {
        const el = contentRef.current;
        if (!el) return;
        el.style.transition = ms ? `transform ${ms}ms ease-out` : 'none';
        el.style.transform = dx ? `translate3d(${dx}px, 0, 0)` : '';
    };

    const reset = () => {
        removing.current = false;
        deleted.current = false;
        moveTo(0);
        const wrap = wrapRef.current;
        if (wrap) {
            wrap.style.height = '';
            wrap.style.transition = '';
        }
        showSide(null);
        showArmed(false);
    };

    const finish = () => {
        if (deleted.current) return;
        deleted.current = true;
        onDeleteRef.current();
        // The list normally drops this row at once. If it is still here a moment
        // later (the customer has another thread on this tab), put it back.
        later(reset, 400);
    };

    const remove = (direction: 'left' | 'right') => {
        removing.current = true;
        if (prefersReducedMotion()) {
            finish();
            return;
        }
        const wrap = wrapRef.current;
        const width = wrap?.offsetWidth || 0;
        moveTo(direction === 'right' ? width : -width, SLIDE_MS);
        later(() => {
            const el = wrapRef.current;
            if (el) {
                el.style.height = `${el.offsetHeight}px`;
                void el.offsetHeight; // commit the start height before animating it away
                el.style.transition = `height ${COLLAPSE_MS}ms ease-out`;
                el.style.height = '0px';
            }
            later(finish, COLLAPSE_MS);
        }, SLIDE_MS);
    };

    const springBack = () => {
        moveTo(0, prefersReducedMotion() ? 0 : SPRING_MS);
        showArmed(false);
        later(() => {
            if (!drag.current && !removing.current) showSide(null);
        }, SPRING_MS);
    };

    useEffect(() => () => {
        timers.current.forEach(id => window.clearTimeout(id));
        timers.current = [];
        // Swiped away but the list re-rendered first: the swipe still counts.
        if (removing.current && !deleted.current) {
            deleted.current = true;
            onDeleteRef.current();
        }
    }, []);

    const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
        if (!enabled) return;
        if (e.pointerType !== 'touch' && e.pointerType !== 'pen') return;
        if (removing.current || drag.current) return;
        swallowUntil.current = 0;
        drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, axis: null, dx: 0, samples: [{ x: e.clientX, t: e.timeStamp }] };
    };

    const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
        const d = drag.current;
        if (!d || d.id !== e.pointerId || d.axis === 'y') return;
        const dx = e.clientX - d.x;
        if (!d.axis) {
            d.axis = lockAxis(dx, e.clientY - d.y);
            if (d.axis !== 'x') return;
            try {
                e.currentTarget.setPointerCapture(e.pointerId);
            } catch {
                // The pointer may already be gone; the move below still lands.
            }
        }
        d.dx = dx;
        d.samples.push({ x: e.clientX, t: e.timeStamp });
        if (d.samples.length > 12) d.samples.shift();
        moveTo(dx);
        showSide(dx > 0 ? 'right' : dx < 0 ? 'left' : sideRef.current);
        showArmed(pastThreshold(dx, wrapRef.current?.offsetWidth || 0));
    };

    const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
        const d = drag.current;
        if (!d || d.id !== e.pointerId) return;
        drag.current = null;
        if (d.axis !== 'x') return;
        swallowUntil.current = performance.now() + SWALLOW_CLICK_MS;
        const outcome = releaseOutcome({
            dx: d.dx,
            width: wrapRef.current?.offsetWidth || 0,
            velocity: releaseVelocity(d.samples),
        });
        if (outcome === 'cancel') springBack();
        else remove(outcome === 'delete-right' ? 'right' : 'left');
    };

    const onPointerCancel = (e: React.PointerEvent<HTMLDivElement>) => {
        const d = drag.current;
        if (!d || d.id !== e.pointerId) return;
        drag.current = null;
        if (d.axis === 'x') springBack();
    };

    const onClickCapture = (e: React.MouseEvent<HTMLDivElement>) => {
        if (performance.now() >= swallowUntil.current) return;
        e.preventDefault();
        e.stopPropagation();
    };

    return (
        <div
            ref={wrapRef}
            className="group relative overflow-hidden"
            style={enabled ? { touchAction: 'pan-y' } : undefined}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerCancel}
            onClickCapture={onClickCapture}
        >
            {side && (
                <div
                    aria-hidden
                    className={`absolute inset-0 flex items-center bg-danger px-6 text-on-danger ${side === 'right' ? 'justify-start' : 'justify-end'}`}
                >
                    <span
                        className="flex items-center gap-2 transition-transform duration-quick ease-out"
                        style={{ transform: armed ? 'scale(1.15)' : undefined }}
                    >
                        <TrashIcon className="h-5 w-5" />
                        <span className="text-sm font-semibold">Delete</span>
                    </span>
                </div>
            )}
            <div ref={contentRef} className="relative bg-surface">
                {children}
            </div>
        </div>
    );
};

export default SwipeToDelete;
