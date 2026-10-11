/**
 * The left pane of the Agent Inbox: who is talking to the desk, in the order
 * Steve has to deal with them. WhatsApp → Needs you → Recent → Earlier (folded away).
 *
 * Reads like a messaging app: name and time, the last line, then the car's
 * plate and what is waiting. Rows sit on hairlines, not cards.
 */

import React, { useEffect, useState } from 'react';
import { ChevronDownIcon, InboxIcon, MagnifyingGlassIcon, PlusIcon } from '../../icons';
import { Button, EmptyState, Search, StatusChip } from '../../ui';
import { formatAgentTime } from '../../../services/salesAgentService';
import type { CustomerGroup, InboxFilter } from '../../../utils/agentInboxGroups';
import { needsReasonOf, type InboxSections, type NeedsReason } from '../../../utils/agentInboxSections';
import { titleHasReg } from '../../../utils/carPickerSearch';
import { RegPlate } from './CarPicker';
import { Avatar, ChannelIcon, WhatsAppMark } from './parts';

/** The car the thread is about, and its reg when the title does not already say it. */
const carOf = (group: CustomerGroup): { title: string; reg: string } => {
    const interest = group.latest.vehicleInterest?.title
        ? group.latest.vehicleInterest
        : group.conversations.find(conv => conv.vehicleInterest?.title)?.vehicleInterest;
    const title = (interest?.title || '').trim();
    const reg = interest?.reg && !titleHasReg(title, interest.reg) ? interest.reg : '';
    return { title, reg };
};

const StatusPill: React.FC<{ reason: NeedsReason; agentName: string }> = ({ reason, agentName }) => {
    if (reason === 'escalated') return <StatusChip status="due">Escalated</StatusChip>;
    if (reason === 'waiting') return <StatusChip status="prep">Awaiting reply</StatusChip>;
    return <StatusChip status="dave">{reason === 'question' ? `${agentName} asks` : 'Draft ready'}</StatusChip>;
};

const ThreadRow: React.FC<{
    group: CustomerGroup;
    active: boolean;
    reason: NeedsReason | null;
    agentName: string;
    muted?: boolean;
    onClick: () => void;
}> = ({ group, active, reason, agentName, muted, onClick }) => {
    const { title: car, reg } = carOf(group);
    const unread = group.unread > 0;
    const preview = group.preview && group.preview !== car ? group.preview : (group.latest.address || 'No messages yet');
    const unreadLabel = group.unread > 99 ? '99+' : String(group.unread);

    return (
        <button
            type="button"
            onClick={onClick}
            aria-current={active ? 'true' : undefined}
            className={`group relative flex w-full items-start gap-3 ps-4 text-start transition-colors duration-quick ease-out focus-visible:[outline-offset:-3px] ${
                active ? 'bg-surface-2' : 'hover:bg-surface-2 active:bg-surface-3'
            }`}
        >
            <span
                aria-hidden
                className={`absolute inset-y-2 start-0 w-[3px] rounded-e-full bg-accent transition-opacity duration-quick ease-out ${active ? 'opacity-100' : 'opacity-0'}`}
            />
            <span className="pt-3">
                <Avatar name={group.name} channel={group.latest.channel} />
            </span>
            <span className="min-w-0 flex-1 border-b border-line py-3 pe-4 group-last:border-b-0">
                <span className="flex items-baseline gap-2">
                    <span className={`min-w-0 flex-1 truncate text-base leading-6 ${
                        unread ? 'font-bold text-ink' : muted ? 'font-semibold text-ink-2' : 'font-semibold text-ink'
                    }`}>
                        {group.name}
                    </span>
                    {group.channels.length > 1 && (
                        <span className="flex flex-shrink-0 items-center gap-1 self-center text-ink-3" aria-label={`Talks on ${group.channels.join(' and ')}`}>
                            {group.channels.map(ch => <ChannelIcon key={ch} channel={ch} className="h-3.5 w-3.5" />)}
                        </span>
                    )}
                    <span className={`flex-shrink-0 text-xs tabular-nums ${unread ? 'font-bold text-accent-text' : 'text-ink-3'}`}>
                        {formatAgentTime(group.updatedAt)}
                    </span>
                </span>
                <span className="mt-0.5 flex items-center gap-2">
                    <span className={`min-w-0 flex-1 truncate text-sm leading-5 ${unread ? 'text-ink' : 'text-ink-2'}`}>
                        {preview}
                    </span>
                    {unread && (
                        <span
                            className="num grid h-5 min-w-[20px] flex-shrink-0 place-items-center rounded-full bg-accent px-1.5 text-xs font-semibold leading-none text-on-accent"
                            aria-label={`${unreadLabel} unread`}
                        >
                            {unreadLabel}
                        </span>
                    )}
                </span>
                {(car || reg || reason || group.shared) && (
                    <span className="mt-2 flex min-w-0 items-center gap-2">
                        {reg && <RegPlate reg={reg} />}
                        {car ? (
                            <span className="min-w-0 flex-1 truncate text-sm text-ink-3">{car}</span>
                        ) : (
                            <span className="min-w-0 flex-1 truncate text-sm text-ink-3">{reg ? '' : 'No car linked'}</span>
                        )}
                        {group.shared && <StatusChip status="neutral">Other ledger</StatusChip>}
                        {reason && <StatusPill reason={reason} agentName={agentName} />}
                    </span>
                )}
            </span>
        </button>
    );
};

const SectionLabel: React.FC<{ tone: 'whatsapp' | 'needs' | 'plain'; count: number; children: React.ReactNode }> = ({ tone, count, children }) => (
    <div className="sticky top-0 z-sticky flex min-h-[36px] items-center gap-2 border-b border-line bg-surface px-4 pt-2 pb-1.5">
        {tone === 'whatsapp' && <WhatsAppMark brand className="h-3.5 w-3.5" />}
        {tone === 'needs' && <span className="h-2 w-2 rounded-full bg-warning" aria-hidden />}
        <span className="font-mono text-xs font-semibold uppercase tracking-[0.08em] text-ink-2">{children}</span>
        <span className="num text-xs text-ink-3">{count}</span>
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
    const total = sections.whatsapp.length + sections.needsYou.length + sections.recent.length + sections.earlier.length;

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
                    <div className="min-w-0 flex-1">
                        {/* Phones have no app header on the inbox, so the list names itself; tablet and desktop show it in the header. */}
                        <h2 className="text-[1.75rem] font-bold leading-[2.125rem] tracking-[-0.02em] text-ink md:sr-only">Inbox</h2>
                        <p className="hidden truncate text-sm text-ink-3 md:block">{inboxName ? `${inboxName} · every ledger` : 'Sales desk'}</p>
                    </div>
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={onStartWhatsApp}
                        icon={<PlusIcon />}
                        className="flex-shrink-0"
                    >
                        New WhatsApp
                    </Button>
                </div>

                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-sm text-ink-2" aria-live="polite">
                    <span className="truncate text-ink-3 md:hidden">{inboxName ? `${inboxName} · every ledger` : 'Sales desk'}</span>
                    <span className="text-ink-3 md:hidden" aria-hidden>·</span>
                    {needCount > 0 ? (
                        <span className="inline-flex items-center gap-1.5 font-semibold text-warning-ink">
                            <span className="h-2 w-2 rounded-full bg-warning" aria-hidden />
                            {needCount} need{needCount === 1 ? 's' : ''} you
                        </span>
                    ) : (
                        <span>Nothing waiting on you</span>
                    )}
                    {unreadTotal > 0 && (
                        <>
                            <span className="text-ink-3" aria-hidden>·</span>
                            <span className="tabular-nums">{unreadTotal} unread</span>
                        </>
                    )}
                </p>

                <div
                    className="mt-3 flex gap-[3px] rounded-control border border-line bg-surface-2 p-[3px]"
                    role="tablist"
                    aria-label="Filter by channel"
                >
                    {tabs.map(tab => {
                        const on = filter === tab.id;
                        return (
                            <button
                                key={tab.id}
                                type="button"
                                role="tab"
                                aria-selected={on}
                                onClick={() => onFilter(tab.id)}
                                className={`flex min-h-[48px] flex-1 items-center justify-center gap-1.5 rounded-[6px] text-sm font-semibold transition-colors duration-quick ease-out [@media(pointer:fine)]:min-h-[36px] ${
                                    on ? 'bg-surface text-ink shadow-e1 ring-1 ring-line' : 'text-ink-2 hover:text-ink'
                                }`}
                            >
                                {tab.id !== 'all' && <ChannelIcon channel={tab.id} brand={on} className="h-4 w-4" />}
                                {tab.label}
                                <span className={`num text-xs ${on ? 'text-ink-2' : 'text-ink-3'}`}>{counts[tab.id]}</span>
                            </button>
                        );
                    })}
                </div>

                <Search
                    className="mt-2"
                    value={query}
                    onChange={onQuery}
                    label="Search conversations"
                    placeholder="Search name, number or email"
                />

                {otherLedgerCount > 0 && (
                    <button
                        type="button"
                        onClick={onToggleOther}
                        aria-pressed={showOther}
                        className="-mx-1 mt-1 flex min-h-[48px] w-[calc(100%+0.5rem)] items-center justify-between gap-2 rounded-control px-1 text-sm text-ink-2 transition-colors duration-quick ease-out hover:text-ink lg:min-h-[40px]"
                    >
                        <span className="flex items-center gap-2">
                            Other ledger&apos;s leads
                            {!showOther && (
                                <span className="num rounded-chip bg-surface-2 px-1.5 py-0.5 text-xs font-semibold text-ink">
                                    {otherLedgerCount} hidden
                                </span>
                            )}
                        </span>
                        <span className="font-semibold text-accent-text">{showOther ? 'Hide' : 'Show'}</span>
                    </button>
                )}
            </header>

            <nav className="min-h-0 flex-1 overflow-y-auto overscroll-contain border-t border-line pb-6" aria-label="Conversations">
                {total === 0 ? (
                    searching ? (
                        <EmptyState
                            className="mt-4"
                            icon={<MagnifyingGlassIcon />}
                            title={`Nobody matches “${query.trim()}”`}
                            description="Try a first name, the last digits of a mobile, or part of an email."
                        />
                    ) : (
                        <EmptyState
                            className="mt-4"
                            icon={<InboxIcon />}
                            title="No conversations yet"
                            description="Incoming WhatsApp and email land here. You can also start a WhatsApp to a new number."
                            actionLabel="Start a WhatsApp"
                            onAction={onStartWhatsApp}
                        />
                    )
                ) : (
                    <>
                        {sections.whatsapp.length > 0 && (
                            <section aria-label="WhatsApp">
                                <SectionLabel tone="whatsapp" count={sections.whatsapp.length}>WhatsApp</SectionLabel>
                                <div>{rows(sections.whatsapp)}</div>
                            </section>
                        )}

                        {sections.needsYou.length > 0 && (
                            <section aria-label="Needs you">
                                <SectionLabel tone="needs" count={sections.needsYou.length}>Needs you</SectionLabel>
                                <div>{rows(sections.needsYou)}</div>
                            </section>
                        )}

                        {sections.recent.length > 0 && (
                            <section aria-label="Recent">
                                <SectionLabel tone="plain" count={sections.recent.length}>Recent</SectionLabel>
                                <div>{rows(sections.recent)}</div>
                            </section>
                        )}

                        {sections.whatsapp.length === 0 && sections.needsYou.length === 0 && sections.recent.length === 0 && !showEarlier && (
                            <p className="px-6 pb-2 pt-8 text-center text-sm text-ink-3">
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
                                    className="sticky top-0 z-sticky flex min-h-[48px] w-full items-center gap-2 border-b border-line bg-surface px-4 text-start transition-colors duration-quick ease-out hover:bg-surface-2 focus-visible:[outline-offset:-3px] disabled:cursor-default disabled:hover:bg-surface"
                                >
                                    <span className="font-mono text-xs font-semibold uppercase tracking-[0.08em] text-ink-2">Earlier</span>
                                    <span className="num text-xs text-ink-3">{sections.earlier.length}</span>
                                    <span className="ms-1 min-w-0 flex-1 truncate text-xs text-ink-3">
                                        quiet for two weeks or more
                                    </span>
                                    {!searching && (
                                        <ChevronDownIcon className={`h-5 w-5 flex-shrink-0 text-ink-2 transition-transform duration-base ease-out ${showEarlier ? 'rotate-180' : ''}`} />
                                    )}
                                </button>
                                {showEarlier && <div>{rows(sections.earlier, true)}</div>}
                            </section>
                        )}
                    </>
                )}
            </nav>
        </>
    );
};

export default ThreadList;
