
import React, { useState, useMemo } from 'react';
import { useAdmin } from '../contexts/AdminContext';
import { AdminBusinessRecord, SubscriptionPlan, Feature, BusinessFeatureOverride } from '../types';
import {
    ArrowLeftIcon,
    BuildingStorefrontIcon,
    CreditCardIcon,
    TagIcon,
    UsersIcon,
    CheckCircleIcon,
    ExclamationTriangleIcon,
    XCircleIcon,
    ClockIcon,
    SignalIcon
} from '../components/icons';

type TabId = 'overview' | 'subscription' | 'features' | 'connectivity';

const TabButton: React.FC<{
    label: string;
    tabId: TabId;
    activeTab: TabId;
    onClick: () => void;
    icon: React.ComponentType<{ className?: string }>;
}> = ({ label, tabId, activeTab, onClick, icon: Icon }) => (
    <button
        onClick={onClick}
        className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === tabId
                ? 'border-brand-500 text-white'
                : 'border-transparent text-gray-400 hover:text-white hover:border-gray-600'
        }`}
    >
        <Icon className="w-4 h-4" />
        {label}
    </button>
);

const SubscriptionBadge: React.FC<{ status?: string }> = ({ status }) => {
    const getStatusConfig = () => {
        switch (status) {
            case 'active':
                return { bg: 'bg-green-500/20', text: 'text-green-400', icon: CheckCircleIcon, label: 'Active' };
            case 'trialing':
                return { bg: 'bg-blue-500/20', text: 'text-blue-400', icon: ClockIcon, label: 'Trial' };
            case 'past_due':
                return { bg: 'bg-red-500/20', text: 'text-red-400', icon: ExclamationTriangleIcon, label: 'Past Due' };
            case 'canceled':
                return { bg: 'bg-gray-500/20', text: 'text-gray-400', icon: XCircleIcon, label: 'Canceled' };
            default:
                return { bg: 'bg-gray-500/20', text: 'text-gray-400', icon: XCircleIcon, label: 'No Plan' };
        }
    };

    const config = getStatusConfig();
    const Icon = config.icon;

    return (
        <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium ${config.bg} ${config.text}`}>
            <Icon className="w-4 h-4" />
            {config.label}
        </span>
    );
};

const OverviewTab: React.FC<{ business: AdminBusinessRecord }> = ({ business }) => {
    const formatDate = (timestamp: number) => {
        return new Date(timestamp).toLocaleDateString('en-GB', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Business Info */}
                <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700">
                    <h3 className="text-sm font-medium text-gray-400 mb-4">Business Information</h3>
                    <div className="space-y-4">
                        <div>
                            <label className="text-xs text-gray-500">Business Name</label>
                            <p className="text-white font-medium">{business.businessName}</p>
                        </div>
                        <div>
                            <label className="text-xs text-gray-500">Business ID</label>
                            <p className="text-gray-300 font-mono text-sm">{business.id}</p>
                        </div>
                        <div>
                            <label className="text-xs text-gray-500">Created</label>
                            <p className="text-gray-300">{formatDate(business.createdAt)}</p>
                        </div>
                        {business.lastActivityAt && (
                            <div>
                                <label className="text-xs text-gray-500">Last Activity</label>
                                <p className="text-gray-300">{formatDate(business.lastActivityAt)}</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Owner Info */}
                <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700">
                    <h3 className="text-sm font-medium text-gray-400 mb-4">Owner Details</h3>
                    <div className="space-y-4">
                        <div>
                            <label className="text-xs text-gray-500">Owner Email</label>
                            <p className="text-white">{business.ownerEmail || 'Not set'}</p>
                        </div>
                        <div>
                            <label className="text-xs text-gray-500">Owner UID</label>
                            <p className="text-gray-300 font-mono text-sm">{business.ownerUid}</p>
                        </div>
                        <div>
                            <label className="text-xs text-gray-500">Total Users</label>
                            <p className="text-gray-300">{business.userCount} users</p>
                        </div>
                        <div>
                            <label className="text-xs text-gray-500">Provisioned By</label>
                            <p className="text-gray-300">{business.provisionedBy || 'Self-signup'}</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700 text-center">
                    <p className="text-2xl font-bold text-white">{business.userCount}</p>
                    <p className="text-xs text-gray-500 mt-1">Total Users</p>
                </div>
                <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700 text-center">
                    <SubscriptionBadge status={business.subscription?.status} />
                </div>
                <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700 text-center">
                    <p className="text-2xl font-bold text-white">{business.featureOverrides?.length || 0}</p>
                    <p className="text-xs text-gray-500 mt-1">Feature Overrides</p>
                </div>
                <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700 text-center">
                    <p className="text-sm font-medium text-gray-300">{business.subscription?.billingCycle || 'N/A'}</p>
                    <p className="text-xs text-gray-500 mt-1">Billing Cycle</p>
                </div>
            </div>
        </div>
    );
};

const SubscriptionTab: React.FC<{
    business: AdminBusinessRecord;
    plans: SubscriptionPlan[];
    onAssignPlan: (planId: string, billingCycle: 'monthly' | 'yearly') => void;
}> = ({ business, plans, onAssignPlan }) => {
    const [selectedPlanId, setSelectedPlanId] = useState(business.subscription?.planId || '');
    const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>(business.subscription?.billingCycle || 'monthly');
    const [isUpdating, setIsUpdating] = useState(false);

    const currentPlan = plans.find(p => p.id === business.subscription?.planId);

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('en-GB', {
            style: 'currency',
            currency: 'GBP'
        }).format(amount / 100);
    };

    const handleAssignPlan = async () => {
        if (!selectedPlanId) return;
        setIsUpdating(true);
        await onAssignPlan(selectedPlanId, billingCycle);
        setIsUpdating(false);
    };

    return (
        <div className="space-y-6">
            {/* Current Subscription */}
            <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700">
                <h3 className="text-sm font-medium text-gray-400 mb-4">Current Subscription</h3>
                {business.subscription ? (
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-lg font-semibold text-white">{currentPlan?.name || 'Unknown Plan'}</p>
                                <p className="text-sm text-gray-400">{business.subscription.billingCycle} billing</p>
                            </div>
                            <SubscriptionBadge status={business.subscription.status} />
                        </div>
                        <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-700">
                            <div>
                                <label className="text-xs text-gray-500">Current Period Start</label>
                                <p className="text-gray-300">{business.subscription.currentPeriodStart}</p>
                            </div>
                            <div>
                                <label className="text-xs text-gray-500">Current Period End</label>
                                <p className="text-gray-300">{business.subscription.currentPeriodEnd}</p>
                            </div>
                            {business.subscription.stripeCustomerId && (
                                <div>
                                    <label className="text-xs text-gray-500">Stripe Customer</label>
                                    <p className="text-gray-300 font-mono text-sm">{business.subscription.stripeCustomerId}</p>
                                </div>
                            )}
                            {business.subscription.cancelAtPeriodEnd && (
                                <div className="col-span-2">
                                    <p className="text-amber-400 text-sm flex items-center gap-2">
                                        <ExclamationTriangleIcon className="w-4 h-4" />
                                        Subscription will cancel at period end
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                ) : (
                    <div className="text-center py-8">
                        <XCircleIcon className="w-12 h-12 text-gray-600 mx-auto" />
                        <p className="mt-4 text-gray-400">No active subscription</p>
                        <p className="text-sm text-gray-500">Assign a plan below to get started</p>
                    </div>
                )}
            </div>

            {/* Assign/Change Plan */}
            <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700">
                <h3 className="text-sm font-medium text-gray-400 mb-4">
                    {business.subscription ? 'Change Plan' : 'Assign Plan'}
                </h3>

                <div className="space-y-4">
                    {/* Plan Selection */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {plans.filter(p => p.isActive).map((plan) => (
                            <div
                                key={plan.id}
                                onClick={() => setSelectedPlanId(plan.id)}
                                className={`p-4 rounded-lg border-2 cursor-pointer transition-colors ${
                                    selectedPlanId === plan.id
                                        ? 'border-brand-500 bg-brand-500/10'
                                        : 'border-gray-700 hover:border-gray-600'
                                }`}
                            >
                                <h4 className="font-semibold text-white">{plan.name}</h4>
                                <p className="text-sm text-gray-400 mt-1">{plan.description}</p>
                                <div className="mt-3">
                                    <p className="text-lg font-bold text-brand-400">
                                        {formatCurrency(billingCycle === 'yearly' ? plan.priceYearly : plan.priceMonthly)}
                                        <span className="text-sm font-normal text-gray-500">
                                            /{billingCycle === 'yearly' ? 'year' : 'month'}
                                        </span>
                                    </p>
                                </div>
                                <p className="text-xs text-gray-500 mt-2">
                                    Max {plan.maxUsers === -1 ? 'Unlimited' : plan.maxUsers} users
                                </p>
                            </div>
                        ))}
                    </div>

                    {/* Billing Cycle */}
                    <div className="flex gap-2">
                        <button
                            onClick={() => setBillingCycle('monthly')}
                            className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
                                billingCycle === 'monthly'
                                    ? 'bg-brand-600 text-white'
                                    : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                            }`}
                        >
                            Monthly
                        </button>
                        <button
                            onClick={() => setBillingCycle('yearly')}
                            className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
                                billingCycle === 'yearly'
                                    ? 'bg-brand-600 text-white'
                                    : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                            }`}
                        >
                            Yearly (Save ~17%)
                        </button>
                    </div>

                    {/* Assign Button */}
                    <button
                        onClick={handleAssignPlan}
                        disabled={!selectedPlanId || isUpdating}
                        className="w-full py-3 px-4 rounded-lg bg-brand-600 text-white font-semibold hover:bg-brand-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        {isUpdating ? 'Updating...' : business.subscription ? 'Update Plan' : 'Assign Plan'}
                    </button>
                </div>
            </div>
        </div>
    );
};

const FeaturesTab: React.FC<{
    business: AdminBusinessRecord;
    features: Feature[];
    planFeatures: string[];
    onToggleFeature: (featureId: string, enabled: boolean) => void;
}> = ({ business, features, planFeatures, onToggleFeature }) => {
    const getFeatureStatus = (featureId: string) => {
        const override = business.featureOverrides?.find(o => o.featureId === featureId);
        if (override) {
            return { enabled: override.enabled, source: 'override' as const };
        }
        const isPlanFeature = planFeatures.includes(featureId);
        return { enabled: isPlanFeature, source: 'plan' as const };
    };

    const featuresByCategory = useMemo(() => {
        const grouped: Record<string, Feature[]> = {};
        features.forEach(feature => {
            if (!grouped[feature.category]) {
                grouped[feature.category] = [];
            }
            grouped[feature.category].push(feature);
        });
        return grouped;
    }, [features]);

    const categoryLabels: Record<string, string> = {
        core: 'Core Features',
        crm: 'CRM Features',
        reporting: 'Reporting',
        integrations: 'Integrations',
        advanced: 'Advanced Features'
    };

    return (
        <div className="space-y-6">
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4">
                <p className="text-sm text-amber-300">
                    <ExclamationTriangleIcon className="w-4 h-4 inline mr-2" />
                    Feature overrides take precedence over plan features. Use with caution.
                </p>
            </div>

            {(Object.entries(featuresByCategory) as [string, Feature[]][]).map(([category, categoryFeatures]) => (
                <div key={category} className="bg-gray-800/50 rounded-xl border border-gray-700 overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-700 bg-gray-800/50">
                        <h3 className="font-medium text-white">{categoryLabels[category] || category}</h3>
                    </div>
                    <div className="divide-y divide-gray-700">
                        {categoryFeatures.map(feature => {
                            const status = getFeatureStatus(feature.id);
                            return (
                                <div key={feature.id} className="px-6 py-4 flex items-center justify-between">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2">
                                            <p className="font-medium text-white">{feature.name}</p>
                                            {status.source === 'override' && (
                                                <span className="text-xs px-2 py-0.5 rounded bg-purple-500/20 text-purple-400">
                                                    Override
                                                </span>
                                            )}
                                            {status.source === 'plan' && status.enabled && (
                                                <span className="text-xs px-2 py-0.5 rounded bg-blue-500/20 text-blue-400">
                                                    Plan
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-sm text-gray-400 mt-1">{feature.description}</p>
                                        <p className="text-xs text-gray-500 mt-1 font-mono">{feature.key}</p>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <button
                                            onClick={() => onToggleFeature(feature.id, !status.enabled)}
                                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                                                status.enabled ? 'bg-green-500' : 'bg-gray-600'
                                            }`}
                                        >
                                            <span
                                                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                                                    status.enabled ? 'translate-x-6' : 'translate-x-1'
                                                }`}
                                            />
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            ))}
        </div>
    );
};

const ConnectivityTab: React.FC<{ business: AdminBusinessRecord }> = ({ business }) => {
    const { testBusinessConnectivity } = useAdmin();
    const [isTestingRead, setIsTestingRead] = useState(false);
    const [isTestingWrite, setIsTestingWrite] = useState(false);
    const [readResult, setReadResult] = useState<{ success: boolean; message: string } | null>(null);
    const [writeResult, setWriteResult] = useState<{ success: boolean; message: string } | null>(null);

    const handleTestRead = async () => {
        setIsTestingRead(true);
        setReadResult(null);
        const result = await testBusinessConnectivity(business.id, 'read');
        setReadResult(result);
        setIsTestingRead(false);
    };

    const handleTestWrite = async () => {
        setIsTestingWrite(true);
        setWriteResult(null);
        const result = await testBusinessConnectivity(business.id, 'write');
        setWriteResult(result);
        setIsTestingWrite(false);
    };

    return (
        <div className="space-y-6">
            <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700">
                <h3 className="text-sm font-medium text-gray-400 mb-4">Firebase Connectivity Tests</h3>
                <p className="text-sm text-gray-400 mb-6">
                    Test read and write access to this business's Firebase data path.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Read Test */}
                    <div className="bg-gray-900 rounded-lg p-4 border border-gray-700">
                        <div className="flex items-center justify-between mb-4">
                            <h4 className="font-medium text-white">Read Test</h4>
                            <button
                                onClick={handleTestRead}
                                disabled={isTestingRead}
                                className="px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-500 text-white rounded-lg disabled:opacity-50 transition-colors"
                            >
                                {isTestingRead ? 'Testing...' : 'Test Read'}
                            </button>
                        </div>
                        {readResult && (
                            <div className={`p-3 rounded-lg flex items-start gap-2 ${
                                readResult.success ? 'bg-green-500/20' : 'bg-red-500/20'
                            }`}>
                                {readResult.success ? (
                                    <CheckCircleIcon className="w-5 h-5 text-green-400 flex-shrink-0" />
                                ) : (
                                    <XCircleIcon className="w-5 h-5 text-red-400 flex-shrink-0" />
                                )}
                                <p className={`text-sm ${readResult.success ? 'text-green-300' : 'text-red-300'}`}>
                                    {readResult.message}
                                </p>
                            </div>
                        )}
                    </div>

                    {/* Write Test */}
                    <div className="bg-gray-900 rounded-lg p-4 border border-gray-700">
                        <div className="flex items-center justify-between mb-4">
                            <h4 className="font-medium text-white">Write Test</h4>
                            <button
                                onClick={handleTestWrite}
                                disabled={isTestingWrite}
                                className="px-4 py-2 text-sm font-medium bg-amber-600 hover:bg-amber-500 text-white rounded-lg disabled:opacity-50 transition-colors"
                            >
                                {isTestingWrite ? 'Testing...' : 'Test Write'}
                            </button>
                        </div>
                        {writeResult && (
                            <div className={`p-3 rounded-lg flex items-start gap-2 ${
                                writeResult.success ? 'bg-green-500/20' : 'bg-red-500/20'
                            }`}>
                                {writeResult.success ? (
                                    <CheckCircleIcon className="w-5 h-5 text-green-400 flex-shrink-0" />
                                ) : (
                                    <XCircleIcon className="w-5 h-5 text-red-400 flex-shrink-0" />
                                )}
                                <p className={`text-sm ${writeResult.success ? 'text-green-300' : 'text-red-300'}`}>
                                    {writeResult.message}
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Connection Info */}
            <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700">
                <h3 className="text-sm font-medium text-gray-400 mb-4">Database Path</h3>
                <div className="bg-gray-900 rounded-lg p-4 font-mono text-sm text-gray-300">
                    <p>/companies/{business.id}/</p>
                </div>
                <p className="text-xs text-gray-500 mt-3">
                    This is the Firebase Realtime Database path for this business's data.
                </p>
            </div>
        </div>
    );
};

const BusinessDetail: React.FC = () => {
    const {
        selectedBusiness,
        plans,
        features,
        setView,
        assignPlanToBusiness,
        setBusinessFeatureOverride
    } = useAdmin();
    const [activeTab, setActiveTab] = useState<TabId>('overview');

    if (!selectedBusiness) {
        return (
            <div className="text-center py-12">
                <BuildingStorefrontIcon className="w-12 h-12 text-gray-600 mx-auto" />
                <p className="mt-4 text-gray-400">No business selected</p>
                <button
                    onClick={() => setView('businesses')}
                    className="mt-4 text-brand-400 hover:text-brand-300"
                >
                    Back to Businesses
                </button>
            </div>
        );
    }

    const currentPlan = plans.find(p => p.id === selectedBusiness.subscription?.planId);
    const planFeatures = currentPlan?.featureIds || [];

    const handleAssignPlan = async (planId: string, billingCycle: 'monthly' | 'yearly') => {
        await assignPlanToBusiness(selectedBusiness.id, planId, billingCycle);
    };

    const handleToggleFeature = async (featureId: string, enabled: boolean) => {
        await setBusinessFeatureOverride(selectedBusiness.id, featureId, enabled);
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center gap-4">
                <button
                    onClick={() => setView('businesses')}
                    className="p-2 rounded-lg hover:bg-gray-800 transition-colors"
                >
                    <ArrowLeftIcon className="w-5 h-5 text-gray-400" />
                </button>
                <div className="flex items-center gap-4 flex-1">
                    <div className="w-12 h-12 rounded-xl bg-brand-500/20 flex items-center justify-center">
                        <BuildingStorefrontIcon className="w-6 h-6 text-brand-400" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-white">{selectedBusiness.businessName}</h1>
                        <p className="text-gray-400">{selectedBusiness.ownerEmail || 'No email'}</p>
                    </div>
                </div>
                <SubscriptionBadge status={selectedBusiness.subscription?.status} />
            </div>

            {/* Tabs */}
            <div className="border-b border-gray-700">
                <div className="flex gap-2">
                    <TabButton
                        label="Overview"
                        tabId="overview"
                        activeTab={activeTab}
                        onClick={() => setActiveTab('overview')}
                        icon={BuildingStorefrontIcon}
                    />
                    <TabButton
                        label="Subscription"
                        tabId="subscription"
                        activeTab={activeTab}
                        onClick={() => setActiveTab('subscription')}
                        icon={CreditCardIcon}
                    />
                    <TabButton
                        label="Features"
                        tabId="features"
                        activeTab={activeTab}
                        onClick={() => setActiveTab('features')}
                        icon={TagIcon}
                    />
                    <TabButton
                        label="Connectivity"
                        tabId="connectivity"
                        activeTab={activeTab}
                        onClick={() => setActiveTab('connectivity')}
                        icon={SignalIcon}
                    />
                </div>
            </div>

            {/* Tab Content */}
            <div>
                {activeTab === 'overview' && <OverviewTab business={selectedBusiness} />}
                {activeTab === 'subscription' && (
                    <SubscriptionTab
                        business={selectedBusiness}
                        plans={plans}
                        onAssignPlan={handleAssignPlan}
                    />
                )}
                {activeTab === 'features' && (
                    <FeaturesTab
                        business={selectedBusiness}
                        features={features}
                        planFeatures={planFeatures}
                        onToggleFeature={handleToggleFeature}
                    />
                )}
                {activeTab === 'connectivity' && <ConnectivityTab business={selectedBusiness} />}
            </div>
        </div>
    );
};

export default BusinessDetail;
