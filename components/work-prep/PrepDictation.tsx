import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useData } from '../../hooks/useData';
import { Badge, Button, Checkbox, IconButton, Input, Plate, Search, Sheet, useToast } from '../ui';
import Spinner from '../common/Spinner';
import { ArrowPathIcon, ExclamationTriangleIcon, PlusIcon, TrashIcon, XMarkIcon } from '../icons';
import { parsePrepDictation } from '../../utils/ai';
import {
    WAV_SAMPLE_RATE,
    encodeWav16kMono,
    isOpenPrepDuplicate,
    mergeByCar,
    resolvePrepCars,
    searchStock,
    toPrepToDos,
    toStockList,
    type AudioBufferLike,
    type PrepCarGroup,
    type PrepCarStatus,
    type PrepStockCar,
} from '../../utils/prepDictation';

/**
 * Prep dictation: a quiet mic button for the Dashboard's Vehicle Prep panel.
 * Steve taps it, talks about the prep jobs while he walks round the cars,
 * taps stop, checks the list Gemini made, and adds it to prep. Nothing saves
 * before that last tap. The overlay belongs to this component (no modal
 * registry entry).
 */

const MAX_RECORDING_MS = 3 * 60 * 1000;
/** Anything shorter than this is a mis-tap, not a recording. */
const MIN_RECORDING_SECONDS = 0.6;

type Phase = 'closed' | 'starting' | 'recording' | 'working' | 'check' | 'error';
type ErrorKind = 'mic' | 'noMic' | 'unsupported' | 'audio' | 'ai' | 'empty';

const ERROR_TEXT: Record<ErrorKind, { title: string; body: string }> = {
    mic: { title: 'Microphone blocked', body: 'Allow the microphone in your browser settings, then try again.' },
    noMic: { title: 'No microphone', body: "The microphone didn't start. Check nothing else is using it, then try again." },
    unsupported: { title: "Can't record here", body: "This browser can't record audio on this page." },
    audio: { title: "Couldn't read the recording", body: 'Something went wrong with the recording. Try again.' },
    ai: { title: "Couldn't work it out", body: 'The recording could not be turned into jobs. Check your signal and try again.' },
    empty: { title: 'Nothing heard', body: "I didn't catch any jobs. Try again." },
};

interface CardJob {
    id: string;
    text: string;
    urgent: boolean;
    include: boolean;
}

interface Card {
    key: string;
    spokenAs: string;
    status: PrepCarStatus;
    candidateIds: string[];
    vehicleId?: string;
    skipped: boolean;
    /** Showing the search over all stock (unknown car, or "Another car"). */
    searching: boolean;
    jobs: CardJob[];
}

let idSeq = 0;
const nextId = (prefix: string) => `${prefix}${Date.now().toString(36)}${(idSeq++).toString(36)}`;

const toCard = (g: PrepCarGroup): Card => ({
    key: nextId('c'),
    spokenAs: g.spokenAs,
    status: g.status,
    candidateIds: g.candidateIds,
    vehicleId: g.vehicleId,
    skipped: false,
    searching: g.status === 'unknown',
    jobs: g.jobs.map(j => ({ id: nextId('j'), text: j.text, urgent: j.urgent, include: true })),
});

const formatClock = (ms: number) => {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

const pickMimeType = (): string | undefined => {
    if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') return undefined;
    return ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find(t => MediaRecorder.isTypeSupported(t));
};

/** Decode whatever the browser recorded (webm/opus or mp4) and re-encode as 16 kHz mono WAV. */
const recordingToWav = async (blob: Blob): Promise<{ wav: Blob; seconds: number }> => {
    const data = await blob.arrayBuffer();
    const Ctx: typeof AudioContext = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    let decoded: AudioBuffer;
    try {
        decoded = await ctx.decodeAudioData(data);
    } finally {
        if (typeof ctx.close === 'function') ctx.close().catch(() => undefined);
    }
    let pcm: AudioBufferLike = decoded;
    try {
        const offline = new OfflineAudioContext(1, Math.max(1, Math.ceil(decoded.duration * WAV_SAMPLE_RATE)), WAV_SAMPLE_RATE);
        const source = offline.createBufferSource();
        source.buffer = decoded;
        source.connect(offline.destination);
        source.start();
        pcm = await offline.startRendering();
    } catch {
        // Some browsers refuse a 16 kHz offline context; the encoder resamples itself.
    }
    return { wav: new Blob([encodeWav16kMono(pcm)], { type: 'audio/wav' }), seconds: decoded.duration };
};

/**
 * A plain microphone. The shared MicrophoneIcon in components/icons.tsx draws
 * the mic inside a circle, which at 20px reads as a power button.
 */
const MicIcon = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className} aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
    </svg>
);

// Same mic, stroked in Gemini's multi-colour gradient. useId keeps the gradient id unique on the page.
const GeminiMicIcon = ({ className }: { className?: string }) => {
    const gradientId = `gemini-mic-${React.useId().replace(/:/g, '')}`;
    return (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.9} stroke={`url(#${gradientId})`} className={className} aria-hidden="true">
            <defs>
                <linearGradient id={gradientId} x1="9" y1="2" x2="15" y2="22" gradientUnits="userSpaceOnUse">
                    <stop offset="0" stopColor="#4285F4" />
                    <stop offset="0.28" stopColor="#4285F4" />
                    <stop offset="0.5" stopColor="#EA4335" />
                    <stop offset="0.7" stopColor="#FBBC04" />
                    <stop offset="0.9" stopColor="#34A853" />
                </linearGradient>
            </defs>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
        </svg>
    );
};

const CheckMark = ({ className }: { className?: string }) => (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={2.5} className={className} aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 10.5l3.5 3.5 7.5-8" />
    </svg>
);

const carLine = (car: PrepStockCar) => [`${car.make} ${car.model}`.trim(), car.colour].filter(Boolean).join(' · ');

const PrepDictation = () => {
    const { vehicles, todos, addToDo } = useData();
    const toast = useToast();

    const stockList = useMemo(() => toStockList(vehicles), [vehicles]);
    const stockById = useMemo(() => new Map(stockList.map(c => [c.id, c])), [stockList]);
    const stockRef = useRef(stockList);
    stockRef.current = stockList;

    const [phase, setPhase] = useState<Phase>('closed');
    const [error, setError] = useState<ErrorKind | null>(null);
    const [elapsed, setElapsed] = useState(0);
    const [cards, setCards] = useState<Card[]>([]);
    const [transcripts, setTranscripts] = useState<string[]>([]);
    const [editingJobId, setEditingJobId] = useState<string | null>(null);
    const [editText, setEditText] = useState('');
    const [searchText, setSearchText] = useState<Record<string, string>>({});
    const [confirmDiscard, setConfirmDiscard] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    const recorderRef = useRef<MediaRecorder | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const chunksRef = useRef<Blob[]>([]);
    const timerRef = useRef<number | null>(null);
    const wakeLockRef = useRef<WakeLockSentinel | null>(null);
    const cancelledRef = useRef(false);
    const lastWavRef = useRef<Blob | null>(null);
    /** Bumped whenever a recording or a Gemini call is abandoned, so a late result is ignored. */
    const runRef = useRef(0);
    /** What the sheet last showed, so it keeps its content while it slides away. */
    const shownRef = useRef<{ body: React.ReactNode; footer: React.ReactNode }>({ body: null, footer: null });

    const isOpen = phase !== 'closed';
    const isRecording = phase === 'recording';

    const releaseMic = useCallback(() => {
        if (timerRef.current !== null) {
            window.clearInterval(timerRef.current);
            timerRef.current = null;
        }
        streamRef.current?.getTracks().forEach(t => t.stop());
        streamRef.current = null;
        wakeLockRef.current?.release().catch(() => undefined);
        wakeLockRef.current = null;
    }, []);

    const fail = useCallback((kind: ErrorKind) => {
        setError(kind);
        setPhase('error');
    }, []);

    const analyse = useCallback(async (wav: Blob) => {
        const run = runRef.current;
        setPhase('working');
        let groups: PrepCarGroup[];
        let transcript = '';
        try {
            const result = await parsePrepDictation(wav, stockRef.current);
            if (run !== runRef.current) return;
            transcript = result.transcript;
            groups = resolvePrepCars(result, stockRef.current);
        } catch {
            if (run === runRef.current) fail('ai');
            return;
        }
        if (groups.length === 0) {
            fail('empty');
            return;
        }
        lastWavRef.current = null;
        setCards(prev => mergeByCar([...prev, ...groups.map(toCard)]));
        if (transcript) setTranscripts(prev => [...prev, transcript]);
        setError(null);
        setPhase('check');
    }, [fail]);

    const handleStopped = useCallback(async () => {
        const recorder = recorderRef.current;
        recorderRef.current = null;
        releaseMic();
        if (cancelledRef.current) return;
        const run = runRef.current;
        const blob = new Blob(chunksRef.current, { type: recorder?.mimeType || 'audio/webm' });
        chunksRef.current = [];
        setPhase('working');
        let wav: Blob;
        let seconds: number;
        try {
            ({ wav, seconds } = await recordingToWav(blob));
        } catch {
            if (run === runRef.current) fail('audio');
            return;
        }
        if (run !== runRef.current) return;
        if (seconds < MIN_RECORDING_SECONDS) {
            fail('empty');
            return;
        }
        lastWavRef.current = wav;
        await analyse(wav);
    }, [analyse, fail, releaseMic]);

    const stopRecording = useCallback(() => {
        const recorder = recorderRef.current;
        if (recorder && recorder.state !== 'inactive') recorder.stop();
    }, []);

    const startRecording = useCallback(async () => {
        setError(null);
        setConfirmDiscard(false);
        setEditingJobId(null);
        if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
            fail('unsupported');
            return;
        }
        setPhase('starting');
        const run = runRef.current;
        let stream: MediaStream;
        try {
            stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch (e) {
            if (run !== runRef.current) return;
            const name = e instanceof Error ? e.name : '';
            fail(name === 'NotAllowedError' || name === 'SecurityError' ? 'mic' : 'noMic');
            return;
        }
        if (run !== runRef.current) {
            // Closed while the permission prompt was up.
            stream.getTracks().forEach(t => t.stop());
            return;
        }
        streamRef.current = stream;
        cancelledRef.current = false;
        chunksRef.current = [];

        let recorder: MediaRecorder;
        try {
            const mimeType = pickMimeType();
            recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
        } catch {
            releaseMic();
            fail('unsupported');
            return;
        }
        recorder.ondataavailable = e => {
            if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
        };
        // Only the live recorder's stop counts; a cancelled one has already been let go.
        recorder.onstop = () => { if (recorderRef.current === recorder) void handleStopped(); };
        recorderRef.current = recorder;
        recorder.start();

        const startedAt = Date.now();
        setElapsed(0);
        setPhase('recording');
        timerRef.current = window.setInterval(() => {
            const ms = Date.now() - startedAt;
            setElapsed(ms);
            if (ms >= MAX_RECORDING_MS) stopRecording();
        }, 250);

        try {
            if ('wakeLock' in navigator) {
                const lock = await navigator.wakeLock.request('screen');
                if (recorderRef.current === recorder) wakeLockRef.current = lock;
                else lock.release().catch(() => undefined);
            }
        } catch {
            // Wake lock is a nicety; recording works without it.
        }
    }, [fail, handleStopped, releaseMic, stopRecording]);

    /** Abandon whatever is in flight: the mic, the recording, a pending Gemini call. */
    const cancelRun = useCallback(() => {
        runRef.current += 1;
        cancelledRef.current = true;
        const recorder = recorderRef.current;
        if (recorder && recorder.state !== 'inactive') recorder.stop();
        recorderRef.current = null;
        releaseMic();
    }, [releaseMic]);

    const resetAll = useCallback(() => {
        cancelRun();
        lastWavRef.current = null;
        setCards([]);
        setTranscripts([]);
        setSearchText({});
        setEditingJobId(null);
        setConfirmDiscard(false);
        setError(null);
        setPhase('closed');
    }, [cancelRun]);

    // Stop the mic if the page goes away mid-recording.
    useEffect(() => () => {
        cancelledRef.current = true;
        const recorder = recorderRef.current;
        if (recorder && recorder.state !== 'inactive') recorder.stop();
        releaseMic();
    }, [releaseMic]);

    const handleMicButton = () => {
        if (isRecording) stopRecording();
        else if (phase === 'closed') void startRecording();
    };

    const handleClose = () => {
        if (phase === 'recording' || phase === 'starting' || phase === 'working') {
            // Mid "Record more": drop this recording, keep the list.
            if (cards.length > 0) {
                cancelRun();
                setPhase('check');
            } else {
                resetAll();
            }
            return;
        }
        const hasJobs = cards.some(c => c.jobs.length > 0);
        if (hasJobs && !confirmDiscard) {
            setConfirmDiscard(true);
            return;
        }
        resetAll();
    };

    // --- Card edits ---
    const updateCard = (key: string, fn: (c: Card) => Card) => {
        setCards(prev => mergeByCar(prev.map(c => (c.key === key ? fn(c) : c))));
    };
    const updateJob = (cardKey: string, jobId: string, fn: (j: CardJob) => CardJob | null) => {
        updateCard(cardKey, c => ({
            ...c,
            jobs: c.jobs.map(j => (j.id === jobId ? fn(j) : j)).filter((j): j is CardJob => j !== null),
        }));
    };
    const chooseCar = (cardKey: string, vehicleId: string) => {
        updateCard(cardKey, c => ({ ...c, vehicleId, searching: false, skipped: false }));
        setSearchText(prev => ({ ...prev, [cardKey]: '' }));
    };
    const beginEdit = (job: CardJob) => {
        setEditingJobId(job.id);
        setEditText(job.text);
    };
    const commitEdit = (cardKey: string, jobId: string) => {
        const text = editText.replace(/\s+/g, ' ').trim();
        updateJob(cardKey, jobId, j => (text ? { ...j, text } : null));
        setEditingJobId(null);
    };
    const addLine = (cardKey: string) => {
        const id = nextId('j');
        updateCard(cardKey, c => ({ ...c, jobs: [...c.jobs, { id, text: '', urgent: false, include: true }] }));
        setEditingJobId(id);
        setEditText('');
    };

    const toSave = useMemo(
        () => toPrepToDos(cards.map(c => ({ vehicleId: c.vehicleId, skipped: c.skipped, jobs: c.jobs })), todos, vehicles),
        [cards, todos, vehicles],
    );
    const cardsNeedingCar = cards.filter(c => !c.skipped && !c.vehicleId && c.jobs.length > 0).length;
    const canSave = cardsNeedingCar === 0 && toSave.length > 0 && !isSaving;

    const handleSave = async () => {
        if (!canSave) return;
        setIsSaving(true);
        try {
            await Promise.all(toSave.map(item => addToDo(item)));
            toast.success(`Added ${toSave.length} prep job${toSave.length === 1 ? '' : 's'}`);
            resetAll();
        } catch (e) {
            toast.error(`Couldn't add the jobs: ${e instanceof Error ? e.message : String(e)}`);
        } finally {
            setIsSaving(false);
        }
    };

    // --- Rendering ---
    const renderCarHeader = (card: Card) => {
        if (card.skipped) {
            return (
                <div className="flex items-center justify-between gap-3 py-1 pe-1 ps-4">
                    <p className="min-w-0 truncate text-sm text-ink-3">
                        Skipped{card.spokenAs ? <> · <span className="text-ink-2">{card.spokenAs}</span></> : null}
                    </p>
                    <Button variant="ghost" onClick={() => updateCard(card.key, c => ({ ...c, skipped: false }))} className="shrink-0">
                        Undo
                    </Button>
                </div>
            );
        }

        const chosen = card.vehicleId ? stockById.get(card.vehicleId) : undefined;
        if (chosen) {
            return (
                <div className="flex items-start justify-between gap-3 pb-3 pe-1 ps-4 pt-3">
                    <div className="min-w-0 pt-1">
                        {chosen.reg ? <Plate reg={chosen.reg} /> : <p className="text-base font-semibold text-ink">No reg</p>}
                        <p className="mt-1.5 truncate text-sm text-ink-2">
                            {carLine(chosen)}{chosen.stockNumber ? <span className="font-mono tabular-nums text-ink-3"> · {chosen.stockNumber}</span> : null}
                        </p>
                    </div>
                    <Button variant="ghost" onClick={() => updateCard(card.key, c => ({ ...c, vehicleId: undefined, searching: c.candidateIds.length < 2 }))} className="shrink-0">
                        Change
                    </Button>
                </div>
            );
        }

        const candidates = card.candidateIds.map(id => stockById.get(id)).filter((c): c is PrepStockCar => !!c);
        const showSearch = card.searching || candidates.length < 2;
        const query = searchText[card.key] || '';
        const results = showSearch ? searchStock(stockList, query, 6) : [];

        return (
            <div className="px-4 pb-2 pt-4">
                <p className="text-base font-semibold text-ink">
                    {showSearch ? 'Which car?' : `Which ${card.spokenAs.replace(/^the\s+/i, '') || 'car'}?`}
                </p>
                <p className="mt-0.5 text-sm text-ink-2">
                    {showSearch
                        ? (card.spokenAs ? <>Heard “{card.spokenAs}”</> : 'Pick the car for these jobs')
                        : `${candidates.length} cars fit. Pick one.`}
                </p>

                {showSearch ? (
                    <div className="mt-3">
                        <Search
                            value={query}
                            onChange={value => setSearchText(prev => ({ ...prev, [card.key]: value }))}
                            label="Search stock"
                            placeholder="Reg, make or model"
                            inputMode="search"
                            autoComplete="off"
                        />
                        <div className="mt-2 space-y-2">
                            {results.map(car => (
                                <CarChoice key={car.id} car={car} onPick={() => chooseCar(card.key, car.id)} />
                            ))}
                            {results.length === 0 && <p className="px-1 py-2 text-sm text-ink-3">No car in stock matches.</p>}
                        </div>
                    </div>
                ) : (
                    <div className="mt-3 space-y-2">
                        {candidates.map(car => (
                            <CarChoice key={car.id} car={car} onPick={() => chooseCar(card.key, car.id)} />
                        ))}
                    </div>
                )}

                <div className="mt-1 flex items-center justify-between">
                    {candidates.length > 1 ? (
                        <Button variant="ghost" onClick={() => updateCard(card.key, c => ({ ...c, searching: !showSearch }))} className="-ms-3">
                            {showSearch ? 'Back to the cars that fit' : 'Another car'}
                        </Button>
                    ) : <span />}
                    <Button variant="ghost" onClick={() => updateCard(card.key, c => ({ ...c, skipped: true }))} className="-me-3">
                        Skip
                    </Button>
                </div>
            </div>
        );
    };

    const renderJob = (card: Card, job: CardJob) => {
        const editing = editingJobId === job.id;
        const duplicate = !!card.vehicleId && isOpenPrepDuplicate(job.text, card.vehicleId, todos);
        return (
            <li key={job.id} className="flex items-center gap-1 px-1">
                <Checkbox
                    checked={job.include}
                    onChange={() => updateJob(card.key, job.id, j => ({ ...j, include: !j.include }))}
                    aria-label={job.text || 'New job'}
                    className="h-12 w-12 shrink-0 place-items-center"
                />
                <div className="min-w-0 flex-1 py-1.5">
                    {editing ? (
                        <Input
                            autoFocus
                            value={editText}
                            onChange={e => setEditText(e.target.value)}
                            onBlur={() => commitEdit(card.key, job.id)}
                            onKeyDown={e => {
                                if (e.key === 'Enter') { e.preventDefault(); commitEdit(card.key, job.id); }
                                if (e.key === 'Escape') { e.preventDefault(); if (!job.text) updateJob(card.key, job.id, () => null); setEditingJobId(null); }
                            }}
                            placeholder="Job, e.g. Valet"
                            aria-label="Job text"
                        />
                    ) : (
                        <button type="button" onClick={() => beginEdit(job)} className={`block min-h-[44px] w-full rounded-control px-1 py-2 text-start text-base leading-snug ${job.include ? 'text-ink' : 'text-ink-3 line-through'}`}>
                            {job.text}
                            {job.urgent && <Badge variant="danger" size="sm" className="ms-2 align-middle">Urgent</Badge>}
                            {duplicate && <Badge size="sm" className="ms-2 align-middle">Already in prep</Badge>}
                        </button>
                    )}
                </div>
                <IconButton
                    label="Delete job"
                    icon={<TrashIcon />}
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => { if (editing) setEditingJobId(null); updateJob(card.key, job.id, () => null); }}
                    className="hover:text-danger"
                />
            </li>
        );
    };

    const renderBody = () => {
        if (phase === 'starting') {
            return (
                <div className="flex flex-1 flex-col items-center justify-center gap-3 py-16 text-center">
                    <Spinner className="h-7 w-7 text-ink-3" />
                    <p className="text-sm text-ink-2">Starting the microphone…</p>
                </div>
            );
        }
        if (phase === 'recording') {
            const left = Math.max(0, MAX_RECORDING_MS - elapsed);
            return (
                <div className="flex flex-1 flex-col items-center justify-center px-2 py-10 text-center">
                    <div className="flex items-center gap-2.5">
                        <span className="relative flex h-3 w-3">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-danger opacity-60" />
                            <span className="relative inline-flex h-3 w-3 rounded-full bg-danger" />
                        </span>
                        <span className="text-sm font-semibold text-danger-ink">Recording</span>
                    </div>
                    <p className="mt-4 font-mono text-5xl font-semibold tabular-nums text-ink">{formatClock(elapsed)}</p>
                    <p className="mt-2 text-xs text-ink-3">{left < 30000 ? `Stops in ${Math.ceil(left / 1000)}s` : 'Up to 3 minutes'}</p>
                    <p className="mt-8 max-w-xs text-sm leading-relaxed text-ink-2">
                        Say the car, then its jobs.<br />
                        <span className="text-ink-3">“The black Porsche needs a valet and a nearside tyre.”</span>
                    </p>
                    <button
                        type="button"
                        onClick={stopRecording}
                        aria-label="Stop recording"
                        className="mt-10 flex h-20 w-20 items-center justify-center rounded-full bg-danger shadow-[0_0_0_6px_rgb(var(--c-danger-soft))] transition-[background-color,transform] duration-quick ease-out hover:bg-danger-hover active:scale-95 active:duration-press"
                    >
                        <span className="h-7 w-7 rounded-md bg-on-danger" />
                    </button>
                    <p className="mt-3 text-sm font-medium text-ink-2">Tap to stop</p>
                </div>
            );
        }
        if (phase === 'working') {
            return (
                <div className="flex flex-1 flex-col items-center justify-center gap-3 py-16 text-center">
                    <Spinner className="h-8 w-8 text-accent-text" />
                    <p className="text-base font-semibold text-ink">Working it out…</p>
                    <p className="text-sm text-ink-3">Matching the jobs to your stock</p>
                </div>
            );
        }
        if (phase === 'error' && error) {
            const text = ERROR_TEXT[error];
            const canResend = error === 'ai' && !!lastWavRef.current;
            return (
                <div className="flex flex-1 flex-col items-center justify-center px-2 py-14 text-center">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-warning-soft">
                        <ExclamationTriangleIcon className="h-6 w-6 text-warning-ink" />
                    </div>
                    <p className="mt-4 text-base font-semibold text-ink">{text.title}</p>
                    <p className="mt-1 max-w-xs text-sm text-ink-2">{text.body}</p>
                    <div className="mt-6 flex w-full max-w-xs flex-col gap-2">
                        {error !== 'unsupported' && (
                            <Button
                                block
                                icon={canResend ? <ArrowPathIcon /> : <MicIcon />}
                                onClick={() => (canResend ? void analyse(lastWavRef.current!) : void startRecording())}
                            >
                                Try again
                            </Button>
                        )}
                        <Button
                            variant="secondary"
                            block
                            onClick={() => (cards.length > 0 ? (setError(null), setPhase('check')) : resetAll())}
                        >
                            {cards.length > 0 ? 'Back to the list' : 'Close'}
                        </Button>
                    </div>
                </div>
            );
        }
        if (phase === 'check') {
            return (
                <div className="space-y-3">
                    {cards.map(card => (
                        <section key={card.key} className={`overflow-hidden rounded-card border bg-surface ${!card.skipped && !card.vehicleId ? 'border-warning' : 'border-line'}`}>
                            {renderCarHeader(card)}
                            {!card.skipped && (
                                <>
                                    <ul className="divide-y divide-line border-t border-line">
                                        {card.jobs.map(job => renderJob(card, job))}
                                    </ul>
                                    <div className="border-t border-line px-1">
                                        <Button variant="ghost" icon={<PlusIcon />} onClick={() => addLine(card.key)}>
                                            Add line
                                        </Button>
                                    </div>
                                </>
                            )}
                        </section>
                    ))}
                    {transcripts.length > 0 && (
                        <div className="px-1 pt-2">
                            <p className="text-xs font-semibold text-ink-3">What I heard</p>
                            {transcripts.map((t, i) => (
                                <p key={i} className="mt-1 text-sm leading-relaxed text-ink-2">{t}</p>
                            ))}
                        </div>
                    )}
                </div>
            );
        }
        return null;
    };

    const jobCountLabel = `Add ${toSave.length} job${toSave.length === 1 ? '' : 's'} to prep`;

    const renderFooter = () => {
        if (phase !== 'check') return null;
        if (confirmDiscard) {
            return (
                <div className="w-full">
                    <p className="mb-2 text-sm font-semibold text-ink">Discard this list?</p>
                    <div className="flex gap-2">
                        <Button variant="secondary" onClick={() => setConfirmDiscard(false)} className="flex-1">Keep list</Button>
                        <Button variant="danger" onClick={resetAll} className="flex-1">Discard list</Button>
                    </div>
                </div>
            );
        }
        return (
            <div className="w-full">
                {cardsNeedingCar > 0 && (
                    <p className="mb-2 text-center text-sm text-warning-ink">
                        Pick a car (or skip) for {cardsNeedingCar === 1 ? 'one list' : `${cardsNeedingCar} lists`} first.
                    </p>
                )}
                <div className="flex gap-2">
                    <Button variant="secondary" icon={<MicIcon />} onClick={() => void startRecording()} disabled={isSaving} className="shrink-0">
                        Record more
                    </Button>
                    <Button onClick={() => void handleSave()} disabled={!canSave} loading={isSaving} className="min-w-0 flex-1">
                        {jobCountLabel}
                    </Button>
                </div>
            </div>
        );
    };

    // While the sheet slides away (phase is already 'closed'), keep showing what it last held.
    if (isOpen) shownRef.current = { body: renderBody(), footer: renderFooter() };
    const { body, footer } = shownRef.current;

    // A tap outside, Esc or a drag-down must not throw away a recording or a pending Gemini call; the X still can.
    const dismissible = phase === 'check' || phase === 'error';

    return (
        <>
            <IconButton
                label={isRecording ? 'Stop dictation' : 'Dictate prep'}
                title="Dictate prep"
                icon={isRecording ? <MicIcon className="text-danger" /> : <GeminiMicIcon />}
                onClick={handleMicButton}
                className={isRecording ? 'animate-pulse' : undefined}
            />
            <Sheet
                open={isOpen}
                onClose={handleClose}
                dismissible={dismissible}
                labelledBy="prep-dictation-title"
                size="lg"
                tall
                footer={footer || undefined}
            >
                <div className="flex min-h-0 flex-1 flex-col">
                    <header className="flex flex-none items-start gap-3 px-5 pb-3 pt-2 sm:pt-5">
                        <h2 id="prep-dictation-title" className="min-w-0 flex-1 pt-1.5 text-[1.375rem] font-bold leading-7 tracking-[-0.01em] text-ink">
                            Prep dictation
                        </h2>
                        <IconButton label="Close" icon={<XMarkIcon />} onClick={handleClose} className="-me-2 -mt-1" />
                    </header>
                    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-5 pb-5">
                        {body}
                    </div>
                </div>
            </Sheet>
        </>
    );
};

const CarChoice = ({ car, onPick }: { car: PrepStockCar; onPick: () => void }) => (
    <button
        type="button"
        onClick={onPick}
        className="flex min-h-[56px] w-full items-center justify-between gap-3 rounded-control border border-line bg-surface px-3 py-2 text-start transition-colors duration-quick ease-out hover:border-line-strong hover:bg-surface-2 active:bg-surface-3"
    >
        <span className="flex min-w-0 items-center gap-3">
            {car.reg ? <Plate reg={car.reg} size="sm" /> : <span className="text-sm font-semibold text-ink">No reg</span>}
            <span className="min-w-0 truncate text-sm text-ink-2">{carLine(car) || 'No details'}</span>
        </span>
        {car.stockNumber && <span className="shrink-0 font-mono text-xs tabular-nums text-ink-3">{car.stockNumber}</span>}
    </button>
);

export default PrepDictation;
