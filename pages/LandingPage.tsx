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
            color: 'blue',
        },
        {
            icon: DocumentTextIcon,
            title: 'Invoice Generation',
            description: 'Create professional sales invoices, deposit slips, and proformas in seconds. VAT margin scheme support included.',
            color: 'green',
        },
        {
            icon: CreditCardIcon,
            title: 'Expense Tracking',
            description: 'Log expenses, attach receipts, and reconcile with bank statements. Perfect for tax time.',
            color: 'amber',
        },
        {
            icon: UserGroupIcon,
            title: 'CRM & Lead Pipeline',
            description: 'Kanban-style pipeline, automatic lead capture from emails, and activity tracking.',
            color: 'purple',
        },
        {
            icon: PhoneIcon,
            title: 'Communication Hub',
            description: 'Log calls, send emails, and track all customer interactions in one place.',
            color: 'red',
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

    return (
        <div className="min-h-screen bg-gray-950 text-white">
            {/* Navigation */}
            <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
                isScrolled ? 'bg-gray-900/95 backdrop-blur-md shadow-xl' : 'bg-transparent'
            }`}>
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex items-center justify-between h-16 sm:h-20">
                        <div className="flex items-center gap-2">
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center">
                                <CarIcon className="w-6 h-6 text-white" />
                            </div>
                            <span className="text-xl font-bold">
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
                                className="px-4 py-2 text-sm font-medium text-white bg-brand-600 hover:bg-brand-500 rounded-lg transition-all hover:shadow-lg hover:shadow-brand-500/25"
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
                        <div className="absolute inset-0 bg-gradient-to-b from-brand-600/10 via-transparent to-transparent" />
                        <div className="absolute top-1/4 left-1/4 w-48 h-48 sm:w-96 sm:h-96 bg-brand-500/20 rounded-full blur-3xl" />
                        <div className="absolute bottom-1/4 right-1/4 w-48 h-48 sm:w-96 sm:h-96 bg-purple-500/10 rounded-full blur-3xl" />

                        <div className="relative max-w-7xl mx-auto text-center">
                            <div className="inline-flex items-center gap-2 px-4 py-2 bg-brand-500/10 border border-brand-500/20 rounded-full text-brand-400 text-sm mb-8">
                                <SparklesIcon className="w-4 h-4" />
                                AI-Powered Dealership Management
                            </div>

                            <h1 className="text-4xl sm:text-5xl lg:text-7xl font-bold mb-6 leading-tight">
                                <span className="block">Everything Your</span>
                                <span className="block bg-gradient-to-r from-brand-400 via-brand-300 to-purple-400 bg-clip-text text-transparent">
                                    Dealership Needs
                                </span>
                                <span className="block">In One Place</span>
                            </h1>

                            <p className="text-lg sm:text-xl text-gray-400 max-w-3xl mx-auto mb-10">
                                Stop juggling multiple apps. Dealer Ledger Pro combines stock management,
                                invoicing, expenses, CRM, and AI-powered automation into one powerful platform.
                            </p>

                            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
                                <button
                                    onClick={onLogin}
                                    className="px-8 py-4 text-lg font-semibold text-white bg-brand-600 hover:bg-brand-500 rounded-xl transition-all hover:shadow-xl hover:shadow-brand-500/25 hover:-translate-y-0.5"
                                >
                                    Start Free Trial
                                </button>
                                <button
                                    onClick={() => onNavigate('demo')}
                                    className="px-8 py-4 text-lg font-semibold text-gray-300 bg-gray-800 hover:bg-gray-700 rounded-xl transition-all border border-gray-700"
                                >
                                    Watch Demo
                                </button>
                            </div>

                            {/* Stats */}
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 sm:gap-8 max-w-2xl mx-auto">
                                <div className="text-center">
                                    <div className="text-3xl sm:text-4xl font-bold text-white">{animatedStats.dealers}+</div>
                                    <div className="text-sm text-gray-500">Active Dealers</div>
                                </div>
                                <div className="text-center">
                                    <div className="text-3xl sm:text-4xl font-bold text-white">{animatedStats.vehicles.toLocaleString()}+</div>
                                    <div className="text-sm text-gray-500">Vehicles Managed</div>
                                </div>
                                <div className="text-center">
                                    <div className="text-3xl sm:text-4xl font-bold text-brand-400">{animatedStats.savings.toLocaleString()}</div>
                                    <div className="text-sm text-gray-500">Avg. Yearly Savings</div>
                                </div>
                            </div>
                        </div>

                        {/* App Screenshot */}
                        <div className="relative max-w-6xl mx-auto mt-16">
                            <div className="relative rounded-2xl overflow-hidden shadow-2xl shadow-brand-500/10 border border-gray-800">
                                <div className="bg-gray-900 p-1">
                                    <div className="flex items-center gap-2 px-4 py-2">
                                        <div className="w-3 h-3 rounded-full bg-red-500" />
                                        <div className="w-3 h-3 rounded-full bg-amber-500" />
                                        <div className="w-3 h-3 rounded-full bg-green-500" />
                                    </div>
                                </div>
                                <div className="bg-gray-950 aspect-[16/9] flex items-center justify-center">
                                    <div className="text-center p-8">
                                        <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center">
                                            <CarIcon className="w-10 h-10 text-white" />
                                        </div>
                                        <p className="text-gray-500 text-lg">Dashboard Preview</p>
                                        <p className="text-gray-600 text-sm mt-2">Screenshots will appear here when you take them from the live app</p>
                                    </div>
                                </div>
                            </div>
                            {/* Floating badges */}
                            <div className="absolute -left-4 top-1/4 bg-gray-900 border border-gray-800 rounded-xl p-4 shadow-xl hidden lg:block">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-lg bg-green-500/20 flex items-center justify-center">
                                        <CheckCircleIcon className="w-6 h-6 text-green-400" />
                                    </div>
                                    <div>
                                        <div className="text-sm font-medium text-white">Auto-Reconciled</div>
                                        <div className="text-xs text-gray-500">23 transactions</div>
                                    </div>
                                </div>
                            </div>
                            <div className="absolute -right-4 top-1/3 bg-gray-900 border border-gray-800 rounded-xl p-4 shadow-xl hidden lg:block">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-lg bg-brand-500/20 flex items-center justify-center">
                                        <SparklesIcon className="w-6 h-6 text-brand-400" />
                                    </div>
                                    <div>
                                        <div className="text-sm font-medium text-white">New Lead</div>
                                        <div className="text-xs text-gray-500">AI analyzed</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* Features Grid */}
                    <section className="py-20 px-4 bg-gray-900/50">
                        <div className="max-w-7xl mx-auto">
                            <div className="text-center mb-16">
                                <h2 className="text-3xl sm:text-4xl font-bold mb-4">
                                    Everything You Need to Run Your Dealership
                                </h2>
                                <p className="text-gray-400 max-w-2xl mx-auto">
                                    Replace expensive subscriptions to multiple services with one complete solution
                                </p>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {features.map((feature, idx) => {
                                    const Icon = feature.icon;
                                    return (
                                        <div
                                            key={idx}
                                            className="group p-6 bg-gray-900 border border-gray-800 rounded-2xl hover:border-brand-500/50 transition-all hover:-translate-y-1"
                                        >
                                            <div className={`w-12 h-12 rounded-xl bg-${feature.color}-500/20 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                                                <Icon className={`w-6 h-6 text-${feature.color}-400`} />
                                            </div>
                                            <h3 className="text-lg font-semibold text-white mb-2">{feature.title}</h3>
                                            <p className="text-gray-400 text-sm">{feature.description}</p>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </section>

                    {/* Comparison Section */}
                    <section className="py-20 px-4">
                        <div className="max-w-5xl mx-auto">
                            <div className="text-center mb-16">
                                <h2 className="text-3xl sm:text-4xl font-bold mb-4">
                                    Stop Paying for Multiple Apps
                                </h2>
                                <p className="text-gray-400">
                                    See how much you could save by switching to Dealer Ledger Pro
                                </p>
                            </div>

                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
                                <div className="space-y-4">
                                    {comparisons.map((item, idx) => (
                                        <div key={idx} className="flex items-center justify-between p-4 bg-gray-900 border border-gray-800 rounded-xl">
                                            <div>
                                                <div className="font-medium text-gray-300">{item.name}</div>
                                                <div className="text-sm text-gray-500">{item.features} feature{item.features > 1 ? 's' : ''}</div>
                                            </div>
                                            <div className="text-xl font-bold text-red-400">{item.price}</div>
                                        </div>
                                    ))}
                                    <div className="flex items-center justify-between p-4 bg-gray-800 border border-gray-700 rounded-xl">
                                        <div className="font-medium text-white">Total Monthly Cost</div>
                                        <div className="text-2xl font-bold text-red-400">342/mo</div>
                                    </div>
                                </div>

                                <div className="relative">
                                    <div className="absolute inset-0 bg-gradient-to-r from-brand-500/20 to-purple-500/20 rounded-3xl blur-xl" />
                                    <div className="relative p-8 bg-gray-900 border-2 border-brand-500 rounded-3xl text-center">
                                        <div className="inline-flex items-center gap-2 px-4 py-1 bg-brand-500/20 border border-brand-500/30 rounded-full text-brand-400 text-sm mb-4">
                                            Best Value
                                        </div>
                                        <h3 className="text-2xl font-bold text-white mb-2">Dealer Ledger Pro</h3>
                                        <p className="text-gray-400 mb-6">Everything included. No hidden fees.</p>
                                        <div className="mb-6">
                                            <span className="text-5xl font-bold text-white">49</span>
                                            <span className="text-gray-400">/month</span>
                                        </div>
                                        <div className="text-green-400 font-semibold mb-6">
                                            Save 293/month (86%)
                                        </div>
                                        <button
                                            onClick={onLogin}
                                            className="w-full py-3 bg-brand-600 hover:bg-brand-500 text-white font-semibold rounded-xl transition-colors"
                                        >
                                            Start Free Trial
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* CTA Section */}
                    <section className="py-20 px-4 bg-gradient-to-b from-gray-900 to-gray-950">
                        <div className="max-w-4xl mx-auto text-center">
                            <h2 className="text-3xl sm:text-4xl font-bold mb-6">
                                Ready to Transform Your Dealership?
                            </h2>
                            <p className="text-gray-400 mb-8 max-w-2xl mx-auto">
                                Join hundreds of dealers who have simplified their operations and saved thousands
                                with Dealer Ledger Pro.
                            </p>
                            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                                <button
                                    onClick={onLogin}
                                    className="px-8 py-4 text-lg font-semibold text-white bg-brand-600 hover:bg-brand-500 rounded-xl transition-all hover:shadow-xl hover:shadow-brand-500/25"
                                >
                                    Start Your Free Trial
                                </button>
                                <button
                                    onClick={() => onNavigate('contact')}
                                    className="px-8 py-4 text-lg font-semibold text-gray-300 hover:text-white transition-colors"
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
                            <h1 className="text-4xl sm:text-5xl font-bold mb-4">Simple, Transparent Pricing</h1>
                            <p className="text-gray-400 text-lg">No hidden fees. No surprises. Cancel anytime.</p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                            {/* Starter */}
                            <div className="p-8 bg-gray-900 border border-gray-800 rounded-2xl">
                                <h3 className="text-xl font-semibold text-white mb-2">Starter</h3>
                                <p className="text-gray-400 text-sm mb-6">Perfect for small dealerships</p>
                                <div className="mb-6">
                                    <span className="text-4xl font-bold text-white">29</span>
                                    <span className="text-gray-400">/month</span>
                                </div>
                                <ul className="space-y-3 mb-8">
                                    {['Up to 50 vehicles', 'Invoice generation', 'Expense tracking', 'Email support'].map((f, i) => (
                                        <li key={i} className="flex items-center gap-2 text-gray-300 text-sm">
                                            <CheckCircleIcon className="w-5 h-5 text-green-400" />
                                            {f}
                                        </li>
                                    ))}
                                </ul>
                                <button className="w-full py-3 bg-gray-800 hover:bg-gray-700 text-white font-medium rounded-xl transition-colors">
                                    Get Started
                                </button>
                            </div>

                            {/* Pro */}
                            <div className="p-8 bg-gray-900 border-2 border-brand-500 rounded-2xl relative">
                                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 bg-brand-500 text-white text-sm font-medium rounded-full">
                                    Most Popular
                                </div>
                                <h3 className="text-xl font-semibold text-white mb-2">Professional</h3>
                                <p className="text-gray-400 text-sm mb-6">For growing dealerships</p>
                                <div className="mb-6">
                                    <span className="text-4xl font-bold text-white">49</span>
                                    <span className="text-gray-400">/month</span>
                                </div>
                                <ul className="space-y-3 mb-8">
                                    {['Unlimited vehicles', 'Full CRM & Pipeline', 'AI email analysis', 'Gmail integration', 'Priority support'].map((f, i) => (
                                        <li key={i} className="flex items-center gap-2 text-gray-300 text-sm">
                                            <CheckCircleIcon className="w-5 h-5 text-green-400" />
                                            {f}
                                        </li>
                                    ))}
                                </ul>
                                <button
                                    onClick={onLogin}
                                    className="w-full py-3 bg-brand-600 hover:bg-brand-500 text-white font-semibold rounded-xl transition-colors"
                                >
                                    Start Free Trial
                                </button>
                            </div>

                            {/* Enterprise */}
                            <div className="p-8 bg-gray-900 border border-gray-800 rounded-2xl">
                                <h3 className="text-xl font-semibold text-white mb-2">Enterprise</h3>
                                <p className="text-gray-400 text-sm mb-6">For multi-site operations</p>
                                <div className="mb-6">
                                    <span className="text-4xl font-bold text-white">99</span>
                                    <span className="text-gray-400">/month</span>
                                </div>
                                <ul className="space-y-3 mb-8">
                                    {['Multi-site support', 'Team management', 'API access', 'White-label options', 'Dedicated support'].map((f, i) => (
                                        <li key={i} className="flex items-center gap-2 text-gray-300 text-sm">
                                            <CheckCircleIcon className="w-5 h-5 text-green-400" />
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
                        <h1 className="text-4xl sm:text-5xl font-bold mb-4">See It In Action</h1>
                        <p className="text-gray-400 text-lg mb-12">Watch how Dealer Ledger Pro can transform your dealership</p>

                        {/* Video placeholder */}
                        <div className="relative aspect-video bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden mb-12">
                            <div className="absolute inset-0 flex items-center justify-center">
                                <div className="text-center">
                                    <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-brand-500/20 flex items-center justify-center cursor-pointer hover:bg-brand-500/30 transition-colors">
                                        <svg className="w-10 h-10 text-brand-400 ml-1" fill="currentColor" viewBox="0 0 24 24">
                                            <path d="M8 5v14l11-7z" />
                                        </svg>
                                    </div>
                                    <p className="text-gray-500">Demo video coming soon</p>
                                </div>
                            </div>
                        </div>

                        <div className="p-8 bg-gray-900 border border-gray-800 rounded-2xl">
                            <h3 className="text-xl font-semibold text-white mb-4">Want a Personal Walkthrough?</h3>
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
                            <h1 className="text-4xl sm:text-5xl font-bold mb-4">Get In Touch</h1>
                            <p className="text-gray-400 text-lg">Have questions? We'd love to hear from you.</p>
                        </div>

                        <div className="p-8 bg-gray-900 border border-gray-800 rounded-2xl">
                            <form className="space-y-6">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-400 mb-2">First Name</label>
                                        <input
                                            type="text"
                                            className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                                            placeholder="John"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-400 mb-2">Last Name</label>
                                        <input
                                            type="text"
                                            className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                                            placeholder="Smith"
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-400 mb-2">Email</label>
                                    <input
                                        type="email"
                                        className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                                        placeholder="john@dealership.com"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-400 mb-2">Dealership Name</label>
                                    <input
                                        type="text"
                                        className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                                        placeholder="Your Dealership"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-400 mb-2">Message</label>
                                    <textarea
                                        rows={4}
                                        className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent resize-none"
                                        placeholder="Tell us about your needs..."
                                    />
                                </div>
                                <button
                                    type="submit"
                                    className="w-full py-4 bg-brand-600 hover:bg-brand-500 text-white font-semibold rounded-xl transition-colors"
                                >
                                    Send Message
                                </button>
                            </form>
                        </div>

                        <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="p-6 bg-gray-900 border border-gray-800 rounded-xl text-center">
                                <EnvelopeIcon className="w-8 h-8 text-brand-400 mx-auto mb-3" />
                                <div className="text-white font-medium">Email Us</div>
                                <div className="text-gray-400 text-sm">hello@dealerledger.pro</div>
                            </div>
                            <div className="p-6 bg-gray-900 border border-gray-800 rounded-xl text-center">
                                <PhoneIcon className="w-8 h-8 text-brand-400 mx-auto mb-3" />
                                <div className="text-white font-medium">Call Us</div>
                                <div className="text-gray-400 text-sm">+44 (0) 123 456 7890</div>
                            </div>
                        </div>
                    </div>
                </section>
            )}

            {/* Footer */}
            <footer className="py-12 px-4 border-t border-gray-800">
                <div className="max-w-7xl mx-auto">
                    <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center">
                                <CarIcon className="w-5 h-5 text-white" />
                            </div>
                            <span className="font-semibold text-white">DealerLedger Pro</span>
                        </div>
                        <div className="flex items-center gap-6 text-sm text-gray-400">
                            <button onClick={() => onNavigate('home')} className="hover:text-white transition-colors">Features</button>
                            <button onClick={() => onNavigate('pricing')} className="hover:text-white transition-colors">Pricing</button>
                            <button onClick={() => onNavigate('demo')} className="hover:text-white transition-colors">Demo</button>
                            <button onClick={() => onNavigate('contact')} className="hover:text-white transition-colors">Contact</button>
                        </div>
                        <div className="text-sm text-gray-500">
                            2025 Dealer Ledger Pro. All rights reserved.
                        </div>
                    </div>
                </div>
            </footer>
        </div>
    );
};

export default LandingPage;
