import React, { useEffect, useRef, useState } from 'react';
import BusinessDetailsPage from '../components/settings/BusinessDetailsPage';
import AppearancePage from '../components/settings/AppearancePage';
import DataManagement from '../components/settings/DataManagement';
import SupplierManagement from '../components/settings/SupplierManagement';
import AccountManagement from '../components/settings/AccountManagement';
import IntegrationsPage from '../components/settings/IntegrationsPage';
import ConnectorsPage from '../components/settings/ConnectorsPage';
import MotSweepCard from '../components/settings/MotSweepCard';
import AppUpdateCard from '../components/settings/AppUpdateCard';
import DiagnosticsPage from '../components/settings/DiagnosticsPage';
import SalesAgentSettingsPage from '../components/salesAgent/SalesAgentSettingsPage';
import { GlobeGlyph, SwatchGlyph } from '../components/settings/SettingsKit';
import { useData } from '../hooks/useData';
import { useThemeMode } from '../contexts/ThemeContext';
import { useAppUpdate } from '../contexts/AppUpdateContext';
import { cx, eyebrow } from '../components/ui/cx';
import {
    ArchiveBoxIcon,
    ArrowPathIcon,
    BanknotesIcon,
    BoltIcon,
    BuildingStorefrontIcon,
    ChatBubbleLeftRightIcon,
    ChevronLeftIcon,
    ChevronRightIcon,
    ShieldCheckIcon,
    SignalIcon,
    TruckIcon,
} from '../components/icons';

type SettingsTab =
    | 'details' | 'suppliers' | 'accounts'
    | 'integrations' | 'connectors' | 'salesAgent'
    | 'mot' | 'data'
    | 'appearance' | 'update' | 'diagnostics';

interface SectionDef {
    id: SettingsTab;
    label: string;
    /** One line under the title on the section's own page. */
    blurb: string;
    icon: React.ReactNode;
}

const GROUPS: { label: string; items: SectionDef[] }[] = [
    {
        label: 'Business',
        items: [
            { id: 'details', label: 'Business details', blurb: 'Your name and address, VAT, year end, and what prints on your invoices.', icon: <BuildingStorefrontIcon /> },
            { id: 'suppliers', label: 'Suppliers', blurb: 'Suppliers you pay several invoices to in one bank payment.', icon: <TruckIcon /> },
            { id: 'accounts', label: 'Bank and card accounts', blurb: 'The accounts you upload statements for.', icon: <BanknotesIcon /> },
        ],
    },
    {
        label: 'Connections',
        items: [
            { id: 'integrations', label: 'Integrations', blurb: 'Accounts you sign in to: Google, Twilio and WhatsApp.', icon: <BoltIcon /> },
            { id: 'connectors', label: 'Website', blurb: 'Send your stock to your website’s back office.', icon: <GlobeGlyph /> },
            { id: 'salesAgent', label: 'AI sales agent', blurb: 'How Dave answers your leads.', icon: <ChatBubbleLeftRightIcon /> },
        ],
    },
    {
        label: 'Tools',
        items: [
            { id: 'mot', label: 'MOT checks', blurb: 'The morning check of every car’s MOT and tax.', icon: <ShieldCheckIcon /> },
            { id: 'data', label: 'Data and files', blurb: 'Statement uploads, backups, and bulk tools.', icon: <ArchiveBoxIcon /> },
        ],
    },
    {
        label: 'App',
        items: [
            { id: 'appearance', label: 'Appearance', blurb: 'Light or dark on this device, and your business colour.', icon: <SwatchGlyph /> },
            { id: 'update', label: 'App update', blurb: 'Get the newest version without signing out.', icon: <ArrowPathIcon /> },
            { id: 'diagnostics', label: 'Diagnostics', blurb: 'Your account IDs and a storage check, for support.', icon: <SignalIcon /> },
        ],
    },
];

const SECTIONS = GROUPS.flatMap(g => g.items);
const sectionOf = (id: SettingsTab) => SECTIONS.find(s => s.id === id)!;

const MODE_LABEL = { system: 'System', light: 'Light', dark: 'Dark' } as const;
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Settings: a grouped list on phones (each row opens its own page, with a
 * back link), a two-pane layout from 1024px (the list stays on the left).
 */
const SettingsPage = () => {
    const { businessDetails, suppliers, financialAccounts, theme, isVatRegistered } = useData();
    const { mode } = useThemeMode();
    const { status: updateStatus, needRefresh } = useAppUpdate();

    // Google sends the browser back to /app/settings?gmail=connected, and the
    // section that has to notice is the sales agent's — landing anywhere else
    // would drop the return leg on the floor.
    const [activeTab, setActiveTab] = useState<SettingsTab | null>(() =>
        new URLSearchParams(window.location.search).get('gmail') ? 'salesAgent' : null
    );
    // Phones show the list until a row is chosen; wide screens always show a section.
    const shown: SettingsTab = activeTab ?? 'details';
    const topRef = useRef<HTMLDivElement>(null);
    const firstRender = useRef(true);

    useEffect(() => {
        if (firstRender.current) { firstRender.current = false; return; }
        topRef.current?.scrollIntoView({ block: 'start' });
    }, [activeTab]);

    const openCount = financialAccounts.filter(a => !a.closed).length;
    const updateReady = updateStatus === 'ready' || needRefresh;
    const meta: Partial<Record<SettingsTab, React.ReactNode>> = {
        suppliers: suppliers.length ? <span className="num">{suppliers.length}</span> : 'None',
        accounts: financialAccounts.length ? <span className="num">{openCount}</span> : 'None',
        appearance: `${MODE_LABEL[mode]} · ${capital(theme || 'blue')}`,
        update: updateReady ? <span className="font-semibold text-accent-text">Ready</span> : undefined,
    };

    const businessName = businessDetails?.name?.trim() || 'Your business';
    const initials = businessName.split(/\s+/).filter(w => /^[A-Za-z0-9]/.test(w)).slice(0, 2).map(w => w[0].toUpperCase()).join('') || 'B';
    const modeName = { dealership: 'Dealership', paint_shop: 'Paint shop', mechanic: 'Mechanic' }[businessDetails?.operatingMode || 'dealership'] || 'Dealership';
    const current = sectionOf(shown);

    return (
        <div ref={topRef} className="scroll-mt-4 lg:grid lg:grid-cols-[232px_minmax(0,1fr)] lg:items-start lg:gap-8">
            {/* ---- The list: whole screen on phones, left pane on desktop ---- */}
            <nav aria-label="Settings" className={cx('space-y-5 lg:sticky lg:top-4 lg:space-y-4', activeTab ? 'hidden lg:block' : '')}>
                <button
                    type="button"
                    onClick={() => setActiveTab('details')}
                    className="flex min-h-[64px] w-full items-center gap-3 rounded-card border border-line bg-surface px-3.5 py-3 text-start transition-colors duration-quick ease-out hover:bg-surface-2 active:bg-surface-3 lg:hidden"
                >
                    <span aria-hidden="true" className="grid h-10 w-10 flex-none place-items-center rounded-control bg-ink font-mono text-sm font-semibold text-surface">{initials}</span>
                    <span className="min-w-0 flex-1">
                        <span className="block truncate text-base font-semibold leading-[1.3] text-ink">{businessName}</span>
                        <span className="block truncate text-sm leading-[1.3] text-ink-3">{modeName}{isVatRegistered ? ' · VAT registered' : ''}</span>
                    </span>
                    <span className="flex-none text-sm font-semibold text-accent-text">Edit</span>
                </button>

                {GROUPS.map(group => (
                    <div key={group.label}>
                        <p className={cx(eyebrow, 'px-1 pb-1.5 lg:px-3')}>{group.label}</p>
                        <ul className="m-0 list-none overflow-hidden rounded-card border border-line bg-surface p-0 lg:overflow-visible lg:rounded-none lg:border-0 lg:bg-transparent">
                            {group.items.map(item => {
                                const selected = shown === item.id;
                                return (
                                    <li key={item.id} className="border-b border-line last:border-b-0 lg:border-b-0">
                                        <button
                                            type="button"
                                            onClick={() => setActiveTab(item.id)}
                                            aria-current={selected ? 'page' : undefined}
                                            className={cx(
                                                'group flex w-full items-center gap-3 text-start transition-colors duration-quick ease-out',
                                                'min-h-[52px] px-3.5 hover:bg-surface-2 active:bg-surface-3',
                                                'lg:min-h-[44px] lg:rounded-control lg:px-3 [@media(pointer:coarse)]:lg:min-h-[48px]',
                                                selected && 'lg:bg-accent-soft lg:text-accent-soft-ink lg:hover:bg-accent-soft',
                                            )}
                                        >
                                            <span aria-hidden="true" className={cx('flex flex-none [&_svg]:h-6 [&_svg]:w-6 lg:[&_svg]:h-5 lg:[&_svg]:w-5', selected ? 'text-ink-2 lg:text-accent-soft-ink' : 'text-ink-2')}>
                                                {item.icon}
                                            </span>
                                            <span className={cx('min-w-0 flex-1 truncate text-base leading-tight lg:text-sm', selected ? 'font-semibold lg:font-bold' : 'font-semibold')}>
                                                {item.label}
                                            </span>
                                            {meta[item.id] !== undefined && (
                                                <span className={cx('flex-none text-sm', selected ? 'text-ink-3 lg:text-accent-soft-ink' : 'text-ink-3')}>{meta[item.id]}</span>
                                            )}
                                            <ChevronRightIcon className="h-5 w-5 flex-none text-ink-3 lg:hidden" />
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    </div>
                ))}
            </nav>

            {/* ---- The section: its own page on phones, right pane on desktop ---- */}
            <div className={cx('min-w-0', activeTab ? '' : 'hidden lg:block')}>
                <header className="mb-5">
                    <button
                        type="button"
                        onClick={() => setActiveTab(null)}
                        className="-ms-2 mb-1 inline-flex min-h-[48px] items-center gap-1 rounded-control pe-3 ps-1 text-base font-semibold text-accent-text transition-colors duration-quick ease-out hover:bg-accent-soft lg:hidden"
                    >
                        <ChevronLeftIcon className="h-5 w-5 flex-none" />
                        Settings
                    </button>
                    <h2 className="text-[1.375rem] font-bold leading-7 tracking-[-0.01em] text-ink">{current.label}</h2>
                    <p className="mt-1 max-w-[62ch] text-sm leading-5 text-ink-3">{current.blurb}</p>
                </header>

                <div className="max-w-3xl">
                    <div hidden={shown !== 'details'}><BusinessDetailsPage /></div>
                    <div hidden={shown !== 'suppliers'}><SupplierManagement /></div>
                    <div hidden={shown !== 'accounts'}><AccountManagement /></div>
                    <div hidden={shown !== 'integrations'}><IntegrationsPage /></div>
                    <div hidden={shown !== 'connectors'}><ConnectorsPage /></div>
                    {/* Mounted only while open: it holds live listeners on the agent's
                        settings, its stock index and, once opened, the simulator. */}
                    {shown === 'salesAgent' && <SalesAgentSettingsPage />}
                    <div hidden={shown !== 'mot'}><MotSweepCard /></div>
                    <div hidden={shown !== 'data'}><DataManagement /></div>
                    <div hidden={shown !== 'appearance'}><AppearancePage /></div>
                    <div hidden={shown !== 'update'}><AppUpdateCard /></div>
                    <div hidden={shown !== 'diagnostics'}><DiagnosticsPage /></div>
                </div>
            </div>
        </div>
    );
};

export default SettingsPage;
