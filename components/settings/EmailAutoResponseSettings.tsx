import React, { useState, useEffect } from 'react';
import { useData } from '../../hooks/useData';
import {
    EnvelopeIcon,
    CheckCircleIcon,
    ExclamationTriangleIcon,
    ClockIcon,
    ShieldCheckIcon,
    PlusIcon,
    XMarkIcon,
    ArrowPathIcon,
    CogIcon,
    EditIcon
} from '../icons';
import { WHITELIST_PRESETS, DEFAULT_AUTO_RESPONSE_CONFIG, formatBusinessHours } from '../../services/autoResponseService';

const EmailAutoResponseSettings: React.FC = () => {
    const { crmSettings, updateCRMSettings, businessDetails } = useData();

    // Local state for form fields
    const [isSaving, setIsSaving] = useState(false);
    const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    // Whitelist state
    const [newWhitelistEmail, setNewWhitelistEmail] = useState('');
    const [whitelistedSenders, setWhitelistedSenders] = useState<string[]>([]);
    const [whitelistMode, setWhitelistMode] = useState<'allow_all' | 'whitelist_only'>('whitelist_only');

    // Business hours state
    const [businessHoursEnabled, setBusinessHoursEnabled] = useState(true);
    const [businessHoursStart, setBusinessHoursStart] = useState('09:00');
    const [businessHoursEnd, setBusinessHoursEnd] = useState('18:00');
    const [businessDays, setBusinessDays] = useState<number[]>([1, 2, 3, 4, 5]);

    // Auto-response state
    const [autoResponseEnabled, setAutoResponseEnabled] = useState(false);
    const [autoResponseDelay, setAutoResponseDelay] = useState(5);
    const [complexKeywordsText, setComplexKeywordsText] = useState('');

    // Response template & signature
    const [emailSignature, setEmailSignature] = useState('');
    const [responseTemplate, setResponseTemplate] = useState('');

    // Load settings when component mounts
    useEffect(() => {
        if (crmSettings) {
            setWhitelistedSenders(crmSettings.whitelistedSenders || []);
            setWhitelistMode(crmSettings.whitelistMode || 'whitelist_only');
            setBusinessHoursEnabled(crmSettings.businessHoursEnabled ?? true);
            setBusinessHoursStart(crmSettings.businessHoursStart || '09:00');
            setBusinessHoursEnd(crmSettings.businessHoursEnd || '18:00');
            setBusinessDays(crmSettings.businessDays || [1, 2, 3, 4, 5]);
            setAutoResponseEnabled(crmSettings.autoResponseEnabled ?? false);
            setAutoResponseDelay(crmSettings.autoResponseDelay ?? 5);
            setComplexKeywordsText(
                (crmSettings.complexQuestionKeywords || DEFAULT_AUTO_RESPONSE_CONFIG.complexKeywords).join('\n')
            );
            setEmailSignature(crmSettings.emailSignature || '');
            setResponseTemplate(crmSettings.autoResponseTemplate || `Hi {{firstName}},

Thank you for your enquiry about {{subject}}.

We've received your message and one of our team will be in touch shortly to assist you.

If you need immediate assistance, please don't hesitate to give us a call.`);
        }
    }, [crmSettings]);

    const handleSave = async () => {
        setIsSaving(true);
        setSaveMessage(null);
        try {
            await updateCRMSettings({
                whitelistedSenders,
                whitelistMode,
                businessHoursEnabled,
                businessHoursStart,
                businessHoursEnd,
                businessDays,
                autoResponseEnabled,
                autoResponseDelay: Math.max(5, autoResponseDelay),
                complexQuestionKeywords: complexKeywordsText.split('\n').map(k => k.trim()).filter(Boolean),
                emailSignature,
                autoResponseTemplate: responseTemplate,
            });
            setSaveMessage({ type: 'success', text: 'Settings saved successfully' });
        } catch (error) {
            setSaveMessage({ type: 'error', text: 'Failed to save settings' });
        } finally {
            setIsSaving(false);
            setTimeout(() => setSaveMessage(null), 3000);
        }
    };

    const addWhitelistEmail = () => {
        const email = newWhitelistEmail.trim().toLowerCase();
        if (email && !whitelistedSenders.includes(email)) {
            setWhitelistedSenders([...whitelistedSenders, email]);
            setNewWhitelistEmail('');
        }
    };

    const removeWhitelistEmail = (email: string) => {
        setWhitelistedSenders(whitelistedSenders.filter(e => e !== email));
    };

    const addPreset = (preset: keyof typeof WHITELIST_PRESETS) => {
        const emails = WHITELIST_PRESETS[preset];
        const newList = [...new Set([...whitelistedSenders, ...emails])];
        setWhitelistedSenders(newList);
    };

    const toggleBusinessDay = (day: number) => {
        if (businessDays.includes(day)) {
            setBusinessDays(businessDays.filter(d => d !== day));
        } else {
            setBusinessDays([...businessDays, day].sort());
        }
    };

    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-semibold text-white">Email & Auto-Response</h2>
                    <p className="text-sm text-gray-400 mt-1">
                        Configure how incoming emails are handled and auto-responded to
                    </p>
                </div>
                <button
                    onClick={handleSave}
                    disabled={isSaving}
                    className="px-4 py-2 bg-brand-500 text-white rounded-lg hover:bg-brand-600 disabled:opacity-50 flex items-center gap-2"
                >
                    {isSaving ? (
                        <>
                            <ArrowPathIcon className="w-4 h-4 animate-spin" />
                            Saving...
                        </>
                    ) : (
                        'Save Settings'
                    )}
                </button>
            </div>

            {saveMessage && (
                <div className={`p-3 rounded-lg flex items-center gap-2 ${
                    saveMessage.type === 'success' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                }`}>
                    {saveMessage.type === 'success' ? (
                        <CheckCircleIcon className="w-5 h-5" />
                    ) : (
                        <ExclamationTriangleIcon className="w-5 h-5" />
                    )}
                    {saveMessage.text}
                </div>
            )}

            {/* Auto-Response Master Switch */}
            <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-brand-500/20">
                            <EnvelopeIcon className="w-5 h-5 text-brand-400" />
                        </div>
                        <div>
                            <h3 className="text-lg font-semibold text-white">Auto-Response System</h3>
                            <p className="text-sm text-gray-400">
                                Automatically reply to simple enquiries
                            </p>
                        </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                        <input
                            type="checkbox"
                            checked={autoResponseEnabled}
                            onChange={(e) => setAutoResponseEnabled(e.target.checked)}
                            className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-gray-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-500"></div>
                    </label>
                </div>

                {autoResponseEnabled && (
                    <div className="mt-4 p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                        <div className="flex items-start gap-2">
                            <ExclamationTriangleIcon className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                            <div>
                                <p className="text-sm font-medium text-amber-300">Auto-Response Active</p>
                                <p className="text-xs text-amber-400 mt-1">
                                    Simple enquiries from whitelisted senders will receive automatic AI-generated responses.
                                    Complex questions will be flagged for human review.
                                </p>
                                <p className="text-xs text-amber-400 mt-2 font-semibold">
                                    Hard Rule: Each email address can only receive ONE auto-reply, ever.
                                </p>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Response Delay */}
            {autoResponseEnabled && (
                <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="p-2 rounded-lg bg-blue-500/20">
                            <ClockIcon className="w-5 h-5 text-blue-400" />
                        </div>
                        <div>
                            <h3 className="text-lg font-semibold text-white">Response Delay</h3>
                            <p className="text-sm text-gray-400">
                                Minimum time to wait before sending auto-response
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-4">
                        <input
                            type="range"
                            min="5"
                            max="60"
                            value={autoResponseDelay}
                            onChange={(e) => setAutoResponseDelay(parseInt(e.target.value))}
                            className="flex-1 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-brand-500"
                        />
                        <div className="w-24 text-center">
                            <span className="text-2xl font-bold text-white">{autoResponseDelay}</span>
                            <span className="text-gray-400 text-sm ml-1">min</span>
                        </div>
                    </div>
                    <p className="text-xs text-gray-500 mt-2">
                        Responses will be sent at least {autoResponseDelay} minutes after receiving the email
                        (minimum 5 minutes for security)
                    </p>
                </div>
            )}

            {/* Sender Whitelist */}
            <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
                <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 rounded-lg bg-green-500/20">
                        <ShieldCheckIcon className="w-5 h-5 text-green-400" />
                    </div>
                    <div>
                        <h3 className="text-lg font-semibold text-white">Sender Whitelist</h3>
                        <p className="text-sm text-gray-400">
                            Only process emails from approved senders
                        </p>
                    </div>
                </div>

                {/* Whitelist Mode Toggle */}
                <div className="flex items-center gap-4 mb-4 p-3 bg-gray-900 rounded-lg">
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input
                            type="radio"
                            name="whitelistMode"
                            checked={whitelistMode === 'whitelist_only'}
                            onChange={() => setWhitelistMode('whitelist_only')}
                            className="text-brand-500 focus:ring-brand-500"
                        />
                        <span className="text-sm text-gray-300">Whitelist Only (Recommended)</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input
                            type="radio"
                            name="whitelistMode"
                            checked={whitelistMode === 'allow_all'}
                            onChange={() => setWhitelistMode('allow_all')}
                            className="text-brand-500 focus:ring-brand-500"
                        />
                        <span className="text-sm text-gray-300">Allow All</span>
                    </label>
                </div>

                {whitelistMode === 'whitelist_only' && (
                    <>
                        {/* Add Presets */}
                        <div className="mb-4">
                            <p className="text-xs text-gray-500 mb-2">Quick Add (UK Car Portals):</p>
                            <div className="flex flex-wrap gap-2">
                                {Object.keys(WHITELIST_PRESETS).map((preset) => (
                                    <button
                                        key={preset}
                                        onClick={() => addPreset(preset as keyof typeof WHITELIST_PRESETS)}
                                        className="px-3 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-full transition-colors capitalize"
                                    >
                                        + {preset}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Add Custom Email */}
                        <div className="flex gap-2 mb-4">
                            <input
                                type="text"
                                value={newWhitelistEmail}
                                onChange={(e) => setNewWhitelistEmail(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && addWhitelistEmail()}
                                placeholder="Add email or @domain.com"
                                className="flex-1 px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-brand-500"
                            />
                            <button
                                onClick={addWhitelistEmail}
                                className="px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-lg flex items-center gap-1"
                            >
                                <PlusIcon className="w-4 h-4" />
                                Add
                            </button>
                        </div>

                        {/* Whitelist Display */}
                        <div className="max-h-40 overflow-y-auto">
                            {whitelistedSenders.length === 0 ? (
                                <p className="text-sm text-gray-500 italic">No emails whitelisted yet</p>
                            ) : (
                                <div className="flex flex-wrap gap-2">
                                    {whitelistedSenders.map((email) => (
                                        <span
                                            key={email}
                                            className="inline-flex items-center gap-1 px-3 py-1 bg-gray-700 text-gray-300 rounded-full text-sm"
                                        >
                                            {email}
                                            <button
                                                onClick={() => removeWhitelistEmail(email)}
                                                className="hover:text-red-400 transition-colors"
                                            >
                                                <XMarkIcon className="w-4 h-4" />
                                            </button>
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>
                    </>
                )}
            </div>

            {/* Business Hours */}
            <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-purple-500/20">
                            <ClockIcon className="w-5 h-5 text-purple-400" />
                        </div>
                        <div>
                            <h3 className="text-lg font-semibold text-white">Business Hours</h3>
                            <p className="text-sm text-gray-400">
                                Only send auto-responses during business hours (UK Time)
                            </p>
                        </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                        <input
                            type="checkbox"
                            checked={businessHoursEnabled}
                            onChange={(e) => setBusinessHoursEnabled(e.target.checked)}
                            className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-gray-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-500"></div>
                    </label>
                </div>

                {businessHoursEnabled && (
                    <div className="space-y-4">
                        {/* Time Pickers */}
                        <div className="flex items-center gap-4">
                            <div className="flex-1">
                                <label className="block text-xs text-gray-500 mb-1">Opens</label>
                                <input
                                    type="time"
                                    value={businessHoursStart}
                                    onChange={(e) => setBusinessHoursStart(e.target.value)}
                                    className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-brand-500"
                                />
                            </div>
                            <span className="text-gray-500 mt-5">to</span>
                            <div className="flex-1">
                                <label className="block text-xs text-gray-500 mb-1">Closes</label>
                                <input
                                    type="time"
                                    value={businessHoursEnd}
                                    onChange={(e) => setBusinessHoursEnd(e.target.value)}
                                    className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-brand-500"
                                />
                            </div>
                        </div>

                        {/* Day Toggles */}
                        <div>
                            <label className="block text-xs text-gray-500 mb-2">Business Days</label>
                            <div className="flex gap-2">
                                {dayNames.map((day, index) => (
                                    <button
                                        key={day}
                                        onClick={() => toggleBusinessDay(index)}
                                        className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                                            businessDays.includes(index)
                                                ? 'bg-brand-500 text-white'
                                                : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                                        }`}
                                    >
                                        {day}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <p className="text-xs text-gray-500">
                            Emails received outside these hours will be queued and sent when business opens.
                            Timezone: Europe/London (automatically handles GMT/BST)
                        </p>
                    </div>
                )}
            </div>

            {/* Complex Question Keywords */}
            <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
                <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 rounded-lg bg-red-500/20">
                        <CogIcon className="w-5 h-5 text-red-400" />
                    </div>
                    <div>
                        <h3 className="text-lg font-semibold text-white">Complex Question Detection</h3>
                        <p className="text-sm text-gray-400">
                            Emails containing these keywords will be flagged for human review
                        </p>
                    </div>
                </div>

                <textarea
                    value={complexKeywordsText}
                    onChange={(e) => setComplexKeywordsText(e.target.value)}
                    placeholder="Enter one keyword per line..."
                    rows={6}
                    className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-brand-500 text-sm"
                />
                <p className="text-xs text-gray-500 mt-2">
                    One keyword per line. Examples: finance, monthly payment, trade-in, warranty claim, complaint
                </p>
            </div>

            {/* Response Template */}
            {autoResponseEnabled && (
                <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="p-2 rounded-lg bg-brand-500/20">
                            <EnvelopeIcon className="w-5 h-5 text-brand-400" />
                        </div>
                        <div>
                            <h3 className="text-lg font-semibold text-white">Response Template</h3>
                            <p className="text-sm text-gray-400">
                                Customize the auto-response message
                            </p>
                        </div>
                    </div>

                    <textarea
                        value={responseTemplate}
                        onChange={(e) => setResponseTemplate(e.target.value)}
                        placeholder="Enter your response template..."
                        rows={8}
                        className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-brand-500 text-sm font-mono"
                    />
                    <div className="mt-2 p-3 bg-gray-900 rounded-lg">
                        <p className="text-xs text-gray-400 mb-2">Available placeholders:</p>
                        <div className="flex flex-wrap gap-2">
                            <code className="px-2 py-1 bg-gray-800 text-brand-400 rounded text-xs">{'{{firstName}}'}</code>
                            <code className="px-2 py-1 bg-gray-800 text-brand-400 rounded text-xs">{'{{lastName}}'}</code>
                            <code className="px-2 py-1 bg-gray-800 text-brand-400 rounded text-xs">{'{{subject}}'}</code>
                            <code className="px-2 py-1 bg-gray-800 text-brand-400 rounded text-xs">{'{{vehicleInfo}}'}</code>
                        </div>
                    </div>
                </div>
            )}

            {/* Email Signature */}
            {autoResponseEnabled && (
                <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="p-2 rounded-lg bg-indigo-500/20">
                            <EditIcon className="w-5 h-5 text-indigo-400" />
                        </div>
                        <div>
                            <h3 className="text-lg font-semibold text-white">Email Signature</h3>
                            <p className="text-sm text-gray-400">
                                This will be added at the end of every auto-response
                            </p>
                        </div>
                    </div>

                    <textarea
                        value={emailSignature}
                        onChange={(e) => setEmailSignature(e.target.value)}
                        placeholder="Kind regards,&#10;John Smith&#10;ABC Motors&#10;01onal123 456789&#10;www.abcmotors.com"
                        rows={6}
                        className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-brand-500 text-sm"
                    />
                    <p className="text-xs text-gray-500 mt-2">
                        Include your name, company, phone number, and website
                    </p>
                </div>
            )}

            {/* Info Box */}
            <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700">
                <h4 className="text-sm font-medium text-gray-300 mb-2">How Auto-Response Works</h4>
                <ul className="text-xs text-gray-500 space-y-1">
                    <li>1. Email arrives from a whitelisted sender</li>
                    <li>2. AI analyzes the email for complexity and vehicle matches</li>
                    <li>3. Simple enquiries get an auto-response after the configured delay</li>
                    <li>4. Complex questions are flagged for human review</li>
                    <li>5. Each email address only ever receives ONE auto-reply (hard limit)</li>
                    <li>6. All responses are logged in the lead's activity history</li>
                </ul>
            </div>
        </div>
    );
};

export default EmailAutoResponseSettings;
