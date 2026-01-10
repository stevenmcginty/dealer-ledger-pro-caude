import React, { useState } from 'react';
import { Vehicle, NewInternalJob, InternalJob, BusinessDetails } from '../../types';
import { XMarkIcon, PlusIcon, TrashIcon } from '../icons';
import Spinner from '../common/Spinner';
import CurrencyInput from '../common/CurrencyInput';
import { formatCurrency } from '../../utils/helpers';
import PrintableJobSheet from './PrintableJobSheet';

interface InternalJobEditorProps {
    vehicles: Vehicle[];
    onSubmit: (data: NewInternalJob) => Promise<void>;
    onCancel: () => void;
    businessDetails: BusinessDetails | null;
}

interface JobItem {
    description: string;
    amount: number;
    amountStr: string;
}

const InternalJobEditor = ({ vehicles, onSubmit, onCancel, businessDetails }: InternalJobEditorProps) => {
    const [selectedVehicleId, setSelectedVehicleId] = useState<string>(vehicles[0]?.id || '');
    const [jobDate, setJobDate] = useState(new Date().toISOString().split('T')[0]);
    const [items, setItems] = useState<JobItem[]>([{ description: '', amount: 0, amountStr: '' }]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [previewData, setPreviewData] = useState<InternalJob | null>(null);

    const handleItemChange = (index: number, field: keyof JobItem, value: string) => {
        const newItems = [...items];
        const item = { ...newItems[index] };
        if (field === 'amountStr') {
            item.amountStr = value;
            item.amount = parseFloat(value) || 0;
        } else if (field === 'description') {
            item.description = value;
        }
        newItems[index] = item;
        setItems(newItems);
    };

    const addItem = () => {
        setItems([...items, { description: '', amount: 0, amountStr: '' }]);
    };

    const removeItem = (index: number) => {
        if (items.length > 1) {
            setItems(items.filter((_, i) => i !== index));
        }
    };
    
    const totalAmount = items.reduce((sum, item) => sum + item.amount, 0);

    const handleGeneratePreview = (e: React.FormEvent) => {
        e.preventDefault();
        const vehicle = vehicles.find(v => v.id === selectedVehicleId);
        if (!vehicle) return;

        const jobSheetNumber = String(Math.floor(1000 + Math.random() * 9000));
        const finalItems = items.map(({ amountStr, ...rest }) => rest).filter(item => item.description.trim() !== '');

        const jobData: InternalJob = {
            id: 'temp-preview-id',
            jobSheetNumber,
            vehicleId: vehicle.id,
            carDetails: { ...vehicle },
            jobDate,
            items: finalItems,
            totalAmount,
            createdAt: Date.now(),
        };
        setPreviewData(jobData);
    };
    
    const handleConfirmSave = async () => {
        if (!previewData) return;
        setIsSubmitting(true);
        const { id, createdAt, ...submissionData } = previewData;
        try {
            await onSubmit(submissionData);
        } catch (error) {
            console.error("Failed to save job sheet:", error);
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
                <h2 className="text-lg font-bold text-white">Create Internal Job Sheet</h2>
                <button onClick={onCancel} className="p-1 rounded-full text-gray-400 hover:bg-gray-700 hover:text-white"><XMarkIcon className="h-6 w-6" /></button>
            </header>
            <form id="job-editor-form" onSubmit={handleGeneratePreview} className="p-6 space-y-6 flex-1 overflow-y-auto">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label htmlFor="vehicleId" className="block text-sm font-medium text-gray-300">Vehicle</label>
                        <select id="vehicleId" value={selectedVehicleId} onChange={e => setSelectedVehicleId(e.target.value)} className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md py-2 px-3 text-white">
                            {vehicles.map(v => <option key={v.id} value={v.id}>{v.reg} - {v.make} {v.model}</option>)}
                        </select>
                    </div>
                     <div>
                        <label htmlFor="jobDate" className="block text-sm font-medium text-gray-300">Job Date</label>
                        <input type="date" id="jobDate" value={jobDate} onChange={e => setJobDate(e.target.value)} className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md py-2 px-3 text-white" />
                    </div>
                </div>
                <div>
                    <h3 className="text-base font-semibold text-white">Work Carried Out</h3>
                     <div className="mt-2 space-y-3">
                        {items.map((item, index) => (
                            <div key={index} className="flex items-start gap-2">
                                <div className="flex-1">
                                    <label htmlFor={`desc-${index}`} className="sr-only">Description</label>
                                    <input id={`desc-${index}`} type="text" placeholder="e.g., Full Service" value={item.description} onChange={e => handleItemChange(index, 'description', e.target.value)} className="block w-full bg-gray-700 border-gray-600 rounded-md py-2 px-3 text-white"/>
                                </div>
                                <div className="w-36">
                                     <label htmlFor={`amount-${index}`} className="sr-only">Amount</label>
                                     <CurrencyInput id={`amount-${index}`} value={item.amountStr} onChange={e => handleItemChange(index, 'amountStr', e.target.value)} />
                                </div>
                                <button type="button" onClick={() => removeItem(index)} disabled={items.length <= 1} className="p-2 text-gray-400 hover:text-red-400 disabled:opacity-50"><TrashIcon className="h-5 w-5"/></button>
                            </div>
                        ))}
                        <button type="button" onClick={addItem} className="w-full text-sm font-semibold text-brand-blue-400 hover:text-brand-blue-300 flex items-center justify-center gap-2 p-2 border-2 border-dashed border-gray-600 rounded-lg hover:border-gray-500">
                            <PlusIcon className="h-4 w-4"/> Add Line Item
                        </button>
                    </div>
                </div>
                <div className="pt-4 border-t border-gray-700 text-right">
                     <p className="text-lg font-bold text-brand-blue-400">Total Cost</p>
                     <p className="text-3xl font-bold text-white">{formatCurrency(totalAmount)}</p>
                </div>
            </form>
            <footer className="flex-shrink-0 p-4 border-t border-gray-700 flex justify-end space-x-3 items-center bg-gray-800">
                <button type="button" onClick={onCancel} className="px-4 py-2 text-sm font-medium text-gray-300 bg-gray-600 hover:bg-gray-500 rounded-md">Cancel</button>
                <button type="submit" form="job-editor-form" disabled={isSubmitting || !selectedVehicleId} className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-brand-blue-600 hover:bg-brand-blue-700 disabled:opacity-50">
                    {isSubmitting ? <Spinner /> : 'Generate Preview'}
                </button>
            </footer>
        </div>
    );
};

export default InternalJobEditor;
