import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Vehicle, PDI, NewPDI, BusinessDetails, PdiCheckStatus, PdiSection, PdiTyre, PdiTyrePosition } from '../../types';
import { XMarkIcon, ChevronDownIcon, ShieldCheckIcon, CheckCircleIcon, XCircleIcon, ExclamationTriangleIcon } from '../icons';
import UkDateInput from '../common/UkDateInput';
import PrintablePdi from './PrintablePdi';
import { useToast } from '../ui';
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
    pass: { classes: 'border-green-500/40 bg-green-500/10 text-green-400 hover:border-green-400/70', Icon: CheckCircleIcon },
    advisory: { classes: 'border-amber-500/50 bg-amber-500/10 text-amber-400 hover:border-amber-400/70', Icon: ExclamationTriangleIcon },
    fail: { classes: 'border-red-500/50 bg-red-500/10 text-red-400 hover:border-red-400/70', Icon: XCircleIcon },
    na: { classes: 'border-gray-600 bg-gray-700/60 text-gray-400 hover:border-gray-500', Icon: null },
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
            className={`inline-flex w-24 flex-shrink-0 items-center justify-center gap-1.5 rounded-full border px-2 py-1 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-1 focus:ring-offset-gray-900 ${classes}`}
        >
            {Icon && <Icon className="h-4 w-4" />}
            {PDI_STATUS_LABEL[status]}
        </button>
    );
};

const compactInput = 'block w-full bg-gray-700 border border-gray-600 rounded-md shadow-sm py-1.5 px-2.5 text-sm text-white focus:outline-none focus:ring-brand-500 focus:border-brand-500';

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
            toast.error('Please select a valid vehicle from the list.');
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
            toast.error('Could not save the PDI. Please try again.');
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
            <header className="p-4 border-b border-gray-700 flex items-center justify-between gap-3 flex-shrink-0">
                <div className="min-w-0">
                    <h2 className="text-lg font-bold text-white flex items-center gap-2">
                        <ShieldCheckIcon className="h-5 w-5 text-brand-400 flex-shrink-0" />
                        <span className="truncate">{isEditing ? 'Edit Pre-Delivery Inspection' : 'Pre-Delivery Inspection'}</span>
                    </h2>
                    <p className="text-xs text-gray-400 mt-0.5">PDI #{pdiNumber}</p>
                </div>
                <button type="button" onClick={onCancel} className="p-1 rounded-full text-gray-400 hover:bg-gray-700 hover:text-white flex-shrink-0" aria-label="Close">
                    <XMarkIcon className="h-6 w-6" />
                </button>
            </header>

            <form id="pdi-editor-form" onSubmit={handleGeneratePreview} className="p-6 space-y-6 flex-1 overflow-y-auto">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="relative md:col-span-2" ref={suggestionBoxRef}>
                        <label htmlFor="pdiVehicleReg" className="block text-sm font-medium text-gray-300 mb-1">Vehicle</label>
                        <input
                            type="text"
                            id="pdiVehicleReg"
                            value={regInput}
                            onChange={handleRegInputChange}
                            required
                            disabled={vehicleLocked}
                            placeholder="Search by Reg, Make, Model..."
                            className="block w-full bg-gray-700 border border-gray-600 rounded-md shadow-sm py-2 px-3 text-white uppercase focus:outline-none focus:ring-brand-500 focus:border-brand-500 disabled:bg-gray-800 disabled:cursor-not-allowed"
                            autoComplete="off"
                        />
                        {showSuggestions && suggestions.length > 0 && (
                            <ul className="absolute z-10 mt-1 w-full bg-gray-600 border border-gray-500 rounded-md shadow-lg max-h-60 overflow-auto">
                                {suggestions.map(v => (
                                    <li key={v.id}>
                                        <button
                                            type="button"
                                            onClick={() => handleSuggestionClick(v)}
                                            className="w-full text-left px-4 py-2 text-sm text-white hover:bg-brand-600 flex justify-between items-center"
                                        >
                                            <div>
                                                <span className="font-bold">{v.reg}</span> - {v.make} {v.model}
                                            </div>
                                            <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                                                v.status === 'Sold' ? 'bg-red-800 text-red-200' :
                                                v.status === 'Deposit Paid' ? 'bg-cyan-800 text-cyan-200' :
                                                'bg-green-800 text-green-200'
                                            }`}>
                                                {v.status}
                                            </span>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                        {selectedVehicle && (
                            <p className="mt-1 text-xs text-gray-400">
                                {selectedVehicle.make} {selectedVehicle.model}{selectedVehicle.year ? ` · ${selectedVehicle.year}` : ''}
                            </p>
                        )}
                    </div>
                    <div>
                        <label htmlFor="pdiDate" className="block text-sm font-medium text-gray-300 mb-1">Inspection Date</label>
                        <UkDateInput id="pdiDate" name="pdiDate" value={inspectionDate} onChange={e => setInspectionDate(e.target.value)} required />
                    </div>
                    <div>
                        <label htmlFor="pdiMileage" className="block text-sm font-medium text-gray-300 mb-1">Mileage</label>
                        <input
                            type="text"
                            inputMode="numeric"
                            id="pdiMileage"
                            value={mileageStr}
                            onChange={e => setMileageStr(e.target.value)}
                            placeholder={selectedVehicle?.mileage ? `${selectedVehicle.mileage.toLocaleString()} on record` : 'e.g., 44229'}
                            className="block w-full bg-gray-700 border border-gray-600 rounded-md shadow-sm py-2 px-3 text-white focus:outline-none focus:ring-brand-500 focus:border-brand-500"
                        />
                    </div>
                    <div>
                        <label htmlFor="pdiInspector" className="block text-sm font-medium text-gray-300 mb-1">Inspected By (Optional)</label>
                        <input
                            type="text"
                            id="pdiInspector"
                            value={inspectedBy}
                            onChange={e => setInspectedBy(e.target.value)}
                            className="block w-full bg-gray-700 border border-gray-600 rounded-md shadow-sm py-2 px-3 text-white focus:outline-none focus:ring-brand-500 focus:border-brand-500"
                        />
                    </div>
                    <div>
                        <label htmlFor="pdiLockingNut" className="block text-sm font-medium text-gray-300 mb-1">Locking Wheel Nut Key Location</label>
                        <input
                            type="text"
                            id="pdiLockingNut"
                            value={lockingWheelNutLocation}
                            onChange={e => setLockingWheelNutLocation(e.target.value)}
                            placeholder="e.g., Boot floor with the spare"
                            className="block w-full bg-gray-700 border border-gray-600 rounded-md shadow-sm py-2 px-3 text-white focus:outline-none focus:ring-brand-500 focus:border-brand-500"
                        />
                    </div>
                </div>

                <div>
                    <h3 className="text-base font-semibold text-white">Inspection Checklist</h3>
                    <p className="mt-0.5 text-xs text-gray-400">Every item starts at Pass. Tap a status to cycle Pass → Advisory → Fail → N/A.</p>
                    <div className="mt-3 space-y-2">
                        {sections.map(section => {
                            const open = !!expanded[section.id];
                            const passCount = section.items.filter(i => i.status === 'pass').length;
                            const secAdvisory = section.items.filter(i => i.status === 'advisory').length;
                            const secFail = section.items.filter(i => i.status === 'fail').length;
                            const secNa = section.items.filter(i => i.status === 'na').length;
                            const allPass = passCount === section.items.length;
                            return (
                                <div key={section.id} className="bg-gray-900/40 border border-gray-700/50 rounded-lg">
                                    <button
                                        type="button"
                                        onClick={() => setExpanded(prev => ({ ...prev, [section.id]: !open }))}
                                        aria-expanded={open}
                                        aria-controls={`pdi-section-${section.id}`}
                                        className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left rounded-lg hover:bg-gray-800/60 transition-colors"
                                    >
                                        <span className="flex items-center gap-2 min-w-0">
                                            <ChevronDownIcon className={`h-4 w-4 text-gray-500 flex-shrink-0 transition-transform ${open ? '' : '-rotate-90'}`} />
                                            <span className="text-sm font-semibold text-white truncate">{section.title}</span>
                                        </span>
                                        <span className="flex items-center gap-2 flex-shrink-0 text-xs font-medium">
                                            {allPass ? (
                                                <span className="inline-flex items-center gap-1 text-green-500/90">
                                                    <CheckCircleIcon className="h-3.5 w-3.5" />{passCount} pass
                                                </span>
                                            ) : (
                                                <>
                                                    <span className="text-gray-500">{passCount} pass</span>
                                                    {secAdvisory > 0 && <span className="text-amber-400">{secAdvisory} adv</span>}
                                                    {secFail > 0 && <span className="text-red-400">{secFail} fail</span>}
                                                    {secNa > 0 && <span className="text-gray-500">{secNa} n/a</span>}
                                                </>
                                            )}
                                        </span>
                                    </button>
                                    {open && (
                                        <div id={`pdi-section-${section.id}`} className="px-3 pb-3 border-t border-gray-700/50">
                                            {!allPass && (
                                                <div className="flex justify-end pt-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => resetSection(section.id)}
                                                        className="text-xs font-semibold text-brand-400 hover:text-brand-300"
                                                    >
                                                        Reset all to Pass
                                                    </button>
                                                </div>
                                            )}
                                            <ul className="divide-y divide-gray-800">
                                                {section.items.map(item => (
                                                    <li key={item.id} className="py-2">
                                                        <div className="flex items-center gap-3">
                                                            <span className="flex-1 min-w-0 text-sm text-gray-200">{item.label}</span>
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
                    <h3 className="text-base font-semibold text-white">Tyres</h3>
                    <p className="mt-0.5 text-xs text-gray-400">Legal minimum tread is {LEGAL_TREAD_MM}mm; under {ADVISORY_TREAD_MM}mm is worth advising.</p>
                    <div className="mt-3 space-y-3">
                        {tyres.map(tyre => {
                            const meta = TYRE_POSITIONS.find(p => p.position === tyre.position);
                            const verdict = treadVerdict(tyre.treadStr === '' ? null : parseFloat(tyre.treadStr));
                            const treadColour =
                                verdict === 'fail' ? 'text-red-400 border-red-500/60 focus:ring-red-500 focus:border-red-500' :
                                verdict === 'advisory' ? 'text-amber-400 border-amber-500/60 focus:ring-amber-500 focus:border-amber-500' :
                                verdict === 'pass' ? 'text-green-400' : 'text-white';
                            const isSpare = tyre.position === 'Spare';
                            return (
                                <div key={tyre.position} className="bg-gray-900/40 border border-gray-700/50 rounded-lg p-3">
                                    <div className="flex items-center justify-between gap-2 flex-wrap">
                                        <span className="flex items-baseline gap-2 min-w-0">
                                            <span className="text-xs font-bold text-brand-400 w-10 flex-shrink-0">{tyre.position}</span>
                                            <span className="text-sm text-gray-200 truncate">{meta?.label || tyre.position}</span>
                                        </span>
                                        <span className="flex items-center gap-3 flex-shrink-0">
                                            {isSpare && (
                                                <label className="flex items-center gap-2 text-xs font-medium text-gray-300 cursor-pointer">
                                                    <input
                                                        type="checkbox"
                                                        checked={tyre.fitted}
                                                        onChange={e => updateTyre(tyre.position, { fitted: e.target.checked })}
                                                        className="h-4 w-4 rounded border-gray-500 bg-gray-700 text-brand-600 focus:ring-brand-500"
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
                                                    <label htmlFor={`tyre-${tyre.position}-make`} className="block text-xs font-medium text-gray-400 mb-1">Make</label>
                                                    <input
                                                        type="text"
                                                        id={`tyre-${tyre.position}-make`}
                                                        value={tyre.makeStr}
                                                        onChange={e => updateTyre(tyre.position, { makeStr: e.target.value })}
                                                        placeholder="e.g., Michelin"
                                                        className={compactInput}
                                                    />
                                                </div>
                                                <div>
                                                    <label htmlFor={`tyre-${tyre.position}-size`} className="block text-xs font-medium text-gray-400 mb-1">Size</label>
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
                                                    <label htmlFor={`tyre-${tyre.position}-tread`} className="block text-xs font-medium text-gray-400 mb-1">Tread (mm)</label>
                                                    <input
                                                        type="number"
                                                        id={`tyre-${tyre.position}-tread`}
                                                        value={tyre.treadStr}
                                                        onChange={e => updateTyre(tyre.position, { treadStr: e.target.value })}
                                                        step="0.1"
                                                        min="0"
                                                        inputMode="decimal"
                                                        placeholder="e.g., 5.5"
                                                        className={`block w-full bg-gray-700 border border-gray-600 rounded-md shadow-sm py-1.5 px-2.5 text-sm font-semibold focus:outline-none focus:ring-brand-500 focus:border-brand-500 ${treadColour}`}
                                                    />
                                                </div>
                                            </div>
                                            {verdict === 'fail' && (
                                                <p className="mt-1.5 text-xs text-red-400">Below the {LEGAL_TREAD_MM}mm legal minimum — prints as a fail.</p>
                                            )}
                                            {verdict === 'advisory' && (
                                                <p className="mt-1.5 text-xs text-amber-400">Under {ADVISORY_TREAD_MM}mm — prints as an advisory.</p>
                                            )}
                                        </>
                                    ) : (
                                        <p className="mt-1.5 text-xs text-gray-500">No spare carried — left off the certificate.</p>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>

                <div className={`rounded-lg border p-4 transition-colors ${roadworthy ? 'border-green-500/40 bg-green-500/5' : 'border-red-500/50 bg-red-500/10'}`}>
                    <div className="flex items-center gap-3">
                        <ShieldCheckIcon className={`h-7 w-7 flex-shrink-0 ${roadworthy ? 'text-green-400' : 'text-red-400'}`} />
                        <div className="min-w-0">
                            <span className="block text-sm font-semibold text-white">Roadworthiness Declaration</span>
                            <span className="block text-xs text-gray-400">The headline verdict printed on the certificate.</span>
                        </div>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                        <button
                            type="button"
                            onClick={() => setRoadworthy(true)}
                            aria-pressed={roadworthy}
                            className={`inline-flex items-center justify-center gap-2 rounded-md border px-3 py-2.5 text-sm font-semibold transition-colors ${
                                roadworthy
                                    ? 'border-green-500 bg-green-600/20 text-white'
                                    : 'border-gray-600 bg-gray-700 text-gray-300 hover:bg-gray-600'
                            }`}
                        >
                            <CheckCircleIcon className={`h-5 w-5 flex-shrink-0 ${roadworthy ? 'text-green-400' : 'text-gray-400'}`} />
                            Roadworthy
                        </button>
                        <button
                            type="button"
                            onClick={() => setRoadworthy(false)}
                            aria-pressed={!roadworthy}
                            className={`inline-flex items-center justify-center gap-2 rounded-md border px-3 py-2.5 text-sm font-semibold transition-colors ${
                                !roadworthy
                                    ? 'border-red-500 bg-red-600/20 text-white'
                                    : 'border-gray-600 bg-gray-700 text-gray-300 hover:bg-gray-600'
                            }`}
                        >
                            <XCircleIcon className={`h-5 w-5 flex-shrink-0 ${!roadworthy ? 'text-red-400' : 'text-gray-400'}`} />
                            Not Roadworthy
                        </button>
                    </div>
                    {roadworthy && failCount > 0 && (
                        <p className="mt-2 text-xs text-amber-400 flex items-start gap-1.5">
                            <ExclamationTriangleIcon className="h-4 w-4 flex-shrink-0" />
                            This inspection has {failCount} failed check{failCount === 1 ? '' : 's'}.
                        </p>
                    )}
                </div>

                <div>
                    <label htmlFor="pdiAdvisoryNotes" className="block text-sm font-medium text-gray-300 mb-1">Advisory Notes (Optional)</label>
                    <textarea
                        id="pdiAdvisoryNotes"
                        value={advisoryNotes}
                        onChange={e => setAdvisoryNotes(e.target.value)}
                        rows={3}
                        placeholder="Anything the customer should know that isn't tied to a single check..."
                        className="block w-full bg-gray-700 border border-gray-600 rounded-md shadow-sm py-2 px-3 text-white focus:outline-none focus:ring-brand-500 focus:border-brand-500"
                    />
                </div>
            </form>

            <footer className="flex-shrink-0 p-4 border-t border-gray-700 flex justify-end space-x-3 items-center bg-gray-800">
                <div className="mr-auto min-w-0 text-xs font-medium">
                    {advisoryCount === 0 && failCount === 0 ? (
                        <span className="inline-flex items-center gap-1.5 text-green-400">
                            <CheckCircleIcon className="h-4 w-4 flex-shrink-0" />All checks pass
                        </span>
                    ) : (
                        <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
                            {advisoryCount > 0 && (
                                <span className="inline-flex items-center gap-1.5 text-amber-400">
                                    <ExclamationTriangleIcon className="h-4 w-4 flex-shrink-0" />
                                    {advisoryCount} advisor{advisoryCount === 1 ? 'y' : 'ies'}
                                </span>
                            )}
                            {failCount > 0 && (
                                <span className="inline-flex items-center gap-1.5 text-red-400">
                                    <XCircleIcon className="h-4 w-4 flex-shrink-0" />
                                    {failCount} fail{failCount === 1 ? '' : 's'}
                                </span>
                            )}
                        </span>
                    )}
                </div>
                <button type="button" onClick={onCancel} className="px-4 py-2 text-sm font-medium text-gray-300 bg-gray-600 hover:bg-gray-500 rounded-md">Cancel</button>
                <button
                    type="submit"
                    form="pdi-editor-form"
                    disabled={!selectedVehicleId}
                    className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-50"
                >
                    Preview Certificate
                </button>
            </footer>
        </div>
    );
};

export default PdiEditor;
