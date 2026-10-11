import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Vehicle, NewInternalJob, InternalJob, InternalJobUpdate, BusinessDetails } from '../../types';
import { TrashIcon } from '../icons';
import CurrencyInput from '../common/CurrencyInput';
import UkDateInput from '../common/UkDateInput';
import { formatCurrency } from '../../utils/helpers';
import PrintableJobSheet from './PrintableJobSheet';
import { useToast, Button, Field, IconButton } from '../ui';
import EditorFrame, { AddLineButton, FrameInput, FrameTextarea, TotalLine, VehicleSuggestions } from '../work-sheets/EditorFrame';

interface InternalJobEditorProps {
    vehicles: Vehicle[];
    existingJobs: InternalJob[];
    onSubmit: (data: NewInternalJob | InternalJobUpdate, id?: string) => Promise<void>;
    onCancel: () => void;
    businessDetails: BusinessDetails | null;
    editingJob?: InternalJob | null;
}

interface JobItem {
    description: string;
    amount: number;
    amountStr: string;
}

/** Job sheet numbers run sequentially from 1001 so references never collide. */
const nextJobSheetNumber = (jobs: InternalJob[]): string => {
    const highest = jobs.reduce((max, job) => {
        const parsed = parseInt(String(job.jobSheetNumber || ''), 10);
        return !isNaN(parsed) && parsed > max ? parsed : max;
    }, 1000);
    return String(highest + 1);
};

const InternalJobEditor = ({ vehicles, existingJobs, onSubmit, onCancel, businessDetails, editingJob }: InternalJobEditorProps) => {
    const toast = useToast();
    const [selectedVehicleId, setSelectedVehicleId] = useState<string>('');
    const [jobDate, setJobDate] = useState(new Date().toISOString().split('T')[0]);
    const [mileageStr, setMileageStr] = useState('');
    const [notes, setNotes] = useState('');
    const [items, setItems] = useState<JobItem[]>([{ description: '', amount: 0, amountStr: '' }]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [previewData, setPreviewData] = useState<InternalJob | null>(null);

    const isEditing = !!editingJob;

    // Vehicle selection autocomplete
    const [regInput, setRegInput] = useState('');
    const [suggestions, setSuggestions] = useState<Vehicle[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const suggestionBoxRef = useRef<HTMLDivElement>(null);

    const selectedVehicle = useMemo(() => vehicles.find(v => v.id === selectedVehicleId), [vehicles, selectedVehicleId]);

    // Seed from the job being edited. Keyed on job id only: a Firebase push
    // re-creates the vehicles array, and depending on it would wipe the form mid-edit.
    useEffect(() => {
        if (isEditing && editingJob) {
            setSelectedVehicleId(editingJob.vehicleId);
            setJobDate(editingJob.jobDate);
            setMileageStr(typeof editingJob.serviceMileage === 'number' ? String(editingJob.serviceMileage) : '');
            setNotes(editingJob.notes || '');
            setItems(editingJob.items.length > 0
                ? editingJob.items.map(i => ({ ...i, amountStr: String(i.amount ?? '') }))
                : [{ description: '', amount: 0, amountStr: '' }]);
        } else {
            setSelectedVehicleId('');
            setRegInput('');
            setJobDate(new Date().toISOString().split('T')[0]);
            setMileageStr('');
            setNotes('');
            setItems([{ description: '', amount: 0, amountStr: '' }]);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [editingJob?.id, isEditing]);

    // Fill the reg display once the vehicle list arrives. Only ever fills a blank
    // value, so it cannot clobber typing.
    useEffect(() => {
        if (!isEditing || !editingJob || regInput) return;
        const vehicle = vehicles.find(v => v.id === editingJob.vehicleId);
        if (vehicle?.reg) setRegInput(vehicle.reg);
    }, [vehicles, isEditing, editingJob, regInput]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (suggestionBoxRef.current && !suggestionBoxRef.current.contains(event.target as Node)) {
                setShowSuggestions(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleItemChange = (index: number, field: 'description' | 'amountStr', value: string) => {
        const newItems = [...items];
        const item = { ...newItems[index] };
        if (field === 'amountStr') {
            item.amountStr = value;
            item.amount = parseFloat(value) || 0;
        } else {
            item.description = value;
        }
        newItems[index] = item;
        setItems(newItems);
    };

    const addItem = () => setItems([...items, { description: '', amount: 0, amountStr: '' }]);

    const removeItem = (index: number) => {
        if (items.length > 1) setItems(items.filter((_, i) => i !== index));
    };

    const totalAmount = useMemo(() => items.reduce((sum, item) => sum + (item.amount || 0), 0), [items]);

    const handleRegInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (isEditing) return;
        const value = e.target.value;
        setRegInput(value);
        setSelectedVehicleId('');

        if (value.trim() === '') {
            setSuggestions([]);
            setShowSuggestions(false);
            return;
        }

        const lowerValue = value.toLowerCase();
        setSuggestions(vehicles.filter(v =>
            (v.reg || '').toLowerCase().includes(lowerValue) ||
            (v.make || '').toLowerCase().includes(lowerValue) ||
            (v.model || '').toLowerCase().includes(lowerValue)
        ).slice(0, 5));
        setShowSuggestions(true);
    };

    const handleSuggestionClick = (vehicle: Vehicle) => {
        setSelectedVehicleId(vehicle.id);
        setRegInput(vehicle.reg);
        setMileageStr(prev => (prev.trim() === '' && typeof vehicle.mileage === 'number' ? String(vehicle.mileage) : prev));
        setSuggestions([]);
        setShowSuggestions(false);
    };

    const handleGeneratePreview = (e: React.FormEvent) => {
        e.preventDefault();
        const vehicle = vehicles.find(v => v.id === selectedVehicleId);
        if (!vehicle) {
            toast.error('Please select a valid vehicle from the list.');
            return;
        }

        const finalItems = items
            .filter(item => item.description.trim() !== '')
            .map(({ amountStr, ...rest }) => rest);

        const parsedMileage = parseInt(mileageStr.replace(/[^0-9]/g, ''), 10);

        setPreviewData({
            id: editingJob?.id || 'temp-preview-id',
            jobSheetNumber: editingJob?.jobSheetNumber || nextJobSheetNumber(existingJobs),
            vehicleId: vehicle.id,
            carDetails: { ...vehicle },
            jobDate,
            // null rather than undefined: Firebase rejects undefined, and on an update
            // an omitted key would keep the old value instead of clearing it.
            serviceMileage: isNaN(parsedMileage) ? null : parsedMileage,
            notes: notes.trim() || null,
            items: finalItems,
            totalAmount: finalItems.reduce((sum, item) => sum + (item.amount || 0), 0),
            createdAt: editingJob?.createdAt || Date.now(),
        });
    };

    const handleConfirmSave = async () => {
        if (!previewData) return;
        setIsSubmitting(true);
        const { id, createdAt, ...submissionData } = previewData;
        try {
            await onSubmit(submissionData as NewInternalJob | InternalJobUpdate, isEditing ? editingJob.id : undefined);
            onCancel();
        } catch (error) {
            console.error('Failed to save internal job sheet:', error);
            toast.error("Could not save the job sheet. Please try again.");
            setPreviewData(null);
        } finally {
            setIsSubmitting(false);
        }
    };

    if (previewData) {
        return (
            <PrintableJobSheet
                job={previewData}
                businessDetails={businessDetails}
                onClose={onCancel}
                isPreview={true}
                onBack={() => setPreviewData(null)}
                onConfirm={handleConfirmSave}
            />
        );
    }

    return (
        <EditorFrame
            title={isEditing ? <>Edit job sheet <span className="num">#{editingJob.jobSheetNumber}</span></> : 'New internal job sheet'}
            onClose={onCancel}
            formId="internal-job-editor-form"
            onSubmit={handleGeneratePreview}
            footer={<>
                <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button>
                <Button type="submit" form="internal-job-editor-form" loading={isSubmitting} disabled={!selectedVehicleId}>
                    {isEditing ? 'Preview changes' : 'Preview job sheet'}
                </Button>
            </>}
        >
            <p className="rounded-control bg-surface-2 px-3.5 py-2.5 text-sm text-ink-2">
                Internal job sheets record in-house cost only. They are not customer documents and carry no VAT.
            </p>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="relative md:col-span-2" ref={suggestionBoxRef}>
                    <Field label="Vehicle" htmlFor="internalJobVehicle" hint={isEditing ? 'The vehicle stays the same on a saved job sheet.' : undefined}>
                        <FrameInput
                            type="text"
                            id="internalJobVehicle"
                            value={regInput}
                            onChange={handleRegInputChange}
                            required
                            disabled={isEditing}
                            placeholder="Search reg, make or model"
                            className="font-mono uppercase tracking-[0.06em]"
                            autoComplete="off"
                        />
                    </Field>
                    {showSuggestions && suggestions.length > 0 && (
                        <VehicleSuggestions vehicles={suggestions} onPick={handleSuggestionClick} />
                    )}
                </div>
                <Field label="Job date" htmlFor="jobDate">
                    <UkDateInput id="jobDate" name="jobDate" value={jobDate} onChange={e => setJobDate(e.target.value)} required />
                </Field>
                <Field label="Mileage at job" optional htmlFor="internalJobMileage">
                    <FrameInput
                        type="text"
                        inputMode="numeric"
                        id="internalJobMileage"
                        value={mileageStr}
                        onChange={e => setMileageStr(e.target.value)}
                        placeholder={selectedVehicle?.mileage ? `${selectedVehicle.mileage.toLocaleString()} on record` : 'e.g. 44,229'}
                        className="num"
                    />
                </Field>
            </div>
            <fieldset>
                <legend className="mb-2 text-base font-bold text-ink">Work carried out</legend>
                <div className="divide-y divide-line rounded-card border border-line">
                    {items.map((item, index) => (
                        <div key={index} className="flex flex-wrap items-center gap-2 p-2.5 sm:flex-nowrap">
                            <div className="min-w-0 basis-full sm:flex-1 sm:basis-0">
                                <label htmlFor={`internal-desc-${index}`} className="sr-only">Work done, line {index + 1}</label>
                                <FrameInput id={`internal-desc-${index}`} type="text" placeholder="e.g. Full service" value={item.description} onChange={e => handleItemChange(index, 'description', e.target.value)} />
                            </div>
                            <div className="min-w-0 flex-1 sm:w-36 sm:flex-none">
                                <label htmlFor={`internal-amount-${index}`} className="sr-only">Cost, line {index + 1}</label>
                                <CurrencyInput id={`internal-amount-${index}`} value={item.amountStr} onChange={e => handleItemChange(index, 'amountStr', e.target.value)} />
                            </div>
                            <IconButton label={`Remove line ${index + 1}`} icon={<TrashIcon />} onClick={() => removeItem(index)} disabled={items.length <= 1} />
                        </div>
                    ))}
                </div>
                <div className="mt-2">
                    <AddLineButton onClick={addItem} />
                </div>
            </fieldset>
            <Field label="Notes" optional htmlFor="internalJobNotes">
                <FrameTextarea
                    id="internalJobNotes"
                    rows={2}
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    placeholder="Anything worth recording against this job"
                />
            </Field>
            <div className="border-t border-line pt-4">
                <TotalLine strong label="Total cost" value={formatCurrency(totalAmount)} />
            </div>
        </EditorFrame>
    );
};

export default InternalJobEditor;
