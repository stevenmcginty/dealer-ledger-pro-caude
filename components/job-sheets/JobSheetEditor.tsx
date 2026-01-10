
import React, { useState } from 'react';
import { Vehicle, NewWorkSheet, WorkSheet, BusinessDetails } from '../../types';
import { XMarkIcon, PlusIcon, TrashIcon } from '../icons';
import Spinner from '../common/Spinner';
import PrintableWorkSheet from './PrintableWorkSheet';
import UkDateInput from '../common/UkDateInput';

interface WorkSheetEditorProps {
    vehicles: Vehicle[];
    onSubmit: (data: NewWorkSheet) => Promise<void>;
    onCancel: () => void;
    businessDetails: BusinessDetails | null;
}

interface WorkItem {
    description: string;
}

const WorkSheetEditor = ({ vehicles, onSubmit, onCancel, businessDetails }: WorkSheetEditorProps) => {
    const [selectedVehicleId, setSelectedVehicleId] = useState<string>(vehicles[0]?.id || '');
    const [workDate, setWorkDate] = useState(new Date().toISOString().split('T')[0]);
    const [items, setItems] = useState<WorkItem[]>([{ description: '' }]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [previewData, setPreviewData] = useState<WorkSheet | null>(null);

    const handleItemChange = (index: number, value: string) => {
        const newItems = [...items];
        newItems[index].description = value;
        setItems(newItems);
    };

    const addItem = () => {
        setItems([...items, { description: '' }]);
    };

    const removeItem = (index: number) => {
        if (items.length > 1) {
            setItems(items.filter((_, i) => i !== index));
        }
    };
    
    const handleGeneratePreview = (e: React.FormEvent) => {
        e.preventDefault();
        const vehicle = vehicles.find(v => v.id === selectedVehicleId);
        if (!vehicle) return;

        const workSheetNumber = String(Math.floor(1000 + Math.random() * 9000));
        const finalItems = items.filter(item => item.description.trim() !== '');

        const sheetData: WorkSheet = {
            id: 'temp-preview-id',
            workSheetNumber,
            vehicleId: vehicle.id,
            carDetails: { ...vehicle },
            workDate: workDate,
            items: finalItems,
            createdAt: Date.now(),
        };
        setPreviewData(sheetData);
    };
    
    const handleConfirmSave = async () => {
        if (!previewData) return;
        setIsSubmitting(true);
        const { id, createdAt, ...submissionData } = previewData;
        try {
            await onSubmit(submissionData as NewWorkSheet);
        } catch (error) {
            console.error("Failed to save work sheet:", error);
            setPreviewData(null); 
        } finally {
            setIsSubmitting(false);
        }
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
                <h2 className="text-lg font-bold text-white">Create Work Sheet</h2>
                <button type="button" onClick={onCancel} className="p-1 rounded-full text-gray-400 hover:bg-gray-700 hover:text-white"><XMarkIcon className="h-6 w-6" /></button>
            </header>
            <form id="worksheet-editor-form" onSubmit={handleGeneratePreview} className="p-6 space-y-6 flex-1 overflow-y-auto">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label htmlFor="vehicleId" className="block text-sm font-medium text-gray-300">Vehicle</label>
                        <select id="vehicleId" value={selectedVehicleId} onChange={e => setSelectedVehicleId(e.target.value)} className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md py-2 px-3 text-white">
                            {vehicles.map(v => <option key={v.id} value={v.id}>{v.reg} - {v.make} {v.model}</option>)}
                        </select>
                    </div>
                     <div>
                        <label htmlFor="workDate" className="block text-sm font-medium text-gray-300">Date</label>
                        <UkDateInput id="workDate" name="workDate" value={workDate} onChange={e => setWorkDate(e.target.value)} className="mt-1" />
                    </div>
                </div>
                <div>
                    <h3 className="text-base font-semibold text-white">Work Carried Out</h3>
                     <div className="mt-2 space-y-3">
                        {items.map((item, index) => (
                            <div key={index} className="flex items-start gap-2">
                                <div className="flex-1">
                                    <label htmlFor={`desc-${index}`} className="sr-only">Description</label>
                                    <input id={`desc-${index}`} type="text" placeholder="e.g., Full Service" value={item.description} onChange={e => handleItemChange(index, e.target.value)} className="block w-full bg-gray-700 border-gray-600 rounded-md py-2 px-3 text-white"/>
                                </div>
                                <button type="button" onClick={() => removeItem(index)} disabled={items.length <= 1} className="p-2 text-gray-400 hover:text-red-400 disabled:opacity-50 mt-1"><TrashIcon className="h-5 w-5"/></button>
                            </div>
                        ))}
                        <button type="button" onClick={addItem} className="w-full text-sm font-semibold text-brand-400 hover:text-brand-300 flex items-center justify-center gap-2 p-2 border-2 border-dashed border-gray-600 rounded-lg hover:border-gray-500">
                            <PlusIcon className="h-4 w-4"/> Add Line Item
                        </button>
                    </div>
                </div>
            </form>
            <footer className="flex-shrink-0 p-4 border-t border-gray-700 flex justify-end space-x-3 items-center bg-gray-800">
                <button type="button" onClick={onCancel} className="px-4 py-2 text-sm font-medium text-gray-300 bg-gray-600 hover:bg-gray-500 rounded-md">Cancel</button>
                <button type="submit" form="worksheet-editor-form" disabled={isSubmitting || !selectedVehicleId} className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-50">
                    {isSubmitting ? <Spinner /> : 'Generate Preview'}
                </button>
            </footer>
        </div>
    );
};

export default WorkSheetEditor;
