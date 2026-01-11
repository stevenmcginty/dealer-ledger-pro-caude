
import React, { useMemo } from 'react';
import { useAdmin } from '../contexts/AdminContext';
import {
    BuildingStorefrontIcon,
    CreditCardIcon,
    UsersIcon,
    CheckCircleIcon,
    ExclamationTriangleIcon,
    ClockIcon
} from '../components/icons';

const StatCard: React.FC<{
    title: string;
    value: string | number;
    icon: React.ComponentType<{ className?: string }>;
    iconBg: string;
    iconColor: string;
    subtitle?: string;
}> = ({ title, value, icon: Icon, iconBg, iconColor, subtitle }) => (
    <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
        <div className="flex items-start justify-between">
            <div>
                <p className="text-sm font-medium text-gray-400">{title}</p>
                <p className="text-3xl font-bold text-white mt-2">{value}</p>
                {subtitle && <p className="text-xs text-gray-500 mt-1">{subtitle}</p>}
            </div>
            <div className={`p-3 rounded-lg ${iconBg}`}>
                <Icon className={`w-6 h-6 ${iconColor}`} />
            </div>
        </div>
    </div>
);

const AdminDashboard: React.FC = () => {
    const { businesses, plans, features, activityLog, isDataLoading } = useAdmin();

    const stats = useMemo(() => {
        const activeSubscriptions = businesses.filter(b => b.subscription?.status === 'active').length;
        const trialSubscriptions = businesses.filter(b => b.subscription?.status === 'trialing').length;
        const pastDueSubscriptions = businesses.filter(b => b.subscription?.status === 'past_due').length;

        const totalUsers = businesses.reduce((acc, b) => acc + b.userCount, 0);

        const recentBusinesses = businesses.filter(b => {
            const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
            return b.createdAt > thirtyDaysAgo;
        }).length;

        // Calculate MRR (Monthly Recurring Revenue)
        let mrr = 0;
        businesses.forEach(b => {
            if (b.subscription?.status === 'active' || b.subscription?.status === 'trialing') {
                const plan = plans.find(p => p.id === b.subscription?.planId);
                if (plan) {
                    if (b.subscription?.billingCycle === 'yearly') {
                        mrr += plan.priceYearly / 12;
                    } else {
                        mrr += plan.priceMonthly;
                    }
                }
            }
        });

        return {
            totalBusinesses: businesses.length,
            activeSubscriptions,
            trialSubscriptions,
            pastDueSubscriptions,
            totalUsers,
            recentBusinesses,
            mrr: mrr / 100, // Convert from pence to pounds
            totalPlans: plans.length,
            totalFeatures: features.length
        };
    }, [businesses, plans, features]);

    const recentActivity = activityLog.slice(0, 10);

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('en-GB', {
            style: 'currency',
            currency: 'GBP'
        }).format(amount);
    };

    const formatTime = (timestamp: number) => {
        const now = Date.now();
        const diff = now - timestamp;
        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(diff / 3600000);
        const days = Math.floor(diff / 86400000);

        if (minutes < 1) return 'Just now';
        if (minutes < 60) return `${minutes}m ago`;
        if (hours < 24) return `${hours}h ago`;
        return `${days}d ago`;
    };

    if (isDataLoading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="text-center">
                    <div className="animate-spin h-8 w-8 border-2 border-brand-500 border-t-transparent rounded-full mx-auto" />
                    <p className="mt-4 text-gray-400">Loading dashboard...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-white">Dashboard</h1>
                <p className="text-gray-400 mt-1">Overview of your SaaS platform</p>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard
                    title="Total Businesses"
                    value={stats.totalBusinesses}
                    icon={BuildingStorefrontIcon}
                    iconBg="bg-blue-500/20"
                    iconColor="text-blue-400"
                    subtitle={`${stats.recentBusinesses} new this month`}
                />
                <StatCard
                    title="Active Subscriptions"
                    value={stats.activeSubscriptions}
                    icon={CheckCircleIcon}
                    iconBg="bg-green-500/20"
                    iconColor="text-green-400"
                    subtitle={`${stats.trialSubscriptions} trialing`}
                />
                <StatCard
                    title="Monthly Revenue"
                    value={formatCurrency(stats.mrr)}
                    icon={CreditCardIcon}
                    iconBg="bg-purple-500/20"
                    iconColor="text-purple-400"
                    subtitle="MRR estimate"
                />
                <StatCard
                    title="Total Users"
                    value={stats.totalUsers}
                    icon={UsersIcon}
                    iconBg="bg-amber-500/20"
                    iconColor="text-amber-400"
                    subtitle="Across all businesses"
                />
            </div>

            {/* Secondary Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
                    <h3 className="text-sm font-medium text-gray-400 mb-4">Subscription Status</h3>
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-green-400" />
                                <span className="text-sm text-gray-300">Active</span>
                            </div>
                            <span className="text-sm font-medium text-white">{stats.activeSubscriptions}</span>
                        </div>
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-blue-400" />
                                <span className="text-sm text-gray-300">Trial</span>
                            </div>
                            <span className="text-sm font-medium text-white">{stats.trialSubscriptions}</span>
                        </div>
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-red-400" />
                                <span className="text-sm text-gray-300">Past Due</span>
                            </div>
                            <span className="text-sm font-medium text-white">{stats.pastDueSubscriptions}</span>
                        </div>
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-gray-400" />
                                <span className="text-sm text-gray-300">No Subscription</span>
                            </div>
                            <span className="text-sm font-medium text-white">
                                {stats.totalBusinesses - stats.activeSubscriptions - stats.trialSubscriptions - stats.pastDueSubscriptions}
                            </span>
                        </div>
                    </div>
                </div>

                <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
                    <h3 className="text-sm font-medium text-gray-400 mb-4">Platform Config</h3>
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <span className="text-sm text-gray-300">Plans Available</span>
                            <span className="text-sm font-medium text-white">{stats.totalPlans}</span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-sm text-gray-300">Features Defined</span>
                            <span className="text-sm font-medium text-white">{stats.totalFeatures}</span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-sm text-gray-300">Active Features</span>
                            <span className="text-sm font-medium text-white">
                                {features.filter(f => f.isActive).length}
                            </span>
                        </div>
                    </div>
                </div>

                <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
                    <h3 className="text-sm font-medium text-gray-400 mb-4">Quick Actions</h3>
                    <div className="space-y-2">
                        <button className="w-full px-4 py-2 text-sm text-left text-gray-300 hover:bg-gray-700 rounded-lg transition-colors">
                            + Create New Business
                        </button>
                        <button className="w-full px-4 py-2 text-sm text-left text-gray-300 hover:bg-gray-700 rounded-lg transition-colors">
                            + Add New Plan
                        </button>
                        <button className="w-full px-4 py-2 text-sm text-left text-gray-300 hover:bg-gray-700 rounded-lg transition-colors">
                            + Define New Feature
                        </button>
                    </div>
                </div>
            </div>

            {/* Recent Activity */}
            <div className="bg-gray-800 rounded-xl border border-gray-700">
                <div className="p-6 border-b border-gray-700">
                    <h3 className="text-lg font-semibold text-white">Recent Activity</h3>
                </div>
                <div className="divide-y divide-gray-700">
                    {recentActivity.length === 0 ? (
                        <div className="p-6 text-center text-gray-500">
                            No activity recorded yet
                        </div>
                    ) : (
                        recentActivity.map((activity) => (
                            <div key={activity.id} className="p-4 flex items-center gap-4">
                                <div className="p-2 rounded-lg bg-gray-700">
                                    <ClockIcon className="w-4 h-4 text-gray-400" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm text-white">{activity.action}</p>
                                    <p className="text-xs text-gray-500">
                                        {activity.targetType}: {activity.targetId.substring(0, 8)}...
                                    </p>
                                </div>
                                <span className="text-xs text-gray-500">{formatTime(activity.timestamp)}</span>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
};

export default AdminDashboard;
