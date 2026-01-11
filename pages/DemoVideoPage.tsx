import React, { useState, useEffect } from 'react';
import {
    CarIcon,
    DocumentTextIcon,
    CreditCardIcon,
    SparklesIcon,
    CheckCircleIcon,
    CalendarIcon,
    ChartPieIcon,
    BanknotesIcon,
    WrenchScrewdriverIcon,
    UserGroupIcon,
    EnvelopeIcon,
    PhoneIcon
} from '../components/icons';

// Scene duration in milliseconds
const SCENE_DURATION = 6000;

interface Scene {
    id: string;
    title: string;
    subtitle: string;
    desktop: React.ReactNode;
    mobile: React.ReactNode;
}

// ============ MOCKUP COMPONENTS ============

const DashboardMockup = ({ isMobile = false }) => {
    const vehicles = [
        { reg: 'YK73 HJT', make: 'BMW', model: '320d M Sport', price: 18500, status: 'Available', days: 12 },
        { reg: 'PE72 XYZ', make: 'Audi', model: 'A4 S-Line', price: 22750, status: 'Reserved', days: 5 },
        { reg: 'LM71 ABC', make: 'Mercedes', model: 'C200 AMG', price: 24995, status: 'Available', days: 8 },
    ];

    const stats = [
        { label: 'Stock Value', value: '£187,450', change: '+12%' },
        { label: 'This Month', value: '£34,200', change: '+8%' },
        { label: 'Pending', value: '£12,500', change: '3 deals' },
    ];

    return (
        <div className="bg-gray-900 h-full flex flex-col">
            <div className="bg-gray-800/50 px-3 py-2 border-b border-gray-700 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-lg bg-brand-500/20 flex items-center justify-center">
                        <CarIcon className="w-3 h-3 text-brand-400" />
                    </div>
                    <span className="text-xs font-semibold text-white">Dashboard</span>
                </div>
                <div className="flex items-center gap-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                    <span className="text-[10px] text-gray-400">Live</span>
                </div>
            </div>

            <div className={`grid ${isMobile ? 'grid-cols-1' : 'grid-cols-3'} gap-px bg-gray-800`}>
                {stats.slice(0, isMobile ? 2 : 3).map((stat, i) => (
                    <div key={i} className="bg-gray-900 p-3 text-center">
                        <div className="text-sm font-bold text-white">{stat.value}</div>
                        <div className="text-[10px] text-gray-500">{stat.label}</div>
                        <div className="text-[10px] text-green-400">{stat.change}</div>
                    </div>
                ))}
            </div>

            <div className="flex-1 p-3 space-y-2 overflow-hidden">
                {vehicles.slice(0, isMobile ? 2 : 3).map((v, i) => (
                    <div key={i} className="flex items-center justify-between p-2 bg-gray-800/50 rounded-lg border border-gray-700/50 animate-in slide-in-from-right-5" style={{ animationDelay: `${i * 200}ms` }}>
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-gray-700 to-gray-800 flex items-center justify-center text-[10px] font-bold text-gray-400">
                                {v.make.substring(0, 2)}
                            </div>
                            <div>
                                <div className="text-xs font-semibold text-white">{v.make} {v.model}</div>
                                <div className="text-[10px] text-gray-500">{v.reg}</div>
                            </div>
                        </div>
                        <div className="text-right">
                            <div className="text-xs font-bold text-brand-400">£{v.price.toLocaleString()}</div>
                            <div className={`text-[10px] px-1.5 py-0.5 rounded-full ${v.status === 'Available' ? 'bg-green-500/10 text-green-400' : 'bg-amber-500/10 text-amber-400'}`}>
                                {v.status}
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

const ExpensesMockup = ({ isMobile = false }) => {
    const receipts = [
        { vendor: 'BCA Auction', category: 'Vehicle Purchase', amount: 8750, icon: CarIcon, color: 'rose' },
        { vendor: 'Halfords Trade', category: 'Parts & Repairs', amount: 234.50, icon: WrenchScrewdriverIcon, color: 'sky' },
        { vendor: 'Shell Garage', category: 'Fuel', amount: 89.40, icon: BanknotesIcon, color: 'orange' },
    ];

    const colorClasses: Record<string, string> = {
        rose: 'bg-rose-500/10 text-rose-400',
        sky: 'bg-sky-500/10 text-sky-400',
        orange: 'bg-orange-500/10 text-orange-400',
    };

    return (
        <div className="bg-gray-900 h-full flex flex-col">
            <div className="bg-gray-800/50 px-3 py-2 border-b border-gray-700 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                        <CreditCardIcon className="w-3 h-3 text-emerald-400" />
                    </div>
                    <span className="text-xs font-semibold text-white">Expenses</span>
                </div>
                <div className="text-[10px] text-gray-400">This Month: <span className="text-white font-semibold">£9,248</span></div>
            </div>

            <div className="flex-1 p-3 space-y-2 overflow-hidden">
                {receipts.map((r, i) => {
                    const Icon = r.icon;
                    return (
                        <div key={i} className="flex items-center justify-between p-2 bg-gray-800/50 rounded-lg border border-gray-700/50 animate-in slide-in-from-left-5" style={{ animationDelay: `${i * 200}ms` }}>
                            <div className="flex items-center gap-2">
                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${colorClasses[r.color]}`}>
                                    <Icon className="w-4 h-4" />
                                </div>
                                <div>
                                    <div className="text-xs font-semibold text-white">{r.vendor}</div>
                                    <div className="text-[10px] text-gray-500">{r.category}</div>
                                </div>
                            </div>
                            <div className="text-xs font-bold text-white">£{r.amount.toLocaleString()}</div>
                        </div>
                    );
                })}
            </div>

            <div className="p-3 pt-0">
                <div className="flex items-center gap-2 p-2 bg-brand-500/10 border border-brand-500/20 rounded-lg text-brand-400 text-xs animate-pulse">
                    <SparklesIcon className="w-4 h-4" />
                    <span>AI Scan Receipt</span>
                </div>
            </div>
        </div>
    );
};

const InvoiceMockup = ({ isMobile = false }) => {
    return (
        <div className="bg-gray-900 h-full flex flex-col">
            <div className="bg-gray-800/50 px-3 py-2 border-b border-gray-700 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-lg bg-violet-500/20 flex items-center justify-center">
                        <DocumentTextIcon className="w-3 h-3 text-violet-400" />
                    </div>
                    <span className="text-xs font-semibold text-white">Invoice #1047</span>
                </div>
                <div className="text-[10px] px-2 py-0.5 bg-green-500/10 text-green-400 rounded-full">Paid</div>
            </div>

            <div className="flex-1 p-3 space-y-3">
                <div className="p-3 bg-gray-800/50 rounded-lg border border-gray-700/50 animate-in fade-in duration-500">
                    <div className="text-[10px] text-gray-500 mb-1">Vehicle</div>
                    <div className="text-sm font-bold text-white">BMW 320d M Sport</div>
                    <div className="text-xs text-gray-400">YK73 HJT • 2023 • 12,450 miles</div>
                </div>

                <div className="p-3 bg-gray-800/50 rounded-lg border border-gray-700/50 animate-in fade-in duration-500 delay-200">
                    <div className="text-[10px] text-gray-500 mb-1">Customer</div>
                    <div className="text-sm font-semibold text-white">James Wilson</div>
                    <div className="text-xs text-gray-400">123 High Street, London</div>
                </div>

                <div className="p-3 bg-gray-800/50 rounded-lg border border-gray-700/50 animate-in fade-in duration-500 delay-300">
                    <div className="flex justify-between items-center mb-2">
                        <span className="text-xs text-gray-400">Sale Price</span>
                        <span className="text-sm font-bold text-white">£18,500</span>
                    </div>
                    <div className="flex justify-between items-center mb-2">
                        <span className="text-xs text-gray-400">Part Exchange</span>
                        <span className="text-sm text-gray-300">-£4,500</span>
                    </div>
                    <div className="border-t border-gray-700 pt-2 flex justify-between items-center">
                        <span className="text-xs font-semibold text-white">Balance Due</span>
                        <span className="text-lg font-bold text-brand-400">£14,000</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

const CRMMockup = ({ isMobile = false }) => {
    const leads = [
        { name: 'Sarah Mitchell', vehicle: 'Audi A4', stage: 'Hot', score: 92 },
        { name: 'Mark Thompson', vehicle: 'BMW 320d', stage: 'Warm', score: 75 },
        { name: 'Emma Davies', vehicle: 'Mercedes C200', stage: 'New', score: 60 },
    ];

    return (
        <div className="bg-gray-900 h-full flex flex-col">
            <div className="bg-gray-800/50 px-3 py-2 border-b border-gray-700 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-lg bg-pink-500/20 flex items-center justify-center">
                        <UserGroupIcon className="w-3 h-3 text-pink-400" />
                    </div>
                    <span className="text-xs font-semibold text-white">Pipeline</span>
                </div>
                <div className="text-[10px] text-gray-400">12 active leads</div>
            </div>

            <div className="flex-1 p-3 space-y-2 overflow-hidden">
                {leads.map((lead, i) => (
                    <div key={i} className="p-2 bg-gray-800/50 rounded-lg border border-gray-700/50 animate-in slide-in-from-bottom-3" style={{ animationDelay: `${i * 150}ms` }}>
                        <div className="flex items-center justify-between mb-1">
                            <div className="text-xs font-semibold text-white">{lead.name}</div>
                            <div className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                                lead.stage === 'Hot' ? 'bg-red-500/10 text-red-400' :
                                lead.stage === 'Warm' ? 'bg-amber-500/10 text-amber-400' :
                                'bg-blue-500/10 text-blue-400'
                            }`}>
                                {lead.stage}
                            </div>
                        </div>
                        <div className="flex items-center justify-between">
                            <div className="text-[10px] text-gray-500">Interested in {lead.vehicle}</div>
                            <div className="flex items-center gap-1">
                                <SparklesIcon className="w-3 h-3 text-brand-400" />
                                <span className="text-[10px] text-brand-400">{lead.score}</span>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            <div className="p-3 pt-0">
                <div className="flex items-center justify-center gap-2 p-2 bg-gray-800 rounded-lg text-gray-400 text-[10px]">
                    <EnvelopeIcon className="w-3 h-3" />
                    <span>3 new enquiries</span>
                </div>
            </div>
        </div>
    );
};

const VATMockup = ({ isMobile = false }) => {
    return (
        <div className="bg-gray-900 h-full flex flex-col">
            <div className="bg-gray-800/50 px-3 py-2 border-b border-gray-700 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-lg bg-teal-500/20 flex items-center justify-center">
                        <ChartPieIcon className="w-3 h-3 text-teal-400" />
                    </div>
                    <span className="text-xs font-semibold text-white">VAT Summary</span>
                </div>
                <div className="text-[10px] text-gray-400">Q4 2024</div>
            </div>

            <div className="flex-1 p-3 space-y-3">
                <div className="grid grid-cols-2 gap-2">
                    <div className="p-3 bg-gray-800/50 rounded-lg border border-gray-700/50 animate-in fade-in duration-300">
                        <div className="text-[10px] text-gray-500">Output VAT</div>
                        <div className="text-lg font-bold text-white">£4,280</div>
                    </div>
                    <div className="p-3 bg-gray-800/50 rounded-lg border border-gray-700/50 animate-in fade-in duration-300 delay-100">
                        <div className="text-[10px] text-gray-500">Input VAT</div>
                        <div className="text-lg font-bold text-white">£1,850</div>
                    </div>
                </div>

                <div className="p-4 bg-gradient-to-br from-teal-500/10 to-emerald-500/10 rounded-xl border border-teal-500/20 animate-in fade-in duration-500 delay-200">
                    <div className="text-[10px] text-teal-400 mb-1">VAT Payable</div>
                    <div className="text-2xl font-bold text-white">£2,430</div>
                    <div className="text-[10px] text-gray-400 mt-1">Due: 7th February 2025</div>
                </div>

                <div className="flex gap-2">
                    <button className="flex-1 py-2 text-[10px] font-semibold bg-gray-800 hover:bg-gray-700 rounded-lg text-gray-300 transition-colors">
                        Export CSV
                    </button>
                    <button className="flex-1 py-2 text-[10px] font-semibold bg-teal-600 hover:bg-teal-500 rounded-lg text-white transition-colors">
                        Download Report
                    </button>
                </div>
            </div>
        </div>
    );
};

const CalendarMockup = ({ isMobile = false }) => {
    const appointments = [
        { time: '10:00', title: 'Test Drive - BMW 320d', customer: 'James Wilson' },
        { time: '14:30', title: 'Vehicle Handover', customer: 'Sarah Mitchell' },
        { time: '16:00', title: 'Valuation', customer: 'Mark Thompson' },
    ];

    return (
        <div className="bg-gray-900 h-full flex flex-col">
            <div className="bg-gray-800/50 px-3 py-2 border-b border-gray-700 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-lg bg-violet-500/20 flex items-center justify-center">
                        <CalendarIcon className="w-3 h-3 text-violet-400" />
                    </div>
                    <span className="text-xs font-semibold text-white">Calendar</span>
                </div>
                <div className="flex items-center gap-1">
                    <div className="w-4 h-4 rounded bg-[#4285F4] flex items-center justify-center">
                        <span className="text-[6px] font-bold text-white">G</span>
                    </div>
                    <span className="text-[10px] text-green-400">Synced</span>
                </div>
            </div>

            <div className="p-3">
                <div className="text-xs font-semibold text-white mb-2">Today's Appointments</div>
                <div className="space-y-2">
                    {appointments.map((apt, i) => (
                        <div key={i} className="flex items-center gap-2 p-2 bg-gray-800/50 rounded-lg border-l-2 border-brand-500 animate-in slide-in-from-right-3" style={{ animationDelay: `${i * 150}ms` }}>
                            <div className="text-[10px] font-mono text-brand-400 w-10">{apt.time}</div>
                            <div className="flex-1">
                                <div className="text-xs font-medium text-white">{apt.title}</div>
                                <div className="text-[10px] text-gray-500">{apt.customer}</div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

// ============ DEVICE FRAMES ============

const DesktopFrame = ({ children }: { children: React.ReactNode }) => (
    <div className="relative">
        <div className="bg-gray-800 rounded-xl p-2 shadow-2xl border border-gray-700">
            <div className="bg-gray-900 rounded-lg overflow-hidden" style={{ width: 480, height: 300 }}>
                {children}
            </div>
        </div>
        <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 w-32 h-4 bg-gray-800 rounded-b-xl" />
    </div>
);

const MobileFrame = ({ children }: { children: React.ReactNode }) => (
    <div className="relative">
        <div className="bg-gray-800 rounded-[2rem] p-2 shadow-2xl border border-gray-700">
            <div className="bg-gray-900 rounded-[1.5rem] overflow-hidden relative" style={{ width: 180, height: 380 }}>
                {/* Notch */}
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-16 h-5 bg-gray-800 rounded-b-xl z-10" />
                <div className="pt-6 h-full">
                    {children}
                </div>
            </div>
        </div>
    </div>
);

// ============ MAIN COMPONENT ============

const DemoVideoPage: React.FC = () => {
    const [currentScene, setCurrentScene] = useState(0);
    const [isPlaying, setIsPlaying] = useState(true);

    const scenes: Scene[] = [
        {
            id: 'intro',
            title: 'Dealer Ledger Pro',
            subtitle: 'Everything your dealership needs in one place',
            desktop: <DashboardMockup />,
            mobile: <DashboardMockup isMobile />,
        },
        {
            id: 'stock',
            title: 'Smart Stock Management',
            subtitle: 'Track every vehicle from purchase to sale',
            desktop: <DashboardMockup />,
            mobile: <DashboardMockup isMobile />,
        },
        {
            id: 'expenses',
            title: 'Expense Tracking',
            subtitle: 'AI-powered receipt scanning & categorisation',
            desktop: <ExpensesMockup />,
            mobile: <ExpensesMockup isMobile />,
        },
        {
            id: 'invoices',
            title: 'Professional Invoicing',
            subtitle: 'Create invoices in seconds with VAT margin support',
            desktop: <InvoiceMockup />,
            mobile: <InvoiceMockup isMobile />,
        },
        {
            id: 'crm',
            title: 'CRM & Lead Pipeline',
            subtitle: 'AI-scored leads with automatic email capture',
            desktop: <CRMMockup />,
            mobile: <CRMMockup isMobile />,
        },
        {
            id: 'vat',
            title: 'VAT & Reporting',
            subtitle: 'One-click accountant exports and VAT calculations',
            desktop: <VATMockup />,
            mobile: <VATMockup isMobile />,
        },
        {
            id: 'calendar',
            title: 'Calendar Integration',
            subtitle: 'Sync with Google Calendar for test drives & handovers',
            desktop: <CalendarMockup />,
            mobile: <CalendarMockup isMobile />,
        },
        {
            id: 'outro',
            title: 'Start Your Free Trial',
            subtitle: 'Join 500+ dealers saving £4,500/year',
            desktop: <DashboardMockup />,
            mobile: <DashboardMockup isMobile />,
        },
    ];

    useEffect(() => {
        if (!isPlaying) return;

        const timer = setInterval(() => {
            setCurrentScene((prev) => (prev + 1) % scenes.length);
        }, SCENE_DURATION);

        return () => clearInterval(timer);
    }, [isPlaying, scenes.length]);

    const scene = scenes[currentScene];

    return (
        <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center p-8 overflow-hidden">
            {/* Background gradient */}
            <div className="fixed inset-0 bg-gradient-to-br from-brand-900/20 via-gray-950 to-gray-950 pointer-events-none" />
            <div className="fixed top-1/4 left-1/4 w-96 h-96 bg-brand-500/10 rounded-full blur-[128px] pointer-events-none" />
            <div className="fixed bottom-1/4 right-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-[128px] pointer-events-none" />

            {/* Logo */}
            <div className="absolute top-8 left-8 flex items-center gap-2 z-20">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center shadow-lg shadow-brand-500/20">
                    <CarIcon className="w-6 h-6 text-white" />
                </div>
                <span className="text-xl font-bold tracking-tight">
                    <span className="text-white">Dealer</span>
                    <span className="text-brand-400">Ledger</span>
                    <span className="text-gray-500 font-normal ml-1">Pro</span>
                </span>
            </div>

            {/* Scene counter */}
            <div className="absolute top-8 right-8 flex items-center gap-2 z-20">
                {scenes.map((_, i) => (
                    <div
                        key={i}
                        className={`w-2 h-2 rounded-full transition-all duration-300 ${
                            i === currentScene ? 'bg-brand-500 w-6' : 'bg-gray-700'
                        }`}
                    />
                ))}
            </div>

            {/* Main content */}
            <div className="relative z-10 flex flex-col items-center">
                {/* Title */}
                <div className="text-center mb-12 animate-in fade-in slide-in-from-bottom-4 duration-700" key={scene.id + '-title'}>
                    <h1 className="text-4xl md:text-5xl font-bold text-white mb-3">{scene.title}</h1>
                    <p className="text-xl text-gray-400">{scene.subtitle}</p>
                </div>

                {/* Devices */}
                <div className="flex items-end gap-8 animate-in fade-in zoom-in-95 duration-700" key={scene.id + '-devices'}>
                    <DesktopFrame>{scene.desktop}</DesktopFrame>
                    <MobileFrame>{scene.mobile}</MobileFrame>
                </div>

                {/* Progress bar */}
                <div className="mt-12 w-64 h-1 bg-gray-800 rounded-full overflow-hidden">
                    <div
                        className="h-full bg-brand-500 transition-all ease-linear"
                        style={{
                            width: '100%',
                            animation: `progress ${SCENE_DURATION}ms linear`,
                        }}
                        key={scene.id + '-progress'}
                    />
                </div>
            </div>

            {/* Play/Pause button */}
            <button
                onClick={() => setIsPlaying(!isPlaying)}
                className="absolute bottom-8 right-8 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white text-sm font-medium rounded-lg transition-colors z-20"
            >
                {isPlaying ? 'Pause' : 'Play'}
            </button>

            {/* CSS for progress animation */}
            <style>{`
                @keyframes progress {
                    from { width: 0%; }
                    to { width: 100%; }
                }
            `}</style>
        </div>
    );
};

export default DemoVideoPage;
