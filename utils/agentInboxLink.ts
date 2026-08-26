/**
 * Getting from an owner alert to the conversation it is about.
 *
 * A tapped push used to open `/app/agentInbox?conv=<id>`, which is the wrong
 * place: Steve is approving a draft, not changing page. `?dave=<id>` is picked
 * up by the notification bell instead, and a toast or a service-worker message
 * while the app is already running has the id in hand and only needs to hand
 * it across. The bell takes whichever is waiting when it mounts.
 *
 * The Agent Inbox still understands `?conv=` and the event below, for a tap
 * that happens while that screen is already open.
 *
 * Modelled on utils/quickAction.ts, which does the same job for the home screen
 * shortcuts.
 */

const INBOX_EVENT = 'dlp:open-agent-conversation';
const REVIEW_EVENT = 'dlp:dave-review';
const APPROVE_EVENT = 'dlp:dave-approve';

/** Set between the request and the Agent Inbox mounting, which is a tick or two. */
let pendingInbox = '';

/** Set between a tap and the notification bell mounting. */
let pendingReview = '';
let pendingApprove = '';

const stripParam = (key: string): string => {
    const params = new URLSearchParams(window.location.search);
    const value = params.get(key) || '';
    if (!value) return '';

    params.delete(key);
    const rest = params.toString();
    window.history.replaceState({}, '', window.location.pathname + (rest ? `?${rest}` : '') + window.location.hash);
    return value;
};

/** Pull `?conv=` off the URL and strip it, so a refresh does not re-open it. */
export function takeConversationFromUrl(): string {
    return stripParam('conv');
}

/** Pull `?dave=` off the URL. The notification bell opens this draft. */
export function takeDraftReviewFromUrl(): string {
    return stripParam('dave');
}

/** `approve` from the phone shade button; empty for a plain tap. */
export function takeDraftActionFromUrl(): string {
    return stripParam('daveAction');
}

/** Ask for a conversation. Pair with `setView('agentInbox')`. */
export function requestAgentConversation(convId: string): void {
    if (!convId) return;
    pendingInbox = convId;
    window.dispatchEvent(new CustomEvent(INBOX_EVENT, { detail: convId }));
}

/** Open the notification bell on this conversation, without changing page. */
export function requestDraftReview(convId: string): void {
    pendingReview = convId;
    window.dispatchEvent(new CustomEvent(REVIEW_EVENT, { detail: convId }));
}

/** Approve the held draft from a phone notification action. */
export function requestDraftApprove(convId: string): void {
    pendingApprove = convId;
    window.dispatchEvent(new CustomEvent(APPROVE_EVENT, { detail: convId }));
}

/** Whatever was asked for while the Agent Inbox was not on screen. One shot. */
export function takeRequestedConversation(): string {
    const convId = pendingInbox;
    pendingInbox = '';
    return convId;
}

/** Whatever was asked for while the notification bell was not on screen. One shot. */
export function takeRequestedDraftReview(): string {
    const convId = pendingReview;
    pendingReview = '';
    return convId;
}

/** Requests that arrive while the Agent Inbox is already mounted. */
export function onAgentConversationRequest(handler: (convId: string) => void): () => void {
    const listener = (event: Event) => {
        const convId = String((event as CustomEvent).detail || '');
        if (convId) handler(convId);
    };
    window.addEventListener(INBOX_EVENT, listener);
    return () => window.removeEventListener(INBOX_EVENT, listener);
}

/** Requests that arrive while the notification bell is already mounted. */
export function onDraftReviewRequest(handler: (convId: string) => void): () => void {
    const listener = (event: Event) => {
        const convId = String((event as CustomEvent).detail || '');
        if (convId) handler(convId);
    };
    window.addEventListener(REVIEW_EVENT, listener);
    return () => window.removeEventListener(REVIEW_EVENT, listener);
}

export function takeRequestedDraftApprove(): string {
    const convId = pendingApprove;
    pendingApprove = '';
    return convId;
}

export function onDraftApproveRequest(handler: (convId: string) => void): () => void {
    const listener = (event: Event) => {
        const convId = String((event as CustomEvent).detail || '');
        if (convId) handler(convId);
    };
    window.addEventListener(APPROVE_EVENT, listener);
    return () => window.removeEventListener(APPROVE_EVENT, listener);
}
