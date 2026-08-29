
import React, { useEffect, useState } from 'react';
import { useData } from '../../hooks/useData';
import { Card, Button, Badge, Input } from '../ui';
import Spinner from '../common/Spinner';
import { CalendarIcon, ExclamationTriangleIcon, CheckCircleIcon, PhoneIcon, ChatBubbleLeftRightIcon } from '../icons';
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
        if (confirm('Are you sure you want to disconnect Twilio?')) {
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
        if (confirm('Are you sure you want to disconnect WhatsApp?')) {
            await updateCRMSettings({
                whatsappConnected: false,
                whatsappPhoneId: undefined,
                whatsappBusinessId: undefined,
                whatsappAccessToken: undefined,
            });
        }
    };

    return (
        <div className="space-y-6">
            {/* Google Calendar */}
            <Card>
                <Card.Header>
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-green-500/20">
                                <CalendarIcon className="w-5 h-5 text-green-400" />
                            </div>
                            <div>
                                <h3 className="text-lg font-semibold text-white">Google Calendar</h3>
                                <p className="text-sm text-gray-400">Sync tasks and reminders</p>
                            </div>
                        </div>
                        <Badge variant={googleUser ? 'success' : 'default'}>
                            {googleUser ? 'Connected' : 'Not Connected'}
                        </Badge>
                    </div>
                </Card.Header>
                <Card.Body>
                    {googleUser ? (
                        <div className="space-y-4">
                            <div className="flex items-center gap-3 p-3 bg-gray-800 rounded-lg">
                                <img src={googleUser.picture} alt="profile" className="h-10 w-10 rounded-full" />
                                <div className="flex-1">
                                    <p className="text-white font-medium">{googleUser.name}</p>
                                    <p className="text-sm text-gray-400">{googleUser.email}</p>
                                </div>
                                <Button variant="ghost" onClick={handleGoogleSignOut}>Disconnect</Button>
                            </div>
                            <Button onClick={onRefreshClick} disabled={isRefreshing} className="w-full">
                                {isRefreshing ? <Spinner className="mr-2" /> : null}
                                Refresh Calendar
                            </Button>
                        </div>
                    ) : (
                        <Button onClick={onConnectClick} disabled={isConnecting} className="w-full">
                            {isConnecting ? <Spinner className="mr-2" /> : null}
                            Connect to Google
                        </Button>
                    )}
                    {googleConnectionMessage && !googleSyncError && !googleUser && (
                        <div className="mt-4 p-3 rounded-lg flex items-center gap-3 bg-green-900/50 border border-green-700">
                            <CheckCircleIcon className="h-5 w-5 text-green-400 flex-shrink-0" />
                            <p className="text-sm text-green-200">{googleConnectionMessage}</p>
                        </div>
                    )}
                    {googleSyncError && (
                        <div className="mt-4 p-3 rounded-lg flex items-center gap-3 bg-red-900/50 border border-red-700">
                            <ExclamationTriangleIcon className="h-5 w-5 text-red-400 flex-shrink-0" />
                            <p className="text-sm text-red-300">{googleSyncError}</p>
                        </div>
                    )}
                </Card.Body>
            </Card>

            {/* Twilio SMS/Voice */}
            <Card>
                <Card.Header>
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-red-500/20">
                                <PhoneIcon className="w-5 h-5 text-red-400" />
                            </div>
                            <div>
                                <h3 className="text-lg font-semibold text-white">Twilio SMS & Voice</h3>
                                <p className="text-sm text-gray-400">Send SMS and make calls</p>
                            </div>
                        </div>
                        <Badge variant={crmSettings?.twilioConnected ? 'success' : 'default'}>
                            {crmSettings?.twilioConnected ? 'Connected' : 'Not Connected'}
                        </Badge>
                    </div>
                </Card.Header>
                <Card.Body>
                    {crmSettings?.twilioConnected ? (
                        <div className="space-y-4">
                            <div className="flex items-center gap-3 p-3 bg-gray-800 rounded-lg">
                                <div className="flex-1">
                                    <p className="text-white font-medium">{crmSettings.twilioPhoneNumber}</p>
                                    <p className="text-sm text-gray-400">Twilio Phone Number</p>
                                </div>
                                <Button variant="ghost" onClick={handleDisconnectTwilio}>Disconnect</Button>
                            </div>
                        </div>
                    ) : showTwilioSetup ? (
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-400 mb-1">Account SID</label>
                                <Input
                                    type="text"
                                    value={twilioAccountSid}
                                    onChange={(e) => setTwilioAccountSid(e.target.value)}
                                    placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-400 mb-1">Auth Token</label>
                                <Input
                                    type="password"
                                    value={twilioAuthToken}
                                    onChange={(e) => setTwilioAuthToken(e.target.value)}
                                    placeholder="Your auth token"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-400 mb-1">Phone Number</label>
                                <Input
                                    type="text"
                                    value={twilioPhoneNumber}
                                    onChange={(e) => setTwilioPhoneNumber(e.target.value)}
                                    placeholder="+44xxxxxxxxxx"
                                />
                            </div>
                            <div className="flex gap-2">
                                <Button onClick={handleSaveTwilio} disabled={!twilioAccountSid || !twilioAuthToken || !twilioPhoneNumber}>
                                    Save & Connect
                                </Button>
                                <Button variant="ghost" onClick={() => setShowTwilioSetup(false)}>Cancel</Button>
                            </div>
                            <div className="p-3 bg-blue-900/20 border border-blue-700/50 rounded-lg">
                                <p className="text-sm text-gray-400">
                                    Get your credentials from{' '}
                                    <a href="https://console.twilio.com" target="_blank" rel="noopener" className="text-brand-400 hover:underline">
                                        Twilio Console
                                    </a>
                                </p>
                            </div>
                        </div>
                    ) : (
                        <div className="text-center py-4">
                            <p className="text-gray-400 mb-4">Send SMS messages and log calls with Twilio</p>
                            <Button onClick={() => setShowTwilioSetup(true)}>Connect Twilio</Button>
                        </div>
                    )}
                </Card.Body>
            </Card>

            {/* WhatsApp Business */}
            <Card>
                <Card.Header>
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-green-500/20">
                                <ChatBubbleLeftRightIcon className="w-5 h-5 text-green-400" />
                            </div>
                            <div>
                                <h3 className="text-lg font-semibold text-white">WhatsApp Business</h3>
                                <p className="text-sm text-gray-400">Send WhatsApp messages</p>
                            </div>
                        </div>
                        <Badge variant={sharedInbox || crmSettings?.whatsappConnected ? 'success' : 'default'}>
                            {sharedInbox
                                ? (sharedInbox.whatsappLive ? 'Shared · live' : 'Shared · not live')
                                : crmSettings?.whatsappConnected ? 'Connected' : 'Not Connected'}
                        </Badge>
                    </div>
                </Card.Header>
                <Card.Body>
                    {sharedInbox ? (
                        <div className="space-y-2">
                            <p className="text-white font-medium">
                                Using the shared {sharedInbox.name || 'Radlett'} WhatsApp number
                            </p>
                            <p className="text-sm text-gray-400">
                                {sharedInbox.credentialCompanyId === companyId
                                    ? 'This ledger holds the Meta connection. The other Dealer Ledger Pro on this inbox sends through it too.'
                                    : 'You do not connect WhatsApp here. Open Agent Inbox and send — it goes out on the shared number.'}
                                {!sharedInbox.whatsappLive ? ' Sending is off until WhatsApp is marked live on the shared inbox.' : ''}
                            </p>
                        </div>
                    ) : crmSettings?.whatsappConnected ? (
                        <div className="space-y-4">
                            <div className="flex items-center gap-3 p-3 bg-gray-800 rounded-lg">
                                <div className="flex-1">
                                    <p className="text-white font-medium">WhatsApp Business Connected</p>
                                    <p className="text-sm text-gray-400">Phone ID: {crmSettings.whatsappPhoneId}</p>
                                </div>
                                <Button variant="ghost" onClick={handleDisconnectWhatsApp}>Disconnect</Button>
                            </div>
                        </div>
                    ) : showWhatsAppSetup ? (
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-400 mb-1">Phone Number ID</label>
                                <Input
                                    type="text"
                                    value={whatsappPhoneId}
                                    onChange={(e) => setWhatsappPhoneId(e.target.value)}
                                    placeholder="Your Phone Number ID"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-400 mb-1">Business Account ID</label>
                                <Input
                                    type="text"
                                    value={whatsappBusinessId}
                                    onChange={(e) => setWhatsappBusinessId(e.target.value)}
                                    placeholder="Your Business Account ID"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-400 mb-1">Access Token</label>
                                <Input
                                    type="password"
                                    value={whatsappAccessToken}
                                    onChange={(e) => setWhatsappAccessToken(e.target.value)}
                                    placeholder="Your permanent access token"
                                />
                            </div>
                            <div className="flex gap-2">
                                <Button onClick={handleSaveWhatsApp} disabled={!whatsappPhoneId || !whatsappBusinessId || !whatsappAccessToken}>
                                    Save & Connect
                                </Button>
                                <Button variant="ghost" onClick={() => setShowWhatsAppSetup(false)}>Cancel</Button>
                            </div>
                            <div className="p-3 bg-blue-900/20 border border-blue-700/50 rounded-lg">
                                <p className="text-sm text-gray-400 mb-2">
                                    WhatsApp Business API requires Meta Business verification.
                                </p>
                                <a
                                    href="https://developers.facebook.com/docs/whatsapp/cloud-api/get-started"
                                    target="_blank"
                                    rel="noopener"
                                    className="text-sm text-brand-400 hover:underline"
                                >
                                    View setup guide →
                                </a>
                            </div>
                        </div>
                    ) : (
                        <div className="text-center py-4">
                            <p className="text-gray-400 mb-4">Send WhatsApp messages to leads and customers</p>
                            <Button onClick={() => setShowWhatsAppSetup(true)}>Connect WhatsApp</Button>
                        </div>
                    )}
                </Card.Body>
            </Card>

            {/* AutoTrader Integration Placeholder */}
            <Card>
                <Card.Header>
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-orange-500/20">
                                <svg className="w-5 h-5 text-orange-400" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
                                </svg>
                            </div>
                            <div>
                                <h3 className="text-lg font-semibold text-white">AutoTrader</h3>
                                <p className="text-sm text-gray-400">Sync leads from AutoTrader</p>
                            </div>
                        </div>
                        <Badge variant="default">Coming Soon</Badge>
                    </div>
                </Card.Header>
                <Card.Body>
                    <div className="text-center py-4">
                        <p className="text-gray-400">
                            Direct AutoTrader integration is coming soon. For now, AutoTrader leads arrive as forwarded emails and can be added to the pipeline manually.
                        </p>
                    </div>
                </Card.Body>
            </Card>
        </div>
    );
};

export default IntegrationsPage;
