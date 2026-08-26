import React, { useState, useCallback, useMemo } from 'react';
import { EmptyState, Input } from '../components/ui';
import { ViewColumnsIcon, PlusIcon, MagnifyingGlassIcon, FunnelIcon, XMarkIcon } from '../components/icons';
import { useData } from '../hooks/useData';
import { useUI } from '../hooks/useUI';
import { LeadStage, Lead, LeadSource } from '../types';
import LeadCard from '../components/crm/LeadCard';

const STAGE_ORDER: LeadStage[] = [
    LeadStage.NEW,
    LeadStage.QUALIFIED,
    LeadStage.TEST_DRIVE,
    LeadStage.NEGOTIATION,
    LeadStage.WON,
    LeadStage.LOST,
];

const STAGE_COLORS: Record<LeadStage, string> = {
    [LeadStage.NEW]: 'bg-blue-500',
    [LeadStage.QUALIFIED]: 'bg-purple-500',
    [LeadStage.TEST_DRIVE]: 'bg-amber-500',
    [LeadStage.NEGOTIATION]: 'bg-orange-500',
    [LeadStage.WON]: 'bg-green-500',
    [LeadStage.LOST]: 'bg-gray-500',
};

const STAGE_BORDER_COLORS: Record<LeadStage, string> = {
    [LeadStage.NEW]: 'border-blue-500/50',
    [LeadStage.QUALIFIED]: 'border-purple-500/50',
    [LeadStage.TEST_DRIVE]: 'border-amber-500/50',
    [LeadStage.NEGOTIATION]: 'border-orange-500/50',
    [LeadStage.WON]: 'border-green-500/50',
    [LeadStage.LOST]: 'border-gray-500/50',
};

const LEAD_SOURCES: LeadSource[] = [
    'Website',
    'Walk-in',
    'Referral',
    'Motors.co.uk',
    'CarGurus',
    'AutoTrader',
    'eBay',
];

const PipelinePage: React.FC = () => {
    const { leads, updateLeadStage, setSelectedLeadId } = useData();
    const { openModal, setView } = useUI();
    const [draggedLead, setDraggedLead] = useState<Lead | null>(null);
    const [dragOverStage, setDragOverStage] = useState<LeadStage | null>(null);

    // Filter state
    const [searchQuery, setSearchQuery] = useState('');
    const [sourceFilter, setSourceFilter] = useState<LeadSource | ''>('');
    const [dateFilter, setDateFilter] = useState<'all' | '7days' | '30days' | '90days'>('all');
    const [minValue, setMinValue] = useState('');
    const [maxValue, setMaxValue] = useState('');
    const [hiddenStages, setHiddenStages] = useState<Set<LeadStage>>(new Set([LeadStage.LOST]));
    const [showFilters, setShowFilters] = useState(false);

    const toggleStageVisibility = useCallback((stage: LeadStage) => {
        setHiddenStages(prev => {
            const next = new Set(prev);
            if (next.has(stage)) {
                next.delete(stage);
            } else {
                next.add(stage);
            }
            return next;
        });
    }, []);

    // Filter leads
    const filteredLeads = useMemo(() => {
        const now = new Date();
        return leads.filter(lead => {
            // Search filter
            if (searchQuery) {
                const query = searchQuery.toLowerCase();
                const matchesName = `${lead.firstName} ${lead.lastName}`.toLowerCase().includes(query);
                const matchesEmail = lead.email.toLowerCase().includes(query);
                const matchesVehicle = lead.vehicleOfInterest?.toLowerCase().includes(query);
                const matchesPhone = lead.phone?.toLowerCase().includes(query);
                if (!matchesName && !matchesEmail && !matchesVehicle && !matchesPhone) {
                    return false;
                }
            }

            // Source filter
            if (sourceFilter && lead.source !== sourceFilter) {
                return false;
            }

            // Date filter
            if (dateFilter !== 'all') {
                const leadDate = new Date(lead.createdAt);
                const daysAgo = dateFilter === '7days' ? 7 : dateFilter === '30days' ? 30 : 90;
                const cutoff = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);
                if (leadDate < cutoff) {
                    return false;
                }
            }

            // Value filter
            if (minValue) {
                const min = parseFloat(minValue);
                if (!isNaN(min) && (lead.value || 0) < min) {
                    return false;
                }
            }
            if (maxValue) {
                const max = parseFloat(maxValue);
                if (!isNaN(max) && (lead.value || 0) > max) {
                    return false;
                }
            }

            return true;
        });
    }, [leads, searchQuery, sourceFilter, dateFilter, minValue, maxValue]);

    const leadsByStage = useMemo(() => {
        return STAGE_ORDER.reduce((acc, stage) => {
            acc[stage] = filteredLeads.filter(lead => lead.stage === stage);
            return acc;
        }, {} as Record<LeadStage, Lead[]>);
    }, [filteredLeads]);

    const handleDragStart = useCallback((e: React.DragEvent, lead: Lead) => {
        setDraggedLead(lead);
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', lead.id);
    }, []);

    const handleDragOver = useCallback((e: React.DragEvent, stage: LeadStage) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        setDragOverStage(stage);
    }, []);

    const handleDragLeave = useCallback(() => {
        setDragOverStage(null);
    }, []);

    const handleDrop = useCallback(async (e: React.DragEvent, targetStage: LeadStage) => {
        e.preventDefault();
        setDragOverStage(null);

        if (draggedLead && draggedLead.stage !== targetStage) {
            await updateLeadStage(draggedLead.id, targetStage);
        }
        setDraggedLead(null);
    }, [draggedLead, updateLeadStage]);

    const handleDragEnd = useCallback(() => {
        setDraggedLead(null);
        setDragOverStage(null);
    }, []);

    const handleLeadClick = useCallback((lead: Lead) => {
        setSelectedLeadId(lead.id);
        setView('leadDetail');
    }, [setSelectedLeadId, setView]);

    const handleAddLead = useCallback(() => {
        openModal('lead');
    }, [openModal]);

    const clearFilters = useCallback(() => {
        setSearchQuery('');
        setSourceFilter('');
        setDateFilter('all');
        setMinValue('');
        setMaxValue('');
    }, []);

    const hasActiveFilters = searchQuery || sourceFilter || dateFilter !== 'all' || minValue || maxValue;

    // Visible stages (excluding hidden ones)
    const visibleStages = useMemo(() =>
        STAGE_ORDER.filter(stage => !hiddenStages.has(stage)),
        [hiddenStages]
    );

    // Calculate total pipeline value (excluding lost leads)
    const totalValue = filteredLeads
        .filter(l => l.stage !== LeadStage.LOST)
        .reduce((sum, l) => sum + (l.value || 0), 0);

    if (leads.length === 0) {
        return (
            <EmptyState
                icon={<ViewColumnsIcon className="w-12 h-12" />}
                title="No leads yet"
                description="Start building your pipeline by adding your first lead."
                actionLabel="Add Lead"
                onAction={handleAddLead}
            />
        );
    }

    return (
        <div className="h-full flex flex-col">
            {/* Pipeline Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                <div className="flex items-center gap-4">
                    <span className="text-sm text-gray-400">
                        {filteredLeads.length} lead{filteredLeads.length !== 1 ? 's' : ''}
                        {hasActiveFilters && ` (filtered from ${leads.length})`}
                    </span>
                    <span className="text-sm text-gray-600">|</span>
                    <span className="text-sm text-green-400">
                        Pipeline: £{totalValue.toLocaleString()}
                    </span>
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto">
                    {/* Search */}
                    <div className="relative flex-1 sm:flex-initial">
                        <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                        <input
                            type="text"
                            placeholder="Search leads..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-9 pr-3 py-1.5 w-full sm:w-48 text-sm bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                        />
                    </div>

                    {/* Filter Toggle */}
                    <button
                        onClick={() => setShowFilters(!showFilters)}
                        className={`p-2 rounded-lg transition-colors ${
                            showFilters || hasActiveFilters
                                ? 'bg-brand-600 text-white'
                                : 'bg-gray-800 text-gray-400 hover:text-white'
                        }`}
                        title="Toggle filters"
                    >
                        <FunnelIcon className="w-4 h-4" />
                    </button>

                    {/* Clear Filters */}
                    {hasActiveFilters && (
                        <button
                            onClick={clearFilters}
                            className="p-2 rounded-lg bg-gray-800 text-gray-400 hover:text-white transition-colors"
                            title="Clear filters"
                        >
                            <XMarkIcon className="w-4 h-4" />
                        </button>
                    )}

                    {/* Add Lead Button */}
                    <button
                        onClick={handleAddLead}
                        className="inline-flex items-center gap-1.5 px-2 sm:px-3 py-1.5 text-sm font-medium text-white bg-brand-600 hover:bg-brand-500 rounded-lg transition-colors flex-shrink-0"
                    >
                        <PlusIcon className="w-4 h-4" />
                        <span className="hidden sm:inline">Add Lead</span>
                    </button>
                </div>
            </div>

            {/* Filter Panel */}
            {showFilters && (
                <div className="mb-4 p-4 bg-gray-900/50 rounded-xl border border-gray-800 animate-in slide-in-from-top-2 duration-200">
                    <div className="flex flex-wrap items-end gap-4">
                        {/* Source Filter */}
                        <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">Source</label>
                            <select
                                value={sourceFilter}
                                onChange={(e) => setSourceFilter(e.target.value as LeadSource | '')}
                                className="px-3 py-1.5 text-sm bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                            >
                                <option value="">All Sources</option>
                                {LEAD_SOURCES.map(source => (
                                    <option key={source} value={source}>{source}</option>
                                ))}
                            </select>
                        </div>

                        {/* Date Filter */}
                        <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">Created</label>
                            <select
                                value={dateFilter}
                                onChange={(e) => setDateFilter(e.target.value as 'all' | '7days' | '30days' | '90days')}
                                className="px-3 py-1.5 text-sm bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                            >
                                <option value="all">All Time</option>
                                <option value="7days">Last 7 Days</option>
                                <option value="30days">Last 30 Days</option>
                                <option value="90days">Last 90 Days</option>
                            </select>
                        </div>

                        {/* Value Range */}
                        <div className="flex items-end gap-2">
                            <div>
                                <label className="block text-xs font-medium text-gray-500 mb-1">Min Value</label>
                                <input
                                    type="number"
                                    placeholder="0"
                                    value={minValue}
                                    onChange={(e) => setMinValue(e.target.value)}
                                    className="w-24 px-3 py-1.5 text-sm bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-500"
                                />
                            </div>
                            <span className="text-gray-500 pb-1.5">-</span>
                            <div>
                                <label className="block text-xs font-medium text-gray-500 mb-1">Max Value</label>
                                <input
                                    type="number"
                                    placeholder="Any"
                                    value={maxValue}
                                    onChange={(e) => setMaxValue(e.target.value)}
                                    className="w-24 px-3 py-1.5 text-sm bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-500"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Stage Visibility */}
                    <div className="mt-4 pt-4 border-t border-gray-800">
                        <label className="block text-xs font-medium text-gray-500 mb-2">Show Stages</label>
                        <div className="flex flex-wrap gap-2">
                            {STAGE_ORDER.map(stage => (
                                <button
                                    key={stage}
                                    onClick={() => toggleStageVisibility(stage)}
                                    className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                                        !hiddenStages.has(stage)
                                            ? `${STAGE_COLORS[stage]} border-transparent text-white`
                                            : 'bg-gray-800 border-gray-700 text-gray-500 hover:text-gray-300'
                                    }`}
                                >
                                    {stage}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* No Results */}
            {filteredLeads.length === 0 && hasActiveFilters && (
                <div className="flex-1 flex items-center justify-center">
                    <div className="text-center">
                        <p className="text-gray-400">No leads match your filters</p>
                        <button
                            onClick={clearFilters}
                            className="mt-2 text-sm text-brand-400 hover:text-brand-300"
                        >
                            Clear filters
                        </button>
                    </div>
                </div>
            )}

            {/* Kanban Board */}
            {filteredLeads.length > 0 && (
                <div className="flex-1 overflow-x-auto pb-4">
                    <div
                        className="grid gap-4 min-w-max xl:min-w-0"
                        style={{
                            gridTemplateColumns: `repeat(${visibleStages.length}, minmax(280px, 1fr))`
                        }}
                    >
                        {visibleStages.map(stage => (
                            <div
                                key={stage}
                                className="flex flex-col min-w-[280px] xl:min-w-0"
                                onDragOver={(e) => handleDragOver(e, stage)}
                                onDragLeave={handleDragLeave}
                                onDrop={(e) => handleDrop(e, stage)}
                            >
                                {/* Stage Header */}
                                <div className="flex items-center gap-2 mb-3 px-1">
                                    <div className={`w-3 h-3 rounded-full ${STAGE_COLORS[stage]}`} />
                                    <h3 className="text-sm font-semibold text-gray-300 truncate">{stage}</h3>
                                    <span className="ml-auto text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded-full flex-shrink-0">
                                        {leadsByStage[stage].length}
                                    </span>
                                </div>

                                {/* Stage Column */}
                                <div
                                    className={`
                                        flex-1 space-y-2 min-h-[300px] rounded-xl p-2 transition-all duration-200
                                        ${dragOverStage === stage
                                            ? `bg-gray-800/80 border-2 border-dashed ${STAGE_BORDER_COLORS[stage]}`
                                            : 'bg-gray-900/50 border-2 border-transparent'
                                        }
                                    `}
                                >
                                    {leadsByStage[stage].map(lead => (
                                        <div
                                            key={lead.id}
                                            draggable
                                            onDragStart={(e) => handleDragStart(e, lead)}
                                            onDragEnd={handleDragEnd}
                                        >
                                            <LeadCard
                                                lead={lead}
                                                onClick={handleLeadClick}
                                                isDragging={draggedLead?.id === lead.id}
                                            />
                                        </div>
                                    ))}

                                    {leadsByStage[stage].length === 0 && (
                                        <div className="flex flex-col items-center justify-center h-24 text-gray-600 text-xs">
                                            <p>No leads</p>
                                            {dragOverStage === stage && (
                                                <p className="mt-1 text-brand-400">Drop here</p>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default PipelinePage;
