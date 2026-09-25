/**
 * Top of an open thread: who, which car, who is answering, which channel pane.
 * The car-fix, details and options menu hang off it. State lives in the page.
 */

import React from 'react';
import Spinner from '../../common/Spinner';
import {
    ArrowLeftIcon,
    ArrowTopRightOnSquareIcon,
    CarIcon,
    EllipsisVerticalIcon,
    PencilIcon,
    PhoneIcon,
    SparklesIcon,
    TrashIcon,
    UsersIcon,
    WhatsAppIcon,
} from '../../icons';
import {
    STAGE_LABELS,
    type Conversation,
    type ConversationMode,
} from '../../../services/salesAgentService';
import type { CustomerGroup, ThreadChannel } from '../../../utils/agentInboxGroups';
import { displayUkPhone } from '../../../utils/agentInboxBounce';
import { Avatar, ChannelIcon, MenuItem, channelName } from './parts';

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
    carFixNote: string;
    onCarFixNote: (note: string) => void;
    carFixBusy: boolean;
    onCarFix: () => void;
    onSplit: () => void;
    onOpenLead: () => void;
    canWhatsAppFollowUp: boolean;
    onWhatsAppFollowUp: () => void;
    onDelete: () => void;
}

const MODE_TEXT = (mode: ConversationMode, agentName: string): { label: string; dot: string } => (
    mode === 'agent' ? { label: `${agentName} is answering`, dot: 'bg-amber-400' }
        : mode === 'human' ? { label: 'You are answering', dot: 'bg-gray-100' }
            : { label: 'Paused — nothing sends', dot: 'bg-red-400' }
);

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
    carFixNote,
    onCarFixNote,
    carFixBusy,
    onCarFix,
    onSplit,
    onOpenLead,
    canWhatsAppFollowUp,
    onWhatsAppFollowUp,
    onDelete,
}) => {
    const car = conv.vehicleInterest?.title;
    const mode = MODE_TEXT(conv.mode, agentName);
    const closeMenu = () => onMenuOpen(false);

    return (
        <header className="relative z-20 border-b border-white/[0.06] bg-gray-900">
            <div className="flex items-center gap-2 px-2 pt-2 sm:gap-3 sm:px-4 sm:pt-3">
                <button
                    type="button"
                    onClick={onBack}
                    className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full text-gray-400 hover:bg-white/[0.06] hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 lg:hidden"
                    aria-label="Back to the list"
                >
                    <ArrowLeftIcon className="h-5 w-5" />
                </button>
                <Avatar name={group.name} size="lg" />
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                        <h2 className="min-w-0 truncate text-[17px] font-semibold leading-tight tracking-tight text-white">{group.name}</h2>
                        {conv.escalated && !bounced && (
                            <>
                                <span className="h-2 w-2 flex-shrink-0 rounded-full bg-red-400 sm:hidden" role="img" aria-label="Escalated" />
                                <span className="hidden flex-shrink-0 rounded-md bg-red-500/15 px-1.5 py-0.5 text-[11px] font-semibold text-red-300 sm:inline">Escalated</span>
                            </>
                        )}
                        {group.shared && (
                            <span className="hidden flex-shrink-0 rounded-md bg-white/[0.06] px-1.5 py-0.5 text-[11px] font-medium text-gray-400 sm:inline">Other ledger</span>
                        )}
                    </div>
                    <p className="mt-1 flex min-w-0 items-center gap-2 text-[12.5px] leading-tight text-gray-400">
                        <span className="inline-flex min-w-0 items-center gap-1.5">
                            <span className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${mode.dot}`} aria-hidden />
                            <span className="truncate">{mode.label}</span>
                        </span>
                        {phone && (
                            <>
                                <span className="hidden text-gray-600 sm:inline" aria-hidden>·</span>
                                <a href={`tel:${phone}`} className="hidden flex-shrink-0 tabular-nums text-gray-300 hover:text-white hover:underline sm:inline">
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
                        className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full text-gray-400 hover:bg-white/[0.06] hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 sm:hidden"
                    >
                        <PhoneIcon className="h-5 w-5" />
                    </a>
                )}
                <button
                    type="button"
                    onClick={() => onMenuOpen(!menuOpen)}
                    aria-haspopup="menu"
                    aria-expanded={menuOpen}
                    aria-label="Conversation options"
                    className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full text-gray-400 hover:bg-white/[0.06] hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
                >
                    <EllipsisVerticalIcon className="h-5 w-5" />
                </button>
            </div>

            <div className="flex items-center gap-2 px-3 pb-1 pt-1.5 sm:px-4 sm:pb-2 sm:pt-2 lg:pl-[4.25rem]">
                <button
                    type="button"
                    onClick={() => onCarFixOpen(!carFixOpen)}
                    aria-expanded={carFixOpen}
                    title={car ? `${agentName} has this down as the ${car}. Tap if that is wrong.` : 'Tell Dave which car this is about'}
                    className="group inline-flex min-h-[44px] min-w-0 max-w-full items-center gap-2 sm:min-h-[34px] rounded-lg border border-white/[0.08] bg-white/[0.03] px-2.5 text-left text-[13px] text-gray-100 transition-colors hover:border-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
                >
                    <CarIcon className="h-4 w-4 flex-shrink-0 text-gray-400" />
                    <span className={`truncate ${car ? 'font-medium' : 'text-gray-400'}`}>{car || 'Which car?'}</span>
                    <PencilIcon className="h-3 w-3 flex-shrink-0 text-gray-500 opacity-60 transition-opacity group-hover:opacity-100" />
                </button>
                {paneChannels.length <= 1 && (
                    <span className={`ml-auto inline-flex flex-shrink-0 items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] ${
                        pane === 'whatsapp' ? 'text-emerald-400' : 'text-sky-400'
                    }`}>
                        <ChannelIcon channel={pane} className="h-3.5 w-3.5" />
                        {channelName(pane)}
                    </span>
                )}
            </div>

            {carFixOpen && (
                <div className="mx-3 mb-3 rounded-xl border border-amber-400/25 bg-amber-400/[0.06] px-3 py-3 sm:mx-4">
                    <p className="text-[13px] leading-snug text-gray-100">
                        {car
                            ? <>{agentName} has this down as the <span className="font-semibold text-amber-200">{car}</span>. Which car is it really?</>
                            : <>Which car is this enquiry about?</>}
                    </p>
                    <textarea
                        value={carFixNote}
                        onChange={e => onCarFixNote(e.target.value)}
                        onKeyDown={e => {
                            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); onCarFix(); }
                        }}
                        rows={2}
                        autoFocus
                        placeholder="It's the black Boxster, not the Taycan. That one sold months ago."
                        className="mt-2 w-full resize-none rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-[16px] text-gray-100 placeholder:text-gray-500 focus:border-amber-400/50 focus:outline-none focus:ring-2 focus:ring-amber-400/20 sm:text-[13px]"
                    />
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                        <p className="min-w-0 flex-1 basis-60 text-[11.5px] leading-snug text-gray-400">
                            {agentName} re-pins the thread, bins the draft and remembers this. If the car is the other ledger&apos;s, the thread goes to them.
                        </p>
                        <div className="flex flex-shrink-0 items-center gap-1">
                            <button
                                type="button"
                                onClick={() => { onCarFixOpen(false); onCarFixNote(''); }}
                                className="h-10 rounded-lg px-3 text-[13px] font-medium text-gray-400 hover:bg-white/[0.06] hover:text-white"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={onCarFix}
                                disabled={carFixBusy || !carFixNote.trim()}
                                className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-amber-400 px-3.5 text-[13px] font-semibold text-gray-950 hover:bg-amber-300 disabled:opacity-40"
                            >
                                {carFixBusy ? <Spinner className="h-3.5 w-3.5 text-gray-950" /> : `Tell ${agentName}`}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {detailsOpen && (
                <dl className="mx-3 mb-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-xl border border-white/[0.06] bg-black/25 px-3.5 py-3 text-[12.5px] text-gray-100 sm:mx-4">
                    {phone && (
                        <>
                            <dt className="text-gray-400">Mobile</dt>
                            <dd><a href={`tel:${phone}`} className="inline-flex items-center gap-1 tabular-nums text-emerald-300 hover:underline"><PhoneIcon className="h-3 w-3" />{displayUkPhone(phone)}</a></dd>
                        </>
                    )}
                    {email && (
                        <>
                            <dt className="text-gray-400">Email</dt>
                            <dd className={`break-all ${bounced ? 'text-red-300' : ''}`}>{email}{bounced ? ' · bounces' : ''}</dd>
                        </>
                    )}
                    {!email && !phone && (
                        <>
                            <dt className="text-gray-400">From</dt>
                            <dd className="break-all">{conv.address}</dd>
                        </>
                    )}
                    {conv.partExOrFinance && (
                        <>
                            <dt className="text-gray-400">Deal</dt>
                            <dd>{conv.partExOrFinance}</dd>
                        </>
                    )}
                    {conv.preferredTime && (
                        <>
                            <dt className="text-gray-400">Prefers</dt>
                            <dd>{conv.preferredTime}</dd>
                        </>
                    )}
                    {conv.booking && (
                        <>
                            <dt className="text-gray-400">Booked</dt>
                            <dd className="text-emerald-300">{conv.booking.window}</dd>
                        </>
                    )}
                    <dt className="text-gray-400">Stage</dt>
                    <dd>{STAGE_LABELS[conv.stage] || conv.stage}{group.shared ? ' · other ledger' : ''}</dd>
                    <dt className="text-gray-400">Ref</dt>
                    <dd className="font-mono text-gray-400">#{conv.shortId}</dd>
                    {conv.contact?.leadId && (
                        <>
                            <dt className="text-gray-400">CRM</dt>
                            <dd>
                                <button type="button" onClick={onOpenLead} className="inline-flex items-center gap-1 text-sky-300 hover:text-sky-200">
                                    <ArrowTopRightOnSquareIcon className="h-3 w-3" />
                                    {leadLabel || 'Open lead'}
                                </button>
                            </dd>
                        </>
                    )}
                </dl>
            )}

            {paneChannels.length > 1 && (
                <div className="flex px-2 sm:px-4 lg:pl-[3.75rem]" role="tablist" aria-label="Channel">
                    {paneChannels.map(ch => {
                        const on = pane === ch;
                        return (
                            <button
                                key={ch}
                                type="button"
                                role="tab"
                                aria-selected={on}
                                onClick={() => onPane(ch)}
                                className={`relative flex h-11 items-center gap-1.5 px-3 text-[13px] font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-400 ${
                                    on ? 'text-white' : 'text-gray-400 hover:text-gray-100'
                                }`}
                            >
                                <ChannelIcon
                                    channel={ch}
                                    className={`h-4 w-4 ${on ? (ch === 'whatsapp' ? 'text-emerald-400' : 'text-sky-400') : ''}`}
                                />
                                {channelName(ch)}
                                <span className={`tabular-nums text-[12px] ${on ? 'text-gray-400' : 'text-gray-500'}`}>{channelCounts[ch]}</span>
                                <span
                                    aria-hidden
                                    className={`absolute inset-x-2 bottom-0 h-[2px] rounded-full transition-opacity ${
                                        ch === 'whatsapp' ? 'bg-emerald-400' : 'bg-sky-400'
                                    } ${on ? 'opacity-100' : 'opacity-0'}`}
                                />
                            </button>
                        );
                    })}
                </div>
            )}

            {menuOpen && (
                <>
                    <div className="fixed inset-0 z-20" onClick={closeMenu} aria-hidden />
                    <div role="menu" className="absolute right-2 top-14 z-30 w-60 overflow-hidden rounded-xl border border-white/10 bg-gray-800 py-1 shadow-2xl shadow-black/50 sm:right-4">
                        {conv.mode !== 'human' && (
                            <MenuItem onClick={() => { closeMenu(); onMode('human'); }} disabled={changingMode}>Take over — I&apos;ll answer</MenuItem>
                        )}
                        {conv.mode !== 'agent' && (
                            <MenuItem onClick={() => { closeMenu(); onMode('agent'); }} disabled={changingMode}>
                                <SparklesIcon className="h-4 w-4 text-amber-300" />
                                Hand back to {agentName}
                            </MenuItem>
                        )}
                        {conv.mode !== 'paused' && (
                            <MenuItem onClick={() => { closeMenu(); onMode('paused'); }} disabled={changingMode}>Pause — send nothing</MenuItem>
                        )}
                        <div className="my-1 border-t border-white/[0.06]" />
                        <MenuItem onClick={() => { closeMenu(); onToggleDetails(); }}>
                            {detailsOpen ? 'Hide details' : 'Details'}
                        </MenuItem>
                        <MenuItem onClick={() => { closeMenu(); onCarFixOpen(true); }}>
                            <CarIcon className="h-4 w-4 text-amber-300" />
                            Wrong car
                        </MenuItem>
                        <MenuItem onClick={() => { closeMenu(); onSplit(); }}>
                            <UsersIcon className="h-4 w-4 text-amber-300" />
                            Different person
                        </MenuItem>
                        {(phone || conv.contact?.leadId) && <div className="my-1 border-t border-white/[0.06]" />}
                        {phone && (
                            <a href={`tel:${phone}`} role="menuitem" onClick={closeMenu} className="flex min-h-[44px] w-full items-center gap-2.5 px-4 text-sm text-gray-100 hover:bg-white/[0.06]">
                                <PhoneIcon className="h-4 w-4 text-gray-400" />
                                Call {displayUkPhone(phone)}
                            </a>
                        )}
                        {canWhatsAppFollowUp && (
                            <MenuItem onClick={() => { closeMenu(); onWhatsAppFollowUp(); }}>
                                <WhatsAppIcon className="h-4 w-4 text-emerald-400" />
                                Follow up on WhatsApp
                            </MenuItem>
                        )}
                        {conv.contact?.leadId && (
                            <MenuItem onClick={() => { closeMenu(); onOpenLead(); }}>
                                <ArrowTopRightOnSquareIcon className="h-4 w-4 text-gray-400" />
                                Open CRM lead
                            </MenuItem>
                        )}
                        <div className="my-1 border-t border-white/[0.06]" />
                        <MenuItem danger onClick={() => { closeMenu(); onDelete(); }}>
                            <TrashIcon className="h-4 w-4" />
                            Delete conversation
                        </MenuItem>
                    </div>
                </>
            )}
        </header>
    );
};

export default ThreadHeader;
