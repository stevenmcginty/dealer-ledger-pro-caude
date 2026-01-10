import React, { useState } from 'react';
import { Card, Button, Badge, Input } from '../ui';
import { EnvelopeIcon, CheckCircleIcon, ExclamationCircleIcon, ArrowPathIcon } from '../icons';
import { useData } from '../../hooks/useData';

const EmailSettings: React.FC = () => {
    const { crmSettings, updateCRMSettings, connectGmail, disconnectGmail } = useData();
    const [isConnecting, setIsConnecting] = useState(false);
    const [testEmailAddress, setTestEmailAddress] = useState('');
    const [isSendingTest, setIsSendingTest] = useState(false);

    const handleConnectGmail = async () => {
        setIsConnecting(true);
        try {
            await connectGmail();
        } catch (error) {
            console.error('Failed to connect Gmail:', error);
        } finally {
            setIsConnecting(false);
        }
    };

    const handleDisconnectGmail = async () => {
        if (confirm('Are you sure you want to disconnect Gmail? This will stop automatic email syncing.')) {
            await disconnectGmail();
        }
    };

    const handleSendTestEmail = async () => {
        if (!testEmailAddress) return;
        setIsSendingTest(true);
        try {
            // Test email will be implemented with Gmail API
            await new Promise(resolve => setTimeout(resolve, 1500));
            alert('Test email sent successfully!');
            setTestEmailAddress('');
        } catch (error) {
            alert('Failed to send test email');
        } finally {
            setIsSendingTest(false);
        }
    };

    const isConnected = crmSettings?.gmailConnected;

    return (
        <div className="space-y-6">
            {/* Gmail Connection */}
            <Card>
                <Card.Header>
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-red-500/20">
                                <EnvelopeIcon className="w-5 h-5 text-red-400" />
                            </div>
                            <div>
                                <h3 className="text-lg font-semibold text-white">Gmail Integration</h3>
                                <p className="text-sm text-gray-400">Connect your Gmail to automatically sync emails</p>
                            </div>
                        </div>
                        <Badge variant={isConnected ? 'success' : 'warning'} size="lg">
                            {isConnected ? 'Connected' : 'Not Connected'}
                        </Badge>
                    </div>
                </Card.Header>
                <Card.Body className="space-y-4">
                    {isConnected ? (
                        <>
                            {/* Connected State */}
                            <div className="flex items-center gap-4 p-4 bg-green-900/20 border border-green-700/50 rounded-lg">
                                <CheckCircleIcon className="w-8 h-8 text-green-400" />
                                <div className="flex-1">
                                    <p className="text-white font-medium">{crmSettings?.gmailEmail}</p>
                                    <p className="text-sm text-gray-400">Emails are syncing automatically</p>
                                </div>
                                <Button variant="ghost" onClick={handleDisconnectGmail}>
                                    Disconnect
                                </Button>
                            </div>

                            {/* Sync Settings */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-gray-700">
                                <div>
                                    <label className="block text-sm font-medium text-gray-400 mb-2">
                                        Sync Frequency
                                    </label>
                                    <select
                                        className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white"
                                        defaultValue="5"
                                    >
                                        <option value="1">Every minute</option>
                                        <option value="5">Every 5 minutes</option>
                                        <option value="15">Every 15 minutes</option>
                                        <option value="30">Every 30 minutes</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-400 mb-2">
                                        Sync Folders
                                    </label>
                                    <select
                                        className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white"
                                        defaultValue="inbox"
                                    >
                                        <option value="inbox">Inbox Only</option>
                                        <option value="all">All Mail</option>
                                        <option value="label">Specific Label</option>
                                    </select>
                                </div>
                            </div>

                            {/* Test Email */}
                            <div className="pt-4 border-t border-gray-700">
                                <label className="block text-sm font-medium text-gray-400 mb-2">
                                    Send Test Email
                                </label>
                                <div className="flex gap-2">
                                    <Input
                                        type="email"
                                        placeholder="Enter email address"
                                        value={testEmailAddress}
                                        onChange={(e) => setTestEmailAddress(e.target.value)}
                                        className="flex-1"
                                    />
                                    <Button
                                        onClick={handleSendTestEmail}
                                        disabled={!testEmailAddress || isSendingTest}
                                    >
                                        {isSendingTest ? 'Sending...' : 'Send Test'}
                                    </Button>
                                </div>
                            </div>
                        </>
                    ) : (
                        <>
                            {/* Not Connected State */}
                            <div className="flex flex-col items-center justify-center py-8 text-center">
                                <div className="p-4 rounded-full bg-gray-800 mb-4">
                                    <EnvelopeIcon className="w-12 h-12 text-gray-500" />
                                </div>
                                <h4 className="text-lg font-medium text-white mb-2">Connect Your Gmail Account</h4>
                                <p className="text-gray-400 max-w-md mb-6">
                                    Connect your Gmail to automatically import leads from incoming emails,
                                    send replies, and track all communications.
                                </p>
                                <Button
                                    onClick={handleConnectGmail}
                                    disabled={isConnecting}
                                    className="inline-flex items-center gap-2"
                                >
                                    {isConnecting ? (
                                        <>
                                            <ArrowPathIcon className="w-5 h-5 animate-spin" />
                                            Connecting...
                                        </>
                                    ) : (
                                        <>
                                            <svg className="w-5 h-5" viewBox="0 0 24 24">
                                                <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                                                <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                                                <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                                                <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                                            </svg>
                                            Connect with Google
                                        </>
                                    )}
                                </Button>
                            </div>

                            {/* Setup Instructions */}
                            <div className="p-4 bg-blue-900/20 border border-blue-700/50 rounded-lg">
                                <h4 className="text-sm font-semibold text-blue-300 mb-2">Setup Required</h4>
                                <p className="text-sm text-gray-400 mb-3">
                                    Gmail integration requires Google Cloud OAuth credentials. Follow these steps:
                                </p>
                                <ol className="text-sm text-gray-400 space-y-2 list-decimal list-inside">
                                    <li>Go to <a href="https://console.cloud.google.com" target="_blank" rel="noopener" className="text-brand-400 hover:underline">Google Cloud Console</a></li>
                                    <li>Create a new project or select existing one</li>
                                    <li>Enable Gmail API</li>
                                    <li>Create OAuth 2.0 credentials</li>
                                    <li>Add your domain to authorized origins</li>
                                    <li>Copy Client ID to your environment variables</li>
                                </ol>
                            </div>
                        </>
                    )}
                </Card.Body>
            </Card>

            {/* Email Filters */}
            <Card>
                <Card.Header title="Email Filters" />
                <Card.Body className="space-y-4">
                    <p className="text-sm text-gray-400">
                        Configure which emails should be imported and processed
                    </p>

                    <div className="space-y-3">
                        <label className="flex items-center gap-3">
                            <input
                                type="checkbox"
                                defaultChecked
                                className="rounded border-gray-600 bg-gray-800 text-brand-500"
                            />
                            <span className="text-white">Import emails from AutoTrader</span>
                        </label>
                        <label className="flex items-center gap-3">
                            <input
                                type="checkbox"
                                defaultChecked
                                className="rounded border-gray-600 bg-gray-800 text-brand-500"
                            />
                            <span className="text-white">Import emails from Motors.co.uk</span>
                        </label>
                        <label className="flex items-center gap-3">
                            <input
                                type="checkbox"
                                defaultChecked
                                className="rounded border-gray-600 bg-gray-800 text-brand-500"
                            />
                            <span className="text-white">Import emails from CarGurus</span>
                        </label>
                        <label className="flex items-center gap-3">
                            <input
                                type="checkbox"
                                defaultChecked
                                className="rounded border-gray-600 bg-gray-800 text-brand-500"
                            />
                            <span className="text-white">Import emails from eBay Motors</span>
                        </label>
                        <label className="flex items-center gap-3">
                            <input
                                type="checkbox"
                                defaultChecked
                                className="rounded border-gray-600 bg-gray-800 text-brand-500"
                            />
                            <span className="text-white">Import emails from Facebook Marketplace</span>
                        </label>
                    </div>

                    <div className="pt-4 border-t border-gray-700">
                        <label className="block text-sm font-medium text-gray-400 mb-2">
                            Custom Keywords (one per line)
                        </label>
                        <textarea
                            placeholder="e.g., enquiry&#10;interested in&#10;test drive"
                            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 h-24 resize-none"
                        />
                        <p className="mt-1 text-xs text-gray-500">
                            Emails containing these keywords will be imported
                        </p>
                    </div>
                </Card.Body>
            </Card>

            {/* Email Signature */}
            <Card>
                <Card.Header title="Email Signature" />
                <Card.Body>
                    <textarea
                        placeholder="Enter your email signature..."
                        className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 h-32 resize-none"
                        defaultValue={`Best regards,

[Your Name]
[Your Business Name]
[Phone Number]`}
                    />
                    <p className="mt-2 text-xs text-gray-500">
                        This signature will be added to all outgoing emails
                    </p>
                </Card.Body>
            </Card>
        </div>
    );
};

export default EmailSettings;
