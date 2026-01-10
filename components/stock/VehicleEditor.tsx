import React, { useState, useEffect, useRef } from 'react';
import { Vehicle, NewVehicle, VehicleUpdate, NewReceipt } from '../../types';
import { uploadFile } from '../../services/dataService';
import * as ai from '../../utils/ai';
import { formatCurrency, fileToBase64, compressImage, robustDateParser, formatBytes } from '../../utils/helpers';
import { XMarkIcon, CameraIcon, ArrowUpTrayIcon, SparklesIcon, CheckCircleIcon } from '../icons';
import Spinner from '../common/Spinner';
import CurrencyInput from '../common/CurrencyInput';
import UkDateInput from '../common/UkDateInput';
import Select from '../common/Select';

type ScannedDeliveryDetails = {
    amount: number;
    vat: number;
    vendor: string;
    date: string;
};

interface VehicleEditorProps {
  companyId: string;
  userId: string;
  vehicles: Vehicle[];
  onSubmit: (data: NewVehicle | VehicleUpdate, id?: string, sellerDetails?: { name: string; address: string }, deliveryDetails?: ScannedDeliveryDetails | null) => Promise<void>;
  addReceipt: (data: NewReceipt) => Promise<string>;
  editingVehicle: Vehicle | null;
  prefillData?: Partial<NewVehicle>;
  imageFile?: File | null;
  onClear: () => void;
}

type ScanStep = 'idle' | 'compressing' | 'uploading' | 'analyzing' | 'error' | 'success';
interface ScanProgress {
    step: ScanStep;
    message: string;
    originalSize?: number;
    compressedSize?: number;
}


const ScanProgressIndicator = ({ progress, onRetry, onClose }: { progress: ScanProgress, onRetry: () => void, onClose: () => void }) => {
    const progressMessage = () => {
        switch (progress.step) {
            case 'compressing':
                return `Compressing... ${progress.originalSize ? `(${formatBytes(progress.originalSize)})` : ''}`;
            case 'uploading':
                return `Uploading... ${progress.compressedSize ? `(${formatBytes(progress.compressedSize)})` : ''}`;
            case 'analyzing':
                return 'AI is analyzing the document...';
            default:
                return progress.message;
        }
    };

    return (
        <div className="absolute inset-0 bg-gray-900/90 backdrop-blur-md flex flex-col justify-center items-center z-20 p-4 text-center">
             <div className="w-full max-w-sm bg-gray-800 p-8 rounded-2xl shadow-2xl">
                <h3 className="text-xl font-bold text-white mb-6">
                    {progress.step === 'success' ? 'Scan Complete!' : 'Scanning Invoice'}
                </h3>
                {progress.step !== 'error' && progress.step !== 'success' && <Spinner className="h-8 w-8 text-brand-500 mx-auto mb-4" />}
                <p className="text-gray-300 mb-6 h-5">{progressMessage()}</p>
                 {progress.step === 'error' && (
                     <div className="mt-2">
                        <div className="bg-red-900/50 border border-red-700 text-red-300 px-4 py-3 rounded-lg"><p className="font-bold">Scan Failed</p><p className="text-sm mt-1">{progress.message}</p></div>
                        <div className="mt-6 flex space-x-4">
                           <button onClick={onClose} className="flex-1 px-4 py-2 text-sm font-medium text-gray-300 bg-gray-600 hover:bg-gray-500 rounded-md">Cancel</button>
                           <button onClick={onRetry} className="flex-1 px-4 py-2 text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 rounded-md">Try Again</button>
                        </div>
                    </div>
                )}
                {progress.step === 'success' && (
                    <div className="mt-2 text-center">
                        <div className="text-green-400 flex items-center justify-center space-x-2">
                            <CheckCircleIcon className="h-7 w-7" />
                            <p className="font-semibold text-xl">{progress.message}</p>
                        </div>
                        <p className="text-sm text-gray-300 mt-2">The form has been populated with the scanned data.</p>
                    </div>
                )}
            </div>
        </div>
    );
};

const calculateNextStockNumber = (allVehicles: Vehicle[]): string => {
    const allStockNumbers = allVehicles.map(v => parseInt(v.stockNumber, 10)).filter(n => !isNaN(n));
    const maxNum = allStockNumbers.length > 0 ? Math.max(...allStockNumbers) : 0;
    return String(Math.max(1000, maxNum + 1));
};

const VehicleEditor = ({ companyId, userId, vehicles, onSubmit, addReceipt, editingVehicle, prefillData, imageFile, onClear }: VehicleEditorProps) => {
  const [formData, setFormData] = useState<Partial<Vehicle>>({});
  const [priceStr, setPriceStr] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [scanProgress, setScanProgress] = useState<ScanProgress>({ step: 'idle', message: '' });
  const [lastFile, setLastFile] = useState<File | null>(null);
  const [scannedDeliveryDetails, setScannedDeliveryDetails] = useState<ScannedDeliveryDetails | null>(null);
  
  const [generatePurchaseInvoice, setGeneratePurchaseInvoice] = useState(false);
  const [sellerDetails, setSellerDetails] = useState({ name: '', address: '' });

  const isScanning = ['compressing', 'uploading', 'analyzing'].includes(scanProgress.step);
  const isEditing = !!editingVehicle;

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let initialState: Partial<Vehicle> = {
        purchaseDate: new Date().toISOString().split('T')[0],
        vatScheme: 'Margin',
        ownershipType: 'Owned Stock',
        sorOwner: { name: '', address: '' },
    };
    let initialPrice = '';
    
    if (editingVehicle) {
      initialState = { ...editingVehicle };
      initialPrice = String(editingVehicle.purchasePrice || '');
    } else {
        if (initialState.ownershipType === 'Owned Stock') {
            initialState.stockNumber = calculateNextStockNumber(vehicles);
        } else {
            initialState.stockNumber = '';
        }

        if (prefillData) {
            const parsedDate = prefillData.purchaseDate ? robustDateParser(prefillData.purchaseDate) : null;
            initialState = { ...initialState, ...prefillData, purchaseDate: parsedDate || initialState.purchaseDate };
            initialPrice = String(prefillData.purchasePrice || '');
        }
    }

    setFormData(initialState);
    setPriceStr(initialPrice);
    setScannedDeliveryDetails(null);
  }, [editingVehicle, prefillData, vehicles]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    
    if (name.startsWith('sorOwner.')) {
        const field = name.split('.')[1];
        setFormData(prev => ({
            ...prev,
            sorOwner: { ...prev.sorOwner, [field]: value }
        }));
        return;
    }

    const val = type === 'number' ? parseFloat(value) : value;
    setFormData(prev => ({ ...prev, [name]: val }));
  };

  const runInvoiceScan = async (file: File) => {
    if (!file) return;
    setLastFile(file);
    try {
        setScanProgress({ step: 'compressing', message: 'Processing file...', originalSize: file.size });
        const compressedFile = await compressImage(file, { maxWidth: 1024, quality: 0.8 });
        
        setScanProgress(p => ({ ...p, step: 'uploading', message: 'Uploading...', compressedSize: compressedFile.size }));
        const invoiceUrl = await uploadFile(companyId, userId, compressedFile, 'invoices');
        setFormData(prev => ({...prev, invoiceUrl}));

        setScanProgress(p => ({ ...p, step: 'analyzing', message: 'Analyzing with AI...' }));
        const result = await ai.scanVehicleInvoice(compressedFile);

        let successMessage = 'Success!';
        if (result.deliveryCharge && result.deliveryCharge > 0) {
            const deliveryAmount = (result.deliveryCharge || 0) + (result.deliveryVat || 0);
            setScannedDeliveryDetails({
                amount: deliveryAmount,
                vat: result.deliveryVat || 0,
                vendor: result.vendor || 'Auction House',
                date: result.purchaseDate || new Date().toISOString().split('T')[0],
            });
            successMessage = 'Success! Delivery charge noted.';
        }
        
        const firstRegDate = result.firstRegistered ? robustDateParser(result.firstRegistered) : null;
        const purchaseDate = result.purchaseDate ? robustDateParser(result.purchaseDate) : null;
        
        setFormData(prev => ({
            ...prev,
            make: result.make || prev.make,
            model: result.model || prev.model,
            vin: result.vin || prev.vin,
            color: result.color || prev.color,
            reg: result.reg || prev.reg,
            firstRegistered: firstRegDate || prev.firstRegistered,
            purchaseDate: purchaseDate || prev.purchaseDate,
            year: result.year || prev.year,
            mileage: result.mileage || prev.mileage,
            engineSize: result.engineSize || prev.engineSize,
        }));
        if(result.purchasePrice) setPriceStr(String(result.purchasePrice));
        setScanProgress({ step: 'success', message: successMessage });

    } catch (error: any) {
      console.error("Invoice scan failed:", error);
      const msg = error instanceof Error ? error.message : 'An unknown error occurred.';
      setScanProgress({ step: 'error', message: msg });
    } finally {
        if(cameraInputRef.current) cameraInputRef.current.value = "";
        if(uploadInputRef.current) uploadInputRef.current.value = "";
        setTimeout(() => setScanProgress({ step: 'idle', message: '' }), scanProgress.step === 'error' ? 5000 : 1500);
    }
  }
  
  useEffect(() => {
    if (imageFile && !editingVehicle) {
        runInvoiceScan(imageFile);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageFile, editingVehicle]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isSubmitting || isScanning) return;
    setIsSubmitting(true);

    let submissionData = { ...formData, purchasePrice: parseFloat(priceStr) || 0 };
    if (submissionData.ownershipType === 'Owned Stock') {
        delete submissionData.sorOwner;
    }
    
    await onSubmit(
        submissionData as NewVehicle, 
        editingVehicle?.id,
        generatePurchaseInvoice && !editingVehicle ? sellerDetails : undefined,
        scannedDeliveryDetails
    );
    setIsSubmitting(false);
  };
  
  const isSor = formData.ownershipType === 'Sale or Return';

  const handleOwnershipTypeChange = (newType: 'Owned Stock' | 'Sale or Return') => {
    setFormData(prev => {
        const newState = { ...prev, ownershipType: newType };
        if (!isEditing) {
            if (newType === 'Owned Stock') {
                newState.stockNumber = calculateNextStockNumber(vehicles);
            } else {
                newState.stockNumber = '';
            }
        }
        return newState;
    });
};

  return (
    <div className="flex flex-col w-full">
        {scanProgress.step !== 'idle' && <ScanProgressIndicator progress={scanProgress} onRetry={() => lastFile && runInvoiceScan(lastFile)} onClose={() => setScanProgress({ step: 'idle', message: ''})} />}
        <header className="p-4 border-b border-gray-700 flex items-center justify-between flex-shrink-0 sticky top-0 z-10 bg-gray-800">
            <h2 className="text-lg font-bold text-white">{isEditing ? 'Edit Vehicle' : 'Add New Vehicle'}</h2>
            <button onClick={onClear} className="p-1 rounded-full text-gray-400 hover:bg-gray-700 hover:text-white"><XMarkIcon className="h-6 w-6" /></button>
        </header>
        <form id="vehicle-editor-form" onSubmit={handleSubmit} className="p-4 space-y-4">
            
            <fieldset>
                <div className="flex items-center justify-between">
                    <legend className="text-sm font-medium text-gray-300">Ownership Type</legend>
                </div>
                <div className="mt-2 flex items-center space-x-2 rounded-lg bg-gray-700 p-1">
                    <button type="button" onClick={() => handleOwnershipTypeChange('Owned Stock')} className={`flex-1 py-2 text-sm font-semibold rounded-md transition-colors ${!isSor ? 'bg-brand-600 text-white shadow' : 'text-gray-300 hover:bg-gray-600'}`}>Owned Stock</button>
                    <button type="button" onClick={() => handleOwnershipTypeChange('Sale or Return')} className={`flex-1 py-2 text-sm font-semibold rounded-md transition-colors ${isSor ? 'bg-brand-600 text-white shadow' : 'text-gray-300 hover:bg-gray-600'}`}>Sale or Return (SOR)</button>
                </div>
            </fieldset>

             {!isSor && (
                <div>
                    <input type="file" accept="image/*,application/pdf" capture="environment" ref={cameraInputRef} onChange={e => e.target.files && runInvoiceScan(e.target.files[0])} className="hidden" />
                    <input type="file" accept="image/*,application/pdf" ref={uploadInputRef} onChange={e => e.target.files && runInvoiceScan(e.target.files[0])} className="hidden" />
                    <label className="block text-sm font-medium text-gray-300">AI Purchase Invoice Scan</label>
                    <div className="mt-1 grid grid-cols-2 gap-3">
                        <button type="button" onClick={() => cameraInputRef.current?.click()} className="inline-flex items-center justify-center w-full px-4 py-2 border border-gray-600 text-sm font-medium rounded-md text-gray-300 bg-gray-700 hover:bg-gray-600"><CameraIcon className="mr-2 h-5 w-5" />Take Photo</button>
                        <button type="button" onClick={() => uploadInputRef.current?.click()} className="inline-flex items-center justify-center w-full px-4 py-2 border border-gray-600 text-sm font-medium rounded-md text-gray-300 bg-gray-700 hover:bg-gray-600"><ArrowUpTrayIcon className="mr-2 h-5 w-5" />Upload File</button>
                    </div>
                </div>
             )}
            <div className="relative"><div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-700" /></div><div className="relative flex justify-center"><span className="bg-gray-800 px-2 text-sm text-gray-400">Or enter manually</span></div></div>
            
             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label htmlFor="stockNumber" className="block text-sm font-medium text-gray-300">Stock #</label>
                    <input 
                        type="text" 
                        name="stockNumber" 
                        value={formData.stockNumber || ''} 
                        readOnly
                        placeholder={isSor && !isEditing ? "Assigned upon sale" : ""}
                        className="mt-1 block w-full bg-gray-900 border-gray-700 rounded-md py-2 px-3 text-gray-400 placeholder:text-gray-500"
                    />
                </div>
                <div><label htmlFor="reg" className="block text-sm font-medium text-gray-300">Registration</label><input type="text" name="reg" value={formData.reg || ''} onChange={handleChange} required className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md py-2 px-3 text-white uppercase" /></div>
                <div><label htmlFor="make" className="block text-sm font-medium text-gray-300">Make</label><input type="text" name="make" value={formData.make || ''} onChange={handleChange} required className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md py-2 px-3 text-white" /></div>
                <div><label htmlFor="model" className="block text-sm font-medium text-gray-300">Model</label><input type="text" name="model" value={formData.model || ''} onChange={handleChange} required className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md py-2 px-3 text-white" /></div>
                <div><label htmlFor="color" className="block text-sm font-medium text-gray-300">Colour</label><input type="text" name="color" value={formData.color || ''} onChange={handleChange} className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md py-2 px-3 text-white" /></div>
                <div><label htmlFor="vin" className="block text-sm font-medium text-gray-300">Chassis / VIN</label><input type="text" name="vin" value={formData.vin || ''} onChange={handleChange} className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md py-2 px-3 text-white" /></div>
                <div><label htmlFor="year" className="block text-sm font-medium text-gray-300">Year</label><input type="number" name="year" value={formData.year || ''} onChange={handleChange} className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md py-2 px-3 text-white" /></div>
                <div><label htmlFor="mileage" className="block text-sm font-medium text-gray-300">Mileage</label><input type="number" name="mileage" value={formData.mileage || ''} onChange={handleChange} className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md py-2 px-3 text-white" /></div>
                <div><label htmlFor="firstRegistered" className="block text-sm font-medium text-gray-300">Date First Registered</label><UkDateInput id="firstRegistered" name="firstRegistered" value={formData.firstRegistered || ''} onChange={handleChange} className="mt-1" /></div>
                <div><label htmlFor="engineSize" className="block text-sm font-medium text-gray-300">Engine Size (cc)</label><input type="text" name="engineSize" value={formData.engineSize || ''} onChange={handleChange} className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md py-2 px-3 text-white" /></div>
                 <div><label htmlFor="motDueDate" className="block text-sm font-medium text-gray-300">MOT Due Date</label><UkDateInput id="motDueDate" name="motDueDate" value={formData.motDueDate || ''} onChange={handleChange} className="mt-1" /></div>
                <div>
                    <label htmlFor="vatScheme" className="block text-sm font-medium text-gray-300">VAT Scheme</label>
                    <Select name="vatScheme" value={formData.vatScheme} onChange={handleChange} wrapperClassName="mt-1">
                        <option>Margin</option><option>Qualifying</option><option>Commercial</option>
                    </Select>
                </div>
                <div className="md:col-span-2"><label htmlFor="purchasePrice" className="block text-sm font-medium text-gray-300">{isSor ? 'Owner Payout Amount' : 'Purchase Price'}</label><CurrencyInput id="purchasePrice" value={priceStr} onChange={e => setPriceStr(e.target.value)} required={!isSor} className="mt-1"/></div>
                <div className="md:col-span-2"><label htmlFor="purchaseDate" className="block text-sm font-medium text-gray-300">{isSor ? 'Agreement Date' : 'Purchase Date'}</label><UkDateInput id="purchaseDate" name="purchaseDate" value={formData.purchaseDate || ''} onChange={handleChange} className="mt-1" /></div>
            </div>

            {isSor && (
                <fieldset className="p-4 border border-gray-700 rounded-lg animate-in fade-in-0 duration-300">
                    <legend className="text-sm font-medium text-gray-300 px-1">Owner Details</legend>
                    <div className="mt-2 grid grid-cols-1 gap-4">
                        <div>
                            <label htmlFor="sorOwner.name" className="block text-sm font-medium text-gray-300">Owner's Full Name</label>
                            <input type="text" id="sorOwner.name" name="sorOwner.name" value={formData.sorOwner?.name || ''} onChange={handleChange} required={isSor} className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md py-2 px-3 text-white" />
                        </div>
                        <div>
                            <label htmlFor="sorOwner.address" className="block text-sm font-medium text-gray-300">Owner's Address</label>
                            <textarea id="sorOwner.address" name="sorOwner.address" value={formData.sorOwner?.address || ''} onChange={handleChange} required={isSor} rows={3} className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md py-2 px-3 text-white" />
                        </div>
                    </div>
                </fieldset>
            )}
            
            {!isEditing && !isSor && (
                <fieldset className="p-4 border border-gray-700 rounded-lg">
                    <div className="relative flex items-start">
                        <div className="flex h-6 items-center"><input id="generatePurchaseInvoice" name="generatePurchaseInvoice" type="checkbox" checked={generatePurchaseInvoice} onChange={(e) => setGeneratePurchaseInvoice(e.target.checked)} className="h-4 w-4 rounded border-gray-500 bg-gray-700 text-brand-600 focus:ring-brand-600"/></div>
                        <div className="ml-3 text-sm leading-6"><label htmlFor="generatePurchaseInvoice" className="font-medium text-gray-300">Generate Purchase Invoice</label><p className="text-gray-400">For private purchases. Creates a document in the Filing Cabinet.</p></div>
                    </div>
                    {generatePurchaseInvoice && (
                        <div className="mt-4 grid grid-cols-1 gap-4 animate-in fade-in-0 duration-300">
                             <div>
                                <label htmlFor="sellerName" className="block text-sm font-medium text-gray-300">Seller's Full Name</label>
                                <input type="text" id="sellerName" value={sellerDetails.name} onChange={e => setSellerDetails(p => ({...p, name: e.target.value}))} required={generatePurchaseInvoice} className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md py-2 px-3 text-white" />
                            </div>
                             <div>
                                <label htmlFor="sellerAddress" className="block text-sm font-medium text-gray-300">Seller's Address</label>
                                <textarea id="sellerAddress" value={sellerDetails.address} onChange={e => setSellerDetails(p => ({...p, address: e.target.value}))} required={generatePurchaseInvoice} rows={3} className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md py-2 px-3 text-white" />
                            </div>
                        </div>
                    )}
                </fieldset>
            )}

        </form>
         <footer className="flex-shrink-0 p-4 border-t border-gray-700 flex justify-end space-x-3 items-center bg-gray-800 sticky bottom-0 z-10">
            <button type="button" onClick={onClear} className="px-4 py-2 text-sm font-medium text-gray-300 bg-gray-600 hover:bg-gray-500 rounded-md">Cancel</button>
            <button type="submit" form="vehicle-editor-form" disabled={isSubmitting || isScanning} className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-50">
                {isSubmitting ? <Spinner /> : (isEditing ? 'Update Vehicle' : 'Add Vehicle')}
            </button>
        </footer>
    </div>
  );
};

export default VehicleEditor;
