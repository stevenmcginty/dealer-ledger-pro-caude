
import React, { useState, useMemo } from 'react';
import { useAdmin } from '../contexts/AdminContext';
import { Feature } from '../types';
import {
    PlusIcon,
    EditIcon,
    TrashIcon,
    TagIcon,
    XMarkIcon,
    CheckCircleIcon,
    XCircleIcon
} from '../components/icons';

type FeatureCategory = 'core' | 'crm' | 'reporting' | 'integrations' | 'advanced';

interface FeatureFormData {
    key: string;
    name: string;
    description: string;
    category: FeatureCategory;
    isActive: boolean;
}

const emptyFeatureForm: FeatureFormData = {
    key: '',
    name: '',
    description: '',
    category: 'core',
    isActive: true
};

const categoryLabels: Record<FeatureCategory, string> = {
    core: 'Core',
    crm: 'CRM',
    reporting: 'Reporting',
    integrations: 'Integrations',
    advanced: 'Advanced'
};

const categoryColors: Record<FeatureCategory, { bg: string; text: string }> = {
    core: { bg: 'bg-blue-500/20', text: 'text-blue-400' },
    crm: { bg: 'bg-purple-500/20', text: 'text-purple-400' },
    reporting: { bg: 'bg-amber-500/20', text: 'text-amber-400' },
    integrations: { bg: 'bg-green-500/20', text: 'text-green-400' },
    advanced: { bg: 'bg-red-500/20', text: 'text-red-400' }
};

const FeatureRow: React.FC<{
    feature: Feature;
    onEdit: () => void;
    onDelete: () => void;
    onToggleActive: () => void;
    usageCount: number;
}> = ({ feature, onEdit, onDelete, onToggleActive, usageCount }) => {
    const colors = categoryColors[feature.category];

    return (
        <tr className="hover:bg-gray-800/50 transition-colors">
            <td className="px-6 py-4">
                <div>
                    <p className="font-medium text-white">{feature.name}</p>
                    <p className="text-xs text-gray-500 font-mono">{feature.key}</p>
                </div>
            </td>
            <td className="px-6 py-4">
                <p className="text-sm text-gray-400 max-w-xs truncate">{feature.description}</p>
            </td>
            <td className="px-6 py-4">
                <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${colors.bg} ${colors.text}`}>
                    {categoryLabels[feature.category]}
                </span>
            </td>
            <td className="px-6 py-4">
                <button
                    onClick={onToggleActive}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                        feature.isActive
                            ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
                            : 'bg-gray-500/20 text-gray-400 hover:bg-gray-500/30'
                    }`}
                >
                    {feature.isActive ? (
                        <>
                            <CheckCircleIcon className="w-3.5 h-3.5" />
                            Active
                        </>
                    ) : (
                        <>
                            <XCircleIcon className="w-3.5 h-3.5" />
                            Inactive
                        </>
                    )}
                </button>
            </td>
            <td className="px-6 py-4 text-sm text-gray-400">
                {usageCount} plan{usageCount !== 1 ? 's' : ''}
            </td>
            <td className="px-6 py-4">
                <div className="flex items-center gap-2">
                    <button
                        onClick={onEdit}
                        className="p-2 rounded-lg hover:bg-gray-700 transition-colors"
                        title="Edit feature"
                    >
                        <EditIcon className="w-4 h-4 text-gray-400" />
                    </button>
                    <button
                        onClick={onDelete}
                        className="p-2 rounded-lg hover:bg-red-500/20 transition-colors"
                        title="Delete feature"
                    >
                        <TrashIcon className="w-4 h-4 text-red-400" />
                    </button>
                </div>
            </td>
        </tr>
    );
};

const FeatureFormModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    onSave: (data: FeatureFormData) => void;
    initialData?: Feature;
    isLoading: boolean;
}> = ({ isOpen, onClose, onSave, initialData, isLoading }) => {
    const [formData, setFormData] = useState<FeatureFormData>(
        initialData
            ? {
                  key: initialData.key,
                  name: initialData.name,
                  description: initialData.description,
                  category: initialData.category,
                  isActive: initialData.isActive
              }
            : emptyFeatureForm
    );

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSave(formData);
    };

    const generateKey = (name: string) => {
        return name
            .toLowerCase()
            .replace(/\s+/g, '_')
            .replace(/[^a-z0-9_]/g, '');
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="bg-gray-900 rounded-xl border border-gray-700 w-full max-w-lg mx-4">
                <div className="flex items-center justify-between p-6 border-b border-gray-700">
                    <h2 className="text-xl font-bold text-white">
                        {initialData ? 'Edit Feature' : 'Create New Feature'}
                    </h2>
                    <button onClick={onClose} className="p-2 hover:bg-gray-800 rounded-lg transition-colors">
                        <XMarkIcon className="w-5 h-5 text-gray-400" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-6">
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">Feature Name</label>
                        <input
                            type="text"
                            value={formData.name}
                            onChange={(e) => {
                                const name = e.target.value;
                                setFormData({
                                    ...formData,
                                    name,
                                    key: initialData ? formData.key : generateKey(name)
                                });
                            }}
                            className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                            placeholder="e.g. Sales Pipeline"
                            required
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">Feature Key</label>
                        <input
                            type="text"
                            value={formData.key}
                            onChange={(e) => setFormData({ ...formData, key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') })}
                            className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white font-mono focus:outline-none focus:ring-2 focus:ring-brand-500"
                            placeholder="e.g. crm_pipeline"
                            required
                        />
                        <p className="text-xs text-gray-500 mt-1">Unique identifier used in code</p>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">Description</label>
                        <textarea
                            value={formData.description}
                            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                            className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                            rows={2}
                            placeholder="Brief description of what this feature enables"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">Category</label>
                        <select
                            value={formData.category}
                            onChange={(e) => setFormData({ ...formData, category: e.target.value as FeatureCategory })}
                            className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                        >
                            {Object.entries(categoryLabels).map(([value, label]) => (
                                <option key={value} value={value}>{label}</option>
                            ))}
                        </select>
                    </div>

                    <div className="flex items-center gap-3">
                        <input
                            type="checkbox"
                            id="isActive"
                            checked={formData.isActive}
                            onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                            className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-brand-500 focus:ring-brand-500"
                        />
                        <label htmlFor="isActive" className="text-sm text-gray-300">
                            Feature is active and can be assigned to plans
                        </label>
                    </div>

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
                            {isLoading ? 'Saving...' : (initialData ? 'Update Feature' : 'Create Feature')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

const FeatureManagement: React.FC = () => {
    const { features, plans, createFeature, updateFeature, deleteFeature, isDataLoading } = useAdmin();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingFeature, setEditingFeature] = useState<Feature | undefined>(undefined);
    const [isSaving, setIsSaving] = useState(false);
    const [categoryFilter, setCategoryFilter] = useState<FeatureCategory | 'all'>('all');

    const featureUsage = useMemo(() => {
        const usage: Record<string, number> = {};
        features.forEach(feature => {
            usage[feature.id] = plans.filter(plan => plan.featureIds.includes(feature.id)).length;
        });
        return usage;
    }, [features, plans]);

    const filteredFeatures = useMemo(() => {
        if (categoryFilter === 'all') return features;
        return features.filter(f => f.category === categoryFilter);
    }, [features, categoryFilter]);

    const categoryCounts = useMemo(() => {
        const counts: Record<string, number> = { all: features.length };
        features.forEach(f => {
            counts[f.category] = (counts[f.category] || 0) + 1;
        });
        return counts;
    }, [features]);

    const handleOpenCreate = () => {
        setEditingFeature(undefined);
        setIsModalOpen(true);
    };

    const handleOpenEdit = (feature: Feature) => {
        setEditingFeature(feature);
        setIsModalOpen(true);
    };

    const handleClose = () => {
        setIsModalOpen(false);
        setEditingFeature(undefined);
    };

    const handleSave = async (data: FeatureFormData) => {
        setIsSaving(true);
        if (editingFeature) {
            await updateFeature(editingFeature.id, data);
        } else {
            await createFeature(data);
        }
        setIsSaving(false);
        handleClose();
    };

    const handleDelete = async (feature: Feature) => {
        const usage = featureUsage[feature.id];
        if (usage > 0) {
            alert(`Cannot delete "${feature.name}" - it's used in ${usage} plan(s). Remove it from all plans first.`);
            return;
        }
        if (confirm(`Are you sure you want to delete the "${feature.name}" feature? This action cannot be undone.`)) {
            await deleteFeature(feature.id);
        }
    };

    const handleToggleActive = async (feature: Feature) => {
        await updateFeature(feature.id, { isActive: !feature.isActive });
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-white">Feature Flags</h1>
                    <p className="text-gray-400 mt-1">Define features that can be enabled for different plans</p>
                </div>
                <button
                    onClick={handleOpenCreate}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-brand-600 hover:bg-brand-500 rounded-lg transition-colors"
                >
                    <PlusIcon className="w-4 h-4" />
                    Create Feature
                </button>
            </div>

            {/* Category Filters */}
            <div className="flex gap-2 flex-wrap">
                <button
                    onClick={() => setCategoryFilter('all')}
                    className={`px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                        categoryFilter === 'all'
                            ? 'bg-brand-600 text-white'
                            : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                    }`}
                >
                    All ({categoryCounts.all || 0})
                </button>
                {(Object.keys(categoryLabels) as FeatureCategory[]).map((cat) => (
                    <button
                        key={cat}
                        onClick={() => setCategoryFilter(cat)}
                        className={`px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                            categoryFilter === cat
                                ? 'bg-brand-600 text-white'
                                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                        }`}
                    >
                        {categoryLabels[cat]} ({categoryCounts[cat] || 0})
                    </button>
                ))}
            </div>

            {/* Features Table */}
            <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
                {isDataLoading ? (
                    <div className="p-12 text-center">
                        <div className="animate-spin h-8 w-8 border-2 border-brand-500 border-t-transparent rounded-full mx-auto" />
                        <p className="mt-4 text-gray-400">Loading features...</p>
                    </div>
                ) : filteredFeatures.length === 0 ? (
                    <div className="p-12 text-center">
                        <TagIcon className="w-12 h-12 text-gray-600 mx-auto" />
                        <h3 className="mt-4 text-lg font-medium text-white">
                            {categoryFilter === 'all' ? 'No features created' : `No ${categoryLabels[categoryFilter as FeatureCategory]} features`}
                        </h3>
                        <p className="mt-2 text-sm text-gray-400">
                            {categoryFilter === 'all'
                                ? 'Create feature flags to control access to different parts of your app.'
                                : 'Create a feature in this category to see it here.'}
                        </p>
                        {categoryFilter === 'all' && (
                            <button
                                onClick={handleOpenCreate}
                                className="mt-6 inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-brand-600 hover:bg-brand-500 rounded-lg transition-colors"
                            >
                                <PlusIcon className="w-4 h-4" />
                                Create First Feature
                            </button>
                        )}
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-gray-700 bg-gray-800/50">
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                                        Feature
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                                        Description
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                                        Category
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                                        Status
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                                        Usage
                                    </th>
                                    <th className="px-6 py-3 w-24"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-700">
                                {filteredFeatures.map((feature) => (
                                    <FeatureRow
                                        key={feature.id}
                                        feature={feature}
                                        usageCount={featureUsage[feature.id] || 0}
                                        onEdit={() => handleOpenEdit(feature)}
                                        onDelete={() => handleDelete(feature)}
                                        onToggleActive={() => handleToggleActive(feature)}
                                    />
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            <FeatureFormModal
                isOpen={isModalOpen}
                onClose={handleClose}
                onSave={handleSave}
                initialData={editingFeature}
                isLoading={isSaving}
            />
        </div>
    );
};

export default FeatureManagement;
