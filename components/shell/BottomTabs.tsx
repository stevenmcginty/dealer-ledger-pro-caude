import React, { useLayoutEffect, useRef } from 'react';
import { View } from '../../types';
import { AddTab, MoreTab, TabLink } from './TabItem';
import { NavFlags, hrefFor, secondTab, tabFor } from './navModel';
import { ShellCounts } from './hooks';
import { NavChatIcon, NavChatSolidIcon, NavGridIcon, NavGridSolidIcon, NavHomeIcon, NavHomeSolidIcon } from '../icons';

interface BottomTabsProps {
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
 * Phone navigation (< 768 px): Today · Stock · Add · Inbox · More.
 * Solid surface and a hairline, no blur (cheaper and clearer in sun).
 * Sits in the page flow under the content, so nothing scrolls behind it.
 * Publishes its height (safe area included) as --nav-h on <html>, so fixed
 * footers can sit on top of it; --nav-h is 0px whenever the bar is not shown.
 */
const BottomTabs: React.FC<BottomTabsProps> = ({ view, flags, counts, addOpen, moreOpen, onNavigate, onToggleAdd, onToggleMore, addRef }) => {
    const second = secondTab(flags);
    const current = moreOpen ? 'more' : tabFor(view, flags);
    const navRef = useRef<HTMLElement>(null);

    useLayoutEffect(() => {
        const nav = navRef.current;
        const root = document.documentElement;
        if (!nav) return;
        const publish = () => root.style.setProperty('--nav-h', `${nav.offsetHeight}px`);
        publish();
        const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(publish) : null;
        observer?.observe(nav);
        return () => {
            observer?.disconnect();
            root.style.setProperty('--nav-h', '0px');
        };
    }, []);

    return (
        <nav
            ref={navRef}
            aria-label="Main"
            className="relative z-nav grid flex-none grid-cols-5 border-t border-line bg-surface px-1 pt-1.5 print:hidden"
            style={{ paddingBottom: 'max(0.375rem, env(safe-area-inset-bottom))' }}
        >
            <TabLink label="Today" href={hrefFor('dashboard')} icon={NavHomeIcon} solidIcon={NavHomeSolidIcon} active={current === 'today'} onSelect={() => onNavigate('dashboard')} />
            <TabLink label={second.label} href={hrefFor(second.view)} icon={second.icon} solidIcon={second.solid} active={current === 'second'} onSelect={() => onNavigate(second.view)} />
            <AddTab ref={addRef} open={addOpen} onToggle={onToggleAdd} />
            <TabLink
                label="Inbox"
                href={hrefFor('agentInbox')}
                icon={NavChatIcon}
                solidIcon={NavChatSolidIcon}
                active={current === 'inbox'}
                onSelect={() => onNavigate('agentInbox')}
                badge={counts.inbox}
                pulse={counts.whatsappUnread > 0}
            />
            <MoreTab icon={NavGridIcon} solidIcon={NavGridSolidIcon} active={current === 'more'} expanded={moreOpen} onToggle={onToggleMore} controls="more-screen" />
        </nav>
    );
};

export default BottomTabs;
