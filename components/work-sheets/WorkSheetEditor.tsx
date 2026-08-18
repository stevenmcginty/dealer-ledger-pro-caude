import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Vehicle, NewWorkSheet, WorkSheet, BusinessDetails, WorkSheetUpdate, workSheetRecordType } from '../../types';
import { XMarkIcon, PlusIcon, TrashIcon } from '../icons';
import Spinner from '../common/Spinner';
import PrintableWorkSheet from './PrintableWorkSheet';
import UkDateInput from '../common/UkDateInput';
import CurrencyInput from '../common/CurrencyInput';
import { formatCurrency } from '../../utils/helpers';
import Select from '../common/Select';
import { useToast } from '../ui';

interface WorkSheetEditorProps {
    vehicles: Vehicle[];
    onSubmit: (data: NewWorkSheet | WorkSheetUpdate, id?: string) => Promise<void>;
    onCancel: () => void;
    businessDetails: BusinessDetails | null;
    editingSheet?: WorkSheet | null;
}

interface WorkItem {
    description: string;
    amount?: number;
    amountStr: string;
}

const WorkSheetEditor = ({ vehicles, onSubmit, onCancel, businessDetails, editingSheet }: WorkSheetEditorProps) => {
    const toast = useToast();
    const [selectedVehicleId, setSelectedVehicleId] = useState<string>('');
    const [workDate, setWorkDate] = useState(new Date().toISOString().split('T')[0]);
    const [recordType, setRecordType] = useState<'customer' | 'internal'>('customer');
    const [vatApplied, setVatApplied] = useState(false);
    const [customerName, setCustomerName] = useState('');
    const [mileageStr, setMileageStr] = useState('');
    const [items, setItems] = useState<WorkItem[]>([{ description: '', amount: undefined, amountStr: '' }]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [previewData, setPreviewData] = useState<WorkSheet | null>(null);

    const isEditing = !!editingSheet;

    // State for vehicle selection autocomplete
    const [regInput, setRegInput] = useState('');
    const [suggestions, setSuggestions] = useState<Vehicle[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const suggestionBoxRef = useRef<HTMLDivElement>(null);

    const selectedVehicle = useMemo(() => vehicles.find(v => v.id === selectedVehicleId), [vehicles, selectedVehicleId]);

    const searchableVehicles = useMemo(() => {
        if (isEditing && editingSheet) {
            const currentVehicle = vehicles.find(v => v.id === editingSheet.vehicleId);
            return currentVehicle ? [currentVehicle] : [];
        }
        return vehicles;
    }, [vehicles, isEditing, editingSheet]);

    // Seed the form from the sheet being edited. Keyed on the sheet id only: a
    // Firebase push re-creates the `vehicles` array, and depending on it here would
    // re-run this and wipe whatever the user had typed (date included) mid-edit.
    useEffect(() => {
        if (isEditing && editingSheet) {
            setSelectedVehicleId(editingSheet.vehicleId);
            setWorkDate(editingSheet.workDate);
            setRecordType(workSheetRecordType(editingSheet));
            setVatApplied(editingSheet.vatApplied === true);
            setCustomerName(editingSheet.customerName || '');
            setMileageStr(typeof editingSheet.serviceMileage === 'number' ? String(editingSheet.serviceMileage) : '');
            setItems(editingSheet.items.length > 0 ? editingSheet.items.map(i => ({...i, amountStr: i.amount !== undefined ? String(i.amount) : ''})) : [{ description: '', amount: undefined, amountStr: '' }]);
        } else {
            setSelectedVehicleId('');
            setRegInput('');
            setWorkDate(new Date().toISOString().split('T')[0]);
            setRecordType('customer');
            setVatApplied(false);
            setCustomerName('');
            setMileageStr('');
            setItems([{ description: '', amount: undefined, amountStr: '' }]);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [editingSheet?.id, isEditing]);

    // Fill the (read-only, while editing) reg display once the vehicle list arrives.
    // Only ever fills a blank value, so it cannot clobber user input.
    useEffect(() => {
        if (!isEditing || !editingSheet || regInput) return;
        const vehicle = vehicles.find(v => v.id === editingSheet.vehicleId);
        if (vehicle?.reg) setRegInput(vehicle.reg);
    }, [vehicles, isEditing, editingSheet, regInput]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (suggestionBoxRef.current && !suggestionBoxRef.current.contains(event.target as Node)) {
                setShowSuggestions(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const handleItemChange = (index: number, field: 'description' | 'amountStr', value: string) => {
        const newItems = [...items];
        const item = { ...newItems[index] };
        if (field === 'amountStr') {
            item.amountStr = value;
            const num = parseFloat(value);
            item.amount = isNaN(num) ? undefined : num;
        } else {
            item.description = value;
        }
        newItems[index] = item;
        setItems(newItems);
    };

    const addItem = () => {
        setItems([...items, { description: '', amount: undefined, amountStr: '' }]);
    };

    const removeItem = (index: number) => {
        if (items.length > 1) {
            setItems(items.filter((_, i) => i !== index));
        }
    };
    
    const totalAmount = useMemo(() => items.reduce((sum, item) => sum + (item.amount || 0), 0), [items]);
    const vatAmount = recordType === 'customer' && vatApplied ? totalAmount * 0.2 : 0;
    const totalDue = totalAmount + vatAmount;
    
    const handleGeneratePreview = (e: React.FormEvent) => {
        e.preventDefault();
        const vehicle = vehicles.find(v => v.id === selectedVehicleId);
        if (!vehicle) {
            toast.error('Please select a valid vehicle from the list.');
            return;
        }

        const workSheetNumber = editingSheet?.workSheetNumber || String(Math.floor(1000 + Math.random() * 9000));
        
        const finalItems = items
          .filter(item => item.description && item.description.trim() !== '')
          .map(item => {
            const newItem: { description: string; amount?: number } = {
              description: item.description,
            };
            if (typeof item.amount === 'number') {
              newItem.amount = item.amount;
            }
            return newItem;
          });

        const { id: vehicleIdToOmit, createdAt: vehicleCreatedAtToOmit, status: vehicleStatusToOmit, ...carDetailsForSheet } = vehicle;

        const parsedMileage = parseInt(mileageStr.replace(/[^0-9]/g, ''), 10);

        const sheetData: WorkSheet = {
            id: editingSheet?.id || 'temp-preview-id',
            workSheetNumber,
            vehicleId: vehicle.id,
            carDetails: carDetailsForSheet,
            workDate,
            recordType,
            vatApplied: recordType === 'customer' && vatApplied,
            // null rather than undefined: Firebase rejects undefined, and on an update
            // an omitted key would silently keep the old value instead of clearing it.
            customerName: recordType === 'customer' && customerName.trim() ? customerName.trim() : null,
            serviceMileage: isNaN(parsedMileage) ? null : parsedMileage,
            items: finalItems,
            createdAt: editingSheet?.createdAt || Date.now(),
        };

        setPreviewData(sheetData);
    };
    
    const handleConfirmSave = async () => {
        if (!previewData) return;
        setIsSubmitting(true);
        const { id, createdAt, ...submissionData } = previewData;
        try {
            await onSubmit(submissionData as NewWorkSheet | WorkSheetUpdate, isEditing ? editingSheet.id : undefined);
            onCancel(); // this is closeModal from parent
        } catch (error) {
            console.error("Failed to save work sheet:", error);
            toast.error("Could not save the work sheet. Please try again.");
            setPreviewData(null);
        } finally {
            setIsSubmitting(false);
        }
    };

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
        const filtered = searchableVehicles.filter(v => 
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

    if (previewData) {
        return (
            <PrintableWorkSheet 
                sheet={previewData}
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
                <h2 className="text-lg font-bold text-white">{isEditing ? `Edit Work Sheet #${editingSheet.workSheetNumber}`: 'Create Work Sheet'}</h2>
                <button type="button" onClick={onCancel} className="p-1 rounded-full text-gray-400 hover:bg-gray-700 hover:text-white"><XMarkIcon className="h-6 w-6" /></button>
            </header>
            <form id="worksheet-editor-form" onSubmit={handleGeneratePreview} className="p-6 space-y-6 flex-1 overflow-y-auto">
                <div>
                    <span className="block text-sm font-medium text-gray-300">Record Type</span>
                    <div className="mt-1 grid grid-cols-2 gap-2">
                        {([
                            { key: 'customer' as const, label: 'Chargeable Work', hint: 'Prints as a work receipt' },
                            { key: 'internal' as const, label: 'Internal / In-House', hint: 'Prints as an internal record' },
                        ]).map(option => (
                            <button
                                key={option.key}
                                type="button"
                                onClick={() => setRecordType(option.key)}
                                aria-pressed={recordType === option.key}
                                className={`rounded-md border px-3 py-2 text-left transition-colors ${
                                    recordType === option.key
                                        ? 'border-brand-500 bg-brand-600/20 text-white'
                                        : 'border-gray-600 bg-gray-700 text-gray-300 hover:bg-gray-600'
                                }`}
                            >
                                <span className="block text-sm font-semibold">{option.label}</span>
                                <span className="block text-xs text-gray-400">{option.hint}</span>
                            </button>
                        ))}
                    </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="relative md:col-span-2" ref={suggestionBoxRef}>
                        <label htmlFor="vehicleReg" className="block text-sm font-medium text-gray-300">Vehicle</label>
                        <input 
                            type="text"
                            id="vehicleReg"
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
                    </div>
                     <div>
                        <label htmlFor="workDate" className="block text-sm font-medium text-gray-300">Date</label>
                        <UkDateInput id="workDate" name="workDate" value={workDate} onChange={e => setWorkDate(e.target.value)} className="mt-1" required />
                    </div>
                    <div>
                        <label htmlFor="serviceMileage" className="block text-sm font-medium text-gray-300">Mileage at Service (Optional)</label>
                        <input
                            type="text"
                            inputMode="numeric"
                            id="serviceMileage"
                            value={mileageStr}
                            onChange={e => setMileageStr(e.target.value)}
                            placeholder={selectedVehicle?.mileage ? `${selectedVehicle.mileage.toLocaleString()} on record` : 'e.g., 44229'}
                            className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md py-2 px-3 text-white"
                        />
                    </div>
                    {recordType === 'customer' && (
                        <div className="md:col-span-2">
                            <label htmlFor="customerName" className="block text-sm font-medium text-gray-300">Customer Name (Optional)</label>
                            <input
                                type="text"
                                id="customerName"
                                value={customerName}
                                onChange={e => setCustomerName(e.target.value)}
                                placeholder="e.g., John Smith"
                                className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md py-2 px-3 text-white"
                            />
                        </div>
                    )}
                </div>
                <div>
                    <h3 className="text-base font-semibold text-white">Work Carried Out</h3>
                     <div className="mt-2 space-y-3">
                        {items.map((item, index) => (
                            <div key={index} className="flex items-start gap-2">
                                <div className="flex-1">
                                    <label htmlFor={`desc-${index}`} className="sr-only">Description</label>
                                    <input id={`desc-${index}`} type="text" placeholder="e.g., Full Service, Replaced front tyres" value={item.description} onChange={e => handleItemChange(index, 'description', e.target.value)} className="block w-full bg-gray-700 border-gray-600 rounded-md py-2 px-3 text-white"/>
                                </div>
                                 <div className="w-36">
                                     <label htmlFor={`amount-${index}`} className="sr-only">Amount</label>
                                     <CurrencyInput id={`amount-${index}`} value={item.amountStr} onChange={e => handleItemChange(index, 'amountStr', e.target.value)} />
                                </div>
                                <button type="button" onClick={() => removeItem(index)} disabled={items.length <= 1} className="p-2 text-gray-400 hover:text-red-400 disabled:opacity-50 mt-1"><TrashIcon className="h-5 w-5"/></button>
                            </div>
                        ))}
                        <button type="button" onClick={addItem} className="w-full text-sm font-semibold text-brand-400 hover:text-brand-300 flex items-center justify-center gap-2 p-2 border-2 border-dashed border-gray-600 rounded-lg hover:border-gray-500">
                            <PlusIcon className="h-4 w-4"/> Add Line Item
                        </button>
                    </div>
                </div>
                {recordType === 'customer' && (
                    <label className="flex items-start gap-3 rounded-md border border-gray-700 bg-gray-800/60 p-3 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={vatApplied}
                            onChange={e => setVatApplied(e.target.checked)}
                            className="mt-1 h-4 w-4 rounded border-gray-500 bg-gray-700 text-brand-600 focus:ring-brand-500"
                        />
                        <span>
                            <span className="block text-sm font-medium text-gray-200">Add VAT (20%)</span>
                            <span className="block text-xs text-gray-400">Adds VAT to the chargeable work subtotal on the receipt.</span>
                        </span>
                    </label>
                )}
                 {totalAmount > 0 && (
                    <div className="pt-4 border-t border-gray-700 text-right">
                        <p className="text-lg font-bold text-brand-400">{vatApplied && recordType === 'customer' ? 'Total including VAT' : 'Total'}</p>
                        <p className="text-3xl font-bold text-white">{formatCurrency(totalDue)}</p>
                    </div>
                )}
            </form>
            <footer className="flex-shrink-0 p-4 border-t border-gray-700 flex justify-end space-x-3 items-center bg-gray-800">
                <button type="button" onClick={onCancel} className="px-4 py-2 text-sm font-medium text-gray-300 bg-gray-600 hover:bg-gray-500 rounded-md">Cancel</button>
                <button type="submit" form="worksheet-editor-form" disabled={isSubmitting || !selectedVehicleId} className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-50">
                    {isSubmitting ? <Spinner /> : (isEditing ? 'Update & Preview' : 'Generate Preview')}
                </button>
            </footer>
        </div>
    );
};

export default WorkSheetEditor;
