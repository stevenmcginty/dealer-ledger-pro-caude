import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useData } from '../../hooks/useData';
import { useToast } from '../ui';
import Spinner from '../common/Spinner';
import { ArrowPathIcon, ExclamationTriangleIcon, MagnifyingGlassIcon, PlusIcon, TrashIcon, XMarkIcon } from '../icons';
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

    // No background scroll behind the sheet.
    useEffect(() => {
        if (!isOpen) return;
        const previous = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = previous; };
    }, [isOpen]);

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
                <div className="flex items-center justify-between gap-3 px-4 py-3">
                    <p className="min-w-0 truncate text-sm text-gray-400">
                        Skipped{card.spokenAs ? <> · <span className="text-gray-300">{card.spokenAs}</span></> : null}
                    </p>
                    <button type="button" onClick={() => updateCard(card.key, c => ({ ...c, skipped: false }))} className="min-h-[44px] shrink-0 rounded-lg px-3 text-sm font-medium text-brand-400 hover:bg-gray-700/60 hover:text-brand-300">
                        Undo
                    </button>
                </div>
            );
        }

        const chosen = card.vehicleId ? stockById.get(card.vehicleId) : undefined;
        if (chosen) {
            return (
                <div className="flex items-start justify-between gap-3 px-4 pt-4 pb-3">
                    <div className="min-w-0">
                        <p className="text-lg font-bold leading-tight tracking-wide text-white">{chosen.reg || 'No reg'}</p>
                        <p className="mt-0.5 truncate text-sm text-gray-400">
                            {carLine(chosen)}{chosen.stockNumber ? <span className="text-gray-500"> · {chosen.stockNumber}</span> : null}
                        </p>
                    </div>
                    <button type="button" onClick={() => updateCard(card.key, c => ({ ...c, vehicleId: undefined, searching: c.candidateIds.length < 2 }))} className="min-h-[44px] shrink-0 rounded-lg px-3 text-sm font-medium text-gray-400 hover:bg-gray-700/60 hover:text-white">
                        Change
                    </button>
                </div>
            );
        }

        const candidates = card.candidateIds.map(id => stockById.get(id)).filter((c): c is PrepStockCar => !!c);
        const showSearch = card.searching || candidates.length < 2;
        const query = searchText[card.key] || '';
        const results = showSearch ? searchStock(stockList, query, 6) : [];

        return (
            <div className="px-4 pt-4 pb-3">
                <p className="text-base font-semibold text-white">
                    {showSearch ? 'Which car?' : `Which ${card.spokenAs.replace(/^the\s+/i, '') || 'car'}?`}
                </p>
                <p className="mt-0.5 text-sm text-gray-400">
                    {showSearch
                        ? (card.spokenAs ? <>Heard “{card.spokenAs}”</> : 'Pick the car for these jobs')
                        : `${candidates.length} cars fit. Pick one.`}
                </p>

                {showSearch ? (
                    <div className="mt-3">
                        <div className="relative">
                            <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-500" />
                            <input
                                type="search"
                                inputMode="search"
                                autoComplete="off"
                                value={query}
                                onChange={e => setSearchText(prev => ({ ...prev, [card.key]: e.target.value }))}
                                placeholder="Reg, make or model"
                                aria-label="Search stock"
                                className="h-11 w-full rounded-lg border border-gray-600 bg-gray-900 pl-10 pr-3 text-base text-white placeholder-gray-500 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                            />
                        </div>
                        <div className="mt-2 space-y-1.5">
                            {results.map(car => (
                                <CarChoice key={car.id} car={car} onPick={() => chooseCar(card.key, car.id)} />
                            ))}
                            {results.length === 0 && <p className="px-1 py-2 text-sm text-gray-500">No car in stock matches.</p>}
                        </div>
                    </div>
                ) : (
                    <div className="mt-3 space-y-1.5">
                        {candidates.map(car => (
                            <CarChoice key={car.id} car={car} onPick={() => chooseCar(card.key, car.id)} />
                        ))}
                    </div>
                )}

                <div className="mt-2 flex items-center justify-between">
                    {candidates.length > 1 ? (
                        <button type="button" onClick={() => updateCard(card.key, c => ({ ...c, searching: !showSearch }))} className="min-h-[44px] rounded-lg px-1 text-sm font-medium text-gray-400 hover:text-white">
                            {showSearch ? 'Back to the cars that fit' : 'Another car'}
                        </button>
                    ) : <span />}
                    <button type="button" onClick={() => updateCard(card.key, c => ({ ...c, skipped: true }))} className="min-h-[44px] rounded-lg px-3 text-sm font-medium text-gray-400 hover:bg-gray-700/60 hover:text-white">
                        Skip
                    </button>
                </div>
            </div>
        );
    };

    const renderJob = (card: Card, job: CardJob) => {
        const editing = editingJobId === job.id;
        const duplicate = !!card.vehicleId && isOpenPrepDuplicate(job.text, card.vehicleId, todos);
        return (
            <li key={job.id} className="flex items-center gap-1 pl-1 pr-1">
                <button
                    type="button"
                    role="checkbox"
                    aria-checked={job.include}
                    aria-label={job.include ? 'Untick job' : 'Tick job'}
                    onClick={() => updateJob(card.key, job.id, j => ({ ...j, include: !j.include }))}
                    className="flex h-11 w-11 shrink-0 items-center justify-center"
                >
                    <span className={`flex h-5 w-5 items-center justify-center rounded-md border transition-colors ${job.include ? 'border-brand-500 bg-brand-600 text-white' : 'border-gray-500 bg-gray-900 text-transparent'}`}>
                        <CheckMark className="h-3.5 w-3.5" />
                    </span>
                </button>
                <div className="min-w-0 flex-1 py-1.5">
                    {editing ? (
                        <input
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
                            className="h-10 w-full rounded-md border border-brand-500 bg-gray-900 px-2.5 text-base text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                        />
                    ) : (
                        <button type="button" onClick={() => beginEdit(job)} className={`block w-full rounded-md px-1 py-1.5 text-left text-[15px] leading-snug ${job.include ? 'text-gray-100' : 'text-gray-500 line-through'}`}>
                            {job.text}
                            {job.urgent && <span className="ml-2 inline-flex translate-y-[-1px] items-center rounded-full bg-red-900/60 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-red-300">Urgent</span>}
                            {duplicate && <span className="ml-2 inline-flex translate-y-[-1px] items-center rounded-full bg-gray-700 px-2 py-0.5 text-[11px] font-medium text-gray-300">Already in prep</span>}
                        </button>
                    )}
                </div>
                <button
                    type="button"
                    aria-label="Delete job"
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => { if (editing) setEditingJobId(null); updateJob(card.key, job.id, () => null); }}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-700/60 hover:text-red-400"
                >
                    <TrashIcon className="h-5 w-5" />
                </button>
            </li>
        );
    };

    const renderBody = () => {
        if (phase === 'starting') {
            return (
                <div className="flex flex-1 flex-col items-center justify-center gap-3 py-16 text-center">
                    <Spinner className="h-7 w-7 text-gray-300" />
                    <p className="text-sm text-gray-400">Starting the microphone…</p>
                </div>
            );
        }
        if (phase === 'recording') {
            const left = Math.max(0, MAX_RECORDING_MS - elapsed);
            return (
                <div className="flex flex-1 flex-col items-center justify-center px-2 py-10 text-center">
                    <div className="flex items-center gap-2.5">
                        <span className="relative flex h-3 w-3">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-60" />
                            <span className="relative inline-flex h-3 w-3 rounded-full bg-red-500" />
                        </span>
                        <span className="text-sm font-medium uppercase tracking-wider text-red-400">Recording</span>
                    </div>
                    <p className="mt-4 font-mono text-5xl font-semibold tabular-nums text-white">{formatClock(elapsed)}</p>
                    <p className="mt-2 text-xs text-gray-500">{left < 30000 ? `Stops in ${Math.ceil(left / 1000)}s` : 'Up to 3 minutes'}</p>
                    <p className="mt-8 max-w-xs text-sm leading-relaxed text-gray-400">
                        Say the car, then its jobs.<br />
                        <span className="text-gray-500">“The black Porsche needs a valet and a nearside tyre.”</span>
                    </p>
                    <button
                        type="button"
                        onClick={stopRecording}
                        aria-label="Stop recording"
                        className="mt-10 flex h-20 w-20 items-center justify-center rounded-full bg-red-600 shadow-lg shadow-red-900/40 ring-4 ring-red-600/25 transition-transform hover:bg-red-500 active:scale-95"
                    >
                        <span className="h-7 w-7 rounded-md bg-white" />
                    </button>
                    <p className="mt-3 text-sm font-medium text-gray-300">Tap to stop</p>
                </div>
            );
        }
        if (phase === 'working') {
            return (
                <div className="flex flex-1 flex-col items-center justify-center gap-3 py-16 text-center">
                    <Spinner className="h-8 w-8 text-brand-400" />
                    <p className="text-base font-medium text-white">Working it out…</p>
                    <p className="text-sm text-gray-500">Matching the jobs to your stock</p>
                </div>
            );
        }
        if (phase === 'error' && error) {
            const text = ERROR_TEXT[error];
            const canResend = error === 'ai' && !!lastWavRef.current;
            return (
                <div className="flex flex-1 flex-col items-center justify-center px-4 py-14 text-center">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-900/40">
                        <ExclamationTriangleIcon className="h-6 w-6 text-amber-400" />
                    </div>
                    <p className="mt-4 text-base font-semibold text-white">{text.title}</p>
                    <p className="mt-1 max-w-xs text-sm text-gray-400">{text.body}</p>
                    <div className="mt-6 flex w-full max-w-xs flex-col gap-2">
                        {error !== 'unsupported' && (
                            <button
                                type="button"
                                onClick={() => (canResend ? void analyse(lastWavRef.current!) : void startRecording())}
                                className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 text-base font-semibold text-white hover:bg-brand-500"
                            >
                                {canResend ? <ArrowPathIcon className="h-5 w-5" /> : <MicIcon className="h-5 w-5" />}
                                Try again
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={() => (cards.length > 0 ? (setError(null), setPhase('check')) : resetAll())}
                            className="min-h-[48px] rounded-xl px-4 text-base font-medium text-gray-300 hover:bg-gray-800"
                        >
                            {cards.length > 0 ? 'Back to the list' : 'Close'}
                        </button>
                    </div>
                </div>
            );
        }
        if (phase === 'check') {
            return (
                <div className="space-y-3">
                    {cards.map(card => (
                        <section key={card.key} className={`overflow-hidden rounded-xl border bg-gray-800 ${!card.skipped && !card.vehicleId ? 'border-amber-500/40' : 'border-gray-700'}`}>
                            {renderCarHeader(card)}
                            {!card.skipped && (
                                <>
                                    <ul className="divide-y divide-gray-700/60 border-t border-gray-700/70">
                                        {card.jobs.map(job => renderJob(card, job))}
                                    </ul>
                                    <div className="border-t border-gray-700/70 px-2">
                                        <button type="button" onClick={() => addLine(card.key)} className="flex min-h-[44px] items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-brand-400 hover:text-brand-300">
                                            <PlusIcon className="h-4 w-4" />
                                            Add line
                                        </button>
                                    </div>
                                </>
                            )}
                        </section>
                    ))}
                    {transcripts.length > 0 && (
                        <div className="px-1 pt-2">
                            <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-600">What I heard</p>
                            {transcripts.map((t, i) => (
                                <p key={i} className="mt-1 text-xs leading-relaxed text-gray-500">{t}</p>
                            ))}
                        </div>
                    )}
                </div>
            );
        }
        return null;
    };

    const jobCountLabel = `Add ${toSave.length} job${toSave.length === 1 ? '' : 's'} to prep`;

    const overlay = isOpen ? createPortal(
        <div
            className="fixed inset-0 z-[60] flex items-stretch justify-center bg-black/70 backdrop-blur-sm sm:items-center sm:p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="prep-dictation-title"
        >
            <div className="flex h-[100dvh] w-full flex-col bg-gray-900 sm:h-auto sm:max-h-[85vh] sm:max-w-lg sm:rounded-2xl sm:border sm:border-gray-700 sm:shadow-2xl">
                <header className="flex shrink-0 items-center justify-between border-b border-gray-800 pl-4 pr-1.5 sm:rounded-t-2xl" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
                    <div className="flex h-14 items-center gap-2.5">
                        <MicIcon className="h-5 w-5 text-brand-400" />
                        <h2 id="prep-dictation-title" className="text-base font-semibold text-white">Prep dictation</h2>
                    </div>
                    <button type="button" onClick={handleClose} aria-label="Close" className="flex h-11 w-11 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-800 hover:text-white">
                        <XMarkIcon className="h-6 w-6" />
                    </button>
                </header>

                <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-4 py-4">
                    {renderBody()}
                </div>

                {phase === 'check' && (
                    <footer className="shrink-0 border-t border-gray-800 bg-gray-900 px-4 pt-3 sm:rounded-b-2xl" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
                        {confirmDiscard ? (
                            <div className="flex items-center gap-2">
                                <p className="flex-1 text-sm text-gray-300">Discard this list?</p>
                                <button type="button" onClick={() => setConfirmDiscard(false)} className="min-h-[48px] rounded-xl px-4 text-sm font-medium text-gray-300 hover:bg-gray-800">Keep</button>
                                <button type="button" onClick={resetAll} className="min-h-[48px] rounded-xl bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-500">Discard</button>
                            </div>
                        ) : (
                            <>
                                {cardsNeedingCar > 0 && (
                                    <p className="mb-2 text-center text-xs text-amber-300/90">
                                        Pick a car (or skip) for {cardsNeedingCar === 1 ? 'one list' : `${cardsNeedingCar} lists`} first.
                                    </p>
                                )}
                                <div className="flex gap-2">
                                    <button
                                        type="button"
                                        onClick={() => void startRecording()}
                                        disabled={isSaving}
                                        className="inline-flex min-h-[48px] shrink-0 items-center justify-center gap-2 rounded-xl border border-gray-700 bg-gray-800 px-4 text-sm font-medium text-gray-200 hover:bg-gray-700 disabled:opacity-50"
                                    >
                                        <MicIcon className="h-5 w-5" />
                                        Record more
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => void handleSave()}
                                        disabled={!canSave}
                                        className="inline-flex min-h-[48px] flex-1 items-center justify-center rounded-xl bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-500 disabled:cursor-not-allowed disabled:bg-gray-700 disabled:text-gray-400"
                                    >
                                        {isSaving ? <Spinner className="h-5 w-5 text-white" /> : jobCountLabel}
                                    </button>
                                </div>
                            </>
                        )}
                    </footer>
                )}
            </div>
        </div>,
        document.body,
    ) : null;

    return (
        <>
            <button
                type="button"
                onClick={handleMicButton}
                aria-label={isRecording ? 'Stop dictation' : 'Dictate prep'}
                title="Dictate prep"
                className={`inline-flex items-center gap-1.5 h-9 pl-2.5 pr-3 rounded-full text-sm font-semibold ring-1 transition-colors ${isRecording
                    ? 'bg-red-500/15 text-red-400 ring-red-500/50 animate-pulse'
                    : 'bg-green-500/15 text-green-400 ring-green-500/40 hover:bg-green-500/25 hover:text-green-300'}`}
            >
                <MicIcon className="h-5 w-5" />
                <span>{isRecording ? 'Stop' : 'Dictate'}</span>
            </button>
            {overlay}
        </>
    );
};

const CarChoice = ({ car, onPick }: { car: PrepStockCar; onPick: () => void }) => (
    <button
        type="button"
        onClick={onPick}
        className="flex min-h-[52px] w-full items-center justify-between gap-3 rounded-lg border border-gray-700 bg-gray-900/60 px-3 py-2 text-left transition-colors hover:border-brand-500/60 hover:bg-gray-900 active:bg-gray-900"
    >
        <span className="min-w-0">
            <span className="block font-bold tracking-wide text-white">{car.reg || 'No reg'}</span>
            <span className="block truncate text-sm text-gray-400">{carLine(car) || 'No details'}</span>
        </span>
        {car.stockNumber && <span className="shrink-0 rounded-md bg-gray-800 px-2 py-1 text-xs font-medium text-gray-400">{car.stockNumber}</span>}
    </button>
);

export default PrepDictation;
