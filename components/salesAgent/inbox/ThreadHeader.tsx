/**
 * Top of an open thread: who, which car, who is answering, which channel pane.
 * The car picker, details and options menu hang off it. State lives in the page.
 *
 * Layout: back · person · call · menu on one line; the car pinned under it as
 * a plate with a Change link (the car picker); channel tabs last.
 */

import React from 'react';
import {
    ArrowLeftIcon,
    ArrowTopRightOnSquareIcon,
    CarIcon,
    CheckCircleIcon,
    EllipsisVerticalIcon,
    PhoneIcon,
    SparklesIcon,
    TrashIcon,
    UsersIcon,
} from '../../icons';
import { StatusChip } from '../../ui';
import {
    STAGE_LABELS,
    type CarCorrection,
    type Conversation,
    type ConversationMode,
} from '../../../services/salesAgentService';
import type { CustomerGroup, ThreadChannel } from '../../../utils/agentInboxGroups';
import { displayUkPhone } from '../../../utils/agentInboxBounce';
import { titleHasReg } from '../../../utils/carPickerSearch';
import CarPicker, { RegPlate } from './CarPicker';
import { Avatar, ChannelIcon, MenuItem, WhatsAppMark, channelName } from './parts';

export interface ThreadHeaderProps {
    group: CustomerGroup;
    conv: Conversation;
    agentName: string;
    bounced: boolean;
    phone?: string;
    email?: string;
    leadLabel: string | null;
    pane: ThreadChannel;
    paneChannels: ThreadChannel[];
    channelCounts: Record<ThreadChannel, number>;
    onPane: (channel: ThreadChannel) => void;
    onBack: () => void;
    menuOpen: boolean;
    onMenuOpen: (open: boolean) => void;
    changingMode: boolean;
    onMode: (mode: ConversationMode) => void;
    detailsOpen: boolean;
    onToggleDetails: () => void;
    carFixOpen: boolean;
    onCarFixOpen: (open: boolean) => void;
    /** Resolves once the server has re-pinned the car; rejects with its message. */
    onCarPick: (pick: CarCorrection) => Promise<void>;
    onSplit: () => void;
    onOpenLead: () => void;
    canWhatsAppFollowUp: boolean;
    onWhatsAppFollowUp: () => void;
    onDelete: () => void;
}

const MODE_TEXT = (mode: ConversationMode, agentName: string): { label: string; dot: string } => (
    mode === 'agent' ? { label: `${agentName} is answering`, dot: 'bg-accent' }
        : mode === 'human' ? { label: 'You are answering', dot: 'bg-ink-2' }
            : { label: 'Paused — nothing sends', dot: 'bg-danger' }
);

/** Square 48px tap target (40 on desktop pointers) for the header's icon actions. */
const iconAction =
    'grid h-12 w-12 flex-shrink-0 place-items-center rounded-control text-ink-2 transition-colors duration-quick ease-out hover:bg-surface-2 hover:text-ink active:bg-surface-3 [&_svg]:h-6 [&_svg]:w-6';

const ThreadHeader: React.FC<ThreadHeaderProps> = ({
    group,
    conv,
    agentName,
    bounced,
    phone,
    email,
    leadLabel,
    pane,
    paneChannels,
    channelCounts,
    onPane,
    onBack,
    menuOpen,
    onMenuOpen,
    changingMode,
    onMode,
    detailsOpen,
    onToggleDetails,
    carFixOpen,
    onCarFixOpen,
    onCarPick,
    onSplit,
    onOpenLead,
    canWhatsAppFollowUp,
    onWhatsAppFollowUp,
    onDelete,
}) => {
    const car = conv.vehicleInterest?.title;
    const reg = conv.vehicleInterest?.reg && !titleHasReg(car, conv.vehicleInterest.reg) ? conv.vehicleInterest.reg : '';
    const mode = MODE_TEXT(conv.mode, agentName);
    const closeMenu = () => onMenuOpen(false);

    return (
        <header className="relative z-nav border-b border-line bg-surface">
            <div className="flex items-center gap-1 px-1 pt-1 sm:gap-2 sm:px-3 sm:pt-2">
                <button
                    type="button"
                    onClick={onBack}
                    className={`${iconAction} lg:hidden`}
                    aria-label="Back to the list"
                >
                    <ArrowLeftIcon />
                </button>
                <span className="inline-flex lg:ms-1">
                    <Avatar name={group.name} />
                </span>
                <div className="min-w-0 flex-1 ps-1.5">
                    <div className="flex items-center gap-2">
                        <h2 className="min-w-0 truncate text-lg font-bold leading-6 tracking-[-0.01em] text-ink">{group.name}</h2>
                        {conv.escalated && !bounced && (
                            <>
                                <span className="h-2 w-2 flex-shrink-0 rounded-full bg-danger sm:hidden" role="img" aria-label="Escalated" />
                                <StatusChip status="due" className="hidden sm:inline-flex">Escalated</StatusChip>
                            </>
                        )}
                        {group.shared && (
                            <StatusChip status="neutral" className="hidden sm:inline-flex">Other ledger</StatusChip>
                        )}
                    </div>
                    <p className="flex min-w-0 items-center gap-2 text-sm leading-5 text-ink-2">
                        <span className="inline-flex min-w-0 items-center gap-1.5">
                            <span className={`h-2 w-2 flex-shrink-0 rounded-full ${mode.dot}`} aria-hidden />
                            <span className="truncate">{mode.label}</span>
                        </span>
                        {phone && (
                            <>
                                <span className="hidden text-ink-3 sm:inline" aria-hidden>·</span>
                                <a href={`tel:${phone}`} className="num hidden flex-shrink-0 text-ink-2 hover:text-ink hover:underline sm:inline">
                                    {displayUkPhone(phone)}
                                </a>
                            </>
                        )}
                    </p>
                </div>
                {phone && (
                    <a
                        href={`tel:${phone}`}
                        aria-label={`Call ${displayUkPhone(phone)}`}
                        className={`${iconAction} sm:hidden`}
                    >
                        <PhoneIcon />
                    </a>
                )}
                <button
                    type="button"
                    onClick={() => onMenuOpen(!menuOpen)}
                    aria-haspopup="menu"
                    aria-expanded={menuOpen}
                    aria-label="Conversation options"
                    className={`${iconAction} ${menuOpen ? 'bg-surface-2 text-ink' : ''}`}
                >
                    <EllipsisVerticalIcon />
                </button>
            </div>

            {/* The car, pinned under the person. Tapping it opens the car picker. */}
            <div className="flex items-center gap-2 px-3 pb-2 pt-1 sm:px-4 lg:ps-[4.25rem]">
                <button
                    type="button"
                    onClick={() => onCarFixOpen(!carFixOpen)}
                    aria-expanded={carFixOpen}
                    aria-haspopup="dialog"
                    title={car ? `${agentName} has this down as the ${car}. Tap to change it.` : `Tell ${agentName} which car this is about`}
                    className="group -ms-1 flex min-h-[48px] min-w-0 flex-1 items-center gap-2.5 rounded-control px-1 text-start transition-colors duration-quick ease-out hover:bg-surface-2 sm:min-h-[40px] sm:flex-none sm:pe-3"
                >
                    {car && reg ? (
                        <RegPlate reg={reg} />
                    ) : (
                        <span className="grid h-6 w-8 flex-shrink-0 place-items-center rounded-chip border border-line-strong text-ink-3" aria-hidden>
                            <CarIcon className="h-4 w-4" />
                        </span>
                    )}
                    {car ? (
                        <span className="min-w-0 truncate text-sm font-semibold text-ink">{car}</span>
                    ) : (
                        <span className="min-w-0 truncate text-sm text-ink-3">No car linked</span>
                    )}
                    {car && conv.carSetByOwner ? (
                        <span className="inline-flex flex-shrink-0 items-center gap-1 text-xs font-semibold text-success-ink" title="You set this car">
                            <CheckCircleIcon className="h-4 w-4" />
                            <span className="hidden sm:inline">Set by you</span>
                        </span>
                    ) : null}
                    <span className="ms-auto flex-shrink-0 ps-1 text-sm font-semibold text-accent-text group-hover:underline group-hover:underline-offset-2 sm:ms-1">
                        {car ? 'Change' : 'Set car'}
                    </span>
                </button>
                {paneChannels.length <= 1 && (
                    <span className="ms-auto hidden flex-shrink-0 items-center gap-1.5 text-sm font-semibold text-ink-2 sm:inline-flex">
                        <ChannelIcon channel={pane} brand className="h-4 w-4" />
                        {channelName(pane)}
                    </span>
                )}
            </div>

            {carFixOpen && (
                <CarPicker
                    agentName={agentName}
                    currentTitle={car}
                    onPick={onCarPick}
                    onClose={() => onCarFixOpen(false)}
                />
            )}

            {detailsOpen && (
                <dl className="mx-3 mb-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-card bg-surface-2 px-4 py-3 text-sm text-ink sm:mx-4 lg:ms-[4.25rem]">
                    {phone && (
                        <>
                            <dt className="text-ink-3">Mobile</dt>
                            <dd><a href={`tel:${phone}`} className="num inline-flex items-center gap-1.5 font-semibold text-accent-text hover:underline"><PhoneIcon className="h-4 w-4" />{displayUkPhone(phone)}</a></dd>
                        </>
                    )}
                    {email && (
                        <>
                            <dt className="text-ink-3">Email</dt>
                            <dd className={`break-all ${bounced ? 'text-danger' : ''}`}>{email}{bounced ? ' · bounces' : ''}</dd>
                        </>
                    )}
                    {!email && !phone && (
                        <>
                            <dt className="text-ink-3">From</dt>
                            <dd className="break-all">{conv.address}</dd>
                        </>
                    )}
                    {conv.partExOrFinance && (
                        <>
                            <dt className="text-ink-3">Deal</dt>
                            <dd>{conv.partExOrFinance}</dd>
                        </>
                    )}
                    {conv.preferredTime && (
                        <>
                            <dt className="text-ink-3">Prefers</dt>
                            <dd>{conv.preferredTime}</dd>
                        </>
                    )}
                    {conv.booking && (
                        <>
                            <dt className="text-ink-3">Booked</dt>
                            <dd className="font-semibold text-success-ink">{conv.booking.window}</dd>
                        </>
                    )}
                    <dt className="text-ink-3">Stage</dt>
                    <dd>{STAGE_LABELS[conv.stage] || conv.stage}{group.shared ? ' · other ledger' : ''}</dd>
                    <dt className="text-ink-3">Ref</dt>
                    <dd className="num text-ink-2">#{conv.shortId}</dd>
                    {conv.contact?.leadId && (
                        <>
                            <dt className="text-ink-3">CRM</dt>
                            <dd>
                                <button type="button" onClick={onOpenLead} className="inline-flex min-h-[32px] items-center gap-1.5 font-semibold text-accent-text hover:underline">
                                    <ArrowTopRightOnSquareIcon className="h-4 w-4" />
                                    {leadLabel || 'Open lead'}
                                </button>
                            </dd>
                        </>
                    )}
                </dl>
            )}

            {paneChannels.length > 1 && (
                <div className="flex px-1 sm:px-3 lg:ps-[3.75rem]" role="tablist" aria-label="Channel">
                    {paneChannels.map(ch => {
                        const on = pane === ch;
                        return (
                            <button
                                key={ch}
                                type="button"
                                role="tab"
                                aria-selected={on}
                                onClick={() => onPane(ch)}
                                className={`relative flex min-h-[48px] items-center gap-2 px-3 text-sm font-semibold transition-colors duration-quick ease-out focus-visible:[outline-offset:-3px] lg:min-h-[44px] ${
                                    on ? 'text-ink' : 'text-ink-2 hover:text-ink'
                                }`}
                            >
                                <ChannelIcon channel={ch} brand={on} className="h-4 w-4" />
                                {channelName(ch)}
                                <span className="num text-xs text-ink-3">{channelCounts[ch]}</span>
                                <span
                                    aria-hidden
                                    className={`absolute inset-x-2 bottom-0 h-[3px] rounded-t-full bg-accent transition-opacity duration-quick ease-out ${on ? 'opacity-100' : 'opacity-0'}`}
                                />
                            </button>
                        );
                    })}
                </div>
            )}

            {menuOpen && (
                <>
                    <div className="fixed inset-0 z-dropdown" onClick={closeMenu} aria-hidden />
                    <div role="menu" className="absolute end-2 top-14 z-dropdown w-64 overflow-hidden rounded-card border border-line bg-surface py-1 shadow-e2 sm:end-4">
                        {conv.mode !== 'human' && (
                            <MenuItem onClick={() => { closeMenu(); onMode('human'); }} disabled={changingMode}>Take over — I&apos;ll answer</MenuItem>
                        )}
                        {conv.mode !== 'agent' && (
                            <MenuItem onClick={() => { closeMenu(); onMode('agent'); }} disabled={changingMode}>
                                <SparklesIcon className="text-accent-text" />
                                Hand back to {agentName}
                            </MenuItem>
                        )}
                        {conv.mode !== 'paused' && (
                            <MenuItem onClick={() => { closeMenu(); onMode('paused'); }} disabled={changingMode}>Pause — send nothing</MenuItem>
                        )}
                        <div className="my-1 border-t border-line" />
                        <MenuItem onClick={() => { closeMenu(); onToggleDetails(); }}>
                            {detailsOpen ? 'Hide details' : 'Details'}
                        </MenuItem>
                        <MenuItem onClick={() => { closeMenu(); onCarFixOpen(true); }}>
                            <CarIcon className="text-ink-3" />
                            Change car
                        </MenuItem>
                        <MenuItem onClick={() => { closeMenu(); onSplit(); }}>
                            <UsersIcon className="text-ink-3" />
                            Different person
                        </MenuItem>
                        {(phone || conv.contact?.leadId) && <div className="my-1 border-t border-line" />}
                        {phone && (
                            <a
                                href={`tel:${phone}`}
                                role="menuitem"
                                onClick={closeMenu}
                                className="flex min-h-[48px] w-full items-center gap-3 px-4 text-base text-ink transition-colors duration-quick ease-out hover:bg-surface-2 focus-visible:[outline-offset:-3px] lg:min-h-[40px] lg:text-sm"
                            >
                                <PhoneIcon className="h-5 w-5 flex-shrink-0 text-ink-3" />
                                Call <span className="num">{displayUkPhone(phone)}</span>
                            </a>
                        )}
                        {canWhatsAppFollowUp && (
                            <MenuItem onClick={() => { closeMenu(); onWhatsAppFollowUp(); }}>
                                <WhatsAppMark brand />
                                Follow up on WhatsApp
                            </MenuItem>
                        )}
                        {conv.contact?.leadId && (
                            <MenuItem onClick={() => { closeMenu(); onOpenLead(); }}>
                                <ArrowTopRightOnSquareIcon className="text-ink-3" />
                                Open CRM lead
                            </MenuItem>
                        )}
                        <div className="my-1 border-t border-line" />
                        <MenuItem danger onClick={() => { closeMenu(); onDelete(); }}>
                            <TrashIcon />
                            Delete conversation
                        </MenuItem>
                    </div>
                </>
            )}
        </header>
    );
};

export default ThreadHeader;
