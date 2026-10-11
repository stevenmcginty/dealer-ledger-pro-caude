import React from 'react';
import { useData } from '../../hooks/useData';
import { cx } from '../ui/cx';

const initials = (name: string): string =>
    name
        .split(/\s+/)
        .filter(w => /^[A-Za-z0-9]/.test(w))
        .slice(0, 2)
        .map(w => w[0].toUpperCase())
        .join('') || 'DL';

/**
 * Whose ledger this is. Each login opens one ledger (Radlett or Chris), so
 * there is nothing to switch to in the app: signing in as the other user is
 * the switch.
 */
const LedgerCard: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
    const { businessDetails, isVatRegistered, user } = useData();
    const name = businessDetails?.name || 'Dealer Ledger';
    const email: string | undefined = user?.email || undefined;

    return (
        <div className={cx('flex min-w-0 items-center gap-3', !compact && 'min-h-[64px] rounded-card border border-line bg-surface px-4 py-3')}>
            <span
                aria-hidden="true"
                className={cx(
                    'grid flex-none place-items-center rounded-control bg-ink font-semibold text-surface',
                    compact ? 'h-9 w-9 text-sm' : 'h-10 w-10 text-base',
                )}
            >
                {initials(name)}
            </span>
            <span className="min-w-0 flex-1">
                <span className={cx('block truncate font-semibold leading-tight text-ink', compact ? 'text-sm' : 'text-base')}>{name}</span>
                <span className="block truncate text-xs leading-snug text-ink-3">
                    {compact && email ? email : `Your ledger${isVatRegistered ? ' · VAT registered' : ''}`}
                </span>
            </span>
        </div>
    );
};

export default LedgerCard;
