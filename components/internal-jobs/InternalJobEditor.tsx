import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Vehicle, NewInternalJob, InternalJob, InternalJobUpdate, BusinessDetails } from '../../types';
import { XMarkIcon, PlusIcon, TrashIcon } from '../icons';
import Spinner from '../common/Spinner';
import CurrencyInput from '../common/CurrencyInput';
import UkDateInput from '../common/UkDateInput';
import { formatCurrency } from '../../utils/helpers';
import PrintableJobSheet from './PrintableJobSheet';

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
            alert('Please select a valid vehicle from the list.');
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
        <div className="w-full flex flex-col h-full">
            <header className="p-4 border-b border-gray-700 flex items-center justify-between flex-shrink-0">
                <h2 className="text-lg font-bold text-white">{isEditing ? `Edit Job Sheet #${editingJob.jobSheetNumber}` : 'Create Internal Job Sheet'}</h2>
                <button type="button" onClick={onCancel} className="p-1 rounded-full text-gray-400 hover:bg-gray-700 hover:text-white"><XMarkIcon className="h-6 w-6" /></button>
            </header>
            <form id="internal-job-editor-form" onSubmit={handleGeneratePreview} className="p-6 space-y-6 flex-1 overflow-y-auto">
                <div className="rounded-md border border-gray-700 bg-gray-900/50 px-3 py-2 text-xs text-gray-400">
                    Internal job sheets record in-house cost only. They are not customer documents and carry no VAT.
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="relative md:col-span-2" ref={suggestionBoxRef}>
                        <label htmlFor="internalJobVehicle" className="block text-sm font-medium text-gray-300">Vehicle</label>
                        <input
                            type="text"
                            id="internalJobVehicle"
                            value={regInput}
                            onChange={handleRegInputChange}
                            required
                            disabled={isEditing}
                            placeholder="Search by Reg, Make, Model..."
                            className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md py-2 px-3 text-white uppercase disabled:bg-gray-800 disabled:cursor-not-allowed"
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
                                            <div><span className="font-bold">{v.reg}</span> - {v.make} {v.model}</div>
                                            <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                                                v.status === 'Sold' ? 'bg-red-800 text-red-200' :
                                                v.status === 'Deposit Paid' ? 'bg-cyan-800 text-cyan-200' :
                                                'bg-green-800 text-green-200'
                                            }`}>{v.status}</span>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                    <div>
                        <label htmlFor="jobDate" className="block text-sm font-medium text-gray-300">Job Date</label>
                        <UkDateInput id="jobDate" name="jobDate" value={jobDate} onChange={e => setJobDate(e.target.value)} className="mt-1" required />
                    </div>
                    <div>
                        <label htmlFor="internalJobMileage" className="block text-sm font-medium text-gray-300">Mileage at Job (Optional)</label>
                        <input
                            type="text"
                            inputMode="numeric"
                            id="internalJobMileage"
                            value={mileageStr}
                            onChange={e => setMileageStr(e.target.value)}
                            placeholder={selectedVehicle?.mileage ? `${selectedVehicle.mileage.toLocaleString()} on record` : 'e.g., 44229'}
                            className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md py-2 px-3 text-white"
                        />
                    </div>
                </div>
                <div>
                    <h3 className="text-base font-semibold text-white">Work Carried Out</h3>
                    <div className="mt-2 space-y-3">
                        {items.map((item, index) => (
                            <div key={index} className="flex items-start gap-2">
                                <div className="flex-1">
                                    <label htmlFor={`internal-desc-${index}`} className="sr-only">Description</label>
                                    <input id={`internal-desc-${index}`} type="text" placeholder="e.g., Full Service" value={item.description} onChange={e => handleItemChange(index, 'description', e.target.value)} className="block w-full bg-gray-700 border-gray-600 rounded-md py-2 px-3 text-white" />
                                </div>
                                <div className="w-36">
                                    <label htmlFor={`internal-amount-${index}`} className="sr-only">Cost</label>
                                    <CurrencyInput id={`internal-amount-${index}`} value={item.amountStr} onChange={e => handleItemChange(index, 'amountStr', e.target.value)} />
                                </div>
                                <button type="button" onClick={() => removeItem(index)} disabled={items.length <= 1} className="p-2 text-gray-400 hover:text-red-400 disabled:opacity-50 mt-1"><TrashIcon className="h-5 w-5" /></button>
                            </div>
                        ))}
                        <button type="button" onClick={addItem} className="w-full text-sm font-semibold text-brand-400 hover:text-brand-300 flex items-center justify-center gap-2 p-2 border-2 border-dashed border-gray-600 rounded-lg hover:border-gray-500">
                            <PlusIcon className="h-4 w-4" /> Add Line Item
                        </button>
                    </div>
                </div>
                <div>
                    <label htmlFor="internalJobNotes" className="block text-sm font-medium text-gray-300">Notes (Optional)</label>
                    <textarea
                        id="internalJobNotes"
                        rows={2}
                        value={notes}
                        onChange={e => setNotes(e.target.value)}
                        placeholder="Anything worth recording against this job"
                        className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md py-2 px-3 text-white"
                    />
                </div>
                <div className="pt-4 border-t border-gray-700 text-right">
                    <p className="text-lg font-bold text-brand-400">Total Cost</p>
                    <p className="text-3xl font-bold text-white">{formatCurrency(totalAmount)}</p>
                </div>
            </form>
            <footer className="flex-shrink-0 p-4 border-t border-gray-700 flex justify-end space-x-3 items-center bg-gray-800">
                <button type="button" onClick={onCancel} className="px-4 py-2 text-sm font-medium text-gray-300 bg-gray-600 hover:bg-gray-500 rounded-md">Cancel</button>
                <button type="submit" form="internal-job-editor-form" disabled={isSubmitting || !selectedVehicleId} className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-50">
                    {isSubmitting ? <Spinner /> : (isEditing ? 'Update & Preview' : 'Generate Preview')}
                </button>
            </footer>
        </div>
    );
};

export default InternalJobEditor;
