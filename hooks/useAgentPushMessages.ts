import { useEffect, useRef } from 'react';
import { useUI } from './useUI';
import { useToast } from '../components/ui';
import { PushAlert, onPushAlert } from '../services/pushService';
import { requestAgentConversation } from '../utils/agentInboxLink';

/**
 * Owner alerts that arrive while the app is open.
 *
 * A browser will not raise a notification for a push it delivered to a visible
 * tab, so without this the alert would land silently in the service worker and
 * Steve would see nothing until he happened to look at the Agent Inbox. The
 * toast carries the same text as the notification and takes him to the
 * conversation it is about.
 *
 * Mounted once, in the app shell. Doing nothing at all is the correct behaviour
 * on a browser with no push support: the WhatsApp alert is unaffected.
 */
export const useAgentPushMessages = (): void => {
    const { setView } = useUI();
    const toast = useToast();

    // The toast context is a fresh object on every one of its own renders, and
    // resubscribing to Cloud Messaging each time would drop alerts arriving in
    // the gap. The listener is attached once and reads the latest handler.
    const show = useRef<(alert: PushAlert) => void>(() => {});
    show.current = alert => {
        const message = alert.body ? `${alert.title}: ${alert.body}` : alert.title;
        toast.info(message, {
            label: 'Open the conversation',
            onClick: () => {
                requestAgentConversation(alert.convId);
                setView('agentInbox');
            },
        });
    };

    useEffect(() => onPushAlert(alert => show.current(alert)), []);
};
