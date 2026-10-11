
import React, { useEffect, useState } from 'react';
import { useData } from '../../hooks/useData';
import { Alert, Avatar, Badge, Button, Input } from '../ui';
import { ArrowPathIcon, ArrowTopRightOnSquareIcon, CalendarIcon, PhoneIcon, ChatBubbleLeftRightIcon } from '../icons';
import { Panel, PanelSection } from './SettingsKit';
import { SharedInboxMeta, subscribeToSharedInbox } from '../../services/salesAgentService';

const IntegrationsPage = () => {
    const {
        companyId,
        googleUser,
        handleGoogleSignIn,
        handleGoogleSignOut,
        refreshGoogleCalendarEvents,
        googleSyncError,
        googleConnectionMessage,
        crmSettings,
        updateCRMSettings,
    } = useData();
    const [sharedInbox, setSharedInbox] = useState<SharedInboxMeta | null>(null);

    useEffect(() => {
        if (!companyId) return;
        return subscribeToSharedInbox(companyId, setSharedInbox);
    }, [companyId]);

    const [isConnecting, setIsConnecting] = useState(false);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [showTwilioSetup, setShowTwilioSetup] = useState(false);
    const [showWhatsAppSetup, setShowWhatsAppSetup] = useState(false);

    // Twilio form
    const [twilioAccountSid, setTwilioAccountSid] = useState('');
    const [twilioAuthToken, setTwilioAuthToken] = useState('');
    const [twilioPhoneNumber, setTwilioPhoneNumber] = useState('');

    // WhatsApp form
    const [whatsappPhoneId, setWhatsappPhoneId] = useState('');
    const [whatsappBusinessId, setWhatsappBusinessId] = useState('');
    const [whatsappAccessToken, setWhatsappAccessToken] = useState('');

    const onConnectClick = () => {
        setIsConnecting(true);
        handleGoogleSignIn();
        setTimeout(() => setIsConnecting(false), 10000);
    };

    const onRefreshClick = async () => {
        setIsRefreshing(true);
        await refreshGoogleCalendarEvents();
        setIsRefreshing(false);
    };

    const handleSaveTwilio = async () => {
        await updateCRMSettings({
            twilioConnected: true,
            twilioAccountSid,
            twilioAuthToken,
            twilioPhoneNumber,
        });
        setShowTwilioSetup(false);
    };

    const handleDisconnectTwilio = async () => {
        if (confirm('Disconnect Twilio? Texts and calls stop until you connect it again.')) {
            await updateCRMSettings({
                twilioConnected: false,
                twilioAccountSid: undefined,
                twilioAuthToken: undefined,
                twilioPhoneNumber: undefined,
            });
        }
    };

    const handleSaveWhatsApp = async () => {
        await updateCRMSettings({
            whatsappConnected: true,
            whatsappPhoneId,
            whatsappBusinessId,
            whatsappAccessToken,
        });
        setShowWhatsAppSetup(false);
    };

    const handleDisconnectWhatsApp = async () => {
        if (confirm('Disconnect WhatsApp? Messages stop until you connect it again.')) {
            await updateCRMSettings({
                whatsappConnected: false,
                whatsappPhoneId: undefined,
                whatsappBusinessId: undefined,
                whatsappAccessToken: undefined,
            });
        }
    };

    const connected = (on: boolean, label = on ? 'Connected' : 'Not connected') => (
        <Badge variant={on ? 'success' : 'default'} dot={on}>{label}</Badge>
    );

    return (
        <Panel ariaLabel="Integrations">
            {/* Google Calendar */}
            <PanelSection
                icon={<CalendarIcon />}
                title="Google Calendar"
                description="Puts tasks and reminders in your calendar."
                action={connected(!!googleUser)}
            >
                {googleUser ? (
                    <div className="space-y-3">
                        <div className="flex flex-wrap items-center gap-3 rounded-control border border-line bg-bg p-3">
                            <Avatar name={googleUser.name || googleUser.email || 'Google'} src={googleUser.picture} />
                            <div className="min-w-0 flex-1">
                                <p className="truncate font-semibold text-ink">{googleUser.name}</p>
                                <p className="truncate text-sm text-ink-3">{googleUser.email}</p>
                            </div>
                            <Button size="sm" variant="ghost" onClick={handleGoogleSignOut}>Disconnect</Button>
                        </div>
                        <Button variant="secondary" icon={<ArrowPathIcon />} onClick={onRefreshClick} loading={isRefreshing} className="w-full sm:w-auto">
                            Refresh calendar
                        </Button>
                    </div>
                ) : (
                    <Button onClick={onConnectClick} loading={isConnecting} className="w-full sm:w-auto">
                        Connect Google
                    </Button>
                )}
                {googleConnectionMessage && !googleSyncError && !googleUser && (
                    <Alert tone="success" className="mt-4">{googleConnectionMessage}</Alert>
                )}
                {googleSyncError && (
                    <Alert tone="danger" className="mt-4">{googleSyncError}</Alert>
                )}
            </PanelSection>

            {/* Twilio SMS/Voice */}
            <PanelSection
                icon={<PhoneIcon />}
                title="Twilio texts and calls"
                description="Send texts and log calls to leads."
                action={connected(!!crmSettings?.twilioConnected)}
            >
                {crmSettings?.twilioConnected ? (
                    <div className="flex flex-wrap items-center gap-3 rounded-control border border-line bg-bg p-3">
                        <div className="min-w-0 flex-1">
                            <p className="num font-semibold text-ink">{crmSettings.twilioPhoneNumber}</p>
                            <p className="text-sm text-ink-3">Twilio number</p>
                        </div>
                        <Button size="sm" variant="ghost" onClick={handleDisconnectTwilio}>Disconnect</Button>
                    </div>
                ) : showTwilioSetup ? (
                    <div className="space-y-4">
                        <Input
                            id="twilio-sid"
                            label="Account SID"
                            type="text"
                            value={twilioAccountSid}
                            onChange={(e) => setTwilioAccountSid(e.target.value)}
                            placeholder="AC…"
                            className="font-mono"
                            autoComplete="off"
                        />
                        <Input
                            id="twilio-token"
                            label="Auth token"
                            type="password"
                            value={twilioAuthToken}
                            onChange={(e) => setTwilioAuthToken(e.target.value)}
                            autoComplete="off"
                        />
                        <Input
                            id="twilio-number"
                            label="Phone number"
                            type="tel"
                            value={twilioPhoneNumber}
                            onChange={(e) => setTwilioPhoneNumber(e.target.value)}
                            placeholder="+44…"
                            className="num"
                        />
                        <p className="text-sm text-ink-3">
                            Find these in the{' '}
                            <a href="https://console.twilio.com" target="_blank" rel="noopener" className="inline-flex items-center gap-1 font-semibold text-accent-text underline underline-offset-[3px]">
                                Twilio console <ArrowTopRightOnSquareIcon className="h-4 w-4" />
                            </a>
                        </p>
                        <div className="flex flex-wrap gap-2">
                            <Button onClick={handleSaveTwilio} disabled={!twilioAccountSid || !twilioAuthToken || !twilioPhoneNumber}>
                                Save and connect
                            </Button>
                            <Button variant="ghost" onClick={() => setShowTwilioSetup(false)}>Cancel</Button>
                        </div>
                    </div>
                ) : (
                    <Button variant="secondary" onClick={() => setShowTwilioSetup(true)} className="w-full sm:w-auto">Connect Twilio</Button>
                )}
            </PanelSection>

            {/* WhatsApp Business */}
            <PanelSection
                icon={<ChatBubbleLeftRightIcon />}
                title="WhatsApp Business"
                description="Send WhatsApp messages to leads and customers."
                action={sharedInbox
                    ? connected(!!sharedInbox.whatsappLive, sharedInbox.whatsappLive ? 'Shared · live' : 'Shared · not live')
                    : connected(!!crmSettings?.whatsappConnected)}
            >
                {sharedInbox ? (
                    <div className="rounded-control border border-line bg-bg p-3">
                        <p className="font-semibold text-ink">
                            Using the shared {sharedInbox.name || 'Radlett'} WhatsApp number
                        </p>
                        <p className="mt-1 text-sm leading-5 text-ink-3">
                            {sharedInbox.credentialCompanyId === companyId
                                ? 'This ledger holds the Meta connection. The other Dealer Ledger Pro on this inbox sends through it too.'
                                : 'You don’t connect WhatsApp here. Open Agent Inbox and send; it goes out on the shared number.'}
                            {!sharedInbox.whatsappLive ? ' Sending is off until WhatsApp is marked live on the shared inbox.' : ''}
                        </p>
                    </div>
                ) : crmSettings?.whatsappConnected ? (
                    <div className="flex flex-wrap items-center gap-3 rounded-control border border-line bg-bg p-3">
                        <div className="min-w-0 flex-1">
                            <p className="font-semibold text-ink">WhatsApp Business connected</p>
                            <p className="text-sm text-ink-3">Phone ID <span className="num">{crmSettings.whatsappPhoneId}</span></p>
                        </div>
                        <Button size="sm" variant="ghost" onClick={handleDisconnectWhatsApp}>Disconnect</Button>
                    </div>
                ) : showWhatsAppSetup ? (
                    <div className="space-y-4">
                        <Input
                            id="wa-phone-id"
                            label="Phone number ID"
                            type="text"
                            value={whatsappPhoneId}
                            onChange={(e) => setWhatsappPhoneId(e.target.value)}
                            className="font-mono"
                            autoComplete="off"
                        />
                        <Input
                            id="wa-business-id"
                            label="Business account ID"
                            type="text"
                            value={whatsappBusinessId}
                            onChange={(e) => setWhatsappBusinessId(e.target.value)}
                            className="font-mono"
                            autoComplete="off"
                        />
                        <Input
                            id="wa-token"
                            label="Access token"
                            hint="The permanent token, not the 24-hour one."
                            type="password"
                            value={whatsappAccessToken}
                            onChange={(e) => setWhatsappAccessToken(e.target.value)}
                            autoComplete="off"
                        />
                        <p className="text-sm text-ink-3">
                            The WhatsApp Business API needs Meta Business verification.{' '}
                            <a
                                href="https://developers.facebook.com/docs/whatsapp/cloud-api/get-started"
                                target="_blank"
                                rel="noopener"
                                className="inline-flex items-center gap-1 font-semibold text-accent-text underline underline-offset-[3px]"
                            >
                                Setup guide <ArrowTopRightOnSquareIcon className="h-4 w-4" />
                            </a>
                        </p>
                        <div className="flex flex-wrap gap-2">
                            <Button onClick={handleSaveWhatsApp} disabled={!whatsappPhoneId || !whatsappBusinessId || !whatsappAccessToken}>
                                Save and connect
                            </Button>
                            <Button variant="ghost" onClick={() => setShowWhatsAppSetup(false)}>Cancel</Button>
                        </div>
                    </div>
                ) : (
                    <Button variant="secondary" onClick={() => setShowWhatsAppSetup(true)} className="w-full sm:w-auto">Connect WhatsApp</Button>
                )}
            </PanelSection>

            {/* Auto Trader placeholder */}
            <PanelSection
                icon={
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round">
                        <path d="M12 2.75 2.75 7.375 12 12l9.25-4.625L12 2.75ZM2.75 16.625 12 21.25l9.25-4.625M2.75 12 12 16.625 21.25 12" />
                    </svg>
                }
                title="Auto Trader"
                description="Auto Trader leads arrive as forwarded emails for now. A direct link is on the way."
                action={<Badge>Coming soon</Badge>}
            />
        </Panel>
    );
};

export default IntegrationsPage;
