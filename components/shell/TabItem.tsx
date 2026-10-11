import React from 'react';
import { cx } from '../ui/cx';
import { badgeText } from './navModel';
import { PlusIcon } from '../icons';

/*
 * One item of the phone tab bar and the tablet rail (spec 4.2 "Bottom tab bar").
 * Icon in a 56x32 pill, label under it, always shown. Active = solid icon +
 * accent text + soft pill: three cues, not colour alone.
 */

const itemBase =
    'group relative flex min-h-[56px] min-w-[48px] select-none flex-col items-center justify-center gap-[3px] rounded-control px-0.5 pb-0.5 pt-1 ' +
    'text-xs font-semibold leading-none no-underline transition-colors duration-quick ease-out focus-visible:outline-offset-[-3px]';

const pillBase =
    'relative grid h-8 w-14 place-items-center rounded-full transition-[background-color,transform] duration-quick ease-out ' +
    'group-active:scale-[.92] group-active:duration-press';

interface TabLinkProps {
    label: string;
    href: string;
    icon: React.ComponentType<{ className?: string }>;
    solidIcon: React.ComponentType<{ className?: string }>;
    active: boolean;
    onSelect: () => void;
    badge?: number;
    /** Gentle ring on the badge while WhatsApp messages sit unread. */
    pulse?: boolean;
    /** What the badge counts, for screen readers ("unread"). */
    badgeNoun?: string;
    className?: string;
}

export const TabLink: React.FC<TabLinkProps> = ({ label, href, icon: Icon, solidIcon: Solid, active, onSelect, badge, pulse, badgeNoun = 'waiting', className }) => {
    const count = badge && badge > 0 ? badge : 0;
    return (
        <a
            href={href}
            onClick={e => {
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return; // let "open in new tab" work
                e.preventDefault();
                onSelect();
            }}
            aria-current={active ? 'page' : undefined}
            className={cx(itemBase, active ? 'text-accent-text' : 'text-ink-3 hover:text-ink-2', className)}
        >
            <span className={cx(pillBase, active ? 'bg-accent-soft' : 'group-hover:bg-surface-2 group-active:bg-surface-3')}>
                {active ? <Solid className="h-6 w-6" /> : <Icon className="h-6 w-6" />}
                {count > 0 && (
                    <span
                        aria-hidden="true"
                        className="num absolute -top-1 start-[calc(50%+4px)] h-5 min-w-[20px] rounded-full bg-danger px-[5px] text-center text-xs font-semibold leading-5 text-on-danger shadow-[0_0_0_2px_rgb(var(--c-surface))]"
                    >
                        {pulse && <span className="absolute inset-0 rounded-full bg-danger opacity-40 motion-safe:animate-ping" />}
                        <span className="relative">{badgeText(count)}</span>
                    </span>
                )}
            </span>
            <span>{label}</span>
            {count > 0 && <span className="sr-only">, {count} {badgeNoun}</span>}
        </a>
    );
};

interface AddTabProps {
    open: boolean;
    onToggle: () => void;
    /** Rail: a bigger filled square at the top. Tab bar: the accent pill. */
    variant?: 'tab' | 'rail';
}

/** The Add item. While the menu is open it reads Close, with the + turned into an x. */
export const AddTab = React.forwardRef<HTMLButtonElement, AddTabProps>(({ open, onToggle, variant = 'tab' }, ref) => (
    <button
        ref={ref}
        type="button"
        onClick={onToggle}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-keyshortcuts="N"
        className={cx(itemBase, 'text-ink')}
    >
        <span
            className={cx(
                'grid place-items-center bg-accent text-on-accent transition-[background-color,transform] duration-quick ease-out',
                'group-hover:bg-accent-hover group-active:scale-[.92] group-active:bg-accent-press group-active:duration-press',
                variant === 'rail' ? 'h-14 w-14 rounded-card' : 'h-8 w-12 rounded-control',
            )}
        >
            <PlusIcon className={cx('h-6 w-6 transition-transform duration-base ease-out', open && 'rotate-45')} />
        </span>
        <span>{open ? 'Close' : 'Add'}</span>
    </button>
));
AddTab.displayName = 'AddTab';

interface MoreTabProps {
    label?: string;
    icon: React.ComponentType<{ className?: string }>;
    solidIcon: React.ComponentType<{ className?: string }>;
    active: boolean;
    expanded: boolean;
    onToggle: () => void;
    controls?: string;
}

/** More is a toggle, not a link: it opens the More screen (phone) or panel (rail). */
export const MoreTab: React.FC<MoreTabProps> = ({ label = 'More', icon: Icon, solidIcon: Solid, active, expanded, onToggle, controls }) => (
    <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={controls}
        aria-current={active && !expanded ? 'page' : undefined}
        className={cx(itemBase, active || expanded ? 'text-accent-text' : 'text-ink-3 hover:text-ink-2')}
    >
        <span className={cx(pillBase, active || expanded ? 'bg-accent-soft' : 'group-hover:bg-surface-2 group-active:bg-surface-3')}>
            {active || expanded ? <Solid className="h-6 w-6" /> : <Icon className="h-6 w-6" />}
        </span>
        <span>{label}</span>
    </button>
);
