import React, { useCallback, useEffect, useId, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { XMarkIcon } from '../icons';
import IconButton from '../ui/IconButton';
import '../ui/primitives.css';

type ModalSize = 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl';

export interface ModalProps {
  children: React.ReactNode;
  onClose: () => void;
  size?: ModalSize;
  /** Optional header title with a close button. Content that draws its own header can leave it out. */
  title?: React.ReactNode;
  /** One line under the title. */
  description?: React.ReactNode;
  /** Action row pinned to the bottom while the body scrolls. */
  footer?: React.ReactNode;
  /** Scrim tap, Esc and the sheet's drag-down close it. Default true. */
  dismissible?: boolean;
  /** id of the heading that names the dialog, when the content has one. */
  labelledBy?: string;
  /**
   * Controlled mode. Leave out (the default) and the modal plays its exit,
   * then calls onClose so the parent can unmount it. Pass it and Esc, the
   * scrim and the close button call onClose at once; the exit plays when
   * the parent sets open to false, then onExited fires.
   */
  open?: boolean;
  /** Controlled mode: the exit has finished, safe to unmount. */
  onExited?: () => void;
  /** alertdialog for confirms that interrupt (delete, discard). */
  role?: 'dialog' | 'alertdialog';
  /** Where focus goes on open. Default: the panel itself, so a phone keyboard does not pop up. */
  initialFocusRef?: React.RefObject<HTMLElement | null>;
  /** Phones: the sheet takes its full 90dvh height (lists with their own search). */
  tall?: boolean;
}

const SIZE: Record<ModalSize, string> = {
  sm: 'sm:max-w-sm',
  md: 'sm:max-w-md',
  lg: 'sm:max-w-lg',
  xl: 'sm:max-w-xl',
  '2xl': 'sm:max-w-2xl',
  '3xl': 'sm:max-w-3xl',
  '4xl': 'sm:max-w-4xl',
};

const FOCUSABLE =
  'a[href],area[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),iframe,summary,[contenteditable="true"],[tabindex]:not([tabindex="-1"])';

const visible = (el: HTMLElement) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';

/** Tab only lands on one radio per group: the checked one, or the first. */
const tabbableRadio = (el: HTMLElement, all: HTMLElement[]) => {
  if (!(el instanceof HTMLInputElement) || el.type !== 'radio' || !el.name) return true;
  const group = all.filter((o): o is HTMLInputElement => o instanceof HTMLInputElement && o.type === 'radio' && o.name === el.name);
  const checked = group.find(o => o.checked);
  return checked ? checked === el : group[0] === el;
};

const tabbables = (panel: HTMLElement) => {
  const all = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(el => !el.hasAttribute('data-focus-guard') && visible(el));
  return all.filter(el => tabbableRadio(el, all));
};

/** Drag distance (px) or flick speed (px/ms) that closes the sheet. */
const DRAG_CLOSE_PX = 96;
const DRAG_CLOSE_SPEED = 0.6;
/** Longest exit (240ms) plus slack, in case animationend never comes. */
const EXIT_FALLBACK_MS = 420;

/**
 * The one modal surface. Under 640px it is a bottom sheet with a grab handle
 * (max 90dvh, content scrolls inside, footer pinned); from 640px it is a
 * centred dialog. Real dialog semantics: role="dialog" + aria-modal, the rest
 * of the page is inert, Tab stays inside, Esc closes, and focus goes back to
 * whatever opened it.
 */
const Modal: React.FC<ModalProps> = ({
  children,
  onClose,
  size = 'md',
  title,
  description,
  footer,
  dismissible = true,
  labelledBy,
  open,
  onExited,
  role = 'dialog',
  initialFocusRef,
  tall = false,
}) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const scrimRef = useRef<HTMLDivElement>(null);
  const closingRef = useRef(false);
  const downOnScrim = useRef(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const onExitedRef = useRef(onExited);
  onExitedRef.current = onExited;
  const dismissibleRef = useRef(dismissible);
  dismissibleRef.current = dismissible;
  const controlled = open !== undefined;
  const titleId = useId();
  const descId = useId();

  // ---- Page lock: inert the page behind, stop its scroll, remember the opener ----
  const openerRef = useRef<HTMLElement | null>(null);
  const releaseRef = useRef<(() => void) | null>(null);

  const lock = useCallback(() => {
    if (releaseRef.current) return;
    const root = rootRef.current;
    const inerted: Element[] = [];
    for (const el of Array.from(document.body.children)) {
      if (el === root || el.hasAttribute('inert') || el.hasAttribute('data-modal-exempt')) continue;
      if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE') continue;
      el.setAttribute('inert', '');
      inerted.push(el);
    }
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    releaseRef.current = () => {
      inerted.forEach(el => el.removeAttribute('inert'));
      document.body.style.overflow = prevOverflow;
      // Hand focus back to the opener, unless the person has already moved it somewhere else.
      const active = document.activeElement;
      const opener = openerRef.current;
      const focusIsOurs = !active || active === document.body || !!root?.contains(active);
      if (focusIsOurs && opener && opener.isConnected && typeof opener.focus === 'function') {
        opener.focus({ preventScroll: true });
      }
    };
  }, []);

  /** Unlock now (idempotent): background live again, focus back on the opener. */
  const release = useCallback(() => {
    const r = releaseRef.current;
    releaseRef.current = null;
    r?.();
  }, []);

  useLayoutEffect(() => {
    openerRef.current = document.activeElement as HTMLElement | null;
    lock();
    return release;
  }, [lock, release]);

  // Name the dialog and move focus inside it.
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    if (!title && !labelledBy) {
      const heading = panel.querySelector<HTMLElement>('[data-modal-title],h1,h2,h3,h4');
      if (heading) {
        if (!heading.id) heading.id = `${titleId}-h`;
        panel.setAttribute('aria-labelledby', heading.id);
      }
    }
    if (!panel.contains(document.activeElement)) {
      const preferred = initialFocusRef?.current ?? panel.querySelector<HTMLElement>('[autofocus],[data-autofocus]');
      (preferred ?? panel).focus({ preventScroll: true });
    }
    // Focus is placed once, on open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Play the exit animation, then call done. Unlocks at the start so focus returns at once. */
  const playExit = useCallback((done: () => void) => {
    closingRef.current = true;
    const panel = panelRef.current;
    const scrim = scrimRef.current;
    release();
    scrim?.setAttribute('data-closing', '');
    if (!panel) { done(); return; }
    let finished = false;
    const finish = () => { if (!finished && closingRef.current) { finished = true; done(); } };
    panel.addEventListener('animationend', e => { if (e.target === panel) finish(); }, { once: true });
    window.setTimeout(finish, EXIT_FALLBACK_MS);
    // A drag-to-close keeps its inline transform, so the exit runs on from where the finger let go.
    panel.removeAttribute('data-dragging');
    panel.setAttribute('data-closing', '');
  }, [release]);

  /** Esc, scrim, close button, drag. */
  const requestClose = useCallback(() => {
    if (closingRef.current) return;
    if (controlled) { onCloseRef.current(); return; }
    playExit(() => onCloseRef.current());
  }, [controlled, playExit]);

  // Controlled: play the exit when the parent closes us; undo it if they reopen mid-exit.
  useEffect(() => {
    if (!controlled) return;
    if (open === false && !closingRef.current) {
      playExit(() => onExitedRef.current?.());
    } else if (open === true && closingRef.current) {
      closingRef.current = false;
      scrimRef.current?.removeAttribute('data-closing');
      panelRef.current?.removeAttribute('data-closing');
      lock();
    }
  }, [controlled, open, playExit, lock]);

  // Esc still works when focus has fallen to <body> (a tap on the scrim of a
  // non-dismissible modal, say). Only the top-most modal answers.
  useEffect(() => {
    const onDocKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || !dismissibleRef.current) return;
      const active = document.activeElement;
      if (active && active !== document.body) return;
      const roots = document.querySelectorAll('[data-modal-root]');
      if (roots[roots.length - 1] !== rootRef.current) return;
      requestClose();
    };
    document.addEventListener('keydown', onDocKey);
    return () => document.removeEventListener('keydown', onDocKey);
  }, [requestClose]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      if (e.defaultPrevented || !dismissible) return;
      e.stopPropagation();
      requestClose();
      return;
    }
    if (e.key !== 'Tab') return;
    const panel = panelRef.current;
    // Focus in a pop-up portalled out of the panel (a calendar) manages itself.
    if (!panel || !(e.target instanceof Node) || !panel.contains(e.target)) return;
    const items = tabbables(panel);
    if (items.length === 0) { e.preventDefault(); panel.focus(); return; }
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === panel)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  };

  /** Focus guards at both ends catch anything the key handler misses (radio groups, roving tabindex). */
  const wrapTo = (end: 'first' | 'last') => () => {
    const panel = panelRef.current;
    if (!panel) return;
    const items = tabbables(panel);
    const target = end === 'first' ? items[0] : items[items.length - 1];
    (target ?? panel).focus();
  };

  // ---- Sheet drag (handle only, phones) ----
  const drag = useRef<{ y: number; t: number; dy: number; v: number; id: number } | null>(null);
  const onHandleDown = (e: React.PointerEvent) => {
    const panel = panelRef.current;
    if (!panel || !dismissible || closingRef.current) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { y: e.clientY, t: performance.now(), dy: 0, v: 0, id: e.pointerId };
    panel.setAttribute('data-settled', '');
    panel.setAttribute('data-dragging', '');
    panel.style.transition = 'none';
  };
  const onHandleMove = (e: React.PointerEvent) => {
    const d = drag.current;
    const panel = panelRef.current;
    if (!d || !panel || e.pointerId !== d.id) return;
    const raw = e.clientY - d.y;
    // Pulling up resists; pulling down follows the finger.
    const dy = raw < 0 ? raw / 6 : raw;
    const now = performance.now();
    d.v = (dy - d.dy) / Math.max(1, now - d.t);
    d.t = now;
    d.dy = dy;
    panel.style.transform = `translateY(${dy}px)`;
    if (scrimRef.current) scrimRef.current.style.opacity = String(Math.max(0.2, 1 - Math.max(0, dy) / (panel.offsetHeight || 1)));
  };
  const onHandleUp = (e: React.PointerEvent) => {
    const d = drag.current;
    const panel = panelRef.current;
    drag.current = null;
    if (!d || !panel || e.pointerId !== d.id) return;
    if (d.dy > DRAG_CLOSE_PX || d.v > DRAG_CLOSE_SPEED) {
      requestClose();
      return;
    }
    panel.removeAttribute('data-dragging');
    panel.style.transition = 'transform var(--dur-3) var(--ease-sheet)';
    panel.style.transform = '';
    if (scrimRef.current) scrimRef.current.style.opacity = '';
  };

  const modalContent = (
    <div
      ref={rootRef}
      data-modal-root=""
      className="fixed inset-0 z-dialog flex items-end justify-center sm:items-center sm:p-4 print:p-0"
      onKeyDown={onKeyDown}
    >
      <div
        ref={scrimRef}
        aria-hidden="true"
        className="fl-scrim absolute inset-0 bg-scrim print:hidden"
        onPointerDown={e => { downOnScrim.current = e.target === e.currentTarget; }}
        onClick={e => {
          if (dismissible && downOnScrim.current && e.target === e.currentTarget) requestClose();
          downOnScrim.current = false;
        }}
      />
      <div
        ref={panelRef}
        role={role}
        aria-modal="true"
        aria-labelledby={title ? titleId : labelledBy}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        onAnimationEnd={e => { if (e.target === e.currentTarget && !closingRef.current) e.currentTarget.setAttribute('data-settled', ''); }}
        className={[
          'fl-panel relative flex max-h-[90dvh] w-full flex-col overflow-hidden bg-surface text-ink shadow-e3 outline-none',
          'rounded-t-sheet pb-[env(safe-area-inset-bottom)] sm:rounded-card sm:pb-0',
          'sm:max-h-[min(90dvh,960px)]',
          tall ? 'h-[90dvh] sm:h-auto' : '',
          SIZE[size],
          'print:max-h-full print:h-auto print:overflow-visible print:rounded-none print:bg-transparent print:shadow-none print:animate-none',
        ].join(' ')}
      >
        <span tabIndex={0} data-focus-guard="" aria-hidden="true" className="sr-only" onFocus={wrapTo('last')} />

        {/* Grab handle: phones only. Drag it down to close. */}
        <div
          aria-hidden="true"
          className={`flex flex-none justify-center pb-1.5 pt-2 sm:hidden print:hidden ${dismissible ? 'cursor-grab touch-none active:cursor-grabbing' : ''}`}
          onPointerDown={onHandleDown}
          onPointerMove={onHandleMove}
          onPointerUp={onHandleUp}
          onPointerCancel={onHandleUp}
        >
          <span className="h-[5px] w-10 rounded-full bg-line-strong" />
        </div>

        {title && (
          <div className="flex flex-none items-start gap-3 px-5 pb-3 pt-2 sm:pt-5">
            <div className="min-w-0 flex-1 pt-1.5">
              <h2 id={titleId} className="text-[1.375rem] font-bold leading-7 tracking-[-0.01em] text-ink">{title}</h2>
              {description && <p id={descId} className="mt-1 text-sm leading-5 text-ink-2">{description}</p>}
            </div>
            {dismissible && (
              <IconButton label="Close" icon={<XMarkIcon />} onClick={requestClose} className="-me-2 -mt-1" />
            )}
          </div>
        )}

        <div className={`flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain print:overflow-visible ${title ? 'px-5 pb-5' : ''}`}>
          {children}
        </div>

        {footer && (
          <div className="flex flex-none flex-wrap justify-end gap-2 border-t border-line bg-surface px-4 py-3 sm:px-5 [&>*]:flex-1 sm:[&>*]:flex-none">
            {footer}
          </div>
        )}

        <span tabIndex={0} data-focus-guard="" aria-hidden="true" className="sr-only" onFocus={wrapTo('first')} />
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};

export default Modal;
