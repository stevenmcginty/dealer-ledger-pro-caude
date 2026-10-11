import React from 'react';
import { View } from '../../types';
import { AddTab, MoreTab, TabLink } from './TabItem';
import { NavFlags, hrefFor, secondTab, tabFor } from './navModel';
import { ShellCounts } from './hooks';
import { NavChatIcon, NavChatSolidIcon, NavGridIcon, NavGridSolidIcon, NavHomeIcon, NavHomeSolidIcon } from '../icons';

interface NavRailProps {
    view: View;
    flags: NavFlags;
    counts: ShellCounts;
    addOpen: boolean;
    moreOpen: boolean;
    onNavigate: (view: View) => void;
    onToggleAdd: () => void;
    onToggleMore: () => void;
    addRef: React.Ref<HTMLButtonElement>;
}

/**
 * Tablet navigation (768-1023 px): an 84 px rail on the start edge with the
 * same five items. Add is a filled button at the top; More opens a 320 px
 * panel beside the rail.
 */
const NavRail: React.FC<NavRailProps> = ({ view, flags, counts, addOpen, moreOpen, onNavigate, onToggleAdd, onToggleMore, addRef }) => {
    const second = secondTab(flags);
    const current = moreOpen ? 'more' : tabFor(view, flags);
    const item = 'w-[72px]';

    return (
        <nav
            aria-label="Main"
            className="relative z-nav flex h-full w-[84px] flex-none flex-col items-center gap-1.5 border-e border-line bg-surface px-1.5 py-3 print:hidden"
        >
            <div className="mb-3">
                <AddTab ref={addRef} open={addOpen} onToggle={onToggleAdd} variant="rail" />
            </div>
            <TabLink className={item} label="Today" href={hrefFor('dashboard')} icon={NavHomeIcon} solidIcon={NavHomeSolidIcon} active={current === 'today'} onSelect={() => onNavigate('dashboard')} />
            <TabLink className={item} label={second.label} href={hrefFor(second.view)} icon={second.icon} solidIcon={second.solid} active={current === 'second'} onSelect={() => onNavigate(second.view)} />
            <TabLink
                className={item}
                label="Inbox"
                href={hrefFor('agentInbox')}
                icon={NavChatIcon}
                solidIcon={NavChatSolidIcon}
                active={current === 'inbox'}
                onSelect={() => onNavigate('agentInbox')}
                badge={counts.inbox}
                pulse={counts.whatsappUnread > 0}
            />
            <div className={item}>
                <MoreTab icon={NavGridIcon} solidIcon={NavGridSolidIcon} active={current === 'more'} expanded={moreOpen} onToggle={onToggleMore} controls="more-panel" />
            </div>
        </nav>
    );
};

export default NavRail;
