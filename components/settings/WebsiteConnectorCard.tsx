import React, { useEffect, useMemo, useState } from 'react';
import { useData } from '../../hooks/useData';
import {
    describeAction,
    describeSiteState,
    formatPushTime,
    linkWebsite,
    previewWebsiteSync,
    pushAllStockNow,
    subscribeToWebsiteConnector,
    unlinkWebsite,
} from '../../services/websiteConnector';
import { WebsiteConnector, WebsitePushSummary, WebsiteVehicleResult } from '../../types';
import Spinner from '../common/Spinner';
import {
    ArrowPathIcon,
    ArrowTopRightOnSquareIcon,
    BuildingStorefrontIcon,
    CheckCircleIcon,
    ExclamationTriangleIcon,
} from '../icons';

const ACTION_TONE: Record<string, string> = {
    created: 'text-brand-300',
    updated: 'text-brand-300',
    unchanged: 'text-gray-500',
    skipped: 'text-amber-400',
    failed: 'text-red-400',
};

/**
 * One car's line in the results table.
 *
 * `kept` is the interesting column and the one worth explaining on screen: it
 * is every box the website refused to let the ledger overwrite because somebody
 * had typed an answer there. Seeing it is how you learn the rule without being
 * told it.
 */
const ResultRow: React.FC<{ result: WebsiteVehicleResult }> = ({ result }) => (
    <li className="py-2 text-sm border-b border-gray-700/50 last:border-0">
        <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
                <span className="font-mono font-semibold text-white">{result.reg}</span>
                {result.name && result.name !== result.reg && (
                    <span className="text-gray-400 ml-2 truncate">{result.name}</span>
                )}
            </div>
            <span className={`flex-shrink-0 text-right text-xs ${ACTION_TONE[result.action] || 'text-gray-400'}`}>
                {describeAction(result.action)}
            </span>
        </div>

        {result.message && (
            <p className="mt-0.5 text-xs text-amber-400/90">{result.message}</p>
        )}

        {result.status && result.status.from !== result.status.to && (
            <p className="mt-0.5 text-xs text-gray-500">
                On the website: {describeSiteState(result.status.from)} → {describeSiteState(result.status.to)}
            </p>
        )}

        {!!result.changed?.length && (
            <p className="mt-0.5 text-xs text-gray-500">Filled in: {result.changed.join(', ')}</p>
        )}

        {!!result.kept?.length && (
            <p className="mt-0.5 text-xs text-gray-500">
                Left as typed on the website: {result.kept.join(', ')}
            </p>
        )}
    </li>
);

const PushReport: React.FC<{ summary: WebsitePushSummary; title: string }> = ({ summary, title }) => {
    const results = summary.results || [];
    const counts = summary.counts;

    // A push where nothing needed doing is the normal state of affairs once the
    // link has settled down, and it should read as reassuring rather than empty.
    const quiet = results.every(r => r.action === 'unchanged');

    return (
        <div className="mt-4">
            <div className="flex items-baseline justify-between gap-3">
                <h3 className="text-sm font-semibold text-gray-200">{title}</h3>
                <span className="text-xs text-gray-500">{formatPushTime(summary.at)}</span>
            </div>

            {counts && (
                <p className="mt-1 text-xs text-gray-500">
                    {counts.created} added, {counts.updated} updated, {counts.unchanged} already right
                    {counts.skipped ? `, ${counts.skipped} left alone` : ''}
                    {counts.failed ? `, ${counts.failed} failed` : ''}
                </p>
            )}

            {quiet && results.length > 0 && (
                <div className="mt-3 p-3 rounded-lg bg-green-900/50 flex items-center gap-3">
                    <CheckCircleIcon className="h-5 w-5 text-green-400 flex-shrink-0" />
                    <p className="text-sm text-gray-300">
                        The website already matches every car in stock.
                    </p>
                </div>
            )}

            {!quiet && !!results.length && (
                <ul className="mt-2">
                    {results.map(result => <ResultRow key={result.reg} result={result} />)}
                </ul>
            )}

            {!results.length && (
                <p className="mt-2 text-sm text-gray-500">No cars in stock to send.</p>
            )}
        </div>
    );
};

/**
 * Pairing this ledger with a dealer website.
 *
 * A car is bought and typed up here; weeks later it needs advertising, and
 * until now that meant typing the same car in twice. Linked, it arrives on the
 * website's back office already filled in and sitting as Not published — the
 * advert, the photos and the price are still a decision somebody makes there,
 * and nothing this ledger does can put a car in front of a customer on its own.
 * What it does own is the other direction: a deposit slip says Reserved and a
 * sales invoice takes the car off the site, without anyone having to remember.
 */
const WebsiteConnectorCard = () => {
    const { companyId } = useData();
    const [connector, setConnector] = useState<WebsiteConnector | null>(null);
    const [loaded, setLoaded] = useState(false);

    const [pairing, setPairing] = useState('');
    const [busy, setBusy] = useState<'' | 'linking' | 'preview' | 'pushing' | 'unlinking'>('');
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [dryRun, setDryRun] = useState<WebsitePushSummary | null>(null);
    const [confirmUnlink, setConfirmUnlink] = useState(false);

    useEffect(() => {
        if (!companyId) return;
        return subscribeToWebsiteConnector(companyId, next => {
            setConnector(next);
            setLoaded(true);
        });
    }, [companyId]);

    const run = async (job: typeof busy, work: () => Promise<void>) => {
        setBusy(job);
        setError(null);
        setNotice(null);
        try {
            await work();
        } catch (err: any) {
            setError(err?.message || 'That did not work.');
        } finally {
            setBusy('');
        }
    };

    const handleLink = () => run('linking', async () => {
        await linkWebsite(pairing);
        setPairing('');
        setNotice('Connected. Nothing has been sent yet — run the dry run below to see exactly what would happen.');
    });

    const handlePreview = () => run('preview', async () => {
        const summary = await previewWebsiteSync();
        setDryRun(summary);
        setNotice('Nothing was written. This is what a real push would do.');
    });

    const handleGoLive = () => run('pushing', async () => {
        const summary = await pushAllStockNow(true);
        setDryRun(null);
        setNotice(`Sent. ${summary.counts?.created || 0} cars are now in the website's back office as Not published — put them live from there when the photos are ready.`);
    });

    const handlePush = () => run('pushing', async () => {
        await pushAllStockNow(false);
        setNotice('Stock sent.');
    });

    const handleUnlink = () => run('unlinking', async () => {
        await unlinkWebsite();
        setConfirmUnlink(false);
        setDryRun(null);
        setNotice('Disconnected. The cars already on the website were left exactly where they are.');
    });

    const latest = connector?.log?.latest;
    const lastVehicle = connector?.log?.lastVehiclePush;

    /* The most recent thing that happened, whichever of the two logs it was in. */
    const mostRecent = useMemo(() => {
        if (!latest) return lastVehicle;
        if (!lastVehicle) return latest;
        return lastVehicle.at > latest.at ? lastVehicle : latest;
    }, [latest, lastVehicle]);

    const working = busy !== '';

    return (
        <div className="bg-gray-800 p-6 rounded-lg shadow-lg">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                        <BuildingStorefrontIcon className="h-5 w-5 text-brand-400" />
                        Your website
                    </h2>
                    <p className="text-sm text-gray-400 mt-1">
                        Link this ledger to your website and every car you add to stock arrives in its
                        back office already typed up — but not on the site. You add the photos, the
                        price and the advert there, then put it live yourself. After that a deposit
                        slip marks it Reserved and a sales invoice takes it off, on their own.
                    </p>
                </div>
                {connector && (
                    <span className={`flex-shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${
                        connector.mode === 'live'
                            ? 'bg-green-900/60 text-green-300'
                            : 'bg-amber-900/60 text-amber-300'
                    }`}>
                        {connector.mode === 'live' ? 'Syncing' : 'Dry run only'}
                    </span>
                )}
            </div>

            {error && (
                <div className="mt-4 p-3 rounded-lg bg-red-900/50 flex items-start gap-3">
                    <ExclamationTriangleIcon className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-gray-300">{error}</p>
                </div>
            )}

            {notice && !error && (
                <div className="mt-4 p-3 rounded-lg bg-brand-900/40 flex items-start gap-3">
                    <CheckCircleIcon className="h-5 w-5 text-brand-400 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-gray-300">{notice}</p>
                </div>
            )}

            {/* ---- not linked -------------------------------------------- */}
            {loaded && !connector && (
                <div className="mt-4 space-y-3">
                    <label htmlFor="pairing" className="block text-sm font-medium text-gray-300">
                        Pairing code
                    </label>
                    <textarea
                        id="pairing"
                        rows={3}
                        value={pairing}
                        onChange={e => setPairing(e.target.value)}
                        placeholder="Paste the code from your website's back office"
                        className="block w-full bg-gray-700 border-gray-600 rounded-md py-2 px-3 text-white font-mono text-xs"
                    />
                    <p className="text-xs text-gray-500">
                        In your website's back office, open <strong>Connections</strong>, add a link for
                        this ledger and copy the code it shows you. It is shown once.
                    </p>
                    <button
                        onClick={handleLink}
                        disabled={working || !pairing.trim()}
                        className="inline-flex items-center justify-center gap-x-2 rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-500 disabled:opacity-50"
                    >
                        {busy === 'linking' && <Spinner className="h-5 w-5" />}
                        {busy === 'linking' ? 'Connecting…' : 'Connect website'}
                    </button>
                </div>
            )}

            {/* ---- linked ------------------------------------------------ */}
            {connector && (
                <div className="mt-4 space-y-4">
                    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-sm">
                        <div className="flex justify-between gap-2">
                            <dt className="text-gray-400">Website</dt>
                            <dd className="text-right text-gray-200 font-mono text-xs">{connector.host || connector.endpoint}</dd>
                        </div>
                        <div className="flex justify-between gap-2">
                            <dt className="text-gray-400">Known there as</dt>
                            <dd className="text-right text-gray-200">{connector.dealer}</dd>
                        </div>
                    </dl>

                    {connector.mode === 'preview' && (
                        <div className="p-3 rounded-lg bg-amber-900/30 text-sm text-gray-300">
                            <p>
                                Nothing is being sent yet. Run the dry run, read what it says it would do,
                                and only then start syncing for real.
                            </p>
                        </div>
                    )}

                    <div className="flex flex-wrap gap-2">
                        <button
                            onClick={handlePreview}
                            disabled={working}
                            className="inline-flex items-center gap-x-2 rounded-md bg-gray-700 px-4 py-2 text-sm font-semibold text-gray-200 hover:bg-gray-600 disabled:opacity-50"
                        >
                            {busy === 'preview' ? <Spinner className="h-5 w-5" /> : <ArrowPathIcon className="h-5 w-5" />}
                            {busy === 'preview' ? 'Checking…' : 'Dry run — change nothing'}
                        </button>

                        {connector.mode === 'preview' ? (
                            <button
                                onClick={handleGoLive}
                                disabled={working}
                                className="inline-flex items-center gap-x-2 rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-500 disabled:opacity-50"
                            >
                                {busy === 'pushing' && <Spinner className="h-5 w-5" />}
                                {busy === 'pushing' ? 'Sending…' : 'Start syncing for real'}
                            </button>
                        ) : (
                            <button
                                onClick={handlePush}
                                disabled={working}
                                className="inline-flex items-center gap-x-2 rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-500 disabled:opacity-50"
                            >
                                {busy === 'pushing' && <Spinner className="h-5 w-5" />}
                                {busy === 'pushing' ? 'Sending…' : 'Push all stock now'}
                            </button>
                        )}

                        <a
                            href={connector.endpoint.replace(/\/api\/ingest\/?$/, '/dashboard.html')}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-x-2 rounded-md px-4 py-2 text-sm font-semibold text-gray-400 hover:text-gray-200"
                        >
                            <ArrowTopRightOnSquareIcon className="h-5 w-5" />
                            Open the back office
                        </a>
                    </div>

                    {busy === 'pushing' && (
                        <p className="text-xs text-gray-500">
                            About a second per car in stock — leave the page open.
                        </p>
                    )}

                    {dryRun && <PushReport summary={dryRun} title="Dry run — nothing was written" />}

                    {!dryRun && mostRecent && (
                        mostRecent.error
                            ? (
                                <div className="mt-4 p-3 rounded-lg bg-red-900/50 flex items-start gap-3">
                                    <ExclamationTriangleIcon className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
                                    <div>
                                        <p className="text-sm text-gray-300">{mostRecent.error}</p>
                                        <p className="text-xs text-gray-500 mt-1">
                                            Last tried {formatPushTime(mostRecent.at)}. Nothing in the ledger was
                                            affected.
                                        </p>
                                    </div>
                                </div>
                            )
                            : (
                                <PushReport
                                    summary={mostRecent}
                                    title={mostRecent.trigger === 'vehicle' ? 'Last car sent' : 'Last push'}
                                />
                            )
                    )}

                    {!dryRun && !mostRecent && (
                        <p className="text-sm text-gray-500">Nothing sent yet.</p>
                    )}

                    <div className="pt-2 border-t border-gray-700">
                        {confirmUnlink ? (
                            <div className="flex flex-wrap items-center gap-3">
                                <p className="text-sm text-gray-300">
                                    Stop sending stock to {connector.host || 'the website'}? Cars already on
                                    it stay exactly as they are — taking an advert down is a decision for
                                    whoever is looking at it.
                                </p>
                                <button
                                    onClick={handleUnlink}
                                    disabled={working}
                                    className="rounded-md bg-red-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-600 disabled:opacity-50"
                                >
                                    {busy === 'unlinking' ? 'Disconnecting…' : 'Yes, disconnect'}
                                </button>
                                <button
                                    onClick={() => setConfirmUnlink(false)}
                                    className="text-sm text-gray-400 hover:text-gray-200"
                                >
                                    Keep it
                                </button>
                            </div>
                        ) : (
                            <button
                                onClick={() => setConfirmUnlink(true)}
                                className="text-sm text-gray-500 hover:text-red-400"
                            >
                                Disconnect this website
                            </button>
                        )}
                    </div>
                </div>
            )}

            {!loaded && <p className="mt-4 text-sm text-gray-500">Loading…</p>}
        </div>
    );
};

export default WebsiteConnectorCard;
