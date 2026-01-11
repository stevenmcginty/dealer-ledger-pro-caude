import React, { useState, useEffect } from 'react';
import {
    CarIcon,
    DocumentTextIcon,
    CreditCardIcon,
    UserGroupIcon,
    PhoneIcon,
    SparklesIcon,
    CheckCircleIcon,
    ChartPieIcon,
    CalendarIcon,
    EnvelopeIcon
} from '../components/icons';

interface LandingPageProps {
    onLogin: () => void;
    onNavigate: (page: 'home' | 'pricing' | 'demo' | 'contact') => void;
    currentPage: 'home' | 'pricing' | 'demo' | 'contact';
}

const LandingPage: React.FC<LandingPageProps> = ({ onLogin, onNavigate, currentPage }) => {
    const [isScrolled, setIsScrolled] = useState(false);
    const [animatedStats, setAnimatedStats] = useState({ dealers: 0, vehicles: 0, savings: 0 });

    useEffect(() => {
        const handleScroll = () => setIsScrolled(window.scrollY > 20);
        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    // Animate stats on load
    useEffect(() => {
        const duration = 2000;
        const steps = 60;
        const interval = duration / steps;

        let step = 0;
        const timer = setInterval(() => {
            step++;
            const progress = step / steps;
            setAnimatedStats({
                dealers: Math.floor(500 * progress),
                vehicles: Math.floor(15000 * progress),
                savings: Math.floor(4500 * progress),
            });
            if (step >= steps) clearInterval(timer);
        }, interval);

        return () => clearInterval(timer);
    }, []);

    const features = [
        {
            icon: CarIcon,
            title: 'Stock Management',
            description: 'Track your entire inventory with VIN decoding, MOT reminders, and automatic stock numbering.',
            color: 'brand',
        },
        {
            icon: DocumentTextIcon,
            title: 'Invoice Generation',
            description: 'Create professional sales invoices, deposit slips, and proformas in seconds. VAT margin scheme support included.',
            color: 'brand',
        },
        {
            icon: CreditCardIcon,
            title: 'Expense Tracking',
            description: 'Log expenses, attach receipts, and reconcile with bank statements. Perfect for tax time.',
            color: 'brand',
        },
        {
            icon: UserGroupIcon,
            title: 'CRM & Lead Pipeline',
            description: 'Kanban-style pipeline, automatic lead capture from emails, and activity tracking.',
            color: 'brand',
        },
        {
            icon: PhoneIcon,
            title: 'Communication Hub',
            description: 'Log calls, send emails, and track all customer interactions in one place.',
            color: 'brand',
        },
        {
            icon: SparklesIcon,
            title: 'AI-Powered',
            description: 'Automatic email analysis, smart response suggestions, and intelligent lead scoring.',
            color: 'brand',
        },
    ];

    const comparisons = [
        { name: 'Dealer Management System', price: '199/mo', features: 4 },
        { name: 'CRM Software', price: '79/mo', features: 3 },
        { name: 'Accounting Software', price: '35/mo', features: 2 },
        { name: 'Email Marketing', price: '29/mo', features: 1 },
    ];

    const showcaseFeatures = [
        {
            title: "Smart Stock Management",
            description: "Track every vehicle from acquisition to sale. VIN decoding, automatic stock numbering, and profit tracking built-in.",
            image: "/screenshots/stock.png",
            align: "right"
        },
        {
            title: "Expense Tracking Made Simple",
            description: "Log expenses on the go. Categorize costs, attach receipts, and see exactly where your money is going.",
            image: "/screenshots/expenses.png",
            align: "left"
        },
        {
            title: "VAT & Financial Reporting",
            description: "Keep the tax man happy with automatic VAT calculations, margin scheme support, and one-click accountant exports.",
            image: "/screenshots/vat.png",
            align: "right"
        }
    ];

    return (
        <div className="min-h-screen bg-gray-950 text-white selection:bg-brand-500 selection:text-white">
            {/* Navigation */}
            <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
                isScrolled ? 'bg-gray-950/90 backdrop-blur-md shadow-lg border-b border-gray-800' : 'bg-transparent'
            }`}>
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex items-center justify-between h-16 sm:h-20">
                        <div className="flex items-center gap-2 cursor-pointer" onClick={() => onNavigate('home')}>
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center shadow-lg shadow-brand-500/20">
                                <CarIcon className="w-6 h-6 text-white" />
                            </div>
                            <span className="text-xl font-bold tracking-tight">
                                <span className="text-white">Dealer</span>
                                <span className="text-brand-400">Ledger</span>
                                <span className="text-gray-500 font-normal ml-1">Pro</span>
                            </span>
                        </div>

                        <div className="hidden md:flex items-center gap-8">
                            <button
                                onClick={() => onNavigate('home')}
                                className={`text-sm font-medium transition-colors ${currentPage === 'home' ? 'text-brand-400' : 'text-gray-300 hover:text-white'}`}
                            >
                                Features
                            </button>
                            <button
                                onClick={() => onNavigate('pricing')}
                                className={`text-sm font-medium transition-colors ${currentPage === 'pricing' ? 'text-brand-400' : 'text-gray-300 hover:text-white'}`}
                            >
                                Pricing
                            </button>
                            <button
                                onClick={() => onNavigate('demo')}
                                className={`text-sm font-medium transition-colors ${currentPage === 'demo' ? 'text-brand-400' : 'text-gray-300 hover:text-white'}`}
                            >
                                Demo
                            </button>
                            <button
                                onClick={() => onNavigate('contact')}
                                className={`text-sm font-medium transition-colors ${currentPage === 'contact' ? 'text-brand-400' : 'text-gray-300 hover:text-white'}`}
                            >
                                Contact
                            </button>
                        </div>

                        <div className="flex items-center gap-4">
                            <button
                                onClick={onLogin}
                                className="px-5 py-2.5 text-sm font-semibold text-white bg-brand-600 hover:bg-brand-500 rounded-lg transition-all hover:shadow-lg hover:shadow-brand-500/25 active:scale-95"
                            >
                                Login
                            </button>
                        </div>
                    </div>
                </div>
            </nav>

            {currentPage === 'home' && (
                <>
                    {/* Hero Section */}
                    <section className="relative pt-32 pb-20 px-4 overflow-hidden">
                        {/* Background effects */}
                        <div className="absolute inset-0 bg-gradient-to-b from-brand-900/10 via-transparent to-transparent pointer-events-none" />
                        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-[500px] bg-brand-500/5 blur-[120px] rounded-full pointer-events-none" />

                        <div className="relative max-w-7xl mx-auto text-center z-10">
                            <div className="inline-flex items-center gap-2 px-4 py-2 bg-brand-500/10 border border-brand-500/20 rounded-full text-brand-400 text-sm font-medium mb-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
                                <SparklesIcon className="w-4 h-4" />
                                Professional Dealership Management
                            </div>

                            <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold mb-8 leading-[1.1] tracking-tight animate-in fade-in slide-in-from-bottom-8 duration-700 delay-100">
                                <span className="block text-white">Everything Your</span>
                                <span className="block text-transparent bg-clip-text bg-gradient-to-r from-brand-400 to-brand-600">
                                    Dealership Needs
                                </span>
                                <span className="block text-white">In One Place</span>
                            </h1>

                            <p className="text-xl text-gray-400 max-w-2xl mx-auto mb-10 animate-in fade-in slide-in-from-bottom-8 duration-700 delay-200">
                                Stop juggling multiple apps. Dealer Ledger Pro combines stock management,
                                invoicing, expenses, CRM, and AI-powered automation into one powerful platform.
                            </p>

                            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-20 animate-in fade-in slide-in-from-bottom-8 duration-700 delay-300">
                                <button
                                    onClick={onLogin}
                                    className="px-8 py-4 text-lg font-semibold text-white bg-brand-600 hover:bg-brand-500 rounded-xl transition-all hover:shadow-xl hover:shadow-brand-500/25 hover:-translate-y-0.5"
                                >
                                    Start Free Trial
                                </button>
                                <button
                                    onClick={() => onNavigate('demo')}
                                    className="px-8 py-4 text-lg font-semibold text-gray-300 bg-gray-800/50 hover:bg-gray-800 rounded-xl transition-all border border-gray-700/50 backdrop-blur-sm"
                                >
                                    Watch Demo
                                </button>
                            </div>

                            {/* Stats */}
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 max-w-3xl mx-auto border-t border-gray-800 pt-12 animate-in fade-in slide-in-from-bottom-8 duration-700 delay-400">
                                <div className="text-center">
                                    <div className="text-4xl font-bold text-white mb-1">{animatedStats.dealers}+</div>
                                    <div className="text-sm font-medium text-gray-500 uppercase tracking-wide">Active Dealers</div>
                                </div>
                                <div className="text-center border-l border-r border-gray-800/50">
                                    <div className="text-4xl font-bold text-white mb-1">{animatedStats.vehicles.toLocaleString()}+</div>
                                    <div className="text-sm font-medium text-gray-500 uppercase tracking-wide">Vehicles Managed</div>
                                </div>
                                <div className="text-center">
                                    <div className="text-4xl font-bold text-brand-400 mb-1">£{animatedStats.savings.toLocaleString()}</div>
                                    <div className="text-sm font-medium text-gray-500 uppercase tracking-wide">Avg. Yearly Savings</div>
                                </div>
                            </div>
                        </div>

                        {/* App Screenshot */}
                        <div className="relative max-w-6xl mx-auto mt-24 px-4 animate-in fade-in slide-in-from-bottom-16 duration-1000 delay-500">
                            <div className="absolute -inset-1 bg-gradient-to-r from-brand-500 to-blue-600 rounded-2xl blur opacity-20" />
                            <div className="relative rounded-xl overflow-hidden shadow-2xl bg-gray-900 border border-gray-800 ring-1 ring-white/10">
                                <div className="bg-gray-900/95 backdrop-blur px-4 py-3 flex items-center gap-4 border-b border-gray-800">
                                    <div className="flex items-center gap-1.5">
                                        <div className="w-3 h-3 rounded-full bg-red-500/80" />
                                        <div className="w-3 h-3 rounded-full bg-amber-500/80" />
                                        <div className="w-3 h-3 rounded-full bg-green-500/80" />
                                    </div>
                                    <div className="flex-1 text-center">
                                        <div className="inline-flex items-center justify-center px-3 py-1 bg-gray-800 rounded text-xs text-gray-400 font-mono">
                                            app.dealerledger.pro
                                        </div>
                                    </div>
                                    <div className="w-12" />
                                </div>
                                <img
                                    src="/screenshots/dashboard.png"
                                    alt="Dealer Ledger Pro Dashboard"
                                    className="w-full h-auto object-cover"
                                />
                            </div>

                            {/* Floating badges */}
                            <div className="absolute -left-6 top-1/4 bg-gray-900/90 backdrop-blur border border-gray-700/50 rounded-xl p-4 shadow-2xl hidden lg:block animate-bounce-slow">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-lg bg-green-500/20 flex items-center justify-center">
                                        <CheckCircleIcon className="w-6 h-6 text-green-400" />
                                    </div>
                                    <div>
                                        <div className="text-sm font-semibold text-white">Auto-Reconciled</div>
                                        <div className="text-xs text-gray-400">23 transactions today</div>
                                    </div>
                                </div>
                            </div>
                            <div className="absolute -right-6 bottom-1/3 bg-gray-900/90 backdrop-blur border border-gray-700/50 rounded-xl p-4 shadow-2xl hidden lg:block animate-bounce-slow" style={{ animationDelay: '1s' }}>
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-lg bg-brand-500/20 flex items-center justify-center">
                                        <SparklesIcon className="w-6 h-6 text-brand-400" />
                                    </div>
                                    <div>
                                        <div className="text-sm font-semibold text-white">New Lead</div>
                                        <div className="text-xs text-gray-400">AI Score: 92/100</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* Showcase Section (Alternating) */}
                    <section className="py-24 px-4 bg-gray-900/30 border-y border-gray-800/50">
                        <div className="max-w-7xl mx-auto space-y-32">
                            {showcaseFeatures.map((feature, idx) => (
                                <div key={idx} className={`flex flex-col ${feature.align === 'left' ? 'lg:flex-row-reverse' : 'lg:flex-row'} items-center gap-12 lg:gap-24`}>
                                    <div className="flex-1 space-y-6">
                                        <h3 className="text-3xl md:text-4xl font-bold text-white leading-tight">{feature.title}</h3>
                                        <p className="text-lg text-gray-400 leading-relaxed">{feature.description}</p>
                                        <div className="pt-4">
                                            <button onClick={onLogin} className="group flex items-center gap-2 text-brand-400 font-semibold hover:text-brand-300 transition-colors">
                                                Learn more about {feature.title.split(' ')[0]}
                                                <span className="group-hover:translate-x-1 transition-transform">→</span>
                                            </button>
                                        </div>
                                    </div>
                                    <div className="flex-1 w-full">
                                        <div className="relative rounded-2xl overflow-hidden shadow-2xl border border-gray-800 bg-gray-900 group">
                                            <div className="absolute inset-0 bg-gradient-to-tr from-brand-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 z-10" />
                                            <img
                                                src={feature.image}
                                                alt={feature.title}
                                                className="w-full h-auto shadow-lg transform transition-transform duration-700 group-hover:scale-[1.02]"
                                            />
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>

                    {/* Features Grid */}
                    <section className="py-24 px-4">
                        <div className="max-w-7xl mx-auto">
                            <div className="text-center mb-16">
                                <h2 className="text-3xl sm:text-4xl font-bold mb-4 text-white">
                                    Everything You Need
                                </h2>
                                <p className="text-gray-400 max-w-2xl mx-auto text-lg">
                                    Replace expensive subscriptions to multiple services with one complete solution
                                </p>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                                {features.map((feature, idx) => {
                                    const Icon = feature.icon;
                                    return (
                                        <div
                                            key={idx}
                                            className="group p-8 bg-gray-900/50 border border-gray-800 rounded-2xl hover:bg-gray-900 hover:border-brand-500/30 transition-all duration-300 hover:-translate-y-1"
                                        >
                                            <div className={`w-14 h-14 rounded-xl bg-brand-500/10 flex items-center justify-center mb-6 group-hover:bg-brand-500/20 transition-colors`}>
                                                <Icon className={`w-7 h-7 text-brand-400`} />
                                            </div>
                                            <h3 className="text-xl font-bold text-white mb-3">{feature.title}</h3>
                                            <p className="text-gray-400 leading-relaxed">{feature.description}</p>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </section>

                    {/* Comparison Section */}
                    <section className="py-24 px-4 bg-gray-900/30 border-y border-gray-800/50">
                        <div className="max-w-5xl mx-auto">
                            <div className="text-center mb-16">
                                <h2 className="text-3xl sm:text-4xl font-bold mb-4 text-white">
                                    Stop Paying for Multiple Apps
                                </h2>
                                <p className="text-gray-400 text-lg">
                                    See how much you could save by switching to Dealer Ledger Pro
                                </p>
                            </div>

                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
                                <div className="space-y-4">
                                    {comparisons.map((item, idx) => (
                                        <div key={idx} className="flex items-center justify-between p-5 bg-gray-900 border border-gray-800 rounded-xl">
                                            <div>
                                                <div className="font-semibold text-gray-300">{item.name}</div>
                                                <div className="text-sm text-gray-500">{item.features} feature{item.features > 1 ? 's' : ''}</div>
                                            </div>
                                            <div className="text-xl font-bold text-red-400">{item.price}</div>
                                        </div>
                                    ))}
                                    <div className="flex items-center justify-between p-5 bg-gray-800 border border-gray-700 rounded-xl shadow-lg">
                                        <div className="font-bold text-white">Total Monthly Cost</div>
                                        <div className="text-2xl font-bold text-red-400">342/mo</div>
                                    </div>
                                </div>

                                <div className="relative">
                                    <div className="absolute inset-0 bg-gradient-to-r from-brand-500/20 to-blue-500/20 rounded-3xl blur-2xl" />
                                    <div className="relative p-8 sm:p-10 bg-gray-900 border border-brand-500/50 rounded-3xl text-center shadow-2xl">
                                        <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-brand-500/10 border border-brand-500/30 rounded-full text-brand-400 text-sm font-semibold mb-6">
                                            Best Value
                                        </div>
                                        <h3 className="text-3xl font-bold text-white mb-2">Dealer Ledger Pro</h3>
                                        <p className="text-gray-400 mb-8">Everything included. No hidden fees.</p>
                                        <div className="mb-8">
                                            <span className="text-6xl font-bold text-white">49</span>
                                            <span className="text-gray-400 text-xl">/month</span>
                                        </div>
                                        <div className="text-green-400 font-bold mb-8 flex items-center justify-center gap-2">
                                            <CheckCircleIcon className="w-5 h-5" />
                                            Save 293/month (86%)
                                        </div>
                                        <button
                                            onClick={onLogin}
                                            className="w-full py-4 bg-brand-600 hover:bg-brand-500 text-white text-lg font-bold rounded-xl transition-all hover:shadow-lg hover:shadow-brand-500/25"
                                        >
                                            Start Free Trial
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* CTA Section */}
                    <section className="py-24 px-4 bg-gradient-to-b from-gray-900 to-gray-950">
                        <div className="max-w-4xl mx-auto text-center">
                            <h2 className="text-4xl sm:text-5xl font-bold mb-6 text-white">
                                Ready to Transform Your Dealership?
                            </h2>
                            <p className="text-gray-400 mb-10 max-w-2xl mx-auto text-lg">
                                Join hundreds of dealers who have simplified their operations and saved thousands
                                with Dealer Ledger Pro.
                            </p>
                            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                                <button
                                    onClick={onLogin}
                                    className="px-8 py-4 text-lg font-bold text-white bg-brand-600 hover:bg-brand-500 rounded-xl transition-all hover:shadow-xl hover:shadow-brand-500/25"
                                >
                                    Start Your Free Trial
                                </button>
                                <button
                                    onClick={() => onNavigate('contact')}
                                    className="px-8 py-4 text-lg font-bold text-gray-300 hover:text-white transition-colors border border-gray-700 hover:bg-gray-800 rounded-xl"
                                >
                                    Contact Sales
                                </button>
                            </div>
                        </div>
                    </section>
                </>
            )}

            {currentPage === 'pricing' && (
                <section className="pt-32 pb-20 px-4">
                    <div className="max-w-5xl mx-auto">
                        <div className="text-center mb-16">
                            <h1 className="text-4xl sm:text-5xl font-bold mb-4 text-white">Simple, Transparent Pricing</h1>
                            <p className="text-gray-400 text-lg">No hidden fees. No surprises. Cancel anytime.</p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                            {/* Starter */}
                            <div className="p-8 bg-gray-900 border border-gray-800 rounded-2xl hover:border-gray-700 transition-colors">
                                <h3 className="text-xl font-bold text-white mb-2">Starter</h3>
                                <p className="text-gray-400 text-sm mb-6">Perfect for small dealerships</p>
                                <div className="mb-6">
                                    <span className="text-4xl font-bold text-white">29</span>
                                    <span className="text-gray-400">/month</span>
                                </div>
                                <ul className="space-y-4 mb-8">
                                    {['Up to 50 vehicles', 'Invoice generation', 'Expense tracking', 'Email support'].map((f, i) => (
                                        <li key={i} className="flex items-center gap-3 text-gray-300 text-sm">
                                            <CheckCircleIcon className="w-5 h-5 text-gray-500" />
                                            {f}
                                        </li>
                                    ))}
                                </ul>
                                <button className="w-full py-3 bg-gray-800 hover:bg-gray-700 text-white font-medium rounded-xl transition-colors">
                                    Get Started
                                </button>
                            </div>

                            {/* Pro */}
                            <div className="p-8 bg-gray-900 border-2 border-brand-500 rounded-2xl relative shadow-2xl shadow-brand-500/10">
                                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 bg-brand-500 text-white text-sm font-bold rounded-full">
                                    Most Popular
                                </div>
                                <h3 className="text-xl font-bold text-white mb-2">Professional</h3>
                                <p className="text-gray-400 text-sm mb-6">For growing dealerships</p>
                                <div className="mb-6">
                                    <span className="text-4xl font-bold text-white">49</span>
                                    <span className="text-gray-400">/month</span>
                                </div>
                                <ul className="space-y-4 mb-8">
                                    {['Unlimited vehicles', 'Full CRM & Pipeline', 'AI email analysis', 'Gmail integration', 'Priority support'].map((f, i) => (
                                        <li key={i} className="flex items-center gap-3 text-gray-300 text-sm">
                                            <CheckCircleIcon className="w-5 h-5 text-brand-400" />
                                            {f}
                                        </li>
                                    ))}
                                </ul>
                                <button
                                    onClick={onLogin}
                                    className="w-full py-3 bg-brand-600 hover:bg-brand-500 text-white font-bold rounded-xl transition-colors"
                                >
                                    Start Free Trial
                                </button>
                            </div>

                            {/* Enterprise */}
                            <div className="p-8 bg-gray-900 border border-gray-800 rounded-2xl hover:border-gray-700 transition-colors">
                                <h3 className="text-xl font-bold text-white mb-2">Enterprise</h3>
                                <p className="text-gray-400 text-sm mb-6">For multi-site operations</p>
                                <div className="mb-6">
                                    <span className="text-4xl font-bold text-white">99</span>
                                    <span className="text-gray-400">/month</span>
                                </div>
                                <ul className="space-y-4 mb-8">
                                    {['Multi-site support', 'Team management', 'API access', 'White-label options', 'Dedicated support'].map((f, i) => (
                                        <li key={i} className="flex items-center gap-3 text-gray-300 text-sm">
                                            <CheckCircleIcon className="w-5 h-5 text-gray-500" />
                                            {f}
                                        </li>
                                    ))}
                                </ul>
                                <button
                                    onClick={() => onNavigate('contact')}
                                    className="w-full py-3 bg-gray-800 hover:bg-gray-700 text-white font-medium rounded-xl transition-colors"
                                >
                                    Contact Sales
                                </button>
                            </div>
                        </div>
                    </div>
                </section>
            )}

            {currentPage === 'demo' && (
                <section className="pt-32 pb-20 px-4">
                    <div className="max-w-4xl mx-auto text-center">
                        <h1 className="text-4xl sm:text-5xl font-bold mb-4 text-white">See It In Action</h1>
                        <p className="text-gray-400 text-lg mb-12">Watch how Dealer Ledger Pro can transform your dealership</p>

                        {/* Video placeholder */}
                        <div className="relative aspect-video bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden mb-12 shadow-2xl">
                            <div className="absolute inset-0 flex items-center justify-center">
                                <div className="text-center">
                                    <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-brand-500/10 flex items-center justify-center cursor-pointer hover:bg-brand-500/20 transition-all hover:scale-105 group">
                                        <svg className="w-8 h-8 text-brand-400 ml-1 group-hover:text-brand-300" fill="currentColor" viewBox="0 0 24 24">
                                            <path d="M8 5v14l11-7z" />
                                        </svg>
                                    </div>
                                    <p className="text-gray-500">Demo video coming soon</p>
                                </div>
                            </div>
                        </div>

                        <div className="p-8 bg-gray-900 border border-gray-800 rounded-2xl">
                            <h3 className="text-xl font-bold text-white mb-4">Want a Personal Walkthrough?</h3>
                            <p className="text-gray-400 mb-6">Book a 15-minute call with our team and see how Dealer Ledger Pro fits your needs.</p>
                            <button
                                onClick={() => onNavigate('contact')}
                                className="px-8 py-3 bg-brand-600 hover:bg-brand-500 text-white font-semibold rounded-xl transition-colors"
                            >
                                Book a Demo
                            </button>
                        </div>
                    </div>
                </section>
            )}

            {currentPage === 'contact' && (
                <section className="pt-32 pb-20 px-4">
                    <div className="max-w-2xl mx-auto">
                        <div className="text-center mb-12">
                            <h1 className="text-4xl sm:text-5xl font-bold mb-4 text-white">Get In Touch</h1>
                            <p className="text-gray-400 text-lg">Have questions? We'd love to hear from you.</p>
                        </div>

                        <div className="p-8 bg-gray-900 border border-gray-800 rounded-2xl shadow-xl">
                            <form className="space-y-6">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-400 mb-2">First Name</label>
                                        <input
                                            type="text"
                                            className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-all"
                                            placeholder="John"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-400 mb-2">Last Name</label>
                                        <input
                                            type="text"
                                            className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-all"
                                            placeholder="Smith"
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-400 mb-2">Email</label>
                                    <input
                                        type="email"
                                        className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-all"
                                        placeholder="john@dealership.com"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-400 mb-2">Dealership Name</label>
                                    <input
                                        type="text"
                                        className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-all"
                                        placeholder="Your Dealership"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-400 mb-2">Message</label>
                                    <textarea
                                        rows={4}
                                        className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent resize-none transition-all"
                                        placeholder="Tell us about your needs..."
                                    />
                                </div>
                                <button
                                    type="submit"
                                    className="w-full py-4 bg-brand-600 hover:bg-brand-500 text-white font-bold rounded-xl transition-colors shadow-lg hover:shadow-brand-500/25"
                                >
                                    Send Message
                                </button>
                            </form>
                        </div>

                        <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="p-6 bg-gray-900 border border-gray-800 rounded-xl text-center hover:border-gray-700 transition-colors">
                                <EnvelopeIcon className="w-8 h-8 text-brand-400 mx-auto mb-3" />
                                <div className="text-white font-medium">Email Us</div>
                                <div className="text-gray-400 text-sm">hello@dealerledger.pro</div>
                            </div>
                            <div className="p-6 bg-gray-900 border border-gray-800 rounded-xl text-center hover:border-gray-700 transition-colors">
                                <PhoneIcon className="w-8 h-8 text-brand-400 mx-auto mb-3" />
                                <div className="text-white font-medium">Call Us</div>
                                <div className="text-gray-400 text-sm">+44 (0) 123 456 7890</div>
                            </div>
                        </div>
                    </div>
                </section>
            )}

            {/* Footer */}
            <footer className="py-12 px-4 border-t border-gray-800 bg-gray-950">
                <div className="max-w-7xl mx-auto">
                    <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center">
                                <CarIcon className="w-5 h-5 text-white" />
                            </div>
                            <span className="font-semibold text-white">DealerLedger Pro</span>
                        </div>
                        <div className="flex items-center gap-8 text-sm text-gray-400">
                            <button onClick={() => onNavigate('home')} className="hover:text-white transition-colors">Features</button>
                            <button onClick={() => onNavigate('pricing')} className="hover:text-white transition-colors">Pricing</button>
                            <button onClick={() => onNavigate('demo')} className="hover:text-white transition-colors">Demo</button>
                            <button onClick={() => onNavigate('contact')} className="hover:text-white transition-colors">Contact</button>
                        </div>
                        <div className="text-sm text-gray-600">
                            © 2025 Dealer Ledger Pro. All rights reserved.
                        </div>
                    </div>
                </div>
            </footer>
        </div>
    );
};

export default LandingPage;
