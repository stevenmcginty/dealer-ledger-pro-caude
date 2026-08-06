import React, { useEffect, useState } from 'react';
import { useData } from '../../hooks/useData';
import { runMotSweepNow, subscribeToMotSweep, describeUrgency } from '../../services/motSweep';
import { MotAlert, MotSweepSummary } from '../../types';
import Spinner from '../common/Spinner';
import { ArrowPathIcon, CheckCircleIcon, ExclamationTriangleIcon } from '../icons';

const formatRunTime = (timestamp: number): string =>
    new Date(timestamp).toLocaleString('en-GB', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
    });

const AlertRow: React.FC<{ alert: MotAlert; tone: 'expired' | 'soon' }> = ({ alert, tone }) => (
    <li className="flex items-center justify-between gap-3 py-2 text-sm border-b border-gray-700/50 last:border-0">
        <div className="min-w-0">
            <span className="font-mono font-semibold text-white">{alert.reg}</span>
            <span className="text-gray-400 ml-2 truncate">
                {[alert.make, alert.model].filter(Boolean).join(' ')}
            </span>
        </div>
        <div className="flex-shrink-0 text-right">
            <span className={tone === 'expired' ? 'text-red-400' : 'text-amber-400'}>
                {describeUrgency(alert.daysRemaining)}
            </span>
            {alert.motDueDate && (
                <span className="block text-xs text-gray-500">{alert.motDueDate}</span>
            )}
        </div>
    </li>
);

/**
 * Shows the result of the nightly MOT sweep and lets you trigger it by hand.
 *
 * The lookups themselves are free — the government APIs don't charge — so running it
 * manually costs nothing beyond the wait.
 */
const MotSweepCard = () => {
    const { companyId } = useData();
    const [summary, setSummary] = useState<MotSweepSummary | null>(null);
    const [isRunning, setIsRunning] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!companyId) return;
        return subscribeToMotSweep(companyId, setSummary);
    }, [companyId]);

    const handleRun = async () => {
        setIsRunning(true);
        setError(null);
        try {
            // The subscription picks up the written summary, so nothing to set here.
            await runMotSweepNow();
        } catch (err: any) {
            setError(err?.message || 'MOT check failed.');
        } finally {
            setIsRunning(false);
        }
    };

    const expired = summary?.expired || [];
    const expiringSoon = summary?.expiringSoon || [];
    const allClear = !!summary && expired.length === 0 && expiringSoon.length === 0;

    return (
        <div className="bg-gray-800 p-6 rounded-lg shadow-lg">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h2 className="text-lg font-semibold text-white">MOT Status Check</h2>
                    <p className="text-sm text-gray-400 mt-1">
                        Every morning the app re-checks the DVLA and DVSA records for each vehicle in
                        stock and updates its MOT and tax details. Run it now if you'd rather not wait.
                    </p>
                </div>
                <button
                    onClick={handleRun}
                    disabled={isRunning || !companyId}
                    className="flex-shrink-0 inline-flex items-center justify-center gap-x-2 rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-500 disabled:opacity-50"
                >
                    {isRunning ? <Spinner className="h-5 w-5" /> : <ArrowPathIcon className="h-5 w-5" />}
                    {isRunning ? 'Checking...' : 'Check now'}
                </button>
            </div>

            {isRunning && (
                <p className="mt-3 text-xs text-gray-500">
                    This takes about a second per vehicle in stock — leave the page open.
                </p>
            )}

            {error && (
                <div className="mt-4 p-3 rounded-lg bg-red-900/50 flex items-center gap-3">
                    <ExclamationTriangleIcon className="h-5 w-5 text-red-400 flex-shrink-0" />
                    <p className="text-sm text-gray-300">{error}</p>
                </div>
            )}

            {!summary && !isRunning && (
                <p className="mt-4 text-sm text-gray-500">Not run yet.</p>
            )}

            {summary && (
                <div className="mt-4 space-y-4">
                    <p className="text-xs text-gray-500">
                        Last run {formatRunTime(summary.finishedAt)}
                        {summary.trigger === 'manual' ? ' (manual)' : ''} — {summary.checked} checked,{' '}
                        {summary.updated} updated
                        {summary.failed > 0 ? `, ${summary.failed} failed` : ''}
                        {summary.skipped ? `, ${summary.skipped} not checked (list too long)` : ''}
                    </p>

                    {allClear && (
                        <div className="p-3 rounded-lg bg-green-900/50 flex items-center gap-3">
                            <CheckCircleIcon className="h-5 w-5 text-green-400 flex-shrink-0" />
                            <p className="text-sm text-gray-300">
                                Every vehicle in stock has more than a month left on its MOT.
                            </p>
                        </div>
                    )}

                    {expired.length > 0 && (
                        <div>
                            <h3 className="text-sm font-semibold text-red-400">
                                MOT expired ({expired.length})
                            </h3>
                            <ul className="mt-1">
                                {expired.map(alert => (
                                    <AlertRow key={alert.vehicleId} alert={alert} tone="expired" />
                                ))}
                            </ul>
                        </div>
                    )}

                    {expiringSoon.length > 0 && (
                        <div>
                            <h3 className="text-sm font-semibold text-amber-400">
                                Due within 30 days ({expiringSoon.length})
                            </h3>
                            <ul className="mt-1">
                                {expiringSoon.map(alert => (
                                    <AlertRow key={alert.vehicleId} alert={alert} tone="soon" />
                                ))}
                            </ul>
                        </div>
                    )}

                    {summary.errors.length > 0 && (
                        <details className="text-xs text-gray-500">
                            <summary className="cursor-pointer">
                                {summary.errors.length} lookup{summary.errors.length === 1 ? '' : 's'} failed
                            </summary>
                            <ul className="mt-1 space-y-1">
                                {summary.errors.map(e => (
                                    <li key={e.reg}>
                                        <span className="font-mono">{e.reg}</span> — {e.message}
                                    </li>
                                ))}
                            </ul>
                        </details>
                    )}
                </div>
            )}
        </div>
    );
};

export default MotSweepCard;
