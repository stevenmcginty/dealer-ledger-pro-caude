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
    SharedInboxMeta,
    saveSalesAgentPrivate,
    saveSalesAgentSettings,
    setConnectionFlag,
    subscribeToSalesAgentSettings,
    subscribeToSalesAgentStockMeta,
    subscribeToSharedInbox,
} from '../../services/salesAgentService';
import AgentSimulator from './AgentSimulator';
import PushNotificationsCard from './PushNotificationsCard';
import SharedInboxCard from './SharedInboxCard';
import { WhatsAppMark } from './inbox/parts';
import { SettingSelect, SettingSwitch as Toggle, SettingTextArea as TextArea } from './settingParts';

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
            <p className="mb-1.5 text-sm font-semibold text-ink">{label}</p>
            <div className="flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded-control border border-line bg-surface-2 px-3 py-2.5 font-mono text-sm text-ink-2">
                    {value}
                </code>
                <Button
                    size="sm"
                    variant="secondary"
                    onClick={copy}
                    icon={copied ? <CheckCircleIcon className="text-success" /> : <ClipboardIcon />}
                >
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
    const [sharedInbox, setSharedInbox] = useState<SharedInboxMeta | null>(null);

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

    useEffect(() => {
        if (!companyId) return;
        return subscribeToSharedInbox(companyId, setSharedInbox);
    }, [companyId]);

    const usesSharedWhatsApp = !!(sharedInbox && sharedInbox.credentialCompanyId !== companyId);

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

    /**
     * Approval ticks save on their own, same as the master switch: changing one
     * and walking away should actually change what Dave does on the next message.
     */
    const handleToggleApproval = async (channel: 'email' | 'whatsapp', hold: boolean) => {
        if (!companyId) return;
        const key = channel === 'whatsapp' ? 'whatsappApprovalMode' : 'emailApprovalMode';
        const previous = channel === 'whatsapp'
            ? draft.whatsappApprovalMode
            : draft.emailApprovalMode;
        setDraft(prev => ({ ...prev, [key]: hold }));
        try {
            await saveSalesAgentSettings(companyId, { [key]: hold });
            const who = draft.agentName || 'Dave';
            const label = channel === 'whatsapp' ? 'WhatsApp' : 'email';
            toast.success(
                hold
                    ? `${who} will draft ${label} replies for you to approve.`
                    : `${who} will send ${label} replies himself.`
            );
        } catch (err: any) {
            setDraft(prev => ({ ...prev, [key]: previous }));
            toast.error(err?.message || 'Could not change that.');
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
        return <p className="text-sm text-ink-3">Loading…</p>;
    }

    return (
        <div className="space-y-6">
            {/* ---- master switch ---------------------------------------- */}
            <Card
                className={draft.enabled ? 'border-accent' : undefined}
                padding="lg"
            >
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="flex min-w-0 items-start gap-4">
                        <span className={`grid h-12 w-12 flex-shrink-0 place-items-center rounded-card ${draft.enabled ? 'bg-accent-soft text-accent-soft-ink' : 'bg-surface-2 text-ink-2'}`}>
                            <SparklesIcon className="h-6 w-6" />
                        </span>
                        <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-3">
                                <h2 className="text-[1.375rem] font-bold leading-7 tracking-[-0.01em] text-ink">
                                    {(saved?.agentName || 'Dave').trim() || 'Dave'} answers your enquiries
                                </h2>
                                <Badge variant={draft.enabled ? 'success' : 'default'} dot>
                                    {draft.enabled ? 'Answering' : 'Off'}
                                </Badge>
                            </div>
                            <p className="mt-1 max-w-2xl text-sm leading-5 text-ink-2">
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
                        <h3 className="flex items-center gap-2 text-lg font-bold text-ink">
                            <ChatBubbleLeftRightIcon className="h-5 w-5 text-ink-2" />
                            Test the agent
                        </h3>
                        <p className="mt-1 max-w-2xl text-sm leading-5 text-ink-2">
                            Talk to it yourself, as a customer would on WhatsApp. Nothing here reaches a real
                            customer and no conversation is created.
                        </p>
                    </div>
                    <Button variant="secondary" onClick={() => setSimulatorOpen(o => !o)}>
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
                        <SettingSelect
                            label="Price flexibility"
                            value={draft.priceFlexMode}
                            onChange={next => edit('priceFlexMode', next as SalesAgentSettings['priceFlexMode'])}
                            hint="On a second push, or a straight request for a number, the agent stops and asks you."
                            className="md:max-w-[28rem]"
                        >
                            <option value="hint">Hint — "usually a bit of movement", never a figure</option>
                            <option value="figure">Figure — may offer up to a set discount</option>
                            <option value="none">None — the price is the price</option>
                        </SettingSelect>

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
                            <p className="mb-1.5 text-sm font-semibold leading-5 text-ink">Reply delay</p>
                            <div className="flex flex-wrap items-center gap-3">
                                <div className="w-28">
                                    <Input
                                        type="number"
                                        min={0}
                                        aria-label="Shortest reply delay in seconds"
                                        value={String(draft.replyDelaySeconds[0])}
                                        onChange={e => edit('replyDelaySeconds', [Number(e.target.value) || 0, draft.replyDelaySeconds[1]])}
                                    />
                                </div>
                                <span className="text-sm text-ink-3">to</span>
                                <div className="w-28">
                                    <Input
                                        type="number"
                                        min={0}
                                        aria-label="Longest reply delay in seconds"
                                        value={String(draft.replyDelaySeconds[1])}
                                        onChange={e => edit('replyDelaySeconds', [draft.replyDelaySeconds[0], Number(e.target.value) || 0])}
                                    />
                                </div>
                                <span className="text-sm text-ink-3">seconds</span>
                            </div>
                            <p className="mt-1.5 text-sm leading-5 text-ink-3">
                                An answer that arrives the instant a message is sent reads as a machine. The agent
                                waits somewhere in this window.
                            </p>
                        </div>

                        <div>
                            <p className="mb-1 text-sm font-semibold leading-5 text-ink">Channels it answers on</p>
                            <div className="divide-y divide-line">
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

                        <div className="space-y-3">
                            <p className="text-sm font-semibold leading-5 text-ink">Before {draft.agentName || 'Dave'} sends</p>
                            <Toggle
                                label="Hold WhatsApp replies for approval"
                                hint={`On: you read the draft first. Off: ${draft.agentName || 'Dave'} sends WhatsApp himself. Steve and Chris each have their own copy.`}
                                checked={(draft.whatsappApprovalMode ?? draft.emailApprovalMode) !== false}
                                onChange={next => handleToggleApproval('whatsapp', next)}
                            />
                            <Toggle
                                label="Hold email replies for approval"
                                hint={`On: you read the draft first. Off: ${draft.agentName || 'Dave'} sends the email himself.`}
                                checked={draft.emailApprovalMode !== false}
                                onChange={next => handleToggleApproval('email', next)}
                            />
                            <div className="w-full md:w-64">
                                <Input
                                    label="Hand over after this many Dave replies"
                                    type="number"
                                    min={0}
                                    value={String(draft.maxAgentTurns ?? 0)}
                                    onChange={e => edit('maxAgentTurns', Math.max(0, Math.floor(Number(e.target.value) || 0)))}
                                    hint="0 = no limit. Once he hits the number, the next customer message is yours — he stops drafting and alerts you."
                                />
                            </div>
                        </div>

                        <div className="space-y-3">
                            <Toggle
                                label="Only send during office hours"
                                hint={`${draft.agentName || 'Dave'} still drafts and notifies you at night. Approve whenever — after hours the reply waits until opening time.`}
                                checked={draft.sendHours?.enabled !== false}
                                onChange={next => edit('sendHours', { ...draft.sendHours, enabled: next })}
                            />
                            {draft.sendHours?.enabled !== false && (
                                <div className="space-y-3 ps-[3.75rem]">
                                    <div className="flex flex-wrap items-end gap-3">
                                        <div className="w-36">
                                            <Input
                                                type="time"
                                                label="From"
                                                value={draft.sendHours?.start || '08:00'}
                                                onChange={e => edit('sendHours', { ...draft.sendHours, start: e.target.value || '08:00' })}
                                            />
                                        </div>
                                        <div className="w-36">
                                            <Input
                                                type="time"
                                                label="To"
                                                value={draft.sendHours?.end || '17:00'}
                                                onChange={e => edit('sendHours', { ...draft.sendHours, end: e.target.value || '17:00' })}
                                            />
                                        </div>
                                        <p className="pb-3.5 text-xs text-ink-3">Europe/London</p>
                                    </div>
                                    <div>
                                        <p className="mb-1.5 text-sm font-semibold leading-5 text-ink">Days</p>
                                        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Days it may send">
                                            {(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const).map((label, day) => {
                                                const selected = (draft.sendHours?.days || [1, 2, 3, 4, 5, 6]).includes(day);
                                                return (
                                                    <button
                                                        key={label}
                                                        type="button"
                                                        aria-pressed={selected}
                                                        onClick={() => {
                                                            const current = draft.sendHours?.days || [1, 2, 3, 4, 5, 6];
                                                            const next = selected
                                                                ? current.filter(d => d !== day)
                                                                : [...current, day].sort((a, b) => a - b);
                                                            edit('sendHours', { ...draft.sendHours, days: next.length ? next : [day] });
                                                        }}
                                                        className={`min-h-[44px] min-w-[44px] rounded-control border px-2 text-sm font-semibold transition-colors duration-quick ease-out [@media(pointer:coarse)]:min-h-[48px] ${
                                                            selected
                                                                ? 'border-accent bg-accent-soft text-accent-soft-ink'
                                                                : 'border-line-strong bg-surface text-ink-2 hover:bg-surface-2 hover:text-ink'
                                                        }`}
                                                    >
                                                        {label}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

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

                        <SettingSelect
                            label="Cars not in any ledger account"
                            value={draft.unmatchedStockPolicy ?? 'include'}
                            onChange={next => edit('unmatchedStockPolicy', next as SalesAgentSettings['unmatchedStockPolicy'])}
                            hint="A car on the website that nobody's stock list claims. Excluded ones are indexed but never offered, and the agent asks you rather than guessing."
                            className="md:max-w-[28rem]"
                        >
                            <option value="include">Include — the agent may sell anything on the site</option>
                            <option value="exclude">Exclude — only cars matched to a ledger account</option>
                        </SettingSelect>
                    </div>
                </Card.Body>
            </Card>

            {/* ---- save -------------------------------------------------- */}
            <div className="sticky bottom-3 z-sticky flex flex-wrap items-center justify-end gap-3 rounded-card border border-line bg-surface px-4 py-3 shadow-e1">
                {dirty && (
                    <p className="me-auto flex items-center gap-2 text-sm font-semibold text-warning-ink">
                        <span className="h-2 w-2 rounded-full bg-warning" aria-hidden />
                        Unsaved changes
                    </p>
                )}
                {!dirty && saved?.updatedAt ? (
                    <p className="me-auto text-sm text-ink-3">Saved {formatAgentTime(saved.updatedAt)}</p>
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

            {/* ---- shared inbox ------------------------------------------ */}
            <SharedInboxCard companyId={companyId} />

            {/* ---- stock index ------------------------------------------- */}
            <Card padding="lg">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="flex min-w-0 items-start gap-3">
                        <span className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-control bg-surface-2 text-ink-2">
                            <CarIcon className="h-5 w-5" />
                        </span>
                        <div className="min-w-0">
                            <h3 className="text-lg font-bold text-ink">Stock the agent can talk about</h3>
                            <p className="mt-1 max-w-2xl text-sm leading-5 text-ink-2">
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
                    <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-4 border-t border-line pt-4 md:grid-cols-4">
                        <div>
                            <dt className="font-mono text-xs font-semibold uppercase tracking-[0.08em] text-ink-3">Available</dt>
                            <dd className="num mt-1 text-[1.75rem] font-semibold leading-8 text-ink">{stockMeta.availableCount ?? 0}</dd>
                        </div>
                        <div>
                            <dt className="font-mono text-xs font-semibold uppercase tracking-[0.08em] text-ink-3">Listings read</dt>
                            <dd className="num mt-1 text-[1.75rem] font-semibold leading-8 text-ink">{stockMeta.count ?? 0}</dd>
                        </div>
                        <div>
                            <dt className="font-mono text-xs font-semibold uppercase tracking-[0.08em] text-ink-3">Last read</dt>
                            <dd className="mt-2 text-sm text-ink">{formatAgentTime(stockMeta.lastIndexedAt)}</dd>
                        </div>
                        <div>
                            <dt className="font-mono text-xs font-semibold uppercase tracking-[0.08em] text-ink-3">Took</dt>
                            <dd className="num mt-2 text-sm text-ink">
                                {stockMeta.durationMs ? `${Math.round(stockMeta.durationMs / 100) / 10}s` : '—'}
                            </dd>
                        </div>
                    </dl>
                ) : (
                    <p className="mt-5 border-t border-line pt-4 text-sm text-ink-3">
                        Nothing indexed yet. Run it once and the agent has a stock list to answer from.
                    </p>
                )}

                {!!stockErrors.length && (
                    <div className="mt-4 rounded-control border border-warning bg-warning-soft p-3 text-warning-ink">
                        <p className="flex items-center gap-2 text-sm font-semibold">
                            <ExclamationTriangleIcon className="h-5 w-5" />
                            {stockErrors.length === 1 ? 'One listing gave trouble' : `${stockErrors.length} listings gave trouble`}
                        </p>
                        <ul className="mt-2 space-y-1">
                            {stockErrors.slice(0, 5).map((err, i) => (
                                <li key={i} className="truncate font-mono text-xs">{err}</li>
                            ))}
                        </ul>
                        {stockErrors.length > 5 && (
                            <p className="mt-1 text-xs">and {stockErrors.length - 5} more</p>
                        )}
                    </div>
                )}
            </Card>

            {/* ---- connections ------------------------------------------- */}
            <div>
                <h3 className="mb-2 font-mono text-xs font-semibold uppercase tracking-[0.08em] text-ink-3">Connections</h3>
                <p className="mb-4 max-w-3xl text-sm leading-5 text-ink-2">
                    These go straight into the functions and cannot be read back out — not by this page, not by
                    anyone signed in. If you need to change one, paste the new value over the top.
                </p>

                <div className="space-y-6">
                    {/* WhatsApp */}
                    <Card padding="lg">
                        <Card.Header
                            action={<Badge variant={usesSharedWhatsApp || connections.whatsapp ? 'success' : 'default'}>{usesSharedWhatsApp ? 'Shared number' : connections.whatsapp ? 'Connected' : 'Not connected'}</Badge>}
                        >
                            <span className="flex items-center gap-2">
                                <WhatsAppMark brand className="h-5 w-5" />
                                WhatsApp Cloud API
                            </span>
                        </Card.Header>
                        <Card.Body>
                            {usesSharedWhatsApp ? (
                                <p className="text-sm text-ink-2 max-w-2xl">
                                    This ledger uses the shared {sharedInbox?.name || 'Radlett'} number. You do not
                                    paste Meta tokens here — send from the Agent Inbox and it goes out on that number.
                                </p>
                            ) : showWhatsApp ? (
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
                                    <p className="text-sm text-ink-3 max-w-xl">
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
                                <PhoneIcon className="h-5 w-5 text-ink-2" />
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
                                    <p className="text-sm text-ink-3 max-w-xl">
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
                                <EnvelopeIcon className="h-5 w-5 text-ink-2" />
                                Gmail
                            </span>
                        </Card.Header>
                        <Card.Body>
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <p className="text-sm text-ink-3 max-w-xl">
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
                                <BoltIcon className="h-5 w-5 text-ink-2" />
                                Addresses to paste into Meta and Twilio
                            </span>
                        </Card.Header>
                        <Card.Body>
                            <p className="text-sm text-ink-3 mb-4 max-w-2xl">
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
                <div className="flex items-center gap-3 text-sm text-ink-3">
                    <Spinner className="h-4 w-4" /> Loading settings…
                </div>
            )}
        </div>
    );
};

export default SalesAgentSettingsPage;
