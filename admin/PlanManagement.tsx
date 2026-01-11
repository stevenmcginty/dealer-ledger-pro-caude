
import React, { useState } from 'react';
import { useAdmin } from '../contexts/AdminContext';
import { SubscriptionPlan, Feature } from '../types';
import {
    PlusIcon,
    EditIcon,
    TrashIcon,
    CreditCardIcon,
    CheckCircleIcon,
    XCircleIcon,
    XMarkIcon,
    TagIcon
} from '../components/icons';

interface PlanFormData {
    name: string;
    slug: string;
    description: string;
    priceMonthly: number;
    priceYearly: number;
    stripePriceIdMonthly: string;
    stripePriceIdYearly: string;
    featureIds: string[];
    maxUsers: number;
    storageLimitMB: number;
    isActive: boolean;
    displayOrder: number;
}

const emptyPlanForm: PlanFormData = {
    name: '',
    slug: '',
    description: '',
    priceMonthly: 0,
    priceYearly: 0,
    stripePriceIdMonthly: '',
    stripePriceIdYearly: '',
    featureIds: [],
    maxUsers: 5,
    storageLimitMB: 500,
    isActive: true,
    displayOrder: 0
};

const PlanCard: React.FC<{
    plan: SubscriptionPlan;
    features: Feature[];
    onEdit: () => void;
    onDelete: () => void;
    onToggleActive: () => void;
}> = ({ plan, features, onEdit, onDelete, onToggleActive }) => {
    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('en-GB', {
            style: 'currency',
            currency: 'GBP'
        }).format(amount / 100);
    };

    const planFeatures = features.filter(f => (plan.featureIds || []).includes(f.id));

    return (
        <div className={`bg-gray-800/50 rounded-xl border ${plan.isActive ? 'border-gray-700' : 'border-gray-800 opacity-60'} overflow-hidden`}>
            <div className="p-6">
                <div className="flex items-start justify-between mb-4">
                    <div>
                        <div className="flex items-center gap-2">
                            <h3 className="text-xl font-bold text-white">{plan.name}</h3>
                            {plan.isActive ? (
                                <span className="text-xs px-2 py-0.5 rounded bg-green-500/20 text-green-400">Active</span>
                            ) : (
                                <span className="text-xs px-2 py-0.5 rounded bg-gray-500/20 text-gray-400">Inactive</span>
                            )}
                        </div>
                        <p className="text-sm text-gray-400 mt-1">{plan.description}</p>
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={onEdit}
                            className="p-2 rounded-lg hover:bg-gray-700 transition-colors"
                            title="Edit plan"
                        >
                            <EditIcon className="w-4 h-4 text-gray-400" />
                        </button>
                        <button
                            onClick={onDelete}
                            className="p-2 rounded-lg hover:bg-red-500/20 transition-colors"
                            title="Delete plan"
                        >
                            <TrashIcon className="w-4 h-4 text-red-400" />
                        </button>
                    </div>
                </div>

                {/* Pricing */}
                <div className="grid grid-cols-2 gap-4 mb-6">
                    <div className="bg-gray-900/50 rounded-lg p-4">
                        <p className="text-xs text-gray-500 mb-1">Monthly</p>
                        <p className="text-2xl font-bold text-brand-400">{formatCurrency(plan.priceMonthly)}</p>
                    </div>
                    <div className="bg-gray-900/50 rounded-lg p-4">
                        <p className="text-xs text-gray-500 mb-1">Yearly</p>
                        <p className="text-2xl font-bold text-brand-400">{formatCurrency(plan.priceYearly)}</p>
                        <p className="text-xs text-green-400">Save {Math.round((1 - plan.priceYearly / (plan.priceMonthly * 12)) * 100)}%</p>
                    </div>
                </div>

                {/* Features */}
                <div className="mb-4">
                    <p className="text-xs text-gray-500 mb-2">Included Features ({planFeatures.length})</p>
                    <div className="flex flex-wrap gap-2">
                        {planFeatures.length === 0 ? (
                            <p className="text-sm text-gray-500">No features assigned</p>
                        ) : (
                            planFeatures.slice(0, 5).map(feature => (
                                <span key={feature.id} className="text-xs px-2 py-1 rounded bg-gray-700 text-gray-300">
                                    {feature.name}
                                </span>
                            ))
                        )}
                        {planFeatures.length > 5 && (
                            <span className="text-xs px-2 py-1 rounded bg-gray-700 text-gray-400">
                                +{planFeatures.length - 5} more
                            </span>
                        )}
                    </div>
                </div>

                {/* Max Users & Storage */}
                <div className="flex justify-between text-sm text-gray-400">
                    <div>
                        Max Users: <span className="text-white font-medium">{plan.maxUsers === -1 ? 'Unlimited' : plan.maxUsers}</span>
                    </div>
                    <div>
                        Storage: <span className="text-white font-medium">{plan.storageLimitMB ? (plan.storageLimitMB >= 1024 ? `${(plan.storageLimitMB / 1024).toFixed(1)}GB` : `${plan.storageLimitMB}MB`) : 'Unlimited'}</span>
                    </div>
                </div>

                {/* Toggle Active */}
                <div className="mt-4 pt-4 border-t border-gray-700">
                    <button
                        onClick={onToggleActive}
                        className={`w-full py-2 rounded-lg text-sm font-medium transition-colors ${
                            plan.isActive
                                ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                                : 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
                        }`}
                    >
                        {plan.isActive ? 'Deactivate Plan' : 'Activate Plan'}
                    </button>
                </div>
            </div>

            {/* Stripe IDs */}
            <div className="px-6 py-3 bg-gray-900/50 border-t border-gray-700">
                <p className="text-xs text-gray-500 mb-1">Stripe Price IDs</p>
                <div className="space-y-1">
                    <p className="text-xs font-mono text-gray-400 truncate" title={plan.stripePriceIdMonthly}>
                        M: {plan.stripePriceIdMonthly || 'Not set'}
                    </p>
                    <p className="text-xs font-mono text-gray-400 truncate" title={plan.stripePriceIdYearly}>
                        Y: {plan.stripePriceIdYearly || 'Not set'}
                    </p>
                </div>
            </div>
        </div>
    );
};

const PlanFormModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    onSave: (data: PlanFormData) => void;
    initialData?: SubscriptionPlan;
    features: Feature[];
    isLoading: boolean;
}> = ({ isOpen, onClose, onSave, initialData, features, isLoading }) => {
    const [formData, setFormData] = useState<PlanFormData>(
        initialData
            ? {
                  name: initialData.name,
                  slug: initialData.slug,
                  description: initialData.description,
                  priceMonthly: initialData.priceMonthly,
                  priceYearly: initialData.priceYearly,
                  stripePriceIdMonthly: initialData.stripePriceIdMonthly,
                  stripePriceIdYearly: initialData.stripePriceIdYearly,
                  featureIds: initialData.featureIds || [],
                  maxUsers: initialData.maxUsers,
                  storageLimitMB: initialData.storageLimitMB || 500,
                  isActive: initialData.isActive,
                  displayOrder: initialData.displayOrder
              }
            : emptyPlanForm
    );

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSave(formData);
    };

    const toggleFeature = (featureId: string) => {
        setFormData(prev => ({
            ...prev,
            featureIds: prev.featureIds.includes(featureId)
                ? prev.featureIds.filter(id => id !== featureId)
                : [...prev.featureIds, featureId]
        }));
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="bg-gray-900 rounded-xl border border-gray-700 w-full max-w-2xl max-h-[90vh] overflow-y-auto mx-4">
                <div className="flex items-center justify-between p-6 border-b border-gray-700">
                    <h2 className="text-xl font-bold text-white">
                        {initialData ? 'Edit Plan' : 'Create New Plan'}
                    </h2>
                    <button onClick={onClose} className="p-2 hover:bg-gray-800 rounded-lg transition-colors">
                        <XMarkIcon className="w-5 h-5 text-gray-400" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-6">
                    {/* Basic Info */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-2">Plan Name</label>
                            <input
                                type="text"
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                                placeholder="e.g. Pro"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-2">Slug</label>
                            <input
                                type="text"
                                value={formData.slug}
                                onChange={(e) => setFormData({ ...formData, slug: e.target.value.toLowerCase().replace(/\s+/g, '-') })}
                                className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                                placeholder="e.g. pro"
                                required
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">Description</label>
                        <textarea
                            value={formData.description}
                            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                            className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                            rows={2}
                            placeholder="Brief description of the plan"
                        />
                    </div>

                    {/* Pricing */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-2">Monthly Price (pence)</label>
                            <input
                                type="number"
                                value={formData.priceMonthly}
                                onChange={(e) => setFormData({ ...formData, priceMonthly: parseInt(e.target.value) || 0 })}
                                className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                                placeholder="2999"
                            />
                            <p className="text-xs text-gray-500 mt-1">e.g. 2999 = £29.99</p>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-2">Yearly Price (pence)</label>
                            <input
                                type="number"
                                value={formData.priceYearly}
                                onChange={(e) => setFormData({ ...formData, priceYearly: parseInt(e.target.value) || 0 })}
                                className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                                placeholder="29900"
                            />
                            <p className="text-xs text-gray-500 mt-1">e.g. 29900 = £299.00</p>
                        </div>
                    </div>

                    {/* Stripe IDs */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-2">Stripe Monthly Price ID</label>
                            <input
                                type="text"
                                value={formData.stripePriceIdMonthly}
                                onChange={(e) => setFormData({ ...formData, stripePriceIdMonthly: e.target.value })}
                                className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-brand-500 font-mono text-sm"
                                placeholder="price_..."
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-2">Stripe Yearly Price ID</label>
                            <input
                                type="text"
                                value={formData.stripePriceIdYearly}
                                onChange={(e) => setFormData({ ...formData, stripePriceIdYearly: e.target.value })}
                                className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-brand-500 font-mono text-sm"
                                placeholder="price_..."
                            />
                        </div>
                    </div>

                    {/* Max Users, Storage & Display Order */}
                    <div className="grid grid-cols-3 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-2">Max Users</label>
                            <input
                                type="number"
                                value={formData.maxUsers}
                                onChange={(e) => setFormData({ ...formData, maxUsers: parseInt(e.target.value) || 0 })}
                                className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                                placeholder="5"
                            />
                            <p className="text-xs text-gray-500 mt-1">-1 for unlimited</p>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-2">Storage Limit (MB)</label>
                            <input
                                type="number"
                                value={formData.storageLimitMB}
                                onChange={(e) => setFormData({ ...formData, storageLimitMB: parseInt(e.target.value) || 0 })}
                                className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                                placeholder="500"
                            />
                            <p className="text-xs text-gray-500 mt-1">0 for unlimited</p>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-2">Display Order</label>
                            <input
                                type="number"
                                value={formData.displayOrder}
                                onChange={(e) => setFormData({ ...formData, displayOrder: parseInt(e.target.value) || 0 })}
                                className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                                placeholder="0"
                            />
                        </div>
                    </div>

                    {/* Features */}
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">Included Features</label>
                        <div className="bg-gray-800 rounded-lg border border-gray-700 p-4 max-h-48 overflow-y-auto">
                            {features.length === 0 ? (
                                <p className="text-sm text-gray-500">No features defined yet</p>
                            ) : (
                                <div className="space-y-2">
                                    {features.map(feature => (
                                        <label
                                            key={feature.id}
                                            className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-700/50 cursor-pointer"
                                        >
                                            <input
                                                type="checkbox"
                                                checked={formData.featureIds.includes(feature.id)}
                                                onChange={() => toggleFeature(feature.id)}
                                                className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-brand-500 focus:ring-brand-500"
                                            />
                                            <div className="flex-1">
                                                <p className="text-sm text-white">{feature.name}</p>
                                                <p className="text-xs text-gray-500">{feature.key}</p>
                                            </div>
                                            <span className="text-xs px-2 py-0.5 rounded bg-gray-700 text-gray-400">
                                                {feature.category}
                                            </span>
                                        </label>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Active Toggle */}
                    <div className="flex items-center gap-3">
                        <input
                            type="checkbox"
                            id="isActive"
                            checked={formData.isActive}
                            onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                            className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-brand-500 focus:ring-brand-500"
                        />
                        <label htmlFor="isActive" className="text-sm text-gray-300">
                            Plan is active and available for selection
                        </label>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-3 pt-4 border-t border-gray-700">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 py-3 px-4 rounded-lg border border-gray-700 text-gray-300 hover:bg-gray-800 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={isLoading}
                            className="flex-1 py-3 px-4 rounded-lg bg-brand-600 text-white font-semibold hover:bg-brand-500 disabled:opacity-50 transition-colors"
                        >
                            {isLoading ? 'Saving...' : (initialData ? 'Update Plan' : 'Create Plan')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

const PlanManagement: React.FC = () => {
    const { plans, features, createPlan, updatePlan, deletePlan, isDataLoading } = useAdmin();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingPlan, setEditingPlan] = useState<SubscriptionPlan | undefined>(undefined);
    const [isSaving, setIsSaving] = useState(false);

    const handleOpenCreate = () => {
        setEditingPlan(undefined);
        setIsModalOpen(true);
    };

    const handleOpenEdit = (plan: SubscriptionPlan) => {
        setEditingPlan(plan);
        setIsModalOpen(true);
    };

    const handleClose = () => {
        setIsModalOpen(false);
        setEditingPlan(undefined);
    };

    const handleSave = async (data: PlanFormData) => {
        setIsSaving(true);
        if (editingPlan) {
            await updatePlan(editingPlan.id, data);
        } else {
            await createPlan(data);
        }
        setIsSaving(false);
        handleClose();
    };

    const handleDelete = async (plan: SubscriptionPlan) => {
        if (confirm(`Are you sure you want to delete the "${plan.name}" plan? This action cannot be undone.`)) {
            await deletePlan(plan.id);
        }
    };

    const handleToggleActive = async (plan: SubscriptionPlan) => {
        await updatePlan(plan.id, { isActive: !plan.isActive });
    };

    const sortedPlans = [...plans].sort((a, b) => a.displayOrder - b.displayOrder);

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-white">Subscription Plans</h1>
                    <p className="text-gray-400 mt-1">Manage your pricing tiers and feature bundles</p>
                </div>
                <button
                    onClick={handleOpenCreate}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-brand-600 hover:bg-brand-500 rounded-lg transition-colors"
                >
                    <PlusIcon className="w-4 h-4" />
                    Create Plan
                </button>
            </div>

            {isDataLoading ? (
                <div className="p-12 text-center">
                    <div className="animate-spin h-8 w-8 border-2 border-brand-500 border-t-transparent rounded-full mx-auto" />
                    <p className="mt-4 text-gray-400">Loading plans...</p>
                </div>
            ) : sortedPlans.length === 0 ? (
                <div className="bg-gray-800/50 rounded-xl border border-gray-700 p-12 text-center">
                    <CreditCardIcon className="w-12 h-12 text-gray-600 mx-auto" />
                    <h3 className="mt-4 text-lg font-medium text-white">No plans created</h3>
                    <p className="mt-2 text-sm text-gray-400">
                        Create subscription plans to offer different features and pricing tiers.
                    </p>
                    <button
                        onClick={handleOpenCreate}
                        className="mt-6 inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-brand-600 hover:bg-brand-500 rounded-lg transition-colors"
                    >
                        <PlusIcon className="w-4 h-4" />
                        Create First Plan
                    </button>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {sortedPlans.map((plan) => (
                        <PlanCard
                            key={plan.id}
                            plan={plan}
                            features={features}
                            onEdit={() => handleOpenEdit(plan)}
                            onDelete={() => handleDelete(plan)}
                            onToggleActive={() => handleToggleActive(plan)}
                        />
                    ))}
                </div>
            )}

            <PlanFormModal
                isOpen={isModalOpen}
                onClose={handleClose}
                onSave={handleSave}
                initialData={editingPlan}
                features={features}
                isLoading={isSaving}
            />
        </div>
    );
};

export default PlanManagement;
