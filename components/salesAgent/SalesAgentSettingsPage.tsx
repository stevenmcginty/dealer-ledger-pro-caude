import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useData } from '../../hooks/useData';
import { Badge, Button, Card, Input, useToast } from '../ui';
import Spinner from '../common/Spinner';
import {
    ArrowPathIcon,
    ArrowTopRightOnSquareIcon,
    BoltIcon,
    CarIcon,
    ChatBubbleLeftRightIcon,
    CheckCircleIcon,
    ClipboardIcon,
    EnvelopeIcon,
    ExclamationTriangleIcon,
    PhoneIcon,
    SparklesIcon,
} from '../icons';
import {
    DEFAULT_SALES_AGENT_SETTINGS,
    SALES_AGENT_WEBHOOKS,
    SalesAgentSettings,
    StockMeta,
    TwilioCredentials,
    WhatsAppCredentials,
    formatAgentTime,
    getGmailAuthUrl,
    runStockIndexNow,
    saveSalesAgentPrivate,
    saveSalesAgentSettings,
    setConnectionFlag,
    subscribeToSalesAgentSettings,
    subscribeToSalesAgentStockMeta,
} from '../../services/salesAgentService';
import AgentSimulator from './AgentSimulator';
import PushNotificationsCard from './PushNotificationsCard';

/** A labelled on/off switch. The agent's settings are mostly yes-or-no answers. */
const Toggle: React.FC<{
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

const TextArea: React.FC<{
    label: string;
    value: string;
    rows?: number;
    hint?: string;
    placeholder?: string;
    onChange: (next: string) => void;
}> = ({ label, value, rows = 4, hint, placeholder, onChange }) => (
    <div className="w-full">
        <label className="block text-sm font-medium text-gray-300 mb-1.5">{label}</label>
        <textarea
            rows={rows}
            value={value}
            placeholder={placeholder}
            onChange={e => onChange(e.target.value)}
            className="w-full bg-gray-900/50 border border-gray-700 hover:border-gray-600 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 text-sm transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500"
        />
        {hint && <p className="mt-1.5 text-sm text-gray-500">{hint}</p>}
    </div>
);

/** One webhook address, with the copy button that is the whole point of showing it. */
const CopyRow: React.FC<{ label: string; value: string }> = ({ label, value }) => {
    const [copied, setCopied] = useState(false);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            if (timer.current) clearTimeout(timer.current);
            timer.current = setTimeout(() => setCopied(false), 2000);
        } catch {
            // Clipboard is blocked in some embedded browsers; the address is on
            // screen either way, so there is nothing useful to say.
        }
    };

    return (
        <div>
            <p className="text-xs font-medium text-gray-400 mb-1">{label}</p>
            <div className="flex items-center gap-2">
                <code className="flex-1 min-w-0 truncate bg-gray-900/70 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-300 font-mono">
                    {value}
                </code>
                <Button size="sm" variant="secondary" onClick={copy}>
                    {copied ? <CheckCircleIcon className="h-4 w-4 text-emerald-400" /> : <ClipboardIcon className="h-4 w-4" />}
                    {copied ? 'Copied' : 'Copy'}
                </Button>
            </div>
        </div>
    );
};

/**
 * Everything about the front desk that answers on its own.
 *
 * The page is deliberately in three parts: what the agent is allowed to do
 * (top), what it knows and how it sounds (middle), and the accounts it speaks
 * through (bottom). The credentials at the bottom go straight to the functions
 * and never come back — the only thing the page can say afterwards is whether
 * they arrived.
 */
const SalesAgentSettingsPage = () => {
    const { companyId } = useData();
    const toast = useToast();

    const [saved, setSaved] = useState<SalesAgentSettings | null>(null);
    const [draft, setDraft] = useState<SalesAgentSettings>(DEFAULT_SALES_AGENT_SETTINGS);
    const [dirty, setDirty] = useState(false);
    const [saving, setSaving] = useState(false);
    const [stockMeta, setStockMeta] = useState<StockMeta | null>(null);
    const [indexing, setIndexing] = useState(false);
    const [simulatorOpen, setSimulatorOpen] = useState(false);

    // Credential forms. These start blank every time and are cleared after a
    // save: the page has no way to read back what is already stored.
    const [showWhatsApp, setShowWhatsApp] = useState(false);
    const [showTwilio, setShowTwilio] = useState(false);
    const [savingCreds, setSavingCreds] = useState<'' | 'whatsapp' | 'twilio' | 'gmail'>('');
    const [whatsApp, setWhatsApp] = useState<WhatsAppCredentials>({
        phoneNumberId: '', businessAccountId: '', accessToken: '', verifyToken: '', appSecret: '',
    });
    const [twilio, setTwilio] = useState<TwilioCredentials>({ accountSid: '', authToken: '', fromNumber: '' });

    const dirtyRef = useRef(false);
    dirtyRef.current = dirty;

    useEffect(() => {
        if (!companyId) return;
        return subscribeToSalesAgentSettings(companyId, next => {
            setSaved(next);
            // A change arriving from elsewhere should not wipe out half-typed
            // answers on this screen.
            if (!dirtyRef.current) setDraft(next);
        });
    }, [companyId]);

    useEffect(() => {
        if (!companyId) return;
        return subscribeToSalesAgentStockMeta(companyId, setStockMeta);
    }, [companyId]);

    // Coming back from Google's consent screen. The refresh token was stored by
    // the function; all that is left is to record that it happened and tidy the
    // address bar so a refresh does not repeat it.
    const gmailReturnHandled = useRef(false);
    useEffect(() => {
        if (!companyId || gmailReturnHandled.current) return;
        const params = new URLSearchParams(window.location.search);
        if (params.get('gmail') !== 'connected') return;
        gmailReturnHandled.current = true;
        setConnectionFlag(companyId, 'gmail', true)
            .then(() => toast.success('Gmail connected. Enquiries to that inbox now reach the agent.'))
            .catch(() => toast.error('Gmail came back connected but the setting could not be saved.'));
        params.delete('gmail');
        const query = params.toString();
        window.history.replaceState({}, '', `${window.location.pathname}${query ? `?${query}` : ''}`);
    }, [companyId, toast]);

    const edit = useCallback(<K extends keyof SalesAgentSettings>(key: K, value: SalesAgentSettings[K]) => {
        setDraft(prev => ({ ...prev, [key]: value }));
        setDirty(true);
    }, []);

    const connections = saved?.connections || {};

    const handleSave = async () => {
        if (!companyId) return;
        setSaving(true);
        try {
            const { connections: _flags, updatedAt: _at, ...patch } = draft;
            await saveSalesAgentSettings(companyId, patch);
            setDirty(false);
            toast.success('Sales agent settings saved.');
        } catch (err: any) {
            toast.error(err?.message || 'Could not save those settings.');
        } finally {
            setSaving(false);
        }
    };

    /** The master switch saves on its own — nobody expects to press Save after it. */
    const handleToggleEnabled = async (next: boolean) => {
        if (!companyId) return;
        setDraft(prev => ({ ...prev, enabled: next }));
        try {
            await saveSalesAgentSettings(companyId, { enabled: next });
            toast.success(next ? 'The agent is answering enquiries.' : 'The agent has stopped answering.');
        } catch (err: any) {
            setDraft(prev => ({ ...prev, enabled: !next }));
            toast.error(err?.message || 'Could not change that.');
        }
    };

    const handleSaveWhatsApp = async () => {
        if (!companyId) return;
        setSavingCreds('whatsapp');
        try {
            await saveSalesAgentPrivate(companyId, { whatsapp: whatsApp });
            await setConnectionFlag(companyId, 'whatsapp', true);
            setWhatsApp({ phoneNumberId: '', businessAccountId: '', accessToken: '', verifyToken: '', appSecret: '' });
            setShowWhatsApp(false);
            toast.success('WhatsApp credentials stored.');
        } catch (err: any) {
            toast.error(err?.message || 'Could not save those credentials.');
        } finally {
            setSavingCreds('');
        }
    };

    const handleSaveTwilio = async () => {
        if (!companyId) return;
        setSavingCreds('twilio');
        try {
            await saveSalesAgentPrivate(companyId, { twilio });
            await setConnectionFlag(companyId, 'twilio', true);
            setTwilio({ accountSid: '', authToken: '', fromNumber: '' });
            setShowTwilio(false);
            toast.success('Twilio credentials stored.');
        } catch (err: any) {
            toast.error(err?.message || 'Could not save those credentials.');
        } finally {
            setSavingCreds('');
        }
    };

    const handleConnectGmail = async () => {
        if (!companyId) return;
        setSavingCreds('gmail');
        try {
            const { url } = await getGmailAuthUrl(companyId);
            if (!url) throw new Error('No sign-in address came back.');
            window.location.href = url;
        } catch (err: any) {
            toast.error(err?.message || 'Could not start the Gmail connection.');
            setSavingCreds('');
        }
    };

    const handleReindex = async () => {
        if (!companyId) return;
        setIndexing(true);
        try {
            const meta = await runStockIndexNow(companyId);
            const count = meta?.availableCount ?? meta?.count;
            toast.success(count === undefined ? 'Stock re-indexed.' : `Stock re-indexed — ${count} cars available.`);
        } catch (err: any) {
            toast.error(err?.message || 'The stock index did not finish.');
        } finally {
            setIndexing(false);
        }
    };

    const whatsAppReady = !!(whatsApp.phoneNumberId && whatsApp.businessAccountId && whatsApp.accessToken && whatsApp.verifyToken);
    const twilioReady = !!(twilio.accountSid && twilio.authToken && twilio.fromNumber);

    const stockErrors = useMemo(() => stockMeta?.errors || [], [stockMeta]);

    if (!companyId) {
        return <p className="text-sm text-gray-500">Loading…</p>;
    }

    return (
        <div className="space-y-6">
            {/* ---- master switch ---------------------------------------- */}
            <Card
                className={`border-2 ${draft.enabled ? 'border-emerald-500/40 bg-emerald-950/20' : 'border-gray-700/50'}`}
                padding="lg"
            >
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="flex items-start gap-4 min-w-0">
                        <div className={`p-3 rounded-xl ${draft.enabled ? 'bg-emerald-500/20' : 'bg-gray-700/60'}`}>
                            <SparklesIcon className={`w-6 h-6 ${draft.enabled ? 'text-emerald-400' : 'text-gray-400'}`} />
                        </div>
                        <div className="min-w-0">
                            <div className="flex items-center gap-3 flex-wrap">
                                <h2 className="text-xl font-bold text-white">AI Sales Agent</h2>
                                <Badge variant={draft.enabled ? 'success' : 'default'} dot>
                                    {draft.enabled ? 'Answering' : 'Off'}
                                </Badge>
                            </div>
                            <p className="text-sm text-gray-400 mt-1 max-w-2xl">
                                Answers WhatsApp, SMS and email enquiries in your voice, from your live stock
                                list — asks about the car, part-exchange or finance, and a time to come in,
                                then books the viewing and pings you. Anything it is unsure of comes to you
                                instead of being made up.
                            </p>
                        </div>
                    </div>
                    <Toggle
                        checked={draft.enabled}
                        onChange={handleToggleEnabled}
                        label={draft.enabled ? 'Agent on' : 'Agent off'}
                    />
                </div>
            </Card>

            {/* ---- try it ------------------------------------------------ */}
            <Card padding="lg">
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="min-w-0">
                        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                            <ChatBubbleLeftRightIcon className="h-5 w-5 text-brand-400" />
                            Test the agent
                        </h3>
                        <p className="text-sm text-gray-400 mt-1 max-w-2xl">
                            Talk to it yourself, as a customer would on WhatsApp. Nothing here reaches a real
                            customer and no conversation is created.
                        </p>
                    </div>
                    <Button variant={simulatorOpen ? 'secondary' : 'primary'} onClick={() => setSimulatorOpen(o => !o)}>
                        {simulatorOpen ? 'Close simulator' : 'Open simulator'}
                    </Button>
                </div>
                {simulatorOpen && (
                    <div className="mt-6 flex justify-center">
                        <AgentSimulator companyId={companyId} dealershipName={draft.dealershipName} />
                    </div>
                )}
            </Card>

            {/* ---- what it knows ----------------------------------------- */}
            <Card padding="lg">
                <Card.Header>The dealership</Card.Header>
                <Card.Body>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Input
                            label="Dealership name"
                            value={draft.dealershipName}
                            onChange={e => edit('dealershipName', e.target.value)}
                        />
                        <Input
                            label="Location"
                            value={draft.location}
                            onChange={e => edit('location', e.target.value)}
                            hint="How the agent describes where you are"
                        />
                        <Input
                            label="Website"
                            value={draft.websiteUrl}
                            onChange={e => edit('websiteUrl', e.target.value)}
                        />
                        <Input
                            label="Stock list page"
                            value={draft.stockListUrl}
                            onChange={e => edit('stockListUrl', e.target.value)}
                            hint="The page the nightly index reads"
                        />
                        <Input
                            label="Address"
                            value={draft.address}
                            onChange={e => edit('address', e.target.value)}
                            placeholder="Given out when someone asks where to come"
                        />
                        <Input
                            label="Opening hours"
                            value={draft.openingHours}
                            onChange={e => edit('openingHours', e.target.value)}
                            placeholder="Mon–Sat 9–6, Sun by appointment"
                        />
                        <Input
                            label="Phone"
                            value={draft.phone}
                            onChange={e => edit('phone', e.target.value)}
                            placeholder="01923 000000"
                        />
                        <Input
                            label="Email address"
                            type="email"
                            value={draft.emailAddress}
                            onChange={e => edit('emailAddress', e.target.value)}
                            hint="The inbox the agent answers from"
                        />
                        <Input
                            label="Agent name"
                            value={draft.agentName}
                            onChange={e => edit('agentName', e.target.value)}
                            placeholder="Dave"
                            hint="Customers will talk to this name"
                        />
                        <Input
                            label="The team"
                            value={draft.teamNames}
                            onChange={e => edit('teamNames', e.target.value)}
                            placeholder="Steve and Chris"
                            hint="Who the agent can hand over to, as a customer would hear it"
                        />
                        <Input
                            label="Your name"
                            value={draft.ownerName}
                            onChange={e => edit('ownerName', e.target.value)}
                            placeholder="Steve"
                            hint="Who alerts and owner commands belong to"
                        />
                        <Input
                            label="Your WhatsApp number"
                            value={draft.ownerAlertNumber}
                            onChange={e => edit('ownerAlertNumber', e.target.value)}
                            placeholder="+447700900000"
                            hint="Where alerts land, and the number owner commands must come from"
                        />
                    </div>
                    <div className="mt-4 space-y-4">
                        <Input
                            label="Sign-off"
                            value={draft.signature}
                            onChange={e => edit('signature', e.target.value)}
                            placeholder="Steve, Radlett Car Sales"
                        />
                        <TextArea
                            label="Answers to the usual questions"
                            value={draft.faqs}
                            rows={6}
                            onChange={next => edit('faqs', next)}
                            placeholder={'Warranty: 3 months on every car\nFinance: we use Zuto and Close Brothers\nTest drives: full licence and insurance needed\nDelivery: within 50 miles, priced on the day\nPart-exchange: bring the V5 and service book'}
                            hint="Written the way you would say it. The agent uses these verbatim in meaning, not in wording."
                        />
                    </div>
                </Card.Body>
            </Card>

            {/* ---- how it behaves ---------------------------------------- */}
            <Card padding="lg">
                <Card.Header>How it behaves</Card.Header>
                <Card.Body>
                    <div className="space-y-6">
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-1.5">Price flexibility</label>
                            <select
                                value={draft.priceFlexMode}
                                onChange={e => edit('priceFlexMode', e.target.value as SalesAgentSettings['priceFlexMode'])}
                                className="w-full md:w-96 bg-gray-900/50 border border-gray-700 hover:border-gray-600 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500"
                            >
                                <option value="hint">Hint — "usually a bit of movement", never a figure</option>
                                <option value="figure">Figure — may offer up to a set discount</option>
                                <option value="none">None — the price is the price</option>
                            </select>
                            <p className="mt-1.5 text-sm text-gray-500">
                                On a second push, or a straight request for a number, the agent stops and asks you.
                            </p>
                        </div>

                        {draft.priceFlexMode === 'figure' && (
                            <div className="w-full md:w-64">
                                <Input
                                    label="Most it may take off (£)"
                                    type="number"
                                    min={0}
                                    value={String(draft.negotiationMaxDiscount ?? 0)}
                                    onChange={e => edit('negotiationMaxDiscount', Number(e.target.value) || 0)}
                                />
                            </div>
                        )}

                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-1.5">Reply delay</label>
                            <div className="flex items-center gap-3 flex-wrap">
                                <div className="w-28">
                                    <Input
                                        type="number"
                                        min={0}
                                        aria-label="Shortest reply delay in seconds"
                                        value={String(draft.replyDelaySeconds[0])}
                                        onChange={e => edit('replyDelaySeconds', [Number(e.target.value) || 0, draft.replyDelaySeconds[1]])}
                                    />
                                </div>
                                <span className="text-sm text-gray-500">to</span>
                                <div className="w-28">
                                    <Input
                                        type="number"
                                        min={0}
                                        aria-label="Longest reply delay in seconds"
                                        value={String(draft.replyDelaySeconds[1])}
                                        onChange={e => edit('replyDelaySeconds', [draft.replyDelaySeconds[0], Number(e.target.value) || 0])}
                                    />
                                </div>
                                <span className="text-sm text-gray-500">seconds</span>
                            </div>
                            <p className="mt-1.5 text-sm text-gray-500">
                                An answer that arrives the instant a message is sent reads as a machine. The agent
                                waits somewhere in this window.
                            </p>
                        </div>

                        <div>
                            <p className="block text-sm font-medium text-gray-300 mb-3">Channels it answers on</p>
                            <div className="space-y-3">
                                <Toggle
                                    label="WhatsApp"
                                    checked={draft.channels.whatsapp}
                                    onChange={next => edit('channels', { ...draft.channels, whatsapp: next })}
                                />
                                <Toggle
                                    label="SMS"
                                    checked={draft.channels.sms}
                                    onChange={next => edit('channels', { ...draft.channels, sms: next })}
                                />
                                <Toggle
                                    label="Email"
                                    checked={draft.channels.email}
                                    onChange={next => edit('channels', { ...draft.channels, email: next })}
                                />
                            </div>
                        </div>

                        <Toggle
                            label="Move email enquiries to WhatsApp"
                            hint="When an email has a mobile number in it, open on WhatsApp instead — and still send the email so nobody is left cold."
                            checked={draft.preferWhatsAppReply}
                            onChange={next => edit('preferWhatsAppReply', next)}
                        />

                        <Toggle
                            label="Approve email replies before they're sent"
                            hint={`${draft.agentName || 'Dave'} drafts, you approve with SEND 12 on WhatsApp or here. WhatsApp replies are still automatic.`}
                            checked={draft.emailApprovalMode !== false}
                            onChange={next => edit('emailApprovalMode', next)}
                        />

                        <Toggle
                            label="Chase missed calls"
                            hint="Automatically WhatsApp people who called via CarGurus/Cazoo and didn't leave a message"
                            checked={!!draft.followUpPhoneLeads}
                            onChange={next => edit('followUpPhoneLeads', next)}
                        />

                        <Toggle
                            label="Share my stock with the agent"
                            hint="Let Dave talk about my cars — turn off if you share the website but don't want the agent selling your stock"
                            checked={draft.shareStockWithAgent !== false}
                            onChange={next => edit('shareStockWithAgent', next)}
                        />

                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-1.5">Cars not in any ledger account</label>
                            <select
                                value={draft.unmatchedStockPolicy ?? 'include'}
                                onChange={e => edit('unmatchedStockPolicy', e.target.value as SalesAgentSettings['unmatchedStockPolicy'])}
                                className="w-full md:w-96 bg-gray-900/50 border border-gray-700 hover:border-gray-600 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500"
                            >
                                <option value="include">Include — the agent may sell anything on the site</option>
                                <option value="exclude">Exclude — only cars matched to a ledger account</option>
                            </select>
                            <p className="mt-1.5 text-sm text-gray-500">
                                A car on the website that nobody's stock list claims. Excluded ones are indexed but
                                never offered, and the agent asks you rather than guessing.
                            </p>
                        </div>
                    </div>
                </Card.Body>
            </Card>

            {/* ---- save -------------------------------------------------- */}
            <div className="sticky bottom-4 z-10 flex flex-wrap items-center justify-end gap-3 bg-gray-900/80 backdrop-blur-sm border border-gray-700/50 rounded-xl px-4 py-3">
                {dirty && <p className="text-sm text-amber-400 mr-auto">Unsaved changes</p>}
                {!dirty && saved?.updatedAt ? (
                    <p className="text-sm text-gray-500 mr-auto">Saved {formatAgentTime(saved.updatedAt)}</p>
                ) : null}
                {dirty && (
                    <Button variant="ghost" onClick={() => { if (saved) setDraft(saved); setDirty(false); }}>
                        Discard
                    </Button>
                )}
                <Button onClick={handleSave} loading={saving} disabled={!dirty || saving}>
                    Save changes
                </Button>
            </div>

            {/* ---- notifications ----------------------------------------- */}
            <PushNotificationsCard
                companyId={companyId}
                enabled={draft.pushNotifications !== false}
                onChanged={next => setDraft(prev => ({ ...prev, pushNotifications: next }))}
            />

            {/* ---- stock index ------------------------------------------- */}
            <Card padding="lg">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="flex items-start gap-3 min-w-0">
                        <div className="p-2 rounded-lg bg-brand-500/20">
                            <CarIcon className="w-5 h-5 text-brand-400" />
                        </div>
                        <div className="min-w-0">
                            <h3 className="text-lg font-semibold text-white">Stock the agent can talk about</h3>
                            <p className="text-sm text-gray-400 mt-1 max-w-2xl">
                                Read from your website every morning at six. Every fact the agent gives out about a
                                car comes from here — it is not allowed to invent one.
                            </p>
                        </div>
                    </div>
                    <Button variant="secondary" onClick={handleReindex} loading={indexing} disabled={indexing}>
                        {!indexing && <ArrowPathIcon className="h-4 w-4" />}
                        {indexing ? 'Reading the site…' : 'Re-index now'}
                    </Button>
                </div>

                {stockMeta ? (
                    <dl className="mt-5 grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div>
                            <dt className="text-xs text-gray-500">Available</dt>
                            <dd className="text-2xl font-bold text-white">{stockMeta.availableCount ?? 0}</dd>
                        </div>
                        <div>
                            <dt className="text-xs text-gray-500">Listings read</dt>
                            <dd className="text-2xl font-bold text-white">{stockMeta.count ?? 0}</dd>
                        </div>
                        <div>
                            <dt className="text-xs text-gray-500">Last read</dt>
                            <dd className="text-sm text-gray-200 mt-2">{formatAgentTime(stockMeta.lastIndexedAt)}</dd>
                        </div>
                        <div>
                            <dt className="text-xs text-gray-500">Took</dt>
                            <dd className="text-sm text-gray-200 mt-2">
                                {stockMeta.durationMs ? `${Math.round(stockMeta.durationMs / 100) / 10}s` : '—'}
                            </dd>
                        </div>
                    </dl>
                ) : (
                    <p className="mt-5 text-sm text-gray-500">
                        Nothing indexed yet. Run it once and the agent has a stock list to answer from.
                    </p>
                )}

                {!!stockErrors.length && (
                    <div className="mt-4 p-3 rounded-lg bg-amber-900/30 border border-amber-700/40">
                        <p className="text-sm font-medium text-amber-300 flex items-center gap-2">
                            <ExclamationTriangleIcon className="h-4 w-4" />
                            {stockErrors.length === 1 ? 'One listing gave trouble' : `${stockErrors.length} listings gave trouble`}
                        </p>
                        <ul className="mt-2 space-y-1">
                            {stockErrors.slice(0, 5).map((err, i) => (
                                <li key={i} className="text-xs text-gray-400 font-mono truncate">{err}</li>
                            ))}
                        </ul>
                        {stockErrors.length > 5 && (
                            <p className="mt-1 text-xs text-gray-500">and {stockErrors.length - 5} more</p>
                        )}
                    </div>
                )}
            </Card>

            {/* ---- connections ------------------------------------------- */}
            <div>
                <h3 className="text-sm font-semibold tracking-wider text-gray-500 uppercase mb-3">Connections</h3>
                <p className="text-sm text-gray-400 mb-4 max-w-3xl">
                    These go straight into the functions and cannot be read back out — not by this page, not by
                    anyone signed in. If you need to change one, paste the new value over the top.
                </p>

                <div className="space-y-6">
                    {/* WhatsApp */}
                    <Card padding="lg">
                        <Card.Header
                            action={<Badge variant={connections.whatsapp ? 'success' : 'default'}>{connections.whatsapp ? 'Connected' : 'Not connected'}</Badge>}
                        >
                            <span className="flex items-center gap-2">
                                <ChatBubbleLeftRightIcon className="h-5 w-5 text-emerald-400" />
                                WhatsApp Cloud API
                            </span>
                        </Card.Header>
                        <Card.Body>
                            {showWhatsApp ? (
                                <div className="space-y-4">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <Input
                                            label="Phone number ID"
                                            value={whatsApp.phoneNumberId}
                                            onChange={e => setWhatsApp({ ...whatsApp, phoneNumberId: e.target.value })}
                                        />
                                        <Input
                                            label="Business account ID"
                                            value={whatsApp.businessAccountId}
                                            onChange={e => setWhatsApp({ ...whatsApp, businessAccountId: e.target.value })}
                                        />
                                        <Input
                                            label="Access token"
                                            type="password"
                                            value={whatsApp.accessToken}
                                            onChange={e => setWhatsApp({ ...whatsApp, accessToken: e.target.value })}
                                            hint="The permanent system-user token"
                                        />
                                        <Input
                                            label="Verify token"
                                            value={whatsApp.verifyToken}
                                            onChange={e => setWhatsApp({ ...whatsApp, verifyToken: e.target.value })}
                                            hint="Any phrase you choose — Meta echoes it back"
                                        />
                                        <Input
                                            label="App secret"
                                            type="password"
                                            value={whatsApp.appSecret || ''}
                                            onChange={e => setWhatsApp({ ...whatsApp, appSecret: e.target.value })}
                                            hint="Used to check every webhook really came from Meta"
                                        />
                                    </div>
                                    <div className="flex gap-2">
                                        <Button onClick={handleSaveWhatsApp} disabled={!whatsAppReady} loading={savingCreds === 'whatsapp'}>
                                            Save credentials
                                        </Button>
                                        <Button variant="ghost" onClick={() => setShowWhatsApp(false)}>Cancel</Button>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                    <p className="text-sm text-gray-400 max-w-xl">
                                        Your own number through Meta Coexistence — the WhatsApp Business app keeps
                                        working on the phone while the agent answers through the Cloud API.
                                    </p>
                                    <Button variant={connections.whatsapp ? 'secondary' : 'primary'} onClick={() => setShowWhatsApp(true)}>
                                        {connections.whatsapp ? 'Replace credentials' : 'Add credentials'}
                                    </Button>
                                </div>
                            )}
                        </Card.Body>
                    </Card>

                    {/* Twilio */}
                    <Card padding="lg">
                        <Card.Header
                            action={<Badge variant={connections.twilio ? 'success' : 'default'}>{connections.twilio ? 'Connected' : 'Not connected'}</Badge>}
                        >
                            <span className="flex items-center gap-2">
                                <PhoneIcon className="h-5 w-5 text-red-400" />
                                Twilio SMS
                            </span>
                        </Card.Header>
                        <Card.Body>
                            {showTwilio ? (
                                <div className="space-y-4">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <Input
                                            label="Account SID"
                                            value={twilio.accountSid}
                                            onChange={e => setTwilio({ ...twilio, accountSid: e.target.value })}
                                            placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                                        />
                                        <Input
                                            label="Auth token"
                                            type="password"
                                            value={twilio.authToken}
                                            onChange={e => setTwilio({ ...twilio, authToken: e.target.value })}
                                        />
                                        <Input
                                            label="From number"
                                            value={twilio.fromNumber}
                                            onChange={e => setTwilio({ ...twilio, fromNumber: e.target.value })}
                                            placeholder="+447700900000"
                                        />
                                    </div>
                                    <div className="flex gap-2">
                                        <Button onClick={handleSaveTwilio} disabled={!twilioReady} loading={savingCreds === 'twilio'}>
                                            Save credentials
                                        </Button>
                                        <Button variant="ghost" onClick={() => setShowTwilio(false)}>Cancel</Button>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                    <p className="text-sm text-gray-400 max-w-xl">
                                        The UK number texts arrive on. Twilio signs every webhook, and the auth token
                                        is what proves it.
                                    </p>
                                    <Button variant={connections.twilio ? 'secondary' : 'primary'} onClick={() => setShowTwilio(true)}>
                                        {connections.twilio ? 'Replace credentials' : 'Add credentials'}
                                    </Button>
                                </div>
                            )}
                        </Card.Body>
                    </Card>

                    {/* Gmail */}
                    <Card padding="lg">
                        <Card.Header
                            action={<Badge variant={connections.gmail ? 'success' : 'default'}>{connections.gmail ? 'Connected' : 'Not connected'}</Badge>}
                        >
                            <span className="flex items-center gap-2">
                                <EnvelopeIcon className="h-5 w-5 text-sky-400" />
                                Gmail
                            </span>
                        </Card.Header>
                        <Card.Body>
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <p className="text-sm text-gray-400 max-w-xl">
                                    Email enquiries are pushed to the agent as they arrive — nothing polls the
                                    inbox. You will be sent to Google to approve it.
                                </p>
                                <Button
                                    variant={connections.gmail ? 'secondary' : 'primary'}
                                    onClick={handleConnectGmail}
                                    loading={savingCreds === 'gmail'}
                                >
                                    {!savingCreds && <ArrowTopRightOnSquareIcon className="h-4 w-4" />}
                                    {connections.gmail ? 'Reconnect' : `Connect ${draft.emailAddress || 'Gmail'}`}
                                </Button>
                            </div>
                        </Card.Body>
                    </Card>

                    {/* Webhooks */}
                    <Card padding="lg">
                        <Card.Header>
                            <span className="flex items-center gap-2">
                                <BoltIcon className="h-5 w-5 text-amber-400" />
                                Addresses to paste into Meta and Twilio
                            </span>
                        </Card.Header>
                        <Card.Body>
                            <p className="text-sm text-gray-400 mb-4 max-w-2xl">
                                Set these once, by hand, in each provider's console. Meta will ask for the verify
                                token above at the same time.
                            </p>
                            <div className="space-y-4">
                                <CopyRow label="Meta — WhatsApp webhook (Callback URL)" value={SALES_AGENT_WEBHOOKS.whatsapp} />
                                <CopyRow label="Twilio — Messaging webhook (A message comes in)" value={SALES_AGENT_WEBHOOKS.sms} />
                            </div>
                        </Card.Body>
                    </Card>
                </div>
            </div>

            {saved === null && (
                <div className="flex items-center gap-3 text-sm text-gray-500">
                    <Spinner className="h-4 w-4" /> Loading settings…
                </div>
            )}
        </div>
    );
};

export default SalesAgentSettingsPage;
