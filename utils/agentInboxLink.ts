/**
 * Getting from an owner alert to the conversation it is about.
 *
 * Two routes end up in the same place. A tapped push notification opens
 * `/app/agentInbox?conv=<id>` cold, so the id arrives on the URL; a toast
 * clicked while the app is already running has the id in hand and only needs to
 * hand it across. The Agent Inbox takes whichever is waiting when it mounts, and
 * listens for the second kind while it is on screen — a request that arrives
 * from the view it is already showing would otherwise go nowhere.
 *
 * Modelled on utils/quickAction.ts, which does the same job for the home screen
 * shortcuts.
 */

const EVENT = 'dlp:open-agent-conversation';

/** Set between the request and the Agent Inbox mounting, which is a tick or two. */
let pending = '';

/** Pull `?conv=` off the URL and strip it, so a refresh does not re-open it. */
export function takeConversationFromUrl(): string {
    const params = new URLSearchParams(window.location.search);
    const convId = params.get('conv') || '';
    if (!convId) return '';

    params.delete('conv');
    const rest = params.toString();
    window.history.replaceState({}, '', window.location.pathname + (rest ? `?${rest}` : '') + window.location.hash);
    return convId;
}

/** Ask for a conversation. Pair with `setView('agentInbox')`. */
export function requestAgentConversation(convId: string): void {
    if (!convId) return;
    pending = convId;
    window.dispatchEvent(new CustomEvent(EVENT, { detail: convId }));
}

/** Whatever was asked for while the Agent Inbox was not on screen. One shot. */
export function takeRequestedConversation(): string {
    const convId = pending;
    pending = '';
    return convId;
}

/** Requests that arrive while the Agent Inbox is already mounted. */
export function onAgentConversationRequest(handler: (convId: string) => void): () => void {
    const listener = (event: Event) => {
        const convId = String((event as CustomEvent).detail || '');
        if (convId) handler(convId);
    };
    window.addEventListener(EVENT, listener);
    return () => window.removeEventListener(EVENT, listener);
}
