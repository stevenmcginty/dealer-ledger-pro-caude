import React, { useState, useEffect, useRef } from 'react';
import { Vehicle, NewVehicle, VehicleUpdate, NewReceipt, VehicleLookupResult } from '../../types';
import { uploadFile } from '../../services/dataService';
import * as ai from '../../utils/ai';
import { lookupVehicle, buildVehiclePatch, isPlausibleUkReg, normaliseReg } from '../../services/vehicleLookup';
import { formatCurrency, fileToBase64, compressImage, robustDateParser, formatBytes, formatDate } from '../../utils/helpers';
import { XMarkIcon, CameraIcon, ArrowUpTrayIcon, SparklesIcon, CheckCircleIcon, MagnifyingGlassIcon, ExclamationTriangleIcon } from '../icons';
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

type ScanStep = 'idle' | 'compressing' | 'uploading' | 'analyzing' | 'looking-up' | 'error' | 'success';
interface ScanProgress {
    step: ScanStep;
    message: string;
    originalSize?: number;
    compressedSize?: number;
}

interface LookupState {
    status: 'idle' | 'loading' | 'done' | 'error';
    message?: string;
    changed?: string[];
    result?: VehicleLookupResult;
    mileageWarning?: string;
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
            case 'looking-up':
                return 'Checking DVLA & MOT records...';
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

/** Diagnostic-only warnings that would be noise on every single lookup. */
const isRoutineWarning = (warning: string) => warning.startsWith('DVLA Vehicle Enquiry Service key not configured');

const LookupResultPanel = ({ lookup }: { lookup: LookupState }) => {
    if (lookup.status === 'idle') return null;

    if (lookup.status === 'loading') {
        return (
            <p className="text-sm text-gray-400">Checking MOT and DVLA records…</p>
        );
    }

    if (lookup.status === 'error') {
        return (
            <div className="flex items-start gap-2 rounded-lg border border-red-800 bg-red-900/40 px-4 py-3 text-sm text-red-200">
                <ExclamationTriangleIcon className="h-5 w-5 flex-shrink-0 text-red-400" />
                <p>{lookup.message}</p>
            </div>
        );
    }

    const result = lookup.result;
    if (!result) return null;

    const motStatusColor = result.motStatus === 'Expired' ? 'text-red-300' : 'text-green-300';
    const advisories = result.motHistory?.find(test => test.advisories.length > 0)?.advisories || [];
    const warnings = [lookup.mileageWarning, ...(result.warnings || [])]
        .filter((w): w is string => !!w && !isRoutineWarning(w));

    const facts: Array<[string, React.ReactNode]> = [];
    if (result.motStatus) {
        facts.push(['MOT', (
            <span className={motStatusColor}>
                {result.motStatus}{result.motDueDate ? ` — ${formatDate(result.motDueDate)}` : ''}
            </span>
        )]);
    }
    if (result.lastMotOdometer) {
        facts.push(['Last recorded mileage', `${result.lastMotOdometer.value.toLocaleString()} (${formatDate(result.lastMotOdometer.date)})`]);
    }
    if (result.taxStatus) {
        facts.push(['Tax', `${result.taxStatus}${result.taxDueDate ? ` — ${formatDate(result.taxDueDate)}` : ''}`]);
    }

    // What the tax costs, not just whether it is paid. No government API
    // answers this — it comes off the published VED tables, so the workings
    // sit underneath where they can be checked.
    if (typeof result.annualRoadTax === 'number') {
        facts.push(['Road tax', (
            <span>
                £{result.annualRoadTax.toLocaleString('en-GB')} a year
                {result.ved?.band ? ` (band ${result.ved.band})` : ''}
            </span>
        )]);
    }
    if (result.runningCosts) {
        const rc = result.runningCosts;
        facts.push([
            rc.fuel === 'Electric' ? 'Home charging' : 'Fuel',
            `≈ £${rc.annualFuelCost.toLocaleString('en-GB')} a year${rc.mpg ? ` · ${rc.mpg} mpg` : ''}`,
        ]);
    }
    if (result.annualCost) {
        facts.push(['Tax + fuel', `≈ £${result.annualCost.total.toLocaleString('en-GB')} a year`]);
    }
    if (result.companyCarTax) {
        facts.push(['Company car band', `${result.companyCarTax.percent}% (${result.companyCarTax.taxYear})`]);
    }
    if (result.zones?.ulez) {
        facts.push(['ULEZ', (
            <span className={result.zones.ulez.compliant ? 'text-green-300' : 'text-red-300'}>
                {result.zones.ulez.compliant ? 'Compliant' : 'Not compliant'}
                {result.zones.ulez.assumed ? ' (from the date)' : ''}
            </span>
        )]);
    }
    if (result.ageAndUse?.milesPerYear) {
        facts.push(['Miles a year', result.ageAndUse.milesPerYear.toLocaleString('en-GB')]);
    }

    if (result.hasOutstandingRecall && result.hasOutstandingRecall !== 'Unknown') {
        facts.push(['Outstanding recall', result.hasOutstandingRecall]);
    }

    // The sentences behind the derived figures. Shown as written — they are
    // drafted to be readable by a customer, not only by Steve.
    const workings = [
        result.ved?.basis,
        result.runningCosts?.basis,
        result.companyCarTax?.basis,
        result.ageAndUse?.versusAverageBasis || result.ageAndUse?.firstMotNote,
    ].filter((s): s is string => !!s);

    return (
        <div className="rounded-lg border border-gray-700 bg-gray-900/60 px-4 py-3 space-y-3">
            <div className="flex items-start gap-2">
                <CheckCircleIcon className="h-5 w-5 flex-shrink-0 text-green-400" />
                <div className="min-w-0">
                    <p className="text-sm font-medium text-white">{lookup.message}</p>
                    <p className="text-xs text-gray-400">
                        Source: {result.sources.mot ? 'DVSA MOT history' : ''}
                        {result.sources.mot && result.sources.ves ? ' + ' : ''}
                        {result.sources.ves ? 'DVLA vehicle enquiry' : ''}
                        {result.cached ? ' (cached)' : ''}
                    </p>
                </div>
            </div>

            {!!lookup.changed?.length && (
                <div className="flex flex-wrap gap-1.5">
                    {lookup.changed.map(field => (
                        <span key={field} className="rounded-full bg-brand-600/20 px-2 py-0.5 text-xs text-brand-300">{field}</span>
                    ))}
                </div>
            )}

            {!!facts.length && (
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-sm">
                    {facts.map(([label, value]) => (
                        <div key={label} className="flex justify-between gap-2">
                            <dt className="text-gray-400">{label}</dt>
                            <dd className="text-right text-gray-200">{value}</dd>
                        </div>
                    ))}
                </dl>
            )}

            {!!workings.length && (
                <details className="text-xs text-gray-400">
                    <summary className="cursor-pointer select-none hover:text-gray-200">
                        How the tax and running costs were worked out
                    </summary>
                    <ul className="mt-1 space-y-1 list-disc list-inside text-gray-300">
                        {workings.map((text, i) => <li key={i}>{text}</li>)}
                    </ul>
                </details>
            )}

            {!!advisories.length && (
                <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Latest MOT advisories</p>
                    <ul className="mt-1 space-y-0.5 text-xs text-gray-300 list-disc list-inside">
                        {advisories.slice(0, 4).map((text, i) => <li key={i}>{text}</li>)}
                        {advisories.length > 4 && <li className="list-none text-gray-500">+{advisories.length - 4} more</li>}
                    </ul>
                </div>
            )}

            {warnings.map(warning => (
                <div key={warning} className="flex items-start gap-2 rounded-md bg-amber-900/30 px-3 py-2 text-xs text-amber-200">
                    <ExclamationTriangleIcon className="h-4 w-4 flex-shrink-0 text-amber-400" />
                    <span>{warning}</span>
                </div>
            ))}
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
  // Mirrors formData so async flows (scan → lookup) can read the current values
  // without waiting for a re-render.
  const formDataRef = useRef<Partial<Vehicle>>({});
  formDataRef.current = formData;
  const [priceStr, setPriceStr] = useState('');
  const [advertisedPriceStr, setAdvertisedPriceStr] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [scanProgress, setScanProgress] = useState<ScanProgress>({ step: 'idle', message: '' });
  const [lastFile, setLastFile] = useState<File | null>(null);
  const [scannedDeliveryDetails, setScannedDeliveryDetails] = useState<ScannedDeliveryDetails | null>(null);
  const [lookup, setLookup] = useState<LookupState>({ status: 'idle' });

  const [generatePurchaseInvoice, setGeneratePurchaseInvoice] = useState(false);
  const [sellerDetails, setSellerDetails] = useState({ name: '', address: '' });

  const isScanning = ['compressing', 'uploading', 'analyzing', 'looking-up'].includes(scanProgress.step);
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
    let initialAdvertisedPrice = '';

    if (editingVehicle) {
      initialState = { ...editingVehicle };
      initialPrice = String(editingVehicle.purchasePrice || '');
      initialAdvertisedPrice = String(editingVehicle.advertisedPrice || '');
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
    setAdvertisedPriceStr(initialAdvertisedPrice);
    setScannedDeliveryDetails(null);
    setLookup({ status: 'idle' });
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

  /**
   * Pull the vehicle's record from DVLA/DVSA and merge it into the form.
   *
   * `base` is the form state the patch is calculated against. It's passed in
   * explicitly because the invoice scan calls this immediately after setting the
   * scanned values, when `formData` hasn't re-rendered yet.
   */
  const runRegLookup = async (rawReg: string, base: Partial<Vehicle>): Promise<VehicleLookupResult | null> => {
    const reg = normaliseReg(rawReg);

    if (!isPlausibleUkReg(reg)) {
        setLookup({ status: 'error', message: 'Enter a registration before looking it up.' });
        return null;
    }

    setLookup({ status: 'loading' });

    try {
        const result = await lookupVehicle(reg);

        if (!result.found) {
            const warning = (result.warnings || []).find(w => !isRoutineWarning(w));
            setLookup({
                status: 'error',
                message: warning
                    || `No record found for ${reg}. Cars under three years old have no MOT history yet.`,
            });
            return null;
        }

        const { patch, changed, mileageWarning } = buildVehiclePatch(result, base);
        if (Object.keys(patch).length) {
            setFormData(prev => ({ ...prev, ...patch }));
        }

        setLookup({
            status: 'done',
            result,
            changed,
            mileageWarning,
            message: changed.length
                ? `${changed.length} field${changed.length === 1 ? '' : 's'} filled from official records.`
                : 'Official records match what you already have.',
        });

        return result;
    } catch (error: any) {
        setLookup({ status: 'error', message: error?.message || 'Lookup failed.' });
        return null;
    }
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
        const totalDeliveryCost = result.totalDeliveryCost || 0;

        if (totalDeliveryCost > 0) {
            setScannedDeliveryDetails({
                amount: totalDeliveryCost,
                vat: result.deliveryVat || 0,
                vendor: result.vendor || 'Auction House',
                date: result.purchaseDate || new Date().toISOString().split('T')[0],
            });
            successMessage = 'Success! Delivery extracted separately.';
        }

        const firstRegDate = result.firstRegistered ? robustDateParser(result.firstRegistered) : null;
        const purchaseDate = result.purchaseDate ? robustDateParser(result.purchaseDate) : null;

        // Only carry across what the invoice actually yielded, so a blank field
        // never wipes something already on the form.
        const invoicePatch: Partial<Vehicle> = {};
        if (result.make) invoicePatch.make = result.make;
        if (result.model) invoicePatch.model = result.model;
        if (result.vin) invoicePatch.vin = result.vin;
        if (result.color) invoicePatch.color = result.color;
        if (result.reg) invoicePatch.reg = result.reg;
        if (firstRegDate) invoicePatch.firstRegistered = firstRegDate;
        if (purchaseDate) invoicePatch.purchaseDate = purchaseDate;
        if (result.year) invoicePatch.year = result.year;
        if (result.mileage) invoicePatch.mileage = result.mileage;
        if (result.engineSize) invoicePatch.engineSize = result.engineSize;

        setFormData(prev => ({ ...prev, ...invoicePatch }));

        // Calculate purchase price: Grand Total minus Delivery Cost
        // This ensures indemnity and auction fees remain in the vehicle purchase price
        if (result.grandTotal) {
            const calculatedPrice = result.grandTotal - totalDeliveryCost;
            setPriceStr(String(calculatedPrice));
        }

        // The invoice gives us the reg; DVLA and DVSA give us everything the
        // invoice got wrong or left out — including the MOT expiry.
        const merged = { ...formDataRef.current, ...invoicePatch };
        if (merged.reg && isPlausibleUkReg(merged.reg)) {
            setScanProgress(p => ({ ...p, step: 'looking-up', message: 'Checking DVLA & MOT records...' }));
            const lookedUp = await runRegLookup(merged.reg, merged);
            if (lookedUp) {
                successMessage = totalDeliveryCost > 0
                    ? 'Invoice + DVLA data combined. Delivery extracted separately.'
                    : 'Invoice and DVLA data combined.';
            } else {
                successMessage = totalDeliveryCost > 0
                    ? 'Invoice scanned. Delivery extracted. MOT lookup failed — tap Look up.'
                    : 'Invoice scanned. MOT lookup failed — tap Look up next to the registration.';
            }
        }

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

    // A blank advertised price is genuinely blank — a car not yet worth
    // advertising. Storing a zero would put "£0" on a website. It is written as
    // null rather than dropped because an edit is an update(), and a key that
    // is simply absent there leaves the previous price sitting in the record.
    const advertised = parseFloat(advertisedPriceStr);
    submissionData.advertisedPrice = Number.isFinite(advertised) && advertised > 0 ? advertised : null;
    
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
                <div>
                    <label htmlFor="reg" className="block text-sm font-medium text-gray-300">Registration</label>
                    <div className="mt-1 flex items-stretch gap-2">
                        <input type="text" name="reg" value={formData.reg || ''} onChange={handleChange} required className="block w-full bg-gray-700 border-gray-600 rounded-md py-2 px-3 text-white uppercase" />
                        <button
                            type="button"
                            onClick={() => runRegLookup(formData.reg || '', formData)}
                            disabled={lookup.status === 'loading' || isScanning}
                            title="Look up DVLA & MOT data for this registration"
                            className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-md text-white bg-gray-600 hover:bg-gray-500 disabled:opacity-50"
                        >
                            {lookup.status === 'loading'
                                ? <Spinner className="h-5 w-5" />
                                : <MagnifyingGlassIcon className="h-5 w-5" />}
                            <span>Look up</span>
                        </button>
                    </div>
                </div>
                {lookup.status !== 'idle' && (
                    <div className="md:col-span-2">
                        <LookupResultPanel lookup={lookup} />
                    </div>
                )}
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
                <div className="md:col-span-2">
                    <label htmlFor="advertisedPrice" className="block text-sm font-medium text-gray-300">Advertised Price</label>
                    <CurrencyInput id="advertisedPrice" value={advertisedPriceStr} onChange={e => setAdvertisedPriceStr(e.target.value)} className="mt-1"/>
                    {/* The only price a linked website is ever sent. Left blank until
                        the car is worth advertising, which is usually weeks later. */}
                    <p className="mt-1 text-xs text-gray-500">Optional — what it goes on the forecourt at. Sent to a linked website; the purchase price never is.</p>
                </div>
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
