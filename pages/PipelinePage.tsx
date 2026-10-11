import React, { useState, useCallback, useMemo } from 'react';
import { Avatar, Button, Checkbox, EmptyState, Input, List, ListRow, Search, StatusChip } from '../components/ui';
import { cx, eyebrow } from '../components/ui/cx';
import Select from '../components/common/Select';
import { ViewColumnsIcon, PlusIcon, FunnelIcon, ClockIcon } from '../components/icons';
import { useData } from '../hooks/useData';
import { useUI } from '../hooks/useUI';
import { LeadStage, Lead, LeadSource } from '../types';
import LeadCard from '../components/crm/LeadCard';
import { STAGE_ORDER, STAGE_CHIP, STAGE_LABEL, daysInStage, fullName, STALE_DAYS } from '../components/crm/leadStage';
import StageMark from '../components/crm/StageMark';
import { formatCurrency } from '../utils/helpers';

const LEAD_SOURCES: LeadSource[] = [
    'Website',
    'Walk-in',
    'Referral',
    'Motors.co.uk',
    'CarGurus',
    'AutoTrader',
    'eBay',
];

/** One stage at a glance: shape + name, the count large, the money under it. */
const StageTally: React.FC<{ stage: LeadStage; count: number; value: number; className?: string }> = ({ stage, count, value, className }) => (
    <span className={cx('flex min-w-0 flex-col items-start gap-1', className)}>
        <span className="flex w-full min-w-0 items-center gap-1.5 text-xs font-semibold text-ink-2">
            <StageMark stage={stage} />
            <span className="truncate">{STAGE_LABEL[stage]}</span>
        </span>
        <span className="num text-2xl font-bold leading-none text-ink">{count}</span>
        <span className="num w-full truncate text-xs text-ink-3">{formatCurrency(value)}</span>
    </span>
);

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
    // Phone and tablet: which stage the list shows. null = every open lead.
    const [focusStage, setFocusStage] = useState<LeadStage | null>(null);

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

    const valueByStage = useMemo(() => {
        return STAGE_ORDER.reduce((acc, stage) => {
            acc[stage] = leadsByStage[stage].reduce((sum, l) => sum + (l.value || 0), 0);
            return acc;
        }, {} as Record<LeadStage, number>);
    }, [leadsByStage]);

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
    // Search has its own clear button; the Filters button counts the rest.
    const panelFilterCount = [sourceFilter, dateFilter !== 'all', minValue, maxValue].filter(Boolean).length;

    // Visible stages (excluding hidden ones)
    const visibleStages = useMemo(() =>
        STAGE_ORDER.filter(stage => !hiddenStages.has(stage)),
        [hiddenStages]
    );

    // Calculate total pipeline value (excluding lost leads)
    const totalValue = filteredLeads
        .filter(l => l.stage !== LeadStage.LOST)
        .reduce((sum, l) => sum + (l.value || 0), 0);

    const openCount = filteredLeads.filter(l => l.stage !== LeadStage.WON && l.stage !== LeadStage.LOST).length;

    // The phone list: one stage, or every open lead in board order.
    const listLeads = focusStage
        ? leadsByStage[focusStage]
        : STAGE_ORDER.slice(0, 4).flatMap(stage => leadsByStage[stage]);

    if (leads.length === 0) {
        return (
            <EmptyState
                icon={<ViewColumnsIcon />}
                title="No leads yet"
                description="Leads from Auto Trader and your website land here, and Dave answers them. You can add a walk-in by hand."
                actionLabel="Add a lead"
                onAction={handleAddLead}
                className="px-0"
            />
        );
    }

    return (
        <div className="flex h-full flex-col gap-4">
            {/* Summary: what's open and what it's worth */}
            <p className="text-sm text-ink-2">
                <span className="font-semibold text-ink">{openCount} open</span>
                {hasActiveFilters && <span> · {filteredLeads.length} of {leads.length} leads match</span>}
                <span> · pipeline </span>
                <span className="num font-semibold text-ink">{formatCurrency(totalValue)}</span>
            </p>

            {/* Toolbar */}
            <div className="flex items-center gap-2">
                <Search
                    value={searchQuery}
                    onChange={setSearchQuery}
                    label="Search leads"
                    placeholder="Search leads"
                    className="min-w-0 flex-1 lg:max-w-sm"
                />
                <button
                    type="button"
                    onClick={() => setShowFilters(!showFilters)}
                    aria-expanded={showFilters}
                    aria-controls="pipeline-filters"
                    aria-label={panelFilterCount ? `Filters, ${panelFilterCount} on` : 'Filters'}
                    className={cx(
                        'inline-flex min-h-[48px] min-w-[48px] flex-none items-center justify-center gap-2 rounded-control border px-3 text-sm font-semibold',
                        'transition-colors duration-quick ease-out [&_svg]:h-5 [&_svg]:w-5',
                        showFilters || panelFilterCount
                            ? 'border-accent bg-accent-soft text-accent-soft-ink'
                            : 'border-line-strong bg-surface text-ink-2 hover:bg-surface-2 hover:text-ink active:bg-surface-3',
                    )}
                >
                    <FunnelIcon aria-hidden="true" />
                    <span className="hidden sm:inline">Filters</span>
                    {panelFilterCount > 0 && <span aria-hidden="true" className="num">{panelFilterCount}</span>}
                </button>
                <Button onClick={handleAddLead} icon={<PlusIcon />} className="flex-none px-4 lg:ms-auto">
                    Add lead
                </Button>
            </div>

            {/* Filter panel */}
            {showFilters && (
                <section id="pipeline-filters" aria-label="Filters" className="rounded-card border border-line bg-surface p-4">
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                        <div className="min-w-0">
                            <label htmlFor="pipeline-source" className="mb-1.5 block text-sm font-semibold leading-5 text-ink">Source</label>
                            <Select
                                id="pipeline-source"
                                value={sourceFilter}
                                onChange={(e) => setSourceFilter(e.target.value as LeadSource | '')}
                            >
                                <option value="">All sources</option>
                                {LEAD_SOURCES.map(source => (
                                    <option key={source} value={source}>{source}</option>
                                ))}
                            </Select>
                        </div>
                        <div className="min-w-0">
                            <label htmlFor="pipeline-created" className="mb-1.5 block text-sm font-semibold leading-5 text-ink">Created</label>
                            <Select
                                id="pipeline-created"
                                value={dateFilter}
                                onChange={(e) => setDateFilter(e.target.value as 'all' | '7days' | '30days' | '90days')}
                            >
                                <option value="all">Any time</option>
                                <option value="7days">Last 7 days</option>
                                <option value="30days">Last 30 days</option>
                                <option value="90days">Last 90 days</option>
                            </Select>
                        </div>
                        <Input
                            id="pipeline-min"
                            label="Value from"
                            type="number"
                            inputMode="decimal"
                            affix="£"
                            placeholder="0"
                            value={minValue}
                            onChange={(e) => setMinValue(e.target.value)}
                            className="num"
                        />
                        <Input
                            id="pipeline-max"
                            label="Value up to"
                            type="number"
                            inputMode="decimal"
                            affix="£"
                            placeholder="Any"
                            value={maxValue}
                            onChange={(e) => setMaxValue(e.target.value)}
                            className="num"
                        />
                    </div>

                    {/* Board columns only exist on wide screens. */}
                    <fieldset className="mt-4 hidden border-t border-line pt-3 lg:block">
                        <legend className={cx(eyebrow, 'float-left mb-1 w-full pt-1')}>Columns on the board</legend>
                        <div className="clear-left flex flex-wrap gap-x-6">
                            {STAGE_ORDER.map(stage => (
                                <Checkbox
                                    key={stage}
                                    label={STAGE_LABEL[stage]}
                                    checked={!hiddenStages.has(stage)}
                                    onChange={() => toggleStageVisibility(stage)}
                                />
                            ))}
                        </div>
                    </fieldset>

                    {hasActiveFilters && (
                        <div className="mt-3 flex justify-end border-t border-line pt-3">
                            <Button variant="ghost" size="sm" onClick={clearFilters}>Clear filters</Button>
                        </div>
                    )}
                </section>
            )}

            {/* No Results */}
            {filteredLeads.length === 0 && hasActiveFilters && (
                <EmptyState
                    icon={<FunnelIcon />}
                    title="No leads match"
                    description="Nothing fits the search and filters you've set. Clear them to see every lead again."
                    actionLabel="Clear filters"
                    onAction={clearFilters}
                    className="rounded-card border border-line bg-surface"
                />
            )}

            {filteredLeads.length > 0 && (
                <>
                    {/* Phone + tablet: stage tallies that filter the list below */}
                    <div className="lg:hidden">
                        <div role="group" aria-label="Show one stage" className="grid grid-cols-3 gap-1.5 md:grid-cols-6">
                            {STAGE_ORDER.map(stage => {
                                const active = focusStage === stage;
                                return (
                                    <button
                                        key={stage}
                                        type="button"
                                        aria-pressed={active}
                                        onClick={() => setFocusStage(active ? null : stage)}
                                        className={cx(
                                            'min-h-[48px] min-w-0 rounded-card border p-2.5 text-start transition-colors duration-quick ease-out',
                                            active
                                                ? 'border-accent bg-accent-soft'
                                                : 'border-line bg-surface hover:bg-surface-2 active:bg-surface-3',
                                        )}
                                    >
                                        <StageTally stage={stage} count={leadsByStage[stage].length} value={valueByStage[stage]} />
                                    </button>
                                );
                            })}
                        </div>

                        <div className="mb-2 mt-5 flex min-h-[32px] items-center justify-between gap-3">
                            <h2 className="text-lg font-bold text-ink">
                                {focusStage ? STAGE_LABEL[focusStage] : 'All open leads'}
                                <span className="num ms-2 text-base font-semibold text-ink-3">{listLeads.length}</span>
                            </h2>
                            {focusStage && (
                                <Button variant="ghost" size="sm" onClick={() => setFocusStage(null)}>Show all open</Button>
                            )}
                        </div>

                        {listLeads.length > 0 ? (
                            <List ariaLabel={focusStage ? `${STAGE_LABEL[focusStage]} leads` : 'Open leads'}>
                                {listLeads.map(lead => {
                                    const days = daysInStage(lead);
                                    const stale = days > STALE_DAYS && lead.stage !== LeadStage.WON && lead.stage !== LeadStage.LOST;
                                    return (
                                        <ListRow
                                            key={lead.id}
                                            onClick={() => handleLeadClick(lead)}
                                            leading={<Avatar name={fullName(lead)} size="md" />}
                                            title={fullName(lead)}
                                            meta={
                                                <>
                                                    {/* Waiting over a week comes first, in amber; otherwise the car. */}
                                                    {stale && (
                                                        <span className="font-semibold text-warning">
                                                            <ClockIcon className="-mt-0.5 me-0.5 inline h-3.5 w-3.5" aria-hidden="true" />
                                                            <span className="num">{days}d</span>
                                                            <span className="sr-only"> in this stage</span>
                                                            {' · '}
                                                        </span>
                                                    )}
                                                    {lead.vehicleOfInterest || lead.source}
                                                </>
                                            }
                                            amount={lead.value ? formatCurrency(lead.value) : undefined}
                                            end={focusStage ? undefined : <StatusChip status={STAGE_CHIP[lead.stage]}>{STAGE_LABEL[lead.stage]}</StatusChip>}
                                        />
                                    );
                                })}
                            </List>
                        ) : (
                            <p className="rounded-card border border-line bg-surface px-4 py-5 text-sm text-ink-3">
                                {focusStage ? `No leads in ${STAGE_LABEL[focusStage]} right now.` : 'No open leads right now.'}
                            </p>
                        )}
                    </div>

                    {/* Desktop: the board. Drag a card to move it between stages. */}
                    <div className="hidden min-h-0 flex-1 overflow-x-auto pb-2 lg:block" role="region" aria-label="Pipeline board" tabIndex={0}>
                        <div
                            className="grid min-h-full gap-3"
                            style={{ gridTemplateColumns: `repeat(${visibleStages.length}, minmax(208px, 1fr))` }}
                        >
                            {visibleStages.map(stage => {
                                const over = dragOverStage === stage;
                                return (
                                    <section
                                        key={stage}
                                        aria-label={`${STAGE_LABEL[stage]}, ${leadsByStage[stage].length} leads`}
                                        className="flex min-w-0 flex-col"
                                        onDragOver={(e) => handleDragOver(e, stage)}
                                        onDragLeave={handleDragLeave}
                                        onDrop={(e) => handleDrop(e, stage)}
                                    >
                                        <StageTally
                                            stage={stage}
                                            count={leadsByStage[stage].length}
                                            value={valueByStage[stage]}
                                            className="mb-2 border-b border-line px-1 pb-3"
                                        />
                                        <div
                                            className={cx(
                                                'flex flex-1 flex-col gap-2 rounded-card border p-1.5 transition-colors duration-quick ease-out',
                                                over ? 'border-dashed border-accent bg-accent-soft' : 'border-transparent bg-surface-2',
                                            )}
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
                                                <p className={cx('flex h-24 items-center justify-center text-center text-sm', over ? 'font-semibold text-accent-text' : 'text-ink-3')}>
                                                    {over ? 'Drop here' : 'No leads'}
                                                </p>
                                            )}
                                        </div>
                                    </section>
                                );
                            })}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

export default PipelinePage;
