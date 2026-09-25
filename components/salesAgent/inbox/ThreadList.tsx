/**
 * The left pane of the Agent Inbox: who is talking to the desk, in the order
 * Steve has to deal with them. Needs you → Recent → Earlier (folded away).
 */

import React, { useEffect, useState } from 'react';
import {
    ArrowLeftIcon,
    CarIcon,
    ChevronDownIcon,
    InboxIcon,
    MagnifyingGlassIcon,
    PlusIcon,
    SparklesIcon,
    WhatsAppIcon,
    XMarkIcon,
} from '../../icons';
import { formatAgentTime } from '../../../services/salesAgentService';
import type { CustomerGroup, InboxFilter } from '../../../utils/agentInboxGroups';
import { needsReasonOf, type InboxSections, type NeedsReason } from '../../../utils/agentInboxSections';
import { Avatar, ChannelIcon } from './parts';

const carOf = (group: CustomerGroup): string =>
    (group.latest.vehicleInterest?.title
        || group.conversations.find(conv => conv.vehicleInterest?.title)?.vehicleInterest?.title
        || '').trim();

const StatusPill: React.FC<{ reason: NeedsReason; agentName: string }> = ({ reason, agentName }) => {
    if (reason === 'escalated') {
        return (
            <span className="flex-shrink-0 rounded-md bg-red-500/15 px-1.5 py-0.5 text-[11px] font-semibold text-red-300">
                Escalated
            </span>
        );
    }
    if (reason === 'waiting') {
        return (
            <span className="flex-shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-semibold text-amber-300 ring-1 ring-inset ring-amber-400/30">
                Awaiting reply
            </span>
        );
    }
    return (
        <span className="inline-flex flex-shrink-0 items-center gap-1 rounded-md bg-amber-400/15 px-1.5 py-0.5 text-[11px] font-semibold text-amber-300">
            <SparklesIcon className="h-3 w-3" />
            {reason === 'question' ? `${agentName} asks` : 'Draft ready'}
        </span>
    );
};

const ThreadRow: React.FC<{
    group: CustomerGroup;
    active: boolean;
    reason: NeedsReason | null;
    agentName: string;
    muted?: boolean;
    onClick: () => void;
}> = ({ group, active, reason, agentName, muted, onClick }) => {
    const car = carOf(group);
    const unread = group.unread > 0;
    const preview = group.preview && group.preview !== car ? group.preview : (group.latest.address || 'No messages yet');

    return (
        <button
            type="button"
            onClick={onClick}
            aria-current={active ? 'true' : undefined}
            className={`group relative flex w-full items-start gap-3 px-4 py-3 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-400 ${
                active ? 'bg-white/[0.07]' : 'hover:bg-white/[0.035]'
            }`}
        >
            <span
                aria-hidden
                className={`absolute inset-y-3 left-0 w-[3px] rounded-r-full transition-opacity ${active ? 'bg-brand-400 opacity-100' : 'opacity-0'}`}
            />
            <span className={muted && !active ? 'opacity-70' : undefined}>
                <Avatar name={group.name} channel={group.latest.channel} />
            </span>
            <span className="min-w-0 flex-1">
                <span className="flex items-baseline gap-2">
                    <span className={`min-w-0 flex-1 truncate text-[15px] leading-tight ${
                        unread ? 'font-semibold text-white' : muted ? 'font-medium text-gray-300' : 'font-medium text-gray-100'
                    }`}>
                        {group.name}
                    </span>
                    {group.channels.length > 1 && (
                        <span className="flex flex-shrink-0 items-center gap-1 self-center text-gray-500" aria-label={`Talks on ${group.channels.join(' and ')}`}>
                            {group.channels.map(ch => <ChannelIcon key={ch} channel={ch} className="h-3 w-3" />)}
                        </span>
                    )}
                    <span className={`flex-shrink-0 text-[11.5px] tabular-nums ${unread ? 'font-semibold text-gray-100' : 'text-gray-400'}`}>
                        {formatAgentTime(group.updatedAt)}
                    </span>
                </span>
                {car && (
                    <span className="mt-1 flex min-w-0 items-center gap-1.5 text-[12.5px] text-gray-300">
                        <CarIcon className="h-3.5 w-3.5 flex-shrink-0 text-gray-500" />
                        <span className="truncate">{car}</span>
                    </span>
                )}
                <span className="mt-1 flex items-center gap-2">
                    <span className={`min-w-0 flex-1 truncate text-[13px] ${unread ? 'text-gray-200' : 'text-gray-400'}`}>
                        {preview}
                    </span>
                    {group.shared && (
                        <span className="flex-shrink-0 rounded-md bg-white/[0.06] px-1.5 py-0.5 text-[10.5px] font-medium text-gray-400">
                            Other ledger
                        </span>
                    )}
                    {reason ? (
                        <StatusPill reason={reason} agentName={agentName} />
                    ) : unread ? (
                        <span className="flex h-5 min-w-[1.25rem] flex-shrink-0 items-center justify-center rounded-full bg-gray-100 px-1.5 text-[11px] font-bold tabular-nums text-gray-900">
                            {group.unread > 99 ? '99+' : group.unread}
                        </span>
                    ) : null}
                </span>
            </span>
        </button>
    );
};

const SectionLabel: React.FC<{ tone: 'amber' | 'gray'; count: number; children: React.ReactNode }> = ({ tone, count, children }) => (
    <div className={`sticky top-0 z-10 flex items-center gap-2 border-b border-white/[0.04] bg-gray-900/95 px-4 pb-2 pt-4 text-[11px] font-semibold uppercase tracking-[0.12em] backdrop-blur ${
        tone === 'amber' ? 'text-amber-300' : 'text-gray-400'
    }`}>
        {tone === 'amber' && (
            <span className="relative flex h-1.5 w-1.5" aria-hidden>
                <span className="absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-60 motion-safe:animate-ping" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-amber-400" />
            </span>
        )}
        <span>{children}</span>
        <span className="tabular-nums text-gray-400">{count}</span>
    </div>
);

export interface ThreadListProps {
    sections: InboxSections;
    activeGroupId: string | null;
    onOpen: (group: CustomerGroup) => void;
    agentName: string;
    now: number;
    filter: InboxFilter;
    onFilter: (filter: InboxFilter) => void;
    counts: Record<InboxFilter, number>;
    query: string;
    onQuery: (query: string) => void;
    otherLedgerCount: number;
    showOther: boolean;
    onToggleOther: () => void;
    inboxName?: string | null;
    /** Header summary — counted without the search box, so a search never hides the work. */
    needsYouTotal: number;
    unreadTotal: number;
    onBack: () => void;
    onStartWhatsApp: () => void;
}

const ThreadList: React.FC<ThreadListProps> = ({
    sections,
    activeGroupId,
    onOpen,
    agentName,
    now,
    filter,
    onFilter,
    counts,
    query,
    onQuery,
    otherLedgerCount,
    showOther,
    onToggleOther,
    inboxName,
    needsYouTotal,
    unreadTotal,
    onBack,
    onStartWhatsApp,
}) => {
    const [earlierOpen, setEarlierOpen] = useState(false);
    const searching = !!query.trim();
    const activeIsEarlier = !!activeGroupId && sections.earlier.some(g => g.id === activeGroupId);

    // A deep link into an old thread should show where it sits in the list.
    useEffect(() => {
        if (activeIsEarlier) setEarlierOpen(true);
    }, [activeIsEarlier]);

    const showEarlier = earlierOpen || searching;
    const needCount = needsYouTotal;
    const total = sections.needsYou.length + sections.recent.length + sections.earlier.length;

    const tabs: Array<{ id: InboxFilter; label: string }> = [
        { id: 'all', label: 'All' },
        { id: 'whatsapp', label: 'WhatsApp' },
        { id: 'email', label: 'Email' },
    ];

    const rows = (list: CustomerGroup[], muted = false) => list.map(group => (
        <ThreadRow
            key={group.id}
            group={group}
            active={activeGroupId === group.id}
            reason={needsReasonOf(group, now)}
            agentName={agentName}
            muted={muted}
            onClick={() => onOpen(group)}
        />
    ));

    return (
        <>
            <header className="px-4 pb-3 pt-3 lg:pt-5">
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={onBack}
                        className="-ml-2 flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full text-gray-400 hover:bg-white/[0.06] hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 lg:hidden"
                        aria-label="Back to the app"
                    >
                        <ArrowLeftIcon className="h-5 w-5" />
                    </button>
                    <div className="min-w-0 flex-1">
                        <p className="truncate text-[10.5px] font-semibold uppercase tracking-[0.14em] text-gray-500">
                            {inboxName ? `${inboxName} · every ledger` : 'Sales desk'}
                        </p>
                        <h2 className="mt-0.5 text-[22px] font-bold leading-none tracking-tight text-white">Inbox</h2>
                    </div>
                    <button
                        type="button"
                        onClick={onStartWhatsApp}
                        className="inline-flex h-11 flex-shrink-0 items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] pl-3 pr-3.5 text-[13px] font-semibold text-gray-100 transition-colors hover:border-emerald-400/40 hover:bg-emerald-400/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60"
                    >
                        <PlusIcon className="h-4 w-4 text-emerald-400" />
                        <span>New WhatsApp</span>
                    </button>
                </div>

                <p className="mt-2.5 flex items-center gap-2 text-[12.5px] text-gray-400" aria-live="polite">
                    {needCount > 0 ? (
                        <span className="font-semibold text-amber-300">{needCount} need{needCount === 1 ? 's' : ''} you</span>
                    ) : (
                        <span>Nothing waiting on you</span>
                    )}
                    {unreadTotal > 0 && (
                        <>
                            <span className="text-gray-600" aria-hidden>·</span>
                            <span className="tabular-nums">{unreadTotal} unread</span>
                        </>
                    )}
                </p>

                <div className="mt-3 flex rounded-xl bg-black/30 p-0.5 ring-1 ring-inset ring-white/[0.05] lg:p-1" role="tablist" aria-label="Filter by channel">
                    {tabs.map(tab => {
                        const on = filter === tab.id;
                        return (
                            <button
                                key={tab.id}
                                type="button"
                                role="tab"
                                aria-selected={on}
                                onClick={() => onFilter(tab.id)}
                                className={`flex h-11 flex-1 items-center justify-center gap-1.5 rounded-lg text-[12.5px] font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 lg:h-8 ${
                                    on ? 'bg-gray-700/80 text-white shadow-sm' : 'text-gray-400 hover:text-gray-100'
                                }`}
                            >
                                {tab.id !== 'all' && (
                                    <ChannelIcon
                                        channel={tab.id}
                                        className={`h-3.5 w-3.5 ${on ? (tab.id === 'whatsapp' ? 'text-emerald-400' : 'text-sky-400') : ''}`}
                                    />
                                )}
                                {tab.label}
                                <span className={`tabular-nums ${on ? 'text-gray-300' : 'text-gray-500'}`}>{counts[tab.id]}</span>
                            </button>
                        );
                    })}
                </div>

                <label className="mt-2 flex h-11 items-center gap-2 rounded-xl bg-gray-800/60 px-3 ring-1 ring-inset ring-white/[0.05] transition focus-within:ring-2 focus-within:ring-brand-400/60 lg:h-10">
                    <MagnifyingGlassIcon className="h-4 w-4 flex-shrink-0 text-gray-500" />
                    <input
                        value={query}
                        onChange={e => onQuery(e.target.value)}
                        placeholder="Search name, number or email"
                        aria-label="Search conversations"
                        className="min-w-0 flex-1 bg-transparent text-[16px] text-white placeholder-gray-500 outline-none lg:text-sm"
                    />
                    {searching && (
                        <button
                            type="button"
                            onClick={() => onQuery('')}
                            aria-label="Clear search"
                            className="-mr-2 flex h-10 w-10 items-center justify-center rounded-full text-gray-400 hover:bg-white/[0.06] hover:text-white"
                        >
                            <XMarkIcon className="h-4 w-4" />
                        </button>
                    )}
                </label>

                {otherLedgerCount > 0 && (
                    <button
                        type="button"
                        onClick={onToggleOther}
                        aria-pressed={showOther}
                        className="mt-1 flex min-h-[44px] w-full items-center justify-between rounded-lg px-1 text-[12px] font-medium text-gray-400 transition-colors hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
                    >
                        <span>
                            Other ledger&apos;s leads
                            {!showOther && (
                                <span className="ml-1.5 rounded-full bg-white/[0.07] px-1.5 py-0.5 text-[10.5px] font-semibold tabular-nums text-gray-200">
                                    {otherLedgerCount} hidden
                                </span>
                            )}
                        </span>
                        <span className={showOther ? 'font-semibold text-gray-100' : ''}>{showOther ? 'Hide' : 'Show'}</span>
                    </button>
                )}
            </header>

            <nav className="min-h-0 flex-1 overflow-y-auto overscroll-contain border-t border-white/[0.05] pb-6" aria-label="Conversations">
                {total === 0 ? (
                    <div className="px-8 py-16 text-center">
                        {searching ? (
                            <>
                                <MagnifyingGlassIcon className="mx-auto h-9 w-9 text-gray-600" />
                                <p className="mt-3 text-sm font-medium text-gray-200">Nobody matches “{query.trim()}”</p>
                                <p className="mt-1 text-xs text-gray-500">Try a first name, the last digits of a mobile, or part of an email.</p>
                            </>
                        ) : (
                            <>
                                <InboxIcon className="mx-auto h-9 w-9 text-gray-600" />
                                <p className="mt-3 text-sm font-medium text-gray-200">No conversations yet</p>
                                <p className="mt-1 text-xs leading-relaxed text-gray-500">
                                    Incoming WhatsApp and email land here. You can also start a WhatsApp to a new number.
                                </p>
                                <button
                                    type="button"
                                    onClick={onStartWhatsApp}
                                    className="mt-4 inline-flex h-11 items-center gap-2 rounded-full bg-emerald-500 px-4 text-[13px] font-semibold text-gray-950 hover:bg-emerald-400"
                                >
                                    <WhatsAppIcon className="h-4 w-4" />
                                    Start a WhatsApp
                                </button>
                            </>
                        )}
                    </div>
                ) : (
                    <>
                        {sections.needsYou.length > 0 && (
                            <section aria-label="Needs you">
                                <SectionLabel tone="amber" count={sections.needsYou.length}>Needs you</SectionLabel>
                                <div className="bg-amber-400/[0.025]">{rows(sections.needsYou)}</div>
                            </section>
                        )}

                        {sections.recent.length > 0 && (
                            <section aria-label="Recent">
                                <SectionLabel tone="gray" count={sections.recent.length}>Recent</SectionLabel>
                                {rows(sections.recent)}
                            </section>
                        )}

                        {sections.needsYou.length === 0 && sections.recent.length === 0 && !showEarlier && (
                            <p className="px-6 pb-2 pt-8 text-center text-[13px] text-gray-500">
                                All quiet for the last two weeks.
                            </p>
                        )}

                        {sections.earlier.length > 0 && (
                            <section aria-label="Earlier">
                                <button
                                    type="button"
                                    onClick={() => setEarlierOpen(o => !o)}
                                    aria-expanded={showEarlier}
                                    disabled={searching}
                                    className="sticky top-0 z-10 flex min-h-[48px] w-full items-center gap-2 border-b border-white/[0.04] bg-gray-900/95 px-4 pt-2 text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-400 backdrop-blur transition-colors hover:text-gray-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-400 disabled:cursor-default disabled:hover:text-gray-400"
                                >
                                    <span>Earlier</span>
                                    <span className="tabular-nums">{sections.earlier.length}</span>
                                    <span className="ml-1 flex-1 truncate font-normal normal-case tracking-normal text-gray-400">
                                        quiet for two weeks or more
                                    </span>
                                    {!searching && (
                                        <ChevronDownIcon className={`h-4 w-4 flex-shrink-0 transition-transform duration-200 ${showEarlier ? 'rotate-180' : ''}`} />
                                    )}
                                </button>
                                {showEarlier && rows(sections.earlier, true)}
                            </section>
                        )}
                    </>
                )}
            </nav>
        </>
    );
};

export default ThreadList;
