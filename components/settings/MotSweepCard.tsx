import React, { useEffect, useState } from 'react';
import { useData } from '../../hooks/useData';
import { runMotSweepNow, subscribeToMotSweep, describeUrgency } from '../../services/motSweep';
import { MotAlert, MotSweepSummary } from '../../types';
import { ArrowPathIcon, ChevronRightIcon } from '../icons';
import { Alert, Button, Plate } from '../ui';
import { Panel, PanelSection } from './SettingsKit';

const formatRunTime = (timestamp: number): string =>
    new Date(timestamp).toLocaleString('en-GB', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
    });

const AlertRow: React.FC<{ alert: MotAlert; tone: 'expired' | 'soon' }> = ({ alert, tone }) => (
    <li className="flex min-h-[56px] items-center gap-3 px-4 py-2.5 sm:px-5">
        <Plate reg={alert.reg} size="sm" />
        <span className="min-w-0 flex-1 truncate text-sm text-ink-2">
            {[alert.make, alert.model].filter(Boolean).join(' ')}
        </span>
        <span className="flex-none text-end">
            <span className={`block text-sm font-semibold ${tone === 'expired' ? 'text-danger' : 'text-warning'}`}>
                {describeUrgency(alert.daysRemaining)}
            </span>
            {alert.motDueDate && (
                <span className="num block text-xs text-ink-3">{alert.motDueDate}</span>
            )}
        </span>
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
            setError(err?.message || "The MOT check didn't finish.");
        } finally {
            setIsRunning(false);
        }
    };

    // Guarded because Realtime Database omits empty arrays entirely.
    const expired = summary?.expired || [];
    const expiringSoon = summary?.expiringSoon || [];
    const errors = summary?.errors || [];
    const allClear = !!summary && expired.length === 0 && expiringSoon.length === 0;

    const listHeading = (text: string, count: number, tone: 'danger' | 'warning') => (
        <h4 className={`flex items-center gap-2 border-b border-line px-4 pb-2 pt-4 text-sm font-bold sm:px-5 ${tone === 'danger' ? 'text-danger' : 'text-warning'}`}>
            {text} <span className="num rounded-chip bg-surface-2 px-1.5 text-xs leading-5 text-ink-2">{count}</span>
        </h4>
    );

    return (
        <Panel ariaLabel="MOT checks">
            <PanelSection
                title="MOT and tax check"
                description="Every morning the app re-checks the DVLA and DVSA records for each car in stock and updates its MOT and tax. Run it now if you'd rather not wait."
                action={
                    <Button onClick={handleRun} loading={isRunning} disabled={!companyId} icon={<ArrowPathIcon />}>
                        {isRunning ? 'Checking…' : 'Check now'}
                    </Button>
                }
            >
                {isRunning && (
                    <p className="text-sm text-ink-3" role="status">About a second per car in stock. Leave this page open.</p>
                )}
                {error && <Alert tone="danger" title="Check failed">{error}</Alert>}
                {!summary && !isRunning && !error && (
                    <p className="text-sm text-ink-3">Not run yet.</p>
                )}
                {summary && !isRunning && (
                    <p className="text-sm text-ink-3">
                        Last run <span className="num text-ink-2">{formatRunTime(summary.finishedAt)}</span>
                        {summary.trigger === 'manual' ? ' (by hand)' : ''} · <span className="num text-ink-2">{summary.checked}</span> checked,{' '}
                        <span className="num text-ink-2">{summary.updated}</span> updated
                        {summary.failed > 0 ? <>, <span className="num text-danger">{summary.failed}</span> failed</> : ''}
                        {summary.skipped ? <>, <span className="num">{summary.skipped}</span> not checked (list too long)</> : ''}
                    </p>
                )}
                {allClear && (
                    <Alert tone="success" className="mt-3">Every car in stock has more than a month left on its MOT.</Alert>
                )}
            </PanelSection>

            {expired.length > 0 && (
                <div>
                    {listHeading('MOT expired', expired.length, 'danger')}
                    <ul className="m-0 list-none divide-y divide-line p-0">
                        {expired.map(alert => (
                            <AlertRow key={alert.vehicleId} alert={alert} tone="expired" />
                        ))}
                    </ul>
                </div>
            )}

            {expiringSoon.length > 0 && (
                <div>
                    {listHeading('Due within 30 days', expiringSoon.length, 'warning')}
                    <ul className="m-0 list-none divide-y divide-line p-0">
                        {expiringSoon.map(alert => (
                            <AlertRow key={alert.vehicleId} alert={alert} tone="soon" />
                        ))}
                    </ul>
                </div>
            )}

            {errors.length > 0 && (
                <details className="group px-4 py-3 text-sm text-ink-3 sm:px-5">
                    <summary className="flex min-h-[44px] cursor-pointer list-none items-center font-semibold text-ink-2 [&::-webkit-details-marker]:hidden">
                        <span className="num me-1">{errors.length}</span> lookup{errors.length === 1 ? '' : 's'} failed
                        <ChevronRightIcon className="ms-auto h-5 w-5 transition-transform duration-quick ease-out group-open:rotate-90" />
                    </summary>
                    <ul className="m-0 mt-1 list-none space-y-2 p-0">
                        {errors.map((e, index) => (
                            <li key={`${e.reg}-${index}`} className="flex flex-wrap items-center gap-2">
                                <Plate reg={e.reg} size="sm" /> <span>{e.message}</span>
                            </li>
                        ))}
                    </ul>
                </details>
            )}
        </Panel>
    );
};

export default MotSweepCard;
