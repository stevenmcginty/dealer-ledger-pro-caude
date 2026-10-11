import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Vehicle, NewWorkSheet, WorkSheet, BusinessDetails, WorkSheetUpdate, workSheetRecordType } from '../../types';
import { TrashIcon } from '../icons';
import PrintableWorkSheet from './PrintableWorkSheet';
import UkDateInput from '../common/UkDateInput';
import CurrencyInput from '../common/CurrencyInput';
import { formatCurrency } from '../../utils/helpers';
import { useToast, Button, Checkbox, Field, IconButton } from '../ui';
import { cx } from '../ui/cx';
import EditorFrame, { AddLineButton, FrameInput, TotalLine, VehicleSuggestions } from './EditorFrame';

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
        <EditorFrame
            title={isEditing ? <>Edit work sheet <span className="num">#{editingSheet.workSheetNumber}</span></> : 'New work sheet'}
            onClose={onCancel}
            formId="worksheet-editor-form"
            onSubmit={handleGeneratePreview}
            footer={<>
                <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button>
                <Button type="submit" form="worksheet-editor-form" loading={isSubmitting} disabled={!selectedVehicleId}>
                    {isEditing ? 'Preview changes' : 'Preview sheet'}
                </Button>
            </>}
        >
            <fieldset>
                <legend className="mb-1.5 text-sm font-semibold text-ink">What kind of work</legend>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {([
                        { key: 'customer' as const, label: 'Chargeable work', hint: 'Prints as a work receipt' },
                        { key: 'internal' as const, label: 'Internal / in-house', hint: 'Prints as an internal record' },
                    ]).map(option => {
                        const on = recordType === option.key;
                        return (
                            <button
                                key={option.key}
                                type="button"
                                onClick={() => setRecordType(option.key)}
                                aria-pressed={on}
                                className={cx(
                                    'flex min-h-[56px] items-center gap-3 rounded-control border px-3.5 py-2.5 text-start transition-colors duration-quick ease-out',
                                    on ? 'border-accent bg-accent-soft' : 'border-line-strong bg-surface hover:bg-surface-2',
                                )}
                            >
                                <span aria-hidden="true" className={cx('grid h-5 w-5 flex-none place-items-center rounded-full border-2', on ? 'border-accent' : 'border-line-strong')}>
                                    {on && <span className="h-2.5 w-2.5 rounded-full bg-accent" />}
                                </span>
                                <span className="min-w-0">
                                    <span className={cx('block text-base font-semibold', on ? 'text-accent-soft-ink' : 'text-ink')}>{option.label}</span>
                                    <span className="block text-sm text-ink-3">{option.hint}</span>
                                </span>
                            </button>
                        );
                    })}
                </div>
            </fieldset>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="relative md:col-span-2" ref={suggestionBoxRef}>
                    <Field label="Vehicle" htmlFor="vehicleReg" hint={isEditing ? 'The vehicle stays the same on a saved sheet.' : undefined}>
                        <FrameInput
                            type="text"
                            id="vehicleReg"
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
                <Field label="Date" htmlFor="workDate">
                    <UkDateInput id="workDate" name="workDate" value={workDate} onChange={e => setWorkDate(e.target.value)} required />
                </Field>
                <Field label="Mileage at service" optional htmlFor="serviceMileage">
                    <FrameInput
                        type="text"
                        inputMode="numeric"
                        id="serviceMileage"
                        value={mileageStr}
                        onChange={e => setMileageStr(e.target.value)}
                        placeholder={selectedVehicle?.mileage ? `${selectedVehicle.mileage.toLocaleString()} on record` : 'e.g. 44,229'}
                        className="num"
                    />
                </Field>
                {recordType === 'customer' && (
                    <Field label="Customer name" optional htmlFor="customerName" className="md:col-span-2">
                        <FrameInput
                            type="text"
                            id="customerName"
                            value={customerName}
                            onChange={e => setCustomerName(e.target.value)}
                            placeholder="e.g. John Smith"
                        />
                    </Field>
                )}
            </div>

            <fieldset>
                <legend className="mb-2 text-base font-bold text-ink">Work carried out</legend>
                <div className="divide-y divide-line rounded-card border border-line">
                    {items.map((item, index) => (
                        <div key={index} className="flex flex-wrap items-center gap-2 p-2.5 sm:flex-nowrap">
                            <div className="min-w-0 basis-full sm:flex-1 sm:basis-0">
                                <label htmlFor={`desc-${index}`} className="sr-only">Work done, line {index + 1}</label>
                                <FrameInput id={`desc-${index}`} type="text" placeholder="e.g. Full service, front tyres" value={item.description} onChange={e => handleItemChange(index, 'description', e.target.value)} />
                            </div>
                            <div className="min-w-0 flex-1 sm:w-36 sm:flex-none">
                                <label htmlFor={`amount-${index}`} className="sr-only">Amount, line {index + 1}</label>
                                <CurrencyInput id={`amount-${index}`} value={item.amountStr} onChange={e => handleItemChange(index, 'amountStr', e.target.value)} />
                            </div>
                            <IconButton label={`Remove line ${index + 1}`} icon={<TrashIcon />} onClick={() => removeItem(index)} disabled={items.length <= 1} />
                        </div>
                    ))}
                </div>
                <div className="mt-2">
                    <AddLineButton onClick={addItem} />
                </div>
            </fieldset>

            {recordType === 'customer' && (
                <Checkbox
                    checked={vatApplied}
                    onChange={e => setVatApplied(e.target.checked)}
                    label="Add VAT at 20%"
                    description="Adds VAT to the subtotal on the work receipt."
                />
            )}

            {totalAmount > 0 && (
                <div className="space-y-1.5 border-t border-line pt-4">
                    {vatApplied && recordType === 'customer' && (
                        <>
                            <TotalLine label="Subtotal" value={formatCurrency(totalAmount)} />
                            <TotalLine label="VAT (20%)" value={formatCurrency(vatAmount)} />
                        </>
                    )}
                    <TotalLine strong label={vatApplied && recordType === 'customer' ? 'Total including VAT' : 'Total'} value={formatCurrency(totalDue)} />
                </div>
            )}
        </EditorFrame>
    );
};

export default WorkSheetEditor;
