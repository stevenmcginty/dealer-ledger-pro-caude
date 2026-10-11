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
import { ArrowPathIcon, ArrowTopRightOnSquareIcon } from '../icons';
import { Alert, Badge, Button, Field, Plate, buttonClasses } from '../ui';
import { cx } from '../ui/cx';
import { GlobeGlyph, Panel, PanelSection, TextArea } from './SettingsKit';

const ACTION_TONE: Record<string, string> = {
    created: 'text-accent-text',
    updated: 'text-accent-text',
    unchanged: 'text-ink-3',
    skipped: 'text-warning',
    failed: 'text-danger',
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
    <li className="px-4 py-3 sm:px-5">
        <div className="flex items-center gap-3">
            <Plate reg={result.reg} size="sm" />
            <span className="min-w-0 flex-1 truncate text-sm text-ink-2">
                {result.name && result.name !== result.reg ? result.name : ''}
            </span>
            <span className={`flex-none text-end text-sm font-semibold ${ACTION_TONE[result.action] || 'text-ink-3'}`}>
                {describeAction(result.action)}
            </span>
        </div>

        {result.message && (
            <p className="mt-1 text-sm text-warning">{result.message}</p>
        )}

        {result.status && result.status.from !== result.status.to && (
            <p className="mt-1 text-sm text-ink-3">
                On the website: {describeSiteState(result.status.from)} → {describeSiteState(result.status.to)}
            </p>
        )}

        {!!result.changed?.length && (
            <p className="mt-1 text-sm text-ink-3">Filled in: {result.changed.join(', ')}</p>
        )}

        {!!result.kept?.length && (
            <p className="mt-1 text-sm text-ink-3">
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
        <div>
            <div className="px-4 pt-4 sm:px-5">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <h4 className="text-sm font-bold text-ink">{title}</h4>
                    <span className="num text-sm text-ink-3">{formatPushTime(summary.at)}</span>
                </div>
                {counts && (
                    <p className="mt-1 text-sm text-ink-3">
                        <span className="num text-ink-2">{counts.created}</span> added, <span className="num text-ink-2">{counts.updated}</span> updated, <span className="num text-ink-2">{counts.unchanged}</span> already right
                        {counts.skipped ? <>, <span className="num text-ink-2">{counts.skipped}</span> left alone</> : ''}
                        {counts.failed ? <>, <span className="num text-danger">{counts.failed}</span> failed</> : ''}
                    </p>
                )}
            </div>

            {quiet && results.length > 0 && (
                <div className="px-4 pb-4 pt-3 sm:px-5">
                    <Alert tone="success">The website already matches every car in stock.</Alert>
                </div>
            )}

            {!quiet && !!results.length && (
                <ul className="m-0 mt-3 list-none divide-y divide-line border-t border-line p-0">
                    {results.map(result => <ResultRow key={result.reg} result={result} />)}
                </ul>
            )}

            {!results.length && (
                <p className="px-4 pb-4 pt-2 text-sm text-ink-3 sm:px-5">No cars in stock to send.</p>
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
        // No company yet means nothing to link to. Saying so beats a spinner
        // that never resolves.
        if (!companyId) { setLoaded(true); return; }
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

    const linkClass = cx(buttonClasses('ghost', 'md'), 'w-full sm:w-auto');

    return (
        <Panel ariaLabel="Website">
            <PanelSection
                icon={<GlobeGlyph />}
                title="Your website"
                description="Linked, every car you add to stock arrives in your website’s back office already typed up, but not on the site. You add the photos, price and advert there and put it live. After that a deposit slip marks it Reserved and a sales invoice takes it off, on their own."
                action={connector
                    ? <Badge variant={connector.mode === 'live' ? 'success' : 'warning'} dot={connector.mode === 'live'}>{connector.mode === 'live' ? 'Syncing' : 'Dry run only'}</Badge>
                    : loaded ? <Badge>Not linked</Badge> : undefined}
            >
                {error && <Alert tone="danger" title="That didn't work">{error}</Alert>}
                {notice && !error && <Alert tone="info">{notice}</Alert>}
                {!loaded && <p className="text-sm text-ink-3" role="status">Loading…</p>}

                {/* ---- not linked -------------------------------------------- */}
                {loaded && !connector && (
                    <div className={cx('space-y-4', (error || notice) && 'mt-4')}>
                        <Field
                            label="Pairing code"
                            htmlFor="pairing"
                            hint={<>In your website’s back office, open <strong className="font-semibold text-ink-2">Connections</strong>, add a link for this ledger and copy the code. It’s shown once.</>}
                        >
                            <TextArea
                                id="pairing"
                                rows={3}
                                value={pairing}
                                onChange={e => setPairing(e.target.value)}
                                placeholder="Paste the code from your website’s back office"
                                mono
                                spellCheck={false}
                                autoComplete="off"
                            />
                        </Field>
                        <Button onClick={handleLink} loading={busy === 'linking'} disabled={working || !pairing.trim()} className="w-full sm:w-auto">
                            {busy === 'linking' ? 'Connecting…' : 'Connect website'}
                        </Button>
                    </div>
                )}

                {/* ---- linked ------------------------------------------------ */}
                {connector && (
                    <div className={cx('space-y-4', (error || notice) && 'mt-4')}>
                        <dl className="m-0 grid grid-cols-1 gap-x-6 gap-y-2 rounded-control border border-line bg-bg p-3 text-sm sm:grid-cols-2">
                            <div className="flex min-w-0 items-baseline justify-between gap-3">
                                <dt className="text-ink-3">Website</dt>
                                <dd className="m-0 min-w-0 truncate text-end font-mono text-ink">{connector.host || connector.endpoint}</dd>
                            </div>
                            <div className="flex min-w-0 items-baseline justify-between gap-3">
                                <dt className="text-ink-3">Known there as</dt>
                                <dd className="m-0 min-w-0 truncate text-end text-ink">{connector.dealer}</dd>
                            </div>
                        </dl>

                        {connector.mode === 'preview' && (
                            <Alert tone="warning" title="Nothing is being sent yet">
                                Run the dry run, read what it says it would do, and only then start syncing for real.
                            </Alert>
                        )}

                        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                            <Button variant="secondary" onClick={handlePreview} loading={busy === 'preview'} disabled={working && busy !== 'preview'} icon={<ArrowPathIcon />}>
                                {busy === 'preview' ? 'Checking…' : 'Dry run, change nothing'}
                            </Button>

                            {connector.mode === 'preview' ? (
                                <Button onClick={handleGoLive} loading={busy === 'pushing'} disabled={working && busy !== 'pushing'}>
                                    {busy === 'pushing' ? 'Sending…' : 'Start syncing for real'}
                                </Button>
                            ) : (
                                <Button onClick={handlePush} loading={busy === 'pushing'} disabled={working && busy !== 'pushing'}>
                                    {busy === 'pushing' ? 'Sending…' : 'Send all stock now'}
                                </Button>
                            )}

                            <a
                                href={connector.endpoint.replace(/\/api\/ingest\/?$/, '/dashboard.html')}
                                target="_blank"
                                rel="noreferrer"
                                className={linkClass}
                            >
                                <ArrowTopRightOnSquareIcon className="h-5 w-5" />
                                Open the back office
                            </a>
                        </div>

                        {busy === 'pushing' && (
                            <p className="text-sm text-ink-3" role="status">
                                About a second per car in stock. Leave this page open.
                            </p>
                        )}
                    </div>
                )}
            </PanelSection>

            {connector && dryRun && <PushReport summary={dryRun} title="Dry run: nothing was written" />}

            {connector && !dryRun && mostRecent && (
                mostRecent.error
                    ? (
                        <div className="p-4 sm:p-5">
                            <Alert tone="danger" title={mostRecent.error}>
                                Last tried <span className="num">{formatPushTime(mostRecent.at)}</span>. Nothing in the ledger was affected.
                            </Alert>
                        </div>
                    )
                    : (
                        <PushReport
                            summary={mostRecent}
                            title={mostRecent.trigger === 'vehicle' ? 'Last car sent' : 'Last push'}
                        />
                    )
            )}

            {connector && !dryRun && !mostRecent && (
                <p className="px-4 py-4 text-sm text-ink-3 sm:px-5">Nothing sent yet.</p>
            )}

            {connector && (
                <div className="px-4 py-3 sm:px-5">
                    {confirmUnlink ? (
                        <div className="space-y-3 py-1">
                            <p className="text-base font-semibold text-ink">Stop sending stock to {connector.host || 'the website'}?</p>
                            <p className="text-sm leading-5 text-ink-2">
                                Cars already on it stay exactly as they are. Taking an advert down is a decision for whoever is looking at it.
                            </p>
                            <div className="flex flex-col-reverse gap-2 sm:flex-row">
                                <Button variant="secondary" onClick={() => setConfirmUnlink(false)}>Keep it linked</Button>
                                <Button variant="danger" onClick={handleUnlink} loading={busy === 'unlinking'} disabled={working && busy !== 'unlinking'}>
                                    {busy === 'unlinking' ? 'Disconnecting…' : 'Disconnect website'}
                                </Button>
                            </div>
                        </div>
                    ) : (
                        <button
                            type="button"
                            onClick={() => setConfirmUnlink(true)}
                            className="-ms-2 inline-flex min-h-[48px] items-center rounded-control px-2 text-sm font-semibold text-ink-3 transition-colors duration-quick ease-out hover:bg-danger-soft hover:text-danger-ink"
                        >
                            Disconnect this website
                        </button>
                    )}
                </div>
            )}
        </Panel>
    );
};

export default WebsiteConnectorCard;
