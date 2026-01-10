import React, { useState, useEffect } from 'react';
import { Card, Button, Badge, Input } from '../ui';
import { SparklesIcon, CheckCircleIcon, ExclamationCircleIcon, BoltIcon } from '../icons';
import { useData } from '../../hooks/useData';

const AISettings: React.FC = () => {
    const { crmSettings, updateCRMSettings, businessDetails } = useData();

    const [settings, setSettings] = useState({
        aiEnabled: crmSettings?.aiEnabled ?? true,
        aiModel: crmSettings?.aiModel ?? 'gemini',
        aiAutoAnalyze: crmSettings?.aiAutoAnalyze ?? true,
        aiAutoRespond: crmSettings?.aiAutoRespond ?? false,
        aiRequireApproval: crmSettings?.aiRequireApproval ?? true,
        autoCreateLeads: crmSettings?.autoCreateLeads ?? true,
        autoResponseEnabled: crmSettings?.autoResponseEnabled ?? false,
        autoResponseDelay: crmSettings?.autoResponseDelay ?? 5,
        leadNotifications: crmSettings?.leadNotifications ?? true,
    });

    const [isSaving, setIsSaving] = useState(false);
    const [hasChanges, setHasChanges] = useState(false);

    useEffect(() => {
        setHasChanges(true);
    }, [settings]);

    const handleSave = async () => {
        setIsSaving(true);
        try {
            await updateCRMSettings(settings);
            setHasChanges(false);
        } catch (error) {
            console.error('Failed to save settings:', error);
        } finally {
            setIsSaving(false);
        }
    };

    const handleToggle = (key: keyof typeof settings) => {
        setSettings(prev => ({ ...prev, [key]: !prev[key] }));
    };

    return (
        <div className="space-y-6">
            {/* AI Status */}
            <Card className={settings.aiEnabled ? 'border-brand-500/30' : ''}>
                <Card.Header>
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-lg ${settings.aiEnabled ? 'bg-brand-500/20' : 'bg-gray-800'}`}>
                                <SparklesIcon className={`w-5 h-5 ${settings.aiEnabled ? 'text-brand-400' : 'text-gray-500'}`} />
                            </div>
                            <div>
                                <h3 className="text-lg font-semibold text-white">AI Assistant</h3>
                                <p className="text-sm text-gray-400">Powered by Google Gemini</p>
                            </div>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input
                                type="checkbox"
                                checked={settings.aiEnabled}
                                onChange={() => handleToggle('aiEnabled')}
                                className="sr-only peer"
                            />
                            <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-600"></div>
                        </label>
                    </div>
                </Card.Header>
                {settings.aiEnabled && (
                    <Card.Body className="space-y-4 border-t border-gray-800">
                        <div className="flex items-center gap-2 p-3 bg-green-900/20 border border-green-700/50 rounded-lg">
                            <CheckCircleIcon className="w-5 h-5 text-green-400" />
                            <span className="text-sm text-green-300">AI is active and ready to assist</span>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-2">AI Model</label>
                            <select
                                value={settings.aiModel}
                                onChange={(e) => setSettings(prev => ({ ...prev, aiModel: e.target.value as 'gemini' | 'openai' }))}
                                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white"
                            >
                                <option value="gemini">Google Gemini (Recommended)</option>
                                <option value="openai">OpenAI GPT-4 (Coming Soon)</option>
                            </select>
                        </div>
                    </Card.Body>
                )}
            </Card>

            {/* Email Analysis */}
            <Card>
                <Card.Header title="Email Analysis" />
                <Card.Body className="space-y-4">
                    <div className="flex items-center justify-between p-3 bg-gray-800 rounded-lg">
                        <div>
                            <p className="font-medium text-white">Auto-analyze incoming emails</p>
                            <p className="text-sm text-gray-400">Extract vehicle info, customer intent, and suggest responses</p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input
                                type="checkbox"
                                checked={settings.aiAutoAnalyze}
                                onChange={() => handleToggle('aiAutoAnalyze')}
                                className="sr-only peer"
                            />
                            <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-600"></div>
                        </label>
                    </div>

                    <div className="flex items-center justify-between p-3 bg-gray-800 rounded-lg">
                        <div>
                            <p className="font-medium text-white">Auto-create leads from emails</p>
                            <p className="text-sm text-gray-400">Automatically create leads when new enquiries arrive</p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input
                                type="checkbox"
                                checked={settings.autoCreateLeads}
                                onChange={() => handleToggle('autoCreateLeads')}
                                className="sr-only peer"
                            />
                            <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-600"></div>
                        </label>
                    </div>
                </Card.Body>
            </Card>

            {/* Auto-Response */}
            <Card>
                <Card.Header>
                    <div className="flex items-center gap-2">
                        <BoltIcon className="w-5 h-5 text-amber-400" />
                        <span>Auto-Response</span>
                        <Badge variant={settings.autoResponseEnabled ? 'success' : 'default'} size="sm">
                            {settings.autoResponseEnabled ? 'Active' : 'Disabled'}
                        </Badge>
                    </div>
                </Card.Header>
                <Card.Body className="space-y-4">
                    <div className="flex items-center justify-between p-3 bg-gray-800 rounded-lg">
                        <div>
                            <p className="font-medium text-white">Enable auto-responses</p>
                            <p className="text-sm text-gray-400">Automatically send AI-generated replies to enquiries</p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input
                                type="checkbox"
                                checked={settings.autoResponseEnabled}
                                onChange={() => handleToggle('autoResponseEnabled')}
                                className="sr-only peer"
                            />
                            <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-600"></div>
                        </label>
                    </div>

                    {settings.autoResponseEnabled && (
                        <>
                            <div className="flex items-center justify-between p-3 bg-gray-800 rounded-lg">
                                <div>
                                    <p className="font-medium text-white">Require approval before sending</p>
                                    <p className="text-sm text-gray-400">Review AI responses before they're sent</p>
                                </div>
                                <label className="relative inline-flex items-center cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={settings.aiRequireApproval}
                                        onChange={() => handleToggle('aiRequireApproval')}
                                        className="sr-only peer"
                                    />
                                    <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-600"></div>
                                </label>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-400 mb-2">
                                    Response Delay (minutes)
                                </label>
                                <div className="flex items-center gap-4">
                                    <input
                                        type="range"
                                        min="1"
                                        max="60"
                                        value={settings.autoResponseDelay}
                                        onChange={(e) => setSettings(prev => ({ ...prev, autoResponseDelay: parseInt(e.target.value) }))}
                                        className="flex-1"
                                    />
                                    <span className="text-white font-medium w-16 text-right">
                                        {settings.autoResponseDelay} min
                                    </span>
                                </div>
                                <p className="text-xs text-gray-500 mt-1">
                                    Wait time before sending auto-response (appears more natural)
                                </p>
                            </div>

                            {!settings.aiRequireApproval && (
                                <div className="p-3 bg-amber-900/20 border border-amber-700/50 rounded-lg">
                                    <div className="flex items-start gap-2">
                                        <ExclamationCircleIcon className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                                        <div>
                                            <p className="text-sm font-medium text-amber-300">Automatic mode enabled</p>
                                            <p className="text-sm text-gray-400">
                                                Responses will be sent automatically without review. Make sure your templates and AI settings are properly configured.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </Card.Body>
            </Card>

            {/* Notifications */}
            <Card>
                <Card.Header title="Notifications" />
                <Card.Body className="space-y-4">
                    <div className="flex items-center justify-between p-3 bg-gray-800 rounded-lg">
                        <div>
                            <p className="font-medium text-white">New lead notifications</p>
                            <p className="text-sm text-gray-400">Get notified when new leads are created</p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input
                                type="checkbox"
                                checked={settings.leadNotifications}
                                onChange={() => handleToggle('leadNotifications')}
                                className="sr-only peer"
                            />
                            <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-600"></div>
                        </label>
                    </div>
                </Card.Body>
            </Card>

            {/* Save Button */}
            {hasChanges && (
                <div className="sticky bottom-4 flex justify-end">
                    <Button onClick={handleSave} disabled={isSaving} className="shadow-lg">
                        {isSaving ? 'Saving...' : 'Save Changes'}
                    </Button>
                </div>
            )}
        </div>
    );
};

export default AISettings;
