import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Vehicle, PDI, NewPDI, BusinessDetails, PdiCheckStatus, PdiSection, PdiTyre, PdiTyrePosition } from '../../types';
import { ChevronDownIcon, ShieldCheckIcon, CheckCircleIcon, XCircleIcon, ExclamationTriangleIcon } from '../icons';
import UkDateInput from '../common/UkDateInput';
import PrintablePdi from './PrintablePdi';
import { useToast, Button } from '../ui';
import { PanelHeader, VehicleStatusChip } from '../stock/parts';
import {
    createDefaultPdiSections,
    createDefaultPdiTyres,
    TYRE_POSITIONS,
    PDI_STATUS_LABEL,
    nextPdiStatus,
    treadVerdict,
    nextPdiNumber,
    withPdiDefaults,
    pdiExceptions,
    LEGAL_TREAD_MM,
    ADVISORY_TREAD_MM,
} from '../../utils/pdi';

interface PdiEditorProps {
    vehicles: Vehicle[];
    pdis: PDI[];
    businessDetails: BusinessDetails | null;
    onSubmit: (data: NewPDI, id?: string) => Promise<void>;
    onCancel: () => void;
    editingPdi?: PDI | null;
    /** When the editor is opened from a vehicle, the car is pre-selected and locked. */
    presetVehicle?: Vehicle | null;
}

/** Tyre fields kept as strings while editing so half-typed numbers survive. */
interface TyreDraft {
    position: PdiTyrePosition;
    makeStr: string;
    sizeStr: string;
    treadStr: string;
    status: PdiCheckStatus;
    fitted: boolean;
}

const toTyreDrafts = (tyres: PdiTyre[]): TyreDraft[] =>
    tyres.map(t => ({
        position: t.position,
        makeStr: t.make || '',
        sizeStr: t.size || '',
        treadStr: t.treadDepth != null ? String(t.treadDepth) : '',
        status: t.status,
        fitted: t.fitted !== false,
    }));

const STATUS_STYLE: Record<PdiCheckStatus, { classes: string; Icon: React.ComponentType<{ className?: string }> | null }> = {
    pass: { classes: 'border-success bg-success-soft text-success-ink', Icon: CheckCircleIcon },
    advisory: { classes: 'border-warning bg-warning-soft text-warning-ink', Icon: ExclamationTriangleIcon },
    fail: { classes: 'border-danger bg-danger-soft text-danger-ink', Icon: XCircleIcon },
    na: { classes: 'border-line-strong bg-surface-2 text-ink-2', Icon: null },
};

/** The one control repeated fifty times: icon + word so state never rests on colour alone. */
const StatusButton = ({ status, itemLabel, onCycle }: { status: PdiCheckStatus; itemLabel: string; onCycle: () => void }) => {
    const { classes, Icon } = STATUS_STYLE[status];
    return (
        <button
            type="button"
            onClick={onCycle}
            aria-label={`${itemLabel}: ${PDI_STATUS_LABEL[status]}`}
            title="Click to cycle: Pass, Advisory, Fail, N/A"
            className={`inline-flex min-h-[40px] w-[7.5rem] flex-none items-center justify-center gap-1.5 rounded-control border px-2 text-sm font-semibold transition-[background-color,border-color,transform] duration-quick ease-out active:scale-[.97] [@media(pointer:coarse)]:min-h-[48px] ${classes}`}
        >
            {Icon && <Icon className="h-4 w-4" />}
            {PDI_STATUS_LABEL[status]}
        </button>
    );
};

const compactInput = 'block min-h-[44px] w-full rounded-control border border-line-strong bg-surface px-3 py-2 text-base text-ink placeholder:text-ink-3 transition-colors duration-quick ease-out hover:border-ink-2 [@media(pointer:coarse)]:min-h-[48px]';
const inputCls = 'block min-h-[48px] w-full rounded-control border border-line-strong bg-surface px-3.5 py-3 text-base text-ink placeholder:text-ink-3 transition-colors duration-quick ease-out hover:border-ink-2';

const PdiEditor = ({ vehicles, pdis, businessDetails, onSubmit, onCancel, editingPdi, presetVehicle }: PdiEditorProps) => {
    const toast = useToast();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const isEditing = !!editingPdi;
    const vehicleLocked = isEditing || !!presetVehicle;

    const [pdiNumber] = useState(() => editingPdi?.pdiNumber || nextPdiNumber(pdis));
    const [selectedVehicleId, setSelectedVehicleId] = useState('');
    const [inspectionDate, setInspectionDate] = useState(new Date().toISOString().split('T')[0]);
    const [mileageStr, setMileageStr] = useState('');
    const [inspectedBy, setInspectedBy] = useState(businessDetails?.name || '');
    const [lockingWheelNutLocation, setLockingWheelNutLocation] = useState('');
    const [roadworthy, setRoadworthy] = useState(true);
    const [sections, setSections] = useState<PdiSection[]>(() => createDefaultPdiSections());
    const [tyres, setTyres] = useState<TyreDraft[]>(() => toTyreDrafts(createDefaultPdiTyres()));
    const [advisoryNotes, setAdvisoryNotes] = useState('');
    const [expanded, setExpanded] = useState<Record<string, boolean>>({});
    const [previewData, setPreviewData] = useState<PDI | null>(null);

    // Autocomplete state, same shape as WorkSheetEditor.
    const [regInput, setRegInput] = useState('');
    const [suggestions, setSuggestions] = useState<Vehicle[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const suggestionBoxRef = useRef<HTMLDivElement>(null);

    const selectedVehicle = useMemo(
        () => vehicles.find(v => v.id === selectedVehicleId) || (presetVehicle && presetVehicle.id === selectedVehicleId ? presetVehicle : undefined),
        [vehicles, selectedVehicleId, presetVehicle]
    );

    // Seed the form. Keyed on the record id only: a Firebase push re-creates the
    // `vehicles` array, and depending on it here would wipe mid-edit input.
    useEffect(() => {
        if (isEditing && editingPdi) {
            const snapshot = withPdiDefaults(editingPdi);
            setSelectedVehicleId(editingPdi.vehicleId);
            setInspectionDate(editingPdi.inspectionDate);
            setMileageStr(typeof editingPdi.mileage === 'number' ? String(editingPdi.mileage) : '');
            setInspectedBy(editingPdi.inspectedBy || '');
            setLockingWheelNutLocation(editingPdi.lockingWheelNutLocation || '');
            setRoadworthy(editingPdi.roadworthy !== false);
            setSections(snapshot.sections);
            setTyres(toTyreDrafts(snapshot.tyres));
            setAdvisoryNotes(editingPdi.advisoryNotes || '');
            // Open straight on to whatever was flagged last time.
            const open: Record<string, boolean> = {};
            snapshot.sections.forEach(s => {
                if (s.items.some(i => i.status !== 'pass')) open[s.id] = true;
            });
            setExpanded(open);
        } else if (presetVehicle) {
            setSelectedVehicleId(presetVehicle.id);
            setRegInput(presetVehicle.reg);
            setMileageStr(typeof presetVehicle.mileage === 'number' ? String(presetVehicle.mileage) : '');
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [editingPdi?.id, isEditing, presetVehicle?.id]);

    // Fill the (read-only, while editing) reg display once the vehicle list arrives.
    useEffect(() => {
        if (!isEditing || !editingPdi || regInput) return;
        const vehicle = vehicles.find(v => v.id === editingPdi.vehicleId);
        if (vehicle?.reg) setRegInput(vehicle.reg);
    }, [vehicles, isEditing, editingPdi, regInput]);

    // Business details load async; fill the inspector name once, and only into a blank field.
    const inspectorSeeded = useRef(isEditing || !!businessDetails?.name);
    useEffect(() => {
        if (inspectorSeeded.current || !businessDetails?.name) return;
        inspectorSeeded.current = true;
        setInspectedBy(prev => prev || businessDetails.name);
    }, [businessDetails]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (suggestionBoxRef.current && !suggestionBoxRef.current.contains(event.target as Node)) {
                setShowSuggestions(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleRegInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (vehicleLocked) return;
        const value = e.target.value;
        setRegInput(value);
        setSelectedVehicleId('');
        if (value.trim() === '') {
            setSuggestions([]);
            setShowSuggestions(false);
            return;
        }
        const lowerValue = value.toLowerCase();
        const filtered = vehicles.filter(v =>
            (v.reg || '').toLowerCase().includes(lowerValue) ||
            (v.make || '').toLowerCase().includes(lowerValue) ||
            (v.model || '').toLowerCase().includes(lowerValue)
        );
        setSuggestions(filtered.slice(0, 5));
        setShowSuggestions(true);
    };

    const handleSuggestionClick = (vehicle: Vehicle) => {
        setSelectedVehicleId(vehicle.id);
        setRegInput(vehicle.reg);
        // Seed the odometer from the vehicle record so it only needs correcting,
        // but never clobber a reading the user has already typed.
        setMileageStr(prev => (prev.trim() === '' && typeof vehicle.mileage === 'number' ? String(vehicle.mileage) : prev));
        setSuggestions([]);
        setShowSuggestions(false);
    };

    const cycleItem = (sectionId: string, itemId: string) => {
        setSections(prev => prev.map(s => s.id !== sectionId ? s : {
            ...s,
            items: s.items.map(i => i.id === itemId ? { ...i, status: nextPdiStatus(i.status) } : i),
        }));
    };

    const setItemNote = (sectionId: string, itemId: string, note: string) => {
        setSections(prev => prev.map(s => s.id !== sectionId ? s : {
            ...s,
            items: s.items.map(i => i.id === itemId ? { ...i, note } : i),
        }));
    };

    const resetSection = (sectionId: string) => {
        setSections(prev => prev.map(s => s.id !== sectionId ? s : {
            ...s,
            items: s.items.map(i => ({ ...i, status: 'pass' as PdiCheckStatus, note: null })),
        }));
    };

    const updateTyre = (position: PdiTyrePosition, patch: Partial<TyreDraft>) => {
        setTyres(prev => prev.map(t => t.position === position ? { ...t, ...patch } : t));
    };

    // The committed shape of the tyre drafts, shared by the live exception
    // count and the preview build so the footer never disagrees with the print.
    const liveTyres = useMemo<PdiTyre[]>(() => tyres.map(t => {
        const tread = parseFloat(t.treadStr);
        return {
            position: t.position,
            // null rather than undefined: Firebase rejects undefined, and on an update
            // an omitted key would silently keep the old value instead of clearing it.
            make: t.fitted ? (t.makeStr.trim() || null) : null,
            size: t.fitted ? (t.sizeStr.trim() || null) : null,
            treadDepth: t.fitted && !isNaN(tread) ? tread : null,
            status: t.status,
            fitted: t.fitted,
        };
    }), [tyres]);

    const exceptions = useMemo(() => pdiExceptions({ sections, tyres: liveTyres }), [sections, liveTyres]);
    const advisoryCount = exceptions.filter(e => e.status === 'advisory').length;
    const failCount = exceptions.filter(e => e.status === 'fail').length;

    const handleGeneratePreview = (e: React.FormEvent) => {
        e.preventDefault();
        const vehicle = selectedVehicle;
        if (!vehicle) {
            toast.error('Choose a car from your stock list.');
            return;
        }

        const { id: _vid, createdAt: _vc, status: _vs, ...carDetailsForPdi } = vehicle;
        const parsedMileage = parseInt(mileageStr.replace(/[^0-9]/g, ''), 10);

        const pdiData: PDI = {
            id: editingPdi?.id || '',
            pdiNumber,
            vehicleId: vehicle.id,
            carDetails: carDetailsForPdi,
            inspectionDate,
            mileage: isNaN(parsedMileage) ? null : parsedMileage,
            inspectedBy: inspectedBy.trim() || null,
            lockingWheelNutLocation: lockingWheelNutLocation.trim() || null,
            sections: sections.map(s => ({
                ...s,
                items: s.items.map(i => ({ ...i, note: i.note?.trim() || null })),
            })),
            tyres: liveTyres,
            roadworthy,
            advisoryNotes: advisoryNotes.trim() || null,
            createdAt: editingPdi?.createdAt || Date.now(),
        };
        setPreviewData(pdiData);
    };

    // A rejected write has to surface: without the await the preview would just
    // sit there and the inspector would have no way to tell a failed save from a
    // slow one.
    const handleConfirmSave = async () => {
        if (!previewData || isSubmitting) return;
        setIsSubmitting(true);
        const { id, createdAt, ...submissionData } = previewData;
        try {
            await onSubmit(submissionData as NewPDI, editingPdi ? editingPdi.id : undefined);
        } catch (error) {
            console.error('Failed to save PDI:', error);
            toast.error('Couldn’t save the PDI. Check your signal and try again.');
            setPreviewData(null);
        } finally {
            setIsSubmitting(false);
        }
    };

    if (previewData) {
        return (
            <PrintablePdi
                pdi={previewData}
                businessDetails={businessDetails}
                onClose={onCancel}
                isPreview={true}
                onBack={() => setPreviewData(null)}
                onConfirm={handleConfirmSave}
            />
        );
    }

    return (
        <div className="w-full flex flex-col h-full">
            <PanelHeader
                title={isEditing ? 'Edit PDI' : 'New PDI'}
                subtitle={<span className="num">PDI #{pdiNumber}</span>}
                onClose={onCancel}
            />

            <form id="pdi-editor-form" onSubmit={handleGeneratePreview} className="flex-1 space-y-6 overflow-y-auto p-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="relative md:col-span-2" ref={suggestionBoxRef}>
                        <label htmlFor="pdiVehicleReg" className="mb-1.5 block text-sm font-semibold text-ink">Car</label>
                        <input
                            type="text"
                            id="pdiVehicleReg"
                            value={regInput}
                            onChange={handleRegInputChange}
                            required
                            disabled={vehicleLocked}
                            placeholder="Reg, make or model"
                            className="block min-h-[48px] w-full rounded-control border border-line-strong bg-surface px-3.5 py-3 text-base text-ink placeholder:text-ink-3 transition-colors duration-quick ease-out hover:border-ink-2 uppercase placeholder:normal-case disabled:cursor-not-allowed disabled:border-line disabled:bg-surface-2"
                            autoComplete="off"
                        />
                        {showSuggestions && suggestions.length > 0 && (
                            <ul className="absolute z-dropdown mt-1 max-h-72 w-full overflow-auto rounded-control border border-line-strong bg-surface py-1 shadow-e2">
                                {suggestions.map(v => (
                                    <li key={v.id}>
                                        <button
                                            type="button"
                                            onClick={() => handleSuggestionClick(v)}
                                            className="flex min-h-[48px] w-full items-center justify-between gap-3 px-4 py-2 text-start text-base text-ink hover:bg-surface-2"
                                        >
                                            <div>
                                                <span className="font-mono font-semibold uppercase tracking-[0.06em]">{v.reg}</span> <span className="text-ink-2">{v.make} {v.model}</span>
                                            </div>
                                            <VehicleStatusChip status={v.status} />
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                        {selectedVehicle && (
                            <p className="mt-1.5 text-sm text-ink-3">
                                {selectedVehicle.make} {selectedVehicle.model}{selectedVehicle.year ? ` · ${selectedVehicle.year}` : ''}
                            </p>
                        )}
                    </div>
                    <div>
                        <label htmlFor="pdiDate" className="mb-1.5 block text-sm font-semibold text-ink">Inspection date</label>
                        <UkDateInput id="pdiDate" name="pdiDate" value={inspectionDate} onChange={e => setInspectionDate(e.target.value)} required />
                    </div>
                    <div>
                        <label htmlFor="pdiMileage" className="mb-1.5 block text-sm font-semibold text-ink">Mileage</label>
                        <input
                            type="text"
                            inputMode="numeric"
                            id="pdiMileage"
                            value={mileageStr}
                            onChange={e => setMileageStr(e.target.value)}
                            placeholder={selectedVehicle?.mileage ? `${selectedVehicle.mileage.toLocaleString('en-GB')} on record` : 'e.g. 44229'}
                            className={inputCls}
                        />
                    </div>
                    <div>
                        <label htmlFor="pdiInspector" className="mb-1.5 block text-sm font-semibold text-ink">Inspected by <span className="font-normal text-ink-3">(optional)</span></label>
                        <input
                            type="text"
                            id="pdiInspector"
                            value={inspectedBy}
                            onChange={e => setInspectedBy(e.target.value)}
                            className={inputCls}
                        />
                    </div>
                    <div>
                        <label htmlFor="pdiLockingNut" className="mb-1.5 block text-sm font-semibold text-ink">Where the locking wheel nut key is</label>
                        <input
                            type="text"
                            id="pdiLockingNut"
                            value={lockingWheelNutLocation}
                            onChange={e => setLockingWheelNutLocation(e.target.value)}
                            placeholder="e.g. Boot floor, with the spare"
                            className={inputCls}
                        />
                    </div>
                </div>

                <div>
                    <h3 className="text-lg font-bold text-ink">Checks</h3>
                    <p className="mt-0.5 text-sm text-ink-3">Every item starts at Pass. Tap a status to cycle Pass → Advisory → Fail → N/A.</p>
                    <div className="mt-3 space-y-2">
                        {sections.map(section => {
                            const open = !!expanded[section.id];
                            const passCount = section.items.filter(i => i.status === 'pass').length;
                            const secAdvisory = section.items.filter(i => i.status === 'advisory').length;
                            const secFail = section.items.filter(i => i.status === 'fail').length;
                            const secNa = section.items.filter(i => i.status === 'na').length;
                            const allPass = passCount === section.items.length;
                            return (
                                <div key={section.id} className="rounded-control border border-line bg-surface">
                                    <button
                                        type="button"
                                        onClick={() => setExpanded(prev => ({ ...prev, [section.id]: !open }))}
                                        aria-expanded={open}
                                        aria-controls={`pdi-section-${section.id}`}
                                        className="flex min-h-[52px] w-full items-center justify-between gap-2 rounded-control px-3 text-start transition-colors duration-quick ease-out hover:bg-surface-2"
                                    >
                                        <span className="flex items-center gap-2 min-w-0">
                                            <ChevronDownIcon className={`h-5 w-5 flex-none text-ink-3 transition-transform duration-quick ease-out ${open ? '' : '-rotate-90 rtl:rotate-90'}`} />
                                            <span className="truncate text-base font-semibold text-ink">{section.title}</span>
                                        </span>
                                        <span className="flex flex-none items-center gap-2 text-sm font-semibold">
                                            {allPass ? (
                                                <span className="inline-flex items-center gap-1 text-success">
                                                    <CheckCircleIcon className="h-4 w-4" />{passCount} pass
                                                </span>
                                            ) : (
                                                <>
                                                    <span className="text-ink-3">{passCount} pass</span>
                                                    {secAdvisory > 0 && <span className="text-warning">{secAdvisory} adv</span>}
                                                    {secFail > 0 && <span className="text-danger">{secFail} fail</span>}
                                                    {secNa > 0 && <span className="text-ink-3">{secNa} n/a</span>}
                                                </>
                                            )}
                                        </span>
                                    </button>
                                    {open && (
                                        <div id={`pdi-section-${section.id}`} className="border-t border-line px-3 pb-3">
                                            {!allPass && (
                                                <div className="flex justify-end pt-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => resetSection(section.id)}
                                                        className="min-h-[44px] rounded-control px-2 text-sm font-semibold text-accent-text hover:bg-accent-soft"
                                                    >
                                                        Set all to Pass
                                                    </button>
                                                </div>
                                            )}
                                            <ul className="divide-y divide-line">
                                                {section.items.map(item => (
                                                    <li key={item.id} className="py-2">
                                                        <div className="flex items-center gap-3">
                                                            <span className="min-w-0 flex-1 text-base text-ink">{item.label}</span>
                                                            <StatusButton
                                                                status={item.status}
                                                                itemLabel={item.label}
                                                                onCycle={() => cycleItem(section.id, item.id)}
                                                            />
                                                        </div>
                                                        {(item.status !== 'pass' || item.note) && (
                                                            <input
                                                                type="text"
                                                                value={item.note || ''}
                                                                onChange={e => setItemNote(section.id, item.id, e.target.value)}
                                                                placeholder="Note for the certificate (optional)"
                                                                aria-label={`Note for ${item.label}`}
                                                                className={`mt-1.5 ${compactInput}`}
                                                            />
                                                        )}
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>

                <div>
                    <h3 className="text-lg font-bold text-ink">Tyres</h3>
                    <p className="mt-0.5 text-sm text-ink-3">Legal minimum tread is {LEGAL_TREAD_MM}mm; under {ADVISORY_TREAD_MM}mm is worth advising.</p>
                    <div className="mt-3 space-y-3">
                        {tyres.map(tyre => {
                            const meta = TYRE_POSITIONS.find(p => p.position === tyre.position);
                            const verdict = treadVerdict(tyre.treadStr === '' ? null : parseFloat(tyre.treadStr));
                            const treadColour =
                                verdict === 'fail' ? 'text-danger border-danger' :
                                verdict === 'advisory' ? 'text-warning border-warning' :
                                verdict === 'pass' ? 'text-success' : 'text-ink';
                            const isSpare = tyre.position === 'Spare';
                            return (
                                <div key={tyre.position} className="rounded-control border border-line bg-surface p-3">
                                    <div className="flex items-center justify-between gap-2 flex-wrap">
                                        <span className="flex items-baseline gap-2 min-w-0">
                                            <span className="w-12 flex-none font-mono text-sm font-semibold text-ink-2">{tyre.position}</span>
                                            <span className="truncate text-base font-semibold text-ink">{meta?.label || tyre.position}</span>
                                        </span>
                                        <span className="flex items-center gap-3 flex-shrink-0">
                                            {isSpare && (
                                                <label className="flex min-h-[44px] cursor-pointer items-center gap-2 text-sm font-semibold text-ink-2">
                                                    <input
                                                        type="checkbox"
                                                        checked={tyre.fitted}
                                                        onChange={e => updateTyre(tyre.position, { fitted: e.target.checked })}
                                                        className="h-5 w-5 rounded-chip accent-[rgb(var(--c-accent))]"
                                                    />
                                                    Fitted
                                                </label>
                                            )}
                                            {tyre.fitted && (
                                                <StatusButton
                                                    status={tyre.status}
                                                    itemLabel={`${meta?.label || tyre.position} tyre`}
                                                    onCycle={() => updateTyre(tyre.position, { status: nextPdiStatus(tyre.status) })}
                                                />
                                            )}
                                        </span>
                                    </div>
                                    {tyre.fitted ? (
                                        <>
                                            <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-2">
                                                <div>
                                                    <label htmlFor={`tyre-${tyre.position}-make`} className="mb-1 block text-sm font-semibold text-ink-2">Make</label>
                                                    <input
                                                        type="text"
                                                        id={`tyre-${tyre.position}-make`}
                                                        value={tyre.makeStr}
                                                        onChange={e => updateTyre(tyre.position, { makeStr: e.target.value })}
                                                        placeholder="e.g. Michelin"
                                                        className={compactInput}
                                                    />
                                                </div>
                                                <div>
                                                    <label htmlFor={`tyre-${tyre.position}-size`} className="mb-1 block text-sm font-semibold text-ink-2">Size</label>
                                                    <input
                                                        type="text"
                                                        id={`tyre-${tyre.position}-size`}
                                                        value={tyre.sizeStr}
                                                        onChange={e => updateTyre(tyre.position, { sizeStr: e.target.value })}
                                                        placeholder="205/55 R16"
                                                        className={compactInput}
                                                    />
                                                </div>
                                                <div>
                                                    <label htmlFor={`tyre-${tyre.position}-tread`} className="mb-1 block text-sm font-semibold text-ink-2">Tread (mm)</label>
                                                    <input
                                                        type="number"
                                                        id={`tyre-${tyre.position}-tread`}
                                                        value={tyre.treadStr}
                                                        onChange={e => updateTyre(tyre.position, { treadStr: e.target.value })}
                                                        step="0.1"
                                                        min="0"
                                                        inputMode="decimal"
                                                        placeholder="e.g. 5.5"
                                                        className={`${compactInput} num font-semibold ${treadColour}`}
                                                    />
                                                </div>
                                            </div>
                                            {verdict === 'fail' && (
                                                <p className="mt-1.5 text-sm font-semibold text-danger">Below the {LEGAL_TREAD_MM}mm legal minimum — prints as a fail.</p>
                                            )}
                                            {verdict === 'advisory' && (
                                                <p className="mt-1.5 text-sm font-semibold text-warning">Under {ADVISORY_TREAD_MM}mm — prints as an advisory.</p>
                                            )}
                                        </>
                                    ) : (
                                        <p className="mt-1.5 text-sm text-ink-3">No spare carried — left off the certificate.</p>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>

                <div className={`rounded-card border p-4 transition-colors duration-quick ease-out ${roadworthy ? 'border-success bg-success-soft' : 'border-danger bg-danger-soft'}`}>
                    <div className="flex items-center gap-3">
                        <ShieldCheckIcon className={`h-7 w-7 flex-shrink-0 ${roadworthy ? 'text-success' : 'text-danger'}`} />
                        <div className="min-w-0">
                            <span className="block text-base font-bold text-ink">Roadworthy?</span>
                            <span className="block text-sm text-ink-2">The headline verdict on the certificate.</span>
                        </div>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                        <button
                            type="button"
                            onClick={() => setRoadworthy(true)}
                            aria-pressed={roadworthy}
                            className={`inline-flex min-h-[48px] items-center justify-center gap-2 rounded-control border px-3 text-base font-semibold transition-colors duration-quick ease-out ${
                                roadworthy
                                    ? 'border-success bg-success-soft text-success-ink'
                                    : 'border-line-strong bg-surface text-ink-2 hover:bg-surface-2'
                            }`}
                        >
                            <CheckCircleIcon className={`h-5 w-5 flex-shrink-0 ${roadworthy ? 'text-success' : 'text-ink-3'}`} />
                            Roadworthy
                        </button>
                        <button
                            type="button"
                            onClick={() => setRoadworthy(false)}
                            aria-pressed={!roadworthy}
                            className={`inline-flex min-h-[48px] items-center justify-center gap-2 rounded-control border px-3 text-base font-semibold transition-colors duration-quick ease-out ${
                                !roadworthy
                                    ? 'border-danger bg-danger-soft text-danger-ink'
                                    : 'border-line-strong bg-surface text-ink-2 hover:bg-surface-2'
                            }`}
                        >
                            <XCircleIcon className={`h-5 w-5 flex-shrink-0 ${!roadworthy ? 'text-danger' : 'text-ink-3'}`} />
                            Not roadworthy
                        </button>
                    </div>
                    {roadworthy && failCount > 0 && (
                        <p className="mt-2 flex items-start gap-1.5 text-sm font-semibold text-warning-ink">
                            <ExclamationTriangleIcon className="h-4 w-4 flex-shrink-0" />
                            This inspection has {failCount} failed check{failCount === 1 ? '' : 's'}.
                        </p>
                    )}
                </div>

                <div>
                    <label htmlFor="pdiAdvisoryNotes" className="mb-1.5 block text-sm font-semibold text-ink">Advisory notes <span className="font-normal text-ink-3">(optional)</span></label>
                    <textarea
                        id="pdiAdvisoryNotes"
                        value={advisoryNotes}
                        onChange={e => setAdvisoryNotes(e.target.value)}
                        rows={3}
                        placeholder="Anything the buyer should know that isn’t tied to one check"
                        className={inputCls}
                    />
                </div>
            </form>

            <footer className="flex flex-none flex-wrap items-center justify-end gap-3 border-t border-line bg-surface p-4">
                <div className="me-auto min-w-0 text-sm font-semibold" aria-live="polite">
                    {advisoryCount === 0 && failCount === 0 ? (
                        <span className="inline-flex items-center gap-1.5 text-success">
                            <CheckCircleIcon className="h-4 w-4 flex-shrink-0" />All checks pass
                        </span>
                    ) : (
                        <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
                            {advisoryCount > 0 && (
                                <span className="inline-flex items-center gap-1.5 text-warning">
                                    <ExclamationTriangleIcon className="h-4 w-4 flex-shrink-0" />
                                    {advisoryCount} advisor{advisoryCount === 1 ? 'y' : 'ies'}
                                </span>
                            )}
                            {failCount > 0 && (
                                <span className="inline-flex items-center gap-1.5 text-danger">
                                    <XCircleIcon className="h-4 w-4 flex-shrink-0" />
                                    {failCount} fail{failCount === 1 ? '' : 's'}
                                </span>
                            )}
                        </span>
                    )}
                </div>
                <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button>
                <Button type="submit" form="pdi-editor-form" disabled={!selectedVehicleId}>Preview certificate</Button>
            </footer>
        </div>
    );
};

export default PdiEditor;
