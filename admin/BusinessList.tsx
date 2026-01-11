
import React, { useState, useMemo } from 'react';
import { useAdmin } from '../contexts/AdminContext';
import { AdminBusinessRecord } from '../types';
import {
    MagnifyingGlassIcon,
    BuildingStorefrontIcon,
    ChevronRightIcon,
    CheckCircleIcon,
    ExclamationTriangleIcon,
    ClockIcon,
    XCircleIcon
} from '../components/icons';

const SubscriptionBadge: React.FC<{ status?: string }> = ({ status }) => {
    const getStatusConfig = () => {
        switch (status) {
            case 'active':
                return { bg: 'bg-green-500/20', text: 'text-green-400', label: 'Active' };
            case 'trialing':
                return { bg: 'bg-blue-500/20', text: 'text-blue-400', label: 'Trial' };
            case 'past_due':
                return { bg: 'bg-red-500/20', text: 'text-red-400', label: 'Past Due' };
            case 'canceled':
                return { bg: 'bg-gray-500/20', text: 'text-gray-400', label: 'Canceled' };
            default:
                return { bg: 'bg-gray-500/20', text: 'text-gray-400', label: 'No Plan' };
        }
    };

    const config = getStatusConfig();

    return (
        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${config.bg} ${config.text}`}>
            {config.label}
        </span>
    );
};

const BusinessRow: React.FC<{
    business: AdminBusinessRecord;
    planName?: string;
    onClick: () => void;
}> = ({ business, planName, onClick }) => {
    const formatDate = (timestamp: number) => {
        return new Date(timestamp).toLocaleDateString('en-GB', {
            day: 'numeric',
            month: 'short',
            year: 'numeric'
        });
    };

    return (
        <tr
            className="hover:bg-gray-800/50 cursor-pointer transition-colors"
            onClick={onClick}
        >
            <td className="px-6 py-4">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-brand-500/20 flex items-center justify-center flex-shrink-0">
                        <BuildingStorefrontIcon className="w-5 h-5 text-brand-400" />
                    </div>
                    <div className="min-w-0">
                        <p className="text-sm font-medium text-white truncate">{business.businessName}</p>
                        <p className="text-xs text-gray-500 truncate">{business.ownerEmail || 'No email'}</p>
                    </div>
                </div>
            </td>
            <td className="px-6 py-4">
                <SubscriptionBadge status={business.subscription?.status} />
            </td>
            <td className="px-6 py-4 text-sm text-gray-300">
                {planName || '-'}
            </td>
            <td className="px-6 py-4 text-sm text-gray-300">
                {business.userCount}
            </td>
            <td className="px-6 py-4 text-sm text-gray-400">
                {formatDate(business.createdAt)}
            </td>
            <td className="px-6 py-4">
                <ChevronRightIcon className="w-5 h-5 text-gray-500" />
            </td>
        </tr>
    );
};

const BusinessList: React.FC = () => {
    const { businesses, plans, selectBusiness, isDataLoading, refreshBusinesses } = useAdmin();
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState<string>('all');

    const getPlanName = (planId?: string) => {
        if (!planId) return undefined;
        const plan = plans.find(p => p.id === planId);
        return plan?.name;
    };

    const filteredBusinesses = useMemo(() => {
        return businesses.filter(business => {
            // Search filter
            const matchesSearch = searchTerm === '' ||
                business.businessName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                business.ownerEmail?.toLowerCase().includes(searchTerm.toLowerCase());

            // Status filter
            const matchesStatus = statusFilter === 'all' ||
                (statusFilter === 'no_plan' && !business.subscription) ||
                business.subscription?.status === statusFilter;

            return matchesSearch && matchesStatus;
        });
    }, [businesses, searchTerm, statusFilter]);

    const statusCounts = useMemo(() => {
        return {
            all: businesses.length,
            active: businesses.filter(b => b.subscription?.status === 'active').length,
            trialing: businesses.filter(b => b.subscription?.status === 'trialing').length,
            past_due: businesses.filter(b => b.subscription?.status === 'past_due').length,
            no_plan: businesses.filter(b => !b.subscription).length
        };
    }, [businesses]);

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-white">Businesses</h1>
                    <p className="text-gray-400 mt-1">Manage all businesses on your platform</p>
                </div>
                <button
                    onClick={() => refreshBusinesses()}
                    className="px-4 py-2 text-sm font-medium text-white bg-brand-600 hover:bg-brand-500 rounded-lg transition-colors"
                >
                    Refresh
                </button>
            </div>

            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-4">
                {/* Search */}
                <div className="relative flex-1">
                    <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                    <input
                        type="text"
                        placeholder="Search businesses..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                </div>

                {/* Status Filter */}
                <div className="flex gap-2 flex-wrap">
                    {[
                        { value: 'all', label: 'All' },
                        { value: 'active', label: 'Active' },
                        { value: 'trialing', label: 'Trial' },
                        { value: 'past_due', label: 'Past Due' },
                        { value: 'no_plan', label: 'No Plan' }
                    ].map((option) => (
                        <button
                            key={option.value}
                            onClick={() => setStatusFilter(option.value)}
                            className={`px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                                statusFilter === option.value
                                    ? 'bg-brand-600 text-white'
                                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                            }`}
                        >
                            {option.label} ({statusCounts[option.value as keyof typeof statusCounts]})
                        </button>
                    ))}
                </div>
            </div>

            {/* Table */}
            <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
                {isDataLoading ? (
                    <div className="p-12 text-center">
                        <div className="animate-spin h-8 w-8 border-2 border-brand-500 border-t-transparent rounded-full mx-auto" />
                        <p className="mt-4 text-gray-400">Loading businesses...</p>
                    </div>
                ) : filteredBusinesses.length === 0 ? (
                    <div className="p-12 text-center">
                        <BuildingStorefrontIcon className="w-12 h-12 text-gray-600 mx-auto" />
                        <h3 className="mt-4 text-lg font-medium text-white">No businesses found</h3>
                        <p className="mt-2 text-sm text-gray-400">
                            {searchTerm || statusFilter !== 'all'
                                ? 'Try adjusting your search or filters'
                                : 'No businesses have been created yet'}
                        </p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-gray-700 bg-gray-800/50">
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                                        Business
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                                        Status
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                                        Plan
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                                        Users
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                                        Created
                                    </th>
                                    <th className="px-6 py-3 w-12"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-700">
                                {filteredBusinesses.map((business) => (
                                    <BusinessRow
                                        key={business.id}
                                        business={business}
                                        planName={getPlanName(business.subscription?.planId)}
                                        onClick={() => selectBusiness(business.id)}
                                    />
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
};

export default BusinessList;
