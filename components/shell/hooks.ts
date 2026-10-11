import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useData } from '../../hooks/useData';
import { useAgentInboxConversations } from '../../hooks/useAgentInboxConversations';
import { inboxWaitingCount, unreadFor } from '../../utils/agentInboxGroups';
import { playInboxChime, setInboxBadge } from '../../utils/inboxNotify';

/* ------------------------------------------------------------------ */
/* Breakpoint: phone < 768, rail 768-1023, sidebar >= 1024 (spec A3).  */
/* ------------------------------------------------------------------ */

export type Breakpoint = 'phone' | 'tablet' | 'desktop';

const TABLET = '(min-width: 768px)';
const DESKTOP = '(min-width: 1024px)';

const readBreakpoint = (): Breakpoint => {
    if (typeof window === 'undefined' || !window.matchMedia) return 'phone';
    if (window.matchMedia(DESKTOP).matches) return 'desktop';
    if (window.matchMedia(TABLET).matches) return 'tablet';
    return 'phone';
};

/** Only one nav is mounted at a time, so its hooks and listeners run once. */
export const useBreakpoint = (): Breakpoint => {
    const [bp, setBp] = useState<Breakpoint>(readBreakpoint);
    useEffect(() => {
        const queries = [window.matchMedia(TABLET), window.matchMedia(DESKTOP)];
        const update = () => setBp(readBreakpoint());
        queries.forEach(q => q.addEventListener('change', update));
        return () => queries.forEach(q => q.removeEventListener('change', update));
    }, []);
    return bp;
};

/* ------------------------------------------------------------------ */
/* Counts on the nav                                                   */
/* ------------------------------------------------------------------ */

export interface ShellCounts {
    /** Everything in the inbox waiting on a person: drafts, questions, unread. */
    inbox: number;
    /** Unread WhatsApp messages (part of `inbox`). */
    whatsappUnread: number;
    /**
     * The number on the Inbox tab and the app icon: unread WhatsApp only.
     * Email is left out; the shop does not always use the app for email.
     */
    inboxBadge: number;
    /** Cars not yet sold. */
    stock: number;
    /** Bank lines not yet reconciled. */
    bankToCheck: number;
}

/**
 * The counts the nav shows, plus the side effects the old Inbox header button
 * owned: the app-icon badge and the chime when something new lands. Call it
 * once, in the shell.
 */
export const useShellCounts = (): ShellCounts => {
    const { userId, vehicles, transactions } = useData();
    const conversations = useAgentInboxConversations();
    const prevCount = useRef<number | null>(null);
    const mountedAt = useRef(Date.now());

    const { pending, unread } = useMemo(() => inboxWaitingCount(conversations, userId), [conversations, userId]);
    const inbox = pending + unread;
    const whatsappUnread = useMemo(
        () => conversations.reduce((n, conv) => n + (conv.channel === 'whatsapp' ? unreadFor(conv, userId) : 0), 0),
        [conversations, userId],
    );

    // The chime still follows everything waiting (`inbox`); only the badge
    // number is WhatsApp-only.
    const inboxBadge = whatsappUnread;
    useEffect(() => {
        setInboxBadge(inboxBadge);
    }, [inboxBadge]);

    useEffect(() => {
        // Shared-inbox conversations arrive a tick after this company's, and
        // that extra count is not a new message. Ignore increases until the
        // first snapshots have settled; the push handler still chimes at once.
        const settled = Date.now() - mountedAt.current > 2500;
        if (settled && prevCount.current !== null && inbox > prevCount.current) playInboxChime();
        prevCount.current = inbox;
    }, [inbox]);

    const stock = useMemo(() => vehicles.filter(v => v.status !== 'Sold').length, [vehicles]);
    const bankToCheck = useMemo(() => transactions.filter(t => t.status === 'Unreconciled').length, [transactions]);

    return { inbox, whatsappUnread, inboxBadge, stock, bankToCheck };
};

/* ------------------------------------------------------------------ */
/* Focus trap for the Add sheet / popover and the More panel           */
/* ------------------------------------------------------------------ */

const FOCUSABLE =
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * While `active`: Tab and Shift+Tab cycle inside `ref`, Esc calls `onClose`,
 * and when it closes focus goes back to whatever had it before (the opener).
 */
export const useFocusTrap = (
    ref: React.RefObject<HTMLElement | null>,
    active: boolean,
    onClose: () => void,
    returnTo?: React.RefObject<HTMLElement | null>,
) => {
    const onCloseRef = useRef(onClose);
    onCloseRef.current = onClose;

    useEffect(() => {
        if (!active) return;
        const opener = (returnTo?.current as HTMLElement | null) || (document.activeElement as HTMLElement | null);
        const node = ref.current;
        const items = () => Array.from(node?.querySelectorAll<HTMLElement>(FOCUSABLE) || []).filter(el => el.offsetParent !== null || el === document.activeElement);
        // First real control, not the container.
        const first = items()[0];
        (first || node)?.focus({ preventScroll: true });

        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                onCloseRef.current();
                return;
            }
            if (e.key !== 'Tab' || !node) return;
            const list = items();
            if (!list.length) { e.preventDefault(); return; }
            const i = list.indexOf(document.activeElement as HTMLElement);
            const next = e.shiftKey
                ? (i <= 0 ? list[list.length - 1] : list[i - 1])
                : (i === -1 || i === list.length - 1 ? list[0] : list[i + 1]);
            e.preventDefault();
            next.focus();
        };
        document.addEventListener('keydown', onKey, true);
        return () => {
            document.removeEventListener('keydown', onKey, true);
            // Back to the opener, after React has finished this commit.
            requestAnimationFrame(() => opener?.focus?.({ preventScroll: true }));
        };
    }, [active, ref, returnTo]);
};

/** True when a key press should not be taken as a shortcut (typing, modifiers). */
export const isTypingTarget = (e: KeyboardEvent): boolean => {
    if (e.metaKey || e.ctrlKey || e.altKey) return true;
    const t = e.target as HTMLElement | null;
    return !!t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
};
