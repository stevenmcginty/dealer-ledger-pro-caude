import React from 'react';
import { IconButton } from '../ui';
import { cx } from '../ui/cx';
import { Lead } from '../../types';
import { PhoneIcon, EnvelopeIcon, ClockIcon } from '../icons';
import { formatCurrency } from '../../utils/helpers';
import { daysInStage, fullName, STALE_DAYS } from './leadStage';

interface LeadCardProps {
    lead: Lead;
    onClick?: (lead: Lead) => void;
    isDragging?: boolean;
}

/**
 * A lead on the desktop board: who, which car, what it's worth. Flat surface
 * on a hairline; the name is the keyboard target, the whole card takes a click.
 */
const LeadCard: React.FC<LeadCardProps> = ({ lead, onClick, isDragging }) => {
    const days = daysInStage(lead);
    const stale = days > STALE_DAYS;
    const name = fullName(lead);

    return (
        <div
            onClick={() => onClick?.(lead)}
            className={cx(
                'group cursor-pointer select-none rounded-card border bg-surface p-3 text-ink',
                'transition-[border-color,background-color,opacity] duration-quick ease-out hover:border-line-strong hover:bg-surface-2 active:bg-surface-3',
                isDragging ? 'border-accent opacity-40' : 'border-line',
            )}
        >
            <div className="flex items-start gap-2">
                <button
                    type="button"
                    onClick={e => { e.stopPropagation(); onClick?.(lead); }}
                    className="min-w-0 flex-1 truncate rounded-chip text-start text-base font-semibold leading-snug text-ink"
                >
                    {name}
                </button>
                <span className={cx('flex flex-none items-center gap-1 pt-0.5 text-xs font-semibold', stale ? 'text-warning' : 'text-ink-3')}>
                    {stale && <ClockIcon className="h-3.5 w-3.5" aria-hidden="true" />}
                    <span className="num">{days}d</span>
                    <span className="sr-only">{days === 1 ? 'day' : 'days'} in this stage</span>
                </span>
            </div>
            <p className={cx('mt-0.5 truncate text-sm', lead.vehicleOfInterest ? 'text-ink-2' : 'text-ink-3')}>
                {lead.vehicleOfInterest || 'No car yet'}
            </p>
            <div className="mt-2 flex items-center gap-1">
                {lead.value
                    ? <span className="num min-w-0 flex-1 text-sm font-semibold text-ink">{formatCurrency(lead.value)}</span>
                    : <span className="min-w-0 flex-1 truncate text-xs text-ink-3">No value · {lead.source}</span>}
                {lead.email && (
                    <IconButton
                        size="sm"
                        label={`Email ${lead.email}`}
                        icon={<EnvelopeIcon />}
                        className="-my-1 [&_svg]:h-5 [&_svg]:w-5"
                        onClick={e => {
                            e.stopPropagation();
                            window.location.href = `mailto:${encodeURIComponent(lead.email)}`;
                        }}
                    />
                )}
                {lead.phone && (
                    <IconButton
                        size="sm"
                        label={`Call ${lead.phone}`}
                        icon={<PhoneIcon />}
                        className="-my-1 -me-1.5 [&_svg]:h-5 [&_svg]:w-5"
                        onClick={e => {
                            e.stopPropagation();
                            window.location.href = `tel:${encodeURIComponent(lead.phone!)}`;
                        }}
                    />
                )}
            </div>
        </div>
    );
};

export default LeadCard;
