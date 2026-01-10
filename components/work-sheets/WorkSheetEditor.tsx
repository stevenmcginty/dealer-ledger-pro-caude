import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Vehicle, NewWorkSheet, WorkSheet, BusinessDetails, WorkSheetUpdate } from '../../types';
import { XMarkIcon, PlusIcon, TrashIcon } from '../icons';
import Spinner from '../common/Spinner';
import PrintableWorkSheet from './PrintableWorkSheet';
import UkDateInput from '../common/UkDateInput';
import CurrencyInput from '../common/CurrencyInput';
import { formatCurrency } from '../../utils/helpers';
import Select from '../common/Select';

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
    const [selectedVehicleId, setSelectedVehicleId] = useState<string>('');
    const [workDate, setWorkDate] = useState(new Date().toISOString().split('T')[0]);
    const [customerName, setCustomerName] = useState('');
    const [items, setItems] = useState<WorkItem[]>([{ description: '', amount: undefined, amountStr: '' }]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [previewData, setPreviewData] = useState<WorkSheet | null>(null);

    const isEditing = !!editingSheet;

    // State for vehicle selection autocomplete
    const [regInput, setRegInput] = useState('');
    const [suggestions, setSuggestions] = useState<Vehicle[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const suggestionBoxRef = useRef<HTMLDivElement>(null);

    const searchableVehicles = useMemo(() => {
        if (isEditing && editingSheet) {
            const currentVehicle = vehicles.find(v => v.id === editingSheet.vehicleId);
            return currentVehicle ? [currentVehicle] : [];
        }
        return vehicles;
    }, [vehicles, isEditing, editingSheet]);

    useEffect(() => {
        if (isEditing && editingSheet) {
            setSelectedVehicleId(editingSheet.vehicleId);
            const vehicle = vehicles.find(v => v.id === editingSheet.vehicleId);
            setRegInput(vehicle?.reg || '');
            setWorkDate(editingSheet.workDate);
            setCustomerName(editingSheet.customerName || '');
            setItems(editingSheet.items.length > 0 ? editingSheet.items.map(i => ({...i, amountStr: i.amount !== undefined ? String(i.amount) : ''})) : [{ description: '', amount: undefined, amountStr: '' }]);
        } else {
            setSelectedVehicleId('');
            setRegInput('');
            setWorkDate(new Date().toISOString().split('T')[0]);
            setCustomerName('');
            setItems([{ description: '', amount: undefined, amountStr: '' }]);
        }
    }, [editingSheet, isEditing, vehicles]);

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
    
    const handleGeneratePreview = (e: React.FormEvent) => {
        e.preventDefault();
        const vehicle = vehicles.find(v => v.id === selectedVehicleId);
        if (!vehicle) {
            alert('Please select a valid vehicle from the list.');
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

        const sheetData: WorkSheet = {
            id: editingSheet?.id || 'temp-preview-id',
            workSheetNumber,
            vehicleId: vehicle.id,
            carDetails: carDetailsForSheet,
            workDate,
            items: finalItems,
            createdAt: editingSheet?.createdAt || Date.now(),
        };

        // Conditionally add customerName only if it exists, to avoid sending 'undefined' to Firebase
        if (customerName.trim()) {
            sheetData.customerName = customerName.trim();
        }

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
                 {totalAmount > 0 && (
                    <div className="pt-4 border-t border-gray-700 text-right">
                        <p className="text-lg font-bold text-brand-400">Total</p>
                        <p className="text-3xl font-bold text-white">{formatCurrency(totalAmount)}</p>
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