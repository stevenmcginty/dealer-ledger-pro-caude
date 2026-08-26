import React, { useCallback, useEffect, useState } from 'react';
import { Badge, Button, Card, useToast } from '../ui';
import { BellIcon, CheckCircleIcon, ExclamationTriangleIcon } from '../icons';
import { PushStatus, disablePush, enablePush, readPushStatus } from '../../services/pushService';
import { saveSalesAgentSettings } from '../../services/salesAgentService';

/**
 * Getting Dave's alerts onto the phone in Steve's pocket.
 *
 * There are two switches here and they are not the same switch, which is why
 * they are on one card. The toggle is a company setting — whether owner alerts
 * are pushed at all, saved next to the rest of the agent's settings. The button
 * is per device: a Cloud Messaging token addresses one browser, so a phone and
 * a desktop have to be turned on separately, and neither knows about the other.
 *
 * Every reason push cannot happen is spelled out rather than left as a button
 * that does nothing. Shade alerts are Android Chrome only — that is the phone
 * in Steve's pocket. iOS is told so, not walked through a home-screen install.
 */

/** Matches the switch on the settings page it sits inside. */
const Switch: React.FC<{
    checked: boolean;
    onChange: (next: boolean) => void;
    label: string;
    hint?: string;
    disabled?: boolean;
}> = ({ checked, onChange, label, hint, disabled }) => (
    <label className={`flex items-start gap-3 ${disabled ? 'opacity-50' : 'cursor-pointer'}`}>
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            aria-label={label}
            disabled={disabled}
            onClick={() => onChange(!checked)}
            className={`mt-0.5 relative inline-flex h-6 w-11 flex-shrink-0 rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-brand-500/50 ${
                checked ? 'bg-brand-600' : 'bg-gray-600'
            }`}
        >
            <span
                className={`inline-block h-5 w-5 mt-0.5 transform rounded-full bg-white shadow transition-transform duration-200 ${
                    checked ? 'translate-x-[1.375rem]' : 'translate-x-0.5'
                }`}
            />
        </button>
        <span className="min-w-0">
            <span className="block text-sm font-medium text-gray-200">{label}</span>
            {hint && <span className="block text-xs text-gray-500 mt-0.5">{hint}</span>}
        </span>
    </label>
);

/** What each state means, in the words somebody would use about their own phone. */
const DEVICE_STATE: Record<PushStatus, { label: string; detail: string; variant: 'success' | 'warning' | 'default' }> = {
    enabled: {
        label: 'On for this device',
        detail: 'Alerts will show on this device even when the app is closed.',
        variant: 'success',
    },
    available: {
        label: 'Off for this device',
        detail: 'On an Android phone in Chrome: turn it on, then pull down the notification shade. Approve sends Dave’s reply; Edit opens it to change.',
        variant: 'default',
    },
    blocked: {
        label: 'Blocked',
        detail: 'Notifications were refused for this site. Allow them in the browser’s site settings, then try again.',
        variant: 'warning',
    },
    'needs-install': {
        label: 'Not available here',
        detail: 'Dave’s shade alerts are Android only. Open this on your Android phone in Chrome.',
        variant: 'warning',
    },
    unsupported: {
        label: 'Not available here',
        detail: 'Dave’s lock-screen alerts are Android Chrome only. The WhatsApp ping still goes out, and the bell in the app still works.',
        variant: 'default',
    },
    unconfigured: {
        label: 'Not set up yet',
        detail: 'This build has no Cloud Messaging keys. Add VITE_FIREBASE_VAPID_KEY, VITE_FIREBASE_MESSAGING_SENDER_ID and VITE_FIREBASE_APP_ID and deploy again.',
        variant: 'default',
    },
};

interface PushNotificationsCardProps {
    companyId: string;
    /** The saved value of `settings.pushNotifications`, defaulting to on. */
    enabled: boolean;
    /**
     * Told about a save that happened here, so the page it sits on can keep its
     * own draft in step — otherwise its Save button would put the old value back.
     */
    onChanged?: (next: boolean) => void;
}

const PushNotificationsCard: React.FC<PushNotificationsCardProps> = ({ companyId, enabled, onChanged }) => {
    const toast = useToast();

    const [status, setStatus] = useState<PushStatus | null>(null);
    const [busy, setBusy] = useState(false);
    const [pushOn, setPushOn] = useState(enabled);

    // The card owns nothing the page's Save button touches, so it follows the
    // saved value rather than holding a draft of its own.
    useEffect(() => setPushOn(enabled), [enabled]);

    useEffect(() => {
        let live = true;
        readPushStatus().then(next => { if (live) setStatus(next); });
        return () => { live = false; };
    }, []);

    const handleToggle = useCallback(async (next: boolean) => {
        setPushOn(next);
        try {
            await saveSalesAgentSettings(companyId, { pushNotifications: next });
            onChanged?.(next);
        } catch (err: any) {
            setPushOn(!next);
            toast.error(err?.message || 'Could not change that.');
        }
    }, [companyId, onChanged, toast]);

    const handleEnable = async () => {
        setBusy(true);
        try {
            const next = await enablePush(companyId);
            setStatus(next);
            if (next === 'enabled') toast.success('This device will get Dave’s alerts.');
            else if (next === 'blocked') toast.error('Notifications are blocked for this site.');
            else toast.info('Alerts were not turned on for this device.');
        } catch (err: any) {
            toast.error(err?.message || 'Could not turn on alerts for this device.');
            setStatus(await readPushStatus());
        } finally {
            setBusy(false);
        }
    };

    const handleDisable = async () => {
        setBusy(true);
        try {
            setStatus(await disablePush(companyId));
            toast.success('This device will stop getting alerts.');
        } catch (err: any) {
            toast.error(err?.message || 'Could not turn off alerts for this device.');
        } finally {
            setBusy(false);
        }
    };

    const state = status ? DEVICE_STATE[status] : null;

    return (
        <Card padding="lg">
            <Card.Header
                action={state ? <Badge variant={state.variant} dot>{state.label}</Badge> : null}
            >
                Notifications
            </Card.Header>
            <Card.Body>
                <div className="space-y-6">
                    <Switch
                        label="Push alerts to your Android phone"
                        hint="Android Chrome only. Expand the notification for Approve and Edit. The WhatsApp ping still goes out either way."
                        checked={pushOn}
                        onChange={handleToggle}
                    />

                    <div className="flex flex-wrap items-start justify-between gap-4 rounded-lg bg-gray-900/40 border border-gray-700/50 p-4">
                        <div className="flex items-start gap-3 min-w-0">
                            <div className={`p-2 rounded-lg ${status === 'enabled' ? 'bg-emerald-500/20' : 'bg-gray-700/60'}`}>
                                {status === 'blocked' || status === 'needs-install' ? (
                                    <ExclamationTriangleIcon className="w-5 h-5 text-amber-400" />
                                ) : status === 'enabled' ? (
                                    <CheckCircleIcon className="w-5 h-5 text-emerald-400" />
                                ) : (
                                    <BellIcon className="w-5 h-5 text-gray-400" />
                                )}
                            </div>
                            <div className="min-w-0">
                                <p className="text-sm font-medium text-gray-200">This device</p>
                                <p className="text-sm text-gray-500 mt-0.5 max-w-xl">
                                    {state ? state.detail : 'Checking what this device can do…'}
                                </p>
                            </div>
                        </div>

                        {status === 'enabled' ? (
                            <Button variant="secondary" onClick={handleDisable} loading={busy} disabled={busy}>
                                Stop alerts here
                            </Button>
                        ) : (
                            <Button
                                onClick={handleEnable}
                                loading={busy}
                                disabled={busy || status !== 'available'}
                            >
                                Get Dave&rsquo;s alerts on this device
                            </Button>
                        )}
                    </div>

                    {pushOn === false && (
                        <p className="text-sm text-amber-400">
                            Push alerts are switched off for the whole company, so nothing will reach any
                            device until the toggle above is back on.
                        </p>
                    )}
                </div>
            </Card.Body>
        </Card>
    );
};

export default PushNotificationsCard;
