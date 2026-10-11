import React, { useState, useEffect, useRef } from 'react';
import { Vehicle, NewVehicle, VehicleUpdate, NewReceipt, VehicleLookupResult } from '../../types';
import { uploadFile } from '../../services/dataService';
import * as ai from '../../utils/ai';
import { lookupVehicle, buildVehiclePatch, isPlausibleUkReg, normaliseReg } from '../../services/vehicleLookup';
import { formatCurrency, fileToBase64, compressImage, robustDateParser, formatBytes, formatDate } from '../../utils/helpers';
import { CameraIcon, ArrowUpTrayIcon, SparklesIcon, CheckCircleIcon, MagnifyingGlassIcon, ExclamationTriangleIcon } from '../icons';
import Spinner from '../common/Spinner';
import CurrencyInput from '../common/CurrencyInput';
import UkDateInput from '../common/UkDateInput';
import Select from '../common/Select';
import { Button, Segmented, Checkbox } from '../ui';
import { PanelHeader } from './parts';

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
                return 'Reading the invoice…';
            case 'looking-up':
                return 'Checking DVLA and MOT records…';
            default:
                return progress.message;
        }
    };

    return (
        <div className="absolute inset-0 z-dialog flex flex-col items-center justify-center bg-scrim p-4 text-center">
             <div role="status" aria-live="polite" className="w-full max-w-sm rounded-card border border-line bg-surface p-6 shadow-e3">
                <h3 className="mb-4 text-xl font-bold text-ink">
                    {progress.step === 'success' ? 'Invoice read' : 'Reading the invoice'}
                </h3>
                {progress.step !== 'error' && progress.step !== 'success' && <Spinner className="h-8 w-8 text-accent-text mx-auto mb-4" />}
                <p className="mb-2 min-h-5 text-ink-2">{progressMessage()}</p>
                 {progress.step === 'error' && (
                     <div className="mt-2">
                        <div className="rounded-control border border-danger bg-danger-soft px-4 py-3 text-start text-danger-ink"><p className="font-bold">Couldn’t read the invoice</p><p className="text-sm mt-1">{progress.message}</p></div>
                        <div className="mt-5 flex gap-3">
                           <Button variant="secondary" className="flex-1" onClick={onClose}>Type it in</Button>
                           <Button className="flex-1" onClick={onRetry}>Try again</Button>
                        </div>
                    </div>
                )}
                {progress.step === 'success' && (
                    <div className="mt-2 text-center">
                        <div className="flex items-center justify-center gap-2 text-success">
                            <CheckCircleIcon className="h-7 w-7" />
                            <p className="font-semibold text-xl">{progress.message}</p>
                        </div>
                        <p className="mt-2 text-sm text-ink-2">Check the filled-in fields before you save.</p>
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
            <p className="text-sm text-ink-3">Checking MOT and DVLA records…</p>
        );
    }

    if (lookup.status === 'error') {
        return (
            <div role="alert" className="flex items-start gap-2 rounded-control border border-danger bg-danger-soft px-4 py-3 text-sm text-danger-ink">
                <ExclamationTriangleIcon className="h-5 w-5 flex-shrink-0 text-danger-ink" />
                <p>{lookup.message}</p>
            </div>
        );
    }

    const result = lookup.result;
    if (!result) return null;

    const motStatusColor = result.motStatus === 'Expired' ? 'text-danger' : 'text-success';
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
            <span className={result.zones.ulez.compliant ? 'text-success' : 'text-danger'}>
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
        <div className="space-y-3 rounded-control border border-line bg-surface-2 px-4 py-3">
            <div className="flex items-start gap-2">
                <CheckCircleIcon className="h-5 w-5 flex-shrink-0 text-success" />
                <div className="min-w-0">
                    <p className="text-sm font-medium text-ink">{lookup.message}</p>
                    <p className="text-sm text-ink-3">
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
                        <span key={field} className="rounded-chip bg-accent-soft px-2 py-1 text-xs font-semibold text-accent-soft-ink">{field}</span>
                    ))}
                </div>
            )}

            {!!facts.length && (
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-sm">
                    {facts.map(([label, value]) => (
                        <div key={label} className="flex justify-between gap-2">
                            <dt className="text-ink-3">{label}</dt>
                            <dd className="text-end font-semibold text-ink">{value}</dd>
                        </div>
                    ))}
                </dl>
            )}

            {!!workings.length && (
                <details className="text-sm text-ink-3">
                    <summary className="flex min-h-[44px] cursor-pointer select-none items-center font-semibold hover:text-ink">
                        How the tax and running costs were worked out
                    </summary>
                    <ul className="mt-1 space-y-1 list-disc list-inside text-ink-2">
                        {workings.map((text, i) => <li key={i}>{text}</li>)}
                    </ul>
                </details>
            )}

            {!!advisories.length && (
                <div>
                    <p className="font-mono text-xs font-semibold uppercase tracking-[0.08em] text-ink-3">Latest MOT advisories</p>
                    <ul className="mt-1 list-inside list-disc space-y-0.5 text-sm text-ink-2">
                        {advisories.slice(0, 4).map((text, i) => <li key={i}>{text}</li>)}
                        {advisories.length > 4 && <li className="list-none text-ink-3">+{advisories.length - 4} more</li>}
                    </ul>
                </div>
            )}

            {warnings.map(warning => (
                <div key={warning} className="flex items-start gap-2 rounded-control bg-warning-soft px-3 py-2 text-sm text-warning-ink">
                    <ExclamationTriangleIcon className="h-4 w-4 flex-shrink-0 text-warning-ink" />
                    <span>{warning}</span>
                </div>
            ))}
        </div>
    );
};

/** Plain text field on the shared control look (48px, 8px radius, strong edge). */
const inputCls = 'mt-1.5 block min-h-[48px] w-full rounded-control border border-line-strong bg-surface px-3.5 py-3 text-base text-ink placeholder:text-ink-3 transition-colors duration-quick ease-out hover:border-ink-2';

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
        if (field === 'name' || field === 'address') {
            setFormData(prev => ({
                ...prev,
                sorOwner: { name: '', address: '', ...prev.sorOwner, [field]: value }
            }));
        }
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
        <PanelHeader
            title={isEditing ? 'Edit car' : 'Add car'}
            subtitle={formData.stockNumber ? <span className="num">#{formData.stockNumber}{formData.reg ? ` · ${formData.reg}` : ''}</span> : undefined}
            onClose={onClear}
        />
        <form id="vehicle-editor-form" onSubmit={handleSubmit} className="space-y-5 p-5">
            
            <fieldset>
                <legend className="mb-1.5 text-sm font-semibold text-ink">Ownership</legend>
                <Segmented
                    ariaLabel="Ownership"
                    full
                    value={isSor ? 'Sale or Return' : 'Owned Stock'}
                    onChange={v => handleOwnershipTypeChange(v as 'Owned Stock' | 'Sale or Return')}
                    options={[{ value: 'Owned Stock', label: 'Owned stock' }, { value: 'Sale or Return', label: 'Sale or return' }]}
                />
            </fieldset>

             {!isSor && (
                <div>
                    <input type="file" accept="image/*,application/pdf" capture="environment" ref={cameraInputRef} onChange={e => e.target.files && runInvoiceScan(e.target.files[0])} className="hidden" />
                    <input type="file" accept="image/*,application/pdf" ref={uploadInputRef} onChange={e => e.target.files && runInvoiceScan(e.target.files[0])} className="hidden" />
                    <p className="text-sm font-semibold text-ink">Read the purchase invoice</p>
                    <div className="mt-1.5 grid grid-cols-2 gap-3">
                        <Button type="button" variant="secondary" block icon={<CameraIcon />} onClick={() => cameraInputRef.current?.click()}>Take photo</Button>
                        <Button type="button" variant="secondary" block icon={<ArrowUpTrayIcon />} onClick={() => uploadInputRef.current?.click()}>Pick a file</Button>
                    </div>
                </div>
             )}
            <div className="relative"><div className="absolute inset-0 flex items-center"><div className="w-full border-t border-line" /></div><div className="relative flex justify-center"><span className="bg-surface px-2 text-sm text-ink-3">Or type it in</span></div></div>
            
             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label htmlFor="stockNumber" className="block text-sm font-semibold text-ink">Stock no.</label>
                    <input 
                        type="text" 
                        name="stockNumber" 
                        value={formData.stockNumber || ''} 
                        readOnly
                        placeholder={isSor && !isEditing ? "Assigned upon sale" : ""}
                        className="num mt-1.5 block min-h-[48px] w-full rounded-control border border-line bg-surface-2 px-3.5 py-3 text-base text-ink-3 placeholder:text-ink-3"
                    />
                </div>
                <div>
                    <label htmlFor="reg" className="block text-sm font-semibold text-ink">Registration</label>
                    <div className="mt-1.5 flex items-stretch gap-2">
                        <input type="text" name="reg" value={formData.reg || ''} onChange={handleChange} required className="block min-h-[48px] w-full min-w-0 rounded-control border-2 border-plate-ink bg-plate-yellow px-3.5 py-2.5 font-mono text-lg font-semibold uppercase tracking-[0.08em] text-plate-ink" />
                        <Button
                            type="button"
                            variant="secondary"
                            onClick={() => runRegLookup(formData.reg || '', formData)}
                            loading={lookup.status === 'loading'}
                            disabled={isScanning}
                            title="Look up DVLA and MOT data for this registration"
                            icon={<MagnifyingGlassIcon />}
                            className="flex-none"
                        >
                            Look up
                        </Button>
                    </div>
                </div>
                {lookup.status !== 'idle' && (
                    <div className="md:col-span-2">
                        <LookupResultPanel lookup={lookup} />
                    </div>
                )}
                <div><label htmlFor="make" className="block text-sm font-semibold text-ink">Make</label><input type="text" name="make" value={formData.make || ''} onChange={handleChange} required className={inputCls} /></div>
                <div><label htmlFor="model" className="block text-sm font-semibold text-ink">Model</label><input type="text" name="model" value={formData.model || ''} onChange={handleChange} required className={inputCls} /></div>
                <div><label htmlFor="color" className="block text-sm font-semibold text-ink">Colour</label><input type="text" name="color" value={formData.color || ''} onChange={handleChange} className={inputCls} /></div>
                <div><label htmlFor="vin" className="block text-sm font-semibold text-ink">Chassis / VIN</label><input type="text" name="vin" value={formData.vin || ''} onChange={handleChange} className={inputCls} /></div>
                <div><label htmlFor="year" className="block text-sm font-semibold text-ink">Year</label><input type="number" name="year" value={formData.year || ''} onChange={handleChange} className={inputCls} /></div>
                <div><label htmlFor="mileage" className="block text-sm font-semibold text-ink">Mileage</label><input type="number" name="mileage" value={formData.mileage || ''} onChange={handleChange} className={inputCls} /></div>
                <div><label htmlFor="firstRegistered" className="block text-sm font-semibold text-ink">First registered</label><UkDateInput id="firstRegistered" name="firstRegistered" value={formData.firstRegistered || ''} onChange={handleChange} className="mt-1.5" /></div>
                <div><label htmlFor="engineSize" className="block text-sm font-semibold text-ink">Engine size (cc)</label><input type="text" name="engineSize" value={formData.engineSize || ''} onChange={handleChange} className={inputCls} /></div>
                 <div><label htmlFor="motDueDate" className="block text-sm font-semibold text-ink">MOT due</label><UkDateInput id="motDueDate" name="motDueDate" value={formData.motDueDate || ''} onChange={handleChange} className="mt-1.5" /></div>
                <div>
                    {/* Read-only: worked out from CO2 and first registration when the car
                        is looked up (functions/src/vehicle/ved.ts) and kept on the car. */}
                    <span className="block text-sm font-semibold text-ink">Road tax</span>
                    <p className="num mt-1.5 py-3 text-base text-ink">
                        {typeof formData.annualRoadTax === 'number'
                            ? `£${formData.annualRoadTax.toLocaleString('en-GB')} a year`
                            : <span className="font-sans text-ink-3">Not known yet</span>}
                        {typeof formData.co2Emissions === 'number' && (
                            <span className="font-sans text-ink-3"> · CO2 {formData.co2Emissions} g/km</span>
                        )}
                    </p>
                    {formData.taxStatus && (
                        <p className="text-sm text-ink-3">
                            {formData.taxStatus}{formData.taxDueDate ? ` — due ${formatDate(formData.taxDueDate)}` : ''}
                        </p>
                    )}
                </div>
                <div>
                    <label htmlFor="vatScheme" className="block text-sm font-semibold text-ink">VAT scheme</label>
                    <Select name="vatScheme" value={formData.vatScheme} onChange={handleChange} wrapperClassName="mt-1.5">
                        <option>Margin</option><option>Qualifying</option><option>Commercial</option>
                    </Select>
                </div>
                <div className="md:col-span-2"><label htmlFor="purchasePrice" className="block text-sm font-semibold text-ink">{isSor ? 'Owner payout' : 'Purchase price'}</label><CurrencyInput id="purchasePrice" value={priceStr} onChange={e => setPriceStr(e.target.value)} required={!isSor} className="mt-1.5"/></div>
                <div className="md:col-span-2">
                    <label htmlFor="advertisedPrice" className="block text-sm font-semibold text-ink">Asking price</label>
                    <CurrencyInput id="advertisedPrice" value={advertisedPriceStr} onChange={e => setAdvertisedPriceStr(e.target.value)} className="mt-1.5"/>
                    {/* The only price a linked website is ever sent. Left blank until
                        the car is worth advertising, which is usually weeks later. */}
                    <p className="mt-1.5 text-sm text-ink-3">Optional — what it goes on the forecourt at. Sent to a linked website; the purchase price never is.</p>
                </div>
                <div className="md:col-span-2"><label htmlFor="purchaseDate" className="block text-sm font-semibold text-ink">{isSor ? 'Agreement date' : 'Purchase date'}</label><UkDateInput id="purchaseDate" name="purchaseDate" value={formData.purchaseDate || ''} onChange={handleChange} className="mt-1.5" /></div>
            </div>

            {isSor && (
                <fieldset className="rounded-card border border-line p-4">
                    <legend className="px-1 text-sm font-semibold text-ink">Owner details</legend>
                    <div className="mt-2 grid grid-cols-1 gap-4">
                        <div>
                            <label htmlFor="sorOwner.name" className="block text-sm font-semibold text-ink">Owner’s full name</label>
                            <input type="text" id="sorOwner.name" name="sorOwner.name" value={formData.sorOwner?.name || ''} onChange={handleChange} required={isSor} className={inputCls} />
                        </div>
                        <div>
                            <label htmlFor="sorOwner.address" className="block text-sm font-semibold text-ink">Owner’s address</label>
                            <textarea id="sorOwner.address" name="sorOwner.address" value={formData.sorOwner?.address || ''} onChange={handleChange} required={isSor} rows={3} className={inputCls} />
                        </div>
                    </div>
                </fieldset>
            )}
            
            {!isEditing && !isSor && (
                <fieldset className="rounded-card border border-line px-4 py-2">
                    <Checkbox
                        id="generatePurchaseInvoice"
                        name="generatePurchaseInvoice"
                        checked={generatePurchaseInvoice}
                        onChange={(e) => setGeneratePurchaseInvoice(e.target.checked)}
                        label="Make a purchase invoice"
                        description="For private purchases. It goes in the Filing Cabinet."
                    />
                    {generatePurchaseInvoice && (
                        <div className="mb-2 mt-2 grid grid-cols-1 gap-4">
                             <div>
                                <label htmlFor="sellerName" className="block text-sm font-semibold text-ink">Seller’s full name</label>
                                <input type="text" id="sellerName" value={sellerDetails.name} onChange={e => setSellerDetails(p => ({...p, name: e.target.value}))} required={generatePurchaseInvoice} className={inputCls} />
                            </div>
                             <div>
                                <label htmlFor="sellerAddress" className="block text-sm font-semibold text-ink">Seller’s address</label>
                                <textarea id="sellerAddress" value={sellerDetails.address} onChange={e => setSellerDetails(p => ({...p, address: e.target.value}))} required={generatePurchaseInvoice} rows={3} className={inputCls} />
                            </div>
                        </div>
                    )}
                </fieldset>
            )}

        </form>
         <footer className="sticky bottom-0 z-sticky flex flex-none items-center justify-end gap-3 border-t border-line bg-surface p-4">
            <Button type="button" variant="secondary" onClick={onClear}>Cancel</Button>
            <Button type="submit" form="vehicle-editor-form" loading={isSubmitting} disabled={isScanning}>
                {isEditing ? 'Save car' : 'Add car'}
            </Button>
        </footer>
    </div>
  );
};

export default VehicleEditor;
