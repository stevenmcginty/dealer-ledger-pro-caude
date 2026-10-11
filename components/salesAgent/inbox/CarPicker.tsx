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
import { Badge, Plate, StatusChip } from '../../ui';
import type { ChipStatus } from '../../ui';
import { controlFrame, controlInput } from '../../ui/cx';
import { useData } from '../../../hooks/useData';
import { fetchAgentStockForPicker, type CarCorrection } from '../../../services/salesAgentService';
import {
    buildCarPickerRows,
    searchCarPicker,
    type CarPickerRow,
    type CarPickerStatus,
    type PickerStockItem,
} from '../../../utils/carPickerSearch';

/** A reg drawn like a number plate (the app's Plate, small). */
export const RegPlate: React.FC<{ reg: string; className?: string }> = ({ reg, className = '' }) => (
    <Plate reg={reg} size="sm" className={className} />
);

const STATUS_TAG: Record<CarPickerStatus, { label: string; chip: ChipStatus }> = {
    in_stock: { label: 'In stock', chip: 'stock' },
    deposit: { label: 'Deposit', chip: 'reserved' },
    sold: { label: 'Sold', chip: 'sold' },
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
        `flex min-h-[52px] w-full items-center gap-2.5 px-4 text-start text-base transition-colors duration-quick ease-out focus-visible:[outline-offset:-3px] disabled:cursor-not-allowed disabled:text-ink-3 sm:min-h-[44px] sm:px-3 sm:text-sm ${
            index === highlight ? 'bg-surface-2' : 'hover:bg-surface-2'
        }`;

    return (
        <>
            <div className="fixed inset-0 z-sheet bg-scrim sm:bg-transparent" onClick={busy ? undefined : onClose} aria-hidden />
            <div
                role="dialog"
                aria-label="Change car"
                onKeyDown={onDialogKeyDown}
                className="fixed inset-x-0 top-0 z-dialog flex max-h-[85dvh] flex-col overflow-hidden rounded-b-sheet border-b border-line bg-surface pt-[env(safe-area-inset-top)] shadow-e3 sm:absolute sm:inset-x-auto sm:start-4 sm:top-full sm:mt-1 sm:max-h-[min(70vh,32rem)] sm:w-[28rem] sm:rounded-card sm:border sm:pt-0 sm:shadow-e2 lg:start-[4.5rem]"
            >
                <div className="flex items-center gap-1 py-1 pe-1 ps-4">
                    <p className="min-w-0 flex-1 text-base font-bold text-ink">Change car</p>
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={busy}
                        aria-label="Close"
                        className="grid h-12 w-12 flex-shrink-0 place-items-center rounded-control text-ink-2 transition-colors duration-quick ease-out hover:bg-surface-2 hover:text-ink sm:h-10 sm:w-10"
                    >
                        <XMarkIcon className="h-5 w-5" />
                    </button>
                </div>

                <div className="px-3 pb-2">
                    <label className={`${controlFrame({ disabled: busy })} ps-3`}>
                        <MagnifyingGlassIcon className="h-5 w-5 flex-shrink-0 text-ink-3" />
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
                            className={`${controlInput} ps-2`}
                        />
                    </label>
                    {currentTitle && (
                        <p className="px-1 pt-2 text-sm text-ink-3">
                            {agentName} has it as <span className="font-semibold text-ink">{currentTitle}</span>
                        </p>
                    )}
                </div>

                <ul ref={listRef} role="listbox" aria-label="Cars" className="min-h-0 flex-1 overflow-y-auto overscroll-contain border-t border-line py-1">
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
                                        <XMarkIcon className="h-5 w-5 flex-shrink-0 text-ink-3" />
                                        <span className="flex-1 font-semibold text-ink-2">No car</span>
                                    </>
                                )}
                                {option.kind === 'typed' && (
                                    <>
                                        <CarIcon className="h-5 w-5 flex-shrink-0 text-ink-3" />
                                        <span className="min-w-0 flex-1 truncate text-ink">Use “{option.text}”</span>
                                    </>
                                )}
                                {option.kind === 'car' && (
                                    <>
                                        {option.row.reg && <RegPlate reg={option.row.reg} />}
                                        <span className="min-w-0 flex-1 truncate font-semibold text-ink">{option.row.title}</span>
                                        {option.row.otherLedger && <Badge variant="info" size="sm">Other ledger</Badge>}
                                        <StatusChip status={STATUS_TAG[option.row.status].chip}>
                                            {STATUS_TAG[option.row.status].label}
                                        </StatusChip>
                                    </>
                                )}
                                {busyKey === option.key && <Spinner className="h-4 w-4 flex-shrink-0 text-ink-2" />}
                            </button>
                        </li>
                    ))}
                    {!rows.length && (
                        <li className="px-4 py-3 text-sm text-ink-3">No cars in the ledger yet.</li>
                    )}
                </ul>

                {error && (
                    <p role="alert" className="border-t border-danger bg-danger-soft px-4 py-2.5 text-sm leading-snug text-danger-ink">{error}</p>
                )}

                <div className="border-t border-line px-3 pb-3 pt-3">
                    <div className={controlFrame({ disabled: busy })}>
                        <input
                            value={note}
                            onChange={e => setNote(e.target.value)}
                            disabled={busy}
                            placeholder={`Note for ${agentName} (optional)`}
                            aria-label={`Note for ${agentName} (optional)`}
                            className={controlInput}
                        />
                    </div>
                    <p className="mt-2 px-1 text-xs leading-4 text-ink-3">
                        {agentName} re-pins the thread and bins the draft. A car on the other ledger moves the thread to them.
                    </p>
                </div>
            </div>
        </>
    );
};

export default CarPicker;
