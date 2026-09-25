import { useEffect, useRef } from 'react';
import { useToast } from '../components/ui';
import { useData } from './useData';
import { useUI } from './useUI';
import { PushAlert, onPushAlert, showAlertNotification, syncPushToken } from '../services/pushService';
import { approveAgentDraft, formatQueuedSend } from '../services/salesAgentService';
import { requestAgentConversation, requestDraftReview, takeDraftActionFromUrl, takeDraftReviewFromUrl } from '../utils/agentInboxLink';
import { playInboxChime } from '../utils/inboxNotify';

/**
 * A customer email. The server titles those "Name · Email" (or plain "Email"
 * when it has no customer push); they live in the Agent Inbox only, with no toast.
 */
const isEmailTitle = (title: string): boolean => /(^|·\s*)Email\s*$/i.test(title.trim());

/**
 * Owner alerts that arrive while the app is open.
 *
 * A browser will not raise a notification for a push it delivered to a visible
 * tab, so without this the alert would land silently in the service worker and
 * Steve would see nothing until he happened to look at the bell. Each one is a
 * toast with a button to the thread in the Agent Inbox; nothing moves the page
 * until he taps. Emails get no toast — they live in the Agent Inbox only.
 *
 * Mounted once, in the app shell. Doing nothing at all is the correct behaviour
 * on a browser with no push support: the WhatsApp alert is unaffected.
 */
export const useAgentPushMessages = (): void => {
    const toast = useToast();
    const { companyId } = useData();
    const { setView } = useUI();
    const setViewRef = useRef(setView);
    setViewRef.current = setView;

    /**
     * Edit, or a plain tap on the shade: go to the Agent Inbox on that thread.
     * The bell is for approving without leaving the page; a tap from the phone
     * is a decision to deal with it properly (Steve, 26 Aug).
     */
    const openInInbox = (convId: string) => {
        if (!convId) return;
        setViewRef.current('agentInbox');
        requestAgentConversation(convId);
    };

    const companyIdRef = useRef(companyId);
    companyIdRef.current = companyId;
    const toastRef = useRef(toast);
    toastRef.current = toast;

    const waitingApprove = useRef('');
    const approveFromShade = useRef<(convId: string) => void>(() => {});
    approveFromShade.current = convId => {
        requestDraftReview(convId);
        const cid = companyIdRef.current;
        if (!convId) return;
        if (!cid) {
            waitingApprove.current = convId;
            return;
        }
        void approveAgentDraft(cid, convId)
            .then(result => {
                const queued = result.sendAfter && result.sendAfter > Date.now() + 5000;
                toastRef.current.success(
                    queued ? `Queued to send at ${formatQueuedSend(result.sendAfter)}.` : 'Sent.'
                );
            })
            .catch((err: any) => {
                toastRef.current.error(err?.message || 'That draft was not sent.');
            });
    };

    // The toast context is a fresh object on every one of its own renders, and
    // resubscribing to Cloud Messaging each time would drop alerts arriving in
    // the gap. The listener is attached once and reads the latest handler.
    const show = useRef<(alert: PushAlert) => void>(() => {});
    show.current = alert => {
        playInboxChime();
        // Into the shade as well, with Approve / Edit, so it is not lost the
        // moment the app is swiped away.
        void showAlertNotification(alert);

        // Never switch page on arrival: Steve may be half way through a form.
        // A toast offers the thread; only a tap goes there.
        if (alert.kind === 'draft' || alert.kind === 'question') {
            toastRef.current.info(alert.body ? `${alert.title}: ${alert.body}` : alert.title || 'Dave needs you', {
                label: 'Review',
                onClick: () => openInInbox(alert.convId),
            });
            return;
        }

        const isWa = !isEmailTitle(alert.title) && (/\bwhatsapp\b/i.test(alert.title) || /\bwhatsapp\b/i.test(alert.body) || alert.kind === 'inbound');
        const displayTitle = alert.title || 'WhatsApp';
        const displayBody = alert.body || (alert.title ? '' : 'New message');

        if (isWa) {
            toastRef.current.whatsapp(
                displayBody || 'New message received',
                {
                    label: 'Reply',
                    onClick: () => {
                        setViewRef.current('agentInbox');
                        requestAgentConversation(alert.convId);
                    },
                },
                displayTitle
            );
        } else if (!isEmailTitle(alert.title)) {
            const message = alert.body ? `${alert.title}: ${alert.body}` : alert.title;
            toast.info(message, {
                label: 'Open inbox',
                onClick: () => {
                    setViewRef.current('agentInbox');
                    requestAgentConversation(alert.convId);
                },
            });
        }
    };

    useEffect(() => {
        if (!companyId || !waitingApprove.current) return;
        const convId = waitingApprove.current;
        waitingApprove.current = '';
        approveFromShade.current(convId);
    }, [companyId]);

    useEffect(() => onPushAlert(alert => show.current(alert)), []);

    // Put this device back on the list every time the app opens. Tokens rotate
    // and dead ones are pruned server-side; without this a phone drops off
    // silently and never comes back.
    useEffect(() => {
        if (!companyId) return;
        void syncPushToken(companyId);
    }, [companyId]);

    // A cold-start tap lands on `?dave=`. Convert it to the same event the bell
    // already listens for, after the bell has subscribed (this effect runs after
    // the children's). Re-firing whatever is already pending covers a toast that
    // arrived before the bell was on screen.
    useEffect(() => {
        const fromUrl = takeDraftReviewFromUrl();
        const action = takeDraftActionFromUrl();
        if (!fromUrl) return;
        if (action === 'approve') approveFromShade.current(fromUrl);
        else openInInbox(fromUrl);
    }, []);

    // A background notification click focuses this tab and posts the id here,
    // rather than navigating to whatever page was last open.
    useEffect(() => {
        if (!('serviceWorker' in navigator)) return;
        const onMessage = (event: MessageEvent) => {
            const type = event.data?.type;
            const convId = String(event.data?.convId || '');
            if (type === 'dlp:dave-approve') approveFromShade.current(convId);
            else if (type === 'dlp:dave-review') openInInbox(convId);
            else if (type === 'dlp:dave-alert') {
                // The worker has already put it in the shade. The FCM onMessage
                // path does not run when the worker owns the push, so the chime
                // and routing live here as well.
                const kind = String(event.data?.kind || '');
                playInboxChime();
                if (kind === 'draft' || kind === 'question') {
                    const draftTitle = String(event.data?.title || '') || 'Dave needs you';
                    const draftBody = String(event.data?.body || '');
                    toastRef.current.info(draftBody ? `${draftTitle}: ${draftBody}` : draftTitle, {
                        label: 'Review',
                        onClick: () => openInInbox(convId),
                    });
                    return;
                }
                const rawTitle = String(event.data?.title || '');
                const body = String(event.data?.body || '');
                const isWa = !isEmailTitle(rawTitle) && (/\bwhatsapp\b/i.test(rawTitle) || /\bwhatsapp\b/i.test(body) || kind === 'inbound');
                const title = rawTitle || (isWa ? 'WhatsApp' : 'Inbox');

                if (isWa) {
                    toastRef.current.whatsapp(
                        body || 'New message received',
                        {
                            label: 'Reply',
                            onClick: () => {
                                setViewRef.current('agentInbox');
                                requestAgentConversation(convId);
                            },
                        },
                        title
                    );
                } else if (!isEmailTitle(rawTitle)) {
                    toastRef.current.info(body ? `${title}: ${body}` : 'New message', {
                        label: 'Open inbox',
                        onClick: () => {
                            setViewRef.current('agentInbox');
                            requestAgentConversation(convId);
                        },
                    });
                }
            }
        };
        navigator.serviceWorker.addEventListener('message', onMessage);
        return () => navigator.serviceWorker.removeEventListener('message', onMessage);
    }, []);
};
