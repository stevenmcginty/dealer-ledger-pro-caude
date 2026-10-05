/**
 * "Change car." A type-ahead over the ledger's cars (plus the website's stock
 * index, which carries the other ledger's cars on a shared inbox). Steve types a
 * bit of the reg, make or model and taps the car; "No car" clears it and
 * "Use …" sends what he typed when it matches nothing.
 *
 * Phone: a full-width sheet from the top, so the keyboard never covers the list.
 * Desktop: a popover under the thread header.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Spinner from '../../common/Spinner';
import { CarIcon, MagnifyingGlassIcon, XMarkIcon } from '../../icons';
import { useData } from '../../../hooks/useData';
import { fetchAgentStockForPicker, type CarCorrection } from '../../../services/salesAgentService';
import {
    buildCarPickerRows,
    formatReg,
    searchCarPicker,
    type CarPickerRow,
    type CarPickerStatus,
    type PickerStockItem,
} from '../../../utils/carPickerSearch';

/** A reg drawn like a number plate. */
export const RegPlate: React.FC<{ reg: string; className?: string }> = ({ reg, className = '' }) => (
    <span className={`inline-flex flex-shrink-0 items-center rounded-[4px] bg-yellow-300 px-1.5 py-px font-mono text-[11px] font-bold leading-tight tracking-wide text-gray-950 ${className}`}>
        {formatReg(reg)}
    </span>
);

const STATUS_TAG: Record<CarPickerStatus, { label: string; cls: string }> = {
    in_stock: { label: 'In stock', cls: 'bg-emerald-500/15 text-emerald-300' },
    deposit: { label: 'Deposit', cls: 'bg-amber-400/15 text-amber-300' },
    sold: { label: 'Sold', cls: 'bg-white/[0.06] text-gray-400' },
};

type Option =
    | { kind: 'none'; key: string }
    | { kind: 'typed'; key: string; text: string }
    | { kind: 'car'; key: string; row: CarPickerRow };

export interface CarPickerProps {
    agentName: string;
    /** What the thread has as the car now, if anything. */
    currentTitle?: string;
    /** Resolves when the server took it; rejects with the server's message. */
    onPick: (pick: CarCorrection) => Promise<void>;
    onClose: () => void;
}

const CarPicker: React.FC<CarPickerProps> = ({ agentName, currentTitle, onPick, onClose }) => {
    const { vehicles, companyId } = useData();
    const [stock, setStock] = useState<PickerStockItem[]>([]);
    const [query, setQuery] = useState('');
    const [note, setNote] = useState('');
    const [highlight, setHighlight] = useState(-1);
    const [busyKey, setBusyKey] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const listRef = useRef<HTMLUListElement>(null);

    useEffect(() => {
        if (!companyId || companyId === 'demo-company') return;
        let live = true;
        fetchAgentStockForPicker(companyId).then(items => { if (live) setStock(items); });
        return () => { live = false; };
    }, [companyId]);

    const rows = useMemo(
        () => buildCarPickerRows(vehicles || [], stock, companyId),
        [vehicles, stock, companyId]
    );
    const results = useMemo(() => searchCarPicker(rows, query), [rows, query]);
    const typed = query.trim();

    const options = useMemo<Option[]>(() => {
        const list: Option[] = [{ kind: 'none', key: 'none' }];
        if (typed && !results.length) list.push({ kind: 'typed', key: 'typed', text: typed });
        results.forEach(row => list.push({ kind: 'car', key: row.key, row }));
        return list;
    }, [typed, results]);

    // A fresh search highlights its best car (or "Use …"), never "No car" by accident.
    useEffect(() => {
        setHighlight(options.length > 1 ? 1 : -1);
    }, [options]);

    useEffect(() => {
        if (highlight < 0) return;
        const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${highlight}"]`);
        el?.scrollIntoView({ block: 'nearest' });
    }, [highlight]);

    const busy = !!busyKey;

    const choose = async (option: Option) => {
        if (busyKey) return;
        const words = note.trim();
        const base: CarCorrection = words ? { note: words } : {};
        const pick: CarCorrection = option.kind === 'none'
            ? { ...base, noCar: true }
            : option.kind === 'typed'
                ? { ...base, freeTitle: option.text }
                : option.row.kind === 'ledger'
                    ? { ...base, ledgerVehicleId: option.row.id, ...(companyId ? { vehicleCompanyId: companyId } : {}) }
                    : { ...base, stockId: option.row.id };
        setBusyKey(option.key);
        setError(null);
        try {
            await onPick(pick);
        } catch (err: any) {
            setError(err?.message || 'That correction could not be applied.');
            setBusyKey(null);
        }
    };

    const onDialogKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Escape' && !busy) {
            e.preventDefault();
            onClose();
        }
    };

    const onSearchKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setHighlight(h => Math.min(options.length - 1, h + 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHighlight(h => Math.max(0, h - 1));
        } else if (e.key === 'Enter') {
            e.preventDefault();
            const option = options[highlight];
            if (option) void choose(option);
        }
    };

    const optionClass = (index: number) =>
        `flex min-h-[48px] w-full items-center gap-2.5 px-3 text-left text-[14px] transition-colors disabled:opacity-50 sm:min-h-[40px] sm:text-[13px] ${
            index === highlight ? 'bg-white/[0.08]' : 'hover:bg-white/[0.05]'
        }`;

    return (
        <>
            <div className="fixed inset-0 z-40 bg-black/50 sm:bg-transparent" onClick={busy ? undefined : onClose} aria-hidden />
            <div
                role="dialog"
                aria-label="Change car"
                onKeyDown={onDialogKeyDown}
                className="fixed inset-x-0 top-0 z-50 flex max-h-[85dvh] flex-col overflow-hidden rounded-b-2xl border-b border-white/10 bg-gray-900 pt-[env(safe-area-inset-top)] shadow-2xl shadow-black/60 sm:absolute sm:inset-x-auto sm:left-4 sm:top-full sm:mt-1 sm:max-h-[min(70vh,30rem)] sm:w-[26rem] sm:rounded-xl sm:border sm:border-white/[0.08] sm:pt-0 lg:left-[4.25rem]"
            >
                <div className="flex items-center gap-2 border-b border-white/[0.06] px-3 py-2">
                    <MagnifyingGlassIcon className="h-4 w-4 flex-shrink-0 text-gray-500" />
                    <input
                        value={query}
                        onChange={e => { setQuery(e.target.value); setError(null); }}
                        onKeyDown={onSearchKeyDown}
                        autoFocus
                        disabled={busy}
                        placeholder="Type a reg, make or model"
                        aria-label="Search the ledger's cars"
                        autoComplete="off"
                        spellCheck={false}
                        className="min-w-0 flex-1 bg-transparent py-2 text-[16px] text-gray-100 placeholder:text-gray-500 focus:outline-none sm:text-[14px]"
                    />
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={busy}
                        aria-label="Close"
                        className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-gray-400 hover:bg-white/[0.06] hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
                    >
                        <XMarkIcon className="h-5 w-5" />
                    </button>
                </div>

                {currentTitle && (
                    <p className="border-b border-white/[0.06] px-3 py-1.5 text-[12px] text-gray-400">
                        {agentName} has it as <span className="font-medium text-gray-200">{currentTitle}</span>
                    </p>
                )}

                <ul ref={listRef} role="listbox" aria-label="Cars" className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-1">
                    {options.map((option, index) => (
                        <li key={option.key} role="option" aria-selected={index === highlight} data-index={index}>
                            <button
                                type="button"
                                disabled={busy}
                                onClick={() => void choose(option)}
                                onMouseEnter={() => setHighlight(index)}
                                className={optionClass(index)}
                            >
                                {option.kind === 'none' && (
                                    <>
                                        <XMarkIcon className="h-4 w-4 flex-shrink-0 text-gray-500" />
                                        <span className="flex-1 text-gray-300">No car</span>
                                    </>
                                )}
                                {option.kind === 'typed' && (
                                    <>
                                        <CarIcon className="h-4 w-4 flex-shrink-0 text-gray-500" />
                                        <span className="min-w-0 flex-1 truncate text-gray-100">Use “{option.text}”</span>
                                    </>
                                )}
                                {option.kind === 'car' && (
                                    <>
                                        <span className="min-w-0 flex-1 truncate font-medium text-gray-100">{option.row.title}</span>
                                        {option.row.reg && <RegPlate reg={option.row.reg} />}
                                        {option.row.otherLedger && (
                                            <span className="flex-shrink-0 rounded-md bg-sky-500/15 px-1.5 py-0.5 text-[10.5px] font-semibold text-sky-300">Other ledger</span>
                                        )}
                                        <span className={`flex-shrink-0 rounded-md px-1.5 py-0.5 text-[10.5px] font-semibold ${STATUS_TAG[option.row.status].cls}`}>
                                            {STATUS_TAG[option.row.status].label}
                                        </span>
                                    </>
                                )}
                                {busyKey === option.key && <Spinner className="h-3.5 w-3.5 flex-shrink-0 text-gray-300" />}
                            </button>
                        </li>
                    ))}
                    {!rows.length && (
                        <li className="px-3 py-3 text-[12.5px] text-gray-500">No cars in the ledger yet.</li>
                    )}
                </ul>

                {error && (
                    <p role="alert" className="border-t border-red-500/20 bg-red-500/10 px-3 py-2 text-[12.5px] leading-snug text-red-300">{error}</p>
                )}

                <div className="border-t border-white/[0.06] px-3 py-2">
                    <input
                        value={note}
                        onChange={e => setNote(e.target.value)}
                        disabled={busy}
                        placeholder={`Note for ${agentName} (optional)`}
                        aria-label={`Note for ${agentName} (optional)`}
                        className="w-full rounded-lg border border-white/[0.08] bg-black/30 px-3 py-2 text-[16px] text-gray-100 placeholder:text-gray-500 focus:border-brand-400/50 focus:outline-none focus:ring-2 focus:ring-brand-400/30 sm:text-[12.5px]"
                    />
                    <p className="mt-1.5 text-[11px] leading-snug text-gray-500">
                        {agentName} re-pins the thread and bins the draft. A car on the other ledger moves the thread to them.
                    </p>
                </div>
            </div>
        </>
    );
};

export default CarPicker;
