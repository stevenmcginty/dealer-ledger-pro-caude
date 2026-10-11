import React, { useState } from 'react';
import { Vehicle } from '../../types';
import { XMarkIcon, ArrowUpTrayIcon, CheckCircleIcon } from '../icons';
import Select from '../common/Select';
import { Button, Field, IconButton } from '../ui';

interface AssignInvoiceModalProps {
    vehicles: Vehicle[];
    onSubmit: (vehicleId: string, file: File) => Promise<void>;
    onClose: () => void;
}

const AssignInvoiceModal = ({ vehicles, onSubmit, onClose }: AssignInvoiceModalProps) => {
    const [selectedVehicleId, setSelectedVehicleId] = useState<string>(vehicles[0]?.id || '');
    const [file, setFile] = useState<File | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedVehicleId || !file) return;
        setIsSubmitting(true);
        await onSubmit(selectedVehicleId, file);
        // closeModal is called in parent
    };

    return (
        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
            <header className="flex flex-none items-start gap-3 px-5 pb-3 pt-2 sm:pt-5">
                <h2 className="min-w-0 flex-1 pt-2.5 text-[1.375rem] font-bold leading-7 tracking-[-0.01em] text-ink">Upload a purchase invoice</h2>
                <IconButton label="Close" icon={<XMarkIcon />} onClick={onClose} className="-me-2" />
            </header>
            <div className="flex-1 space-y-5 px-5 pb-5">
                <Field label="Car" htmlFor="vehicle-select">
                    <Select
                        id="vehicle-select"
                        value={selectedVehicleId}
                        onChange={e => setSelectedVehicleId(e.target.value)}
                        disabled={vehicles.length === 0}
                    >
                        {vehicles.length > 0 ? (
                            vehicles.map(v => (
                                <option key={v.id} value={v.id}>{v.reg} - {v.make} {v.model}</option>
                            ))
                        ) : (
                            <option>Every car has its invoice</option>
                        )}
                    </Select>
                </Field>
                <Field label="Invoice file" htmlFor="file-upload" hint="A photo or PDF, up to 10 MB.">
                    {() => (
                        <label
                            htmlFor="file-upload"
                            className="flex min-h-[132px] cursor-pointer flex-col items-center justify-center gap-2 rounded-card border-2 border-dashed border-line-strong bg-bg p-5 text-center transition-colors duration-quick ease-out hover:border-accent hover:bg-accent-soft has-[:focus-visible]:outline has-[:focus-visible]:outline-[3px] has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus"
                        >
                            {file ? <CheckCircleIcon className="h-8 w-8 text-success" /> : <ArrowUpTrayIcon className="h-8 w-8 text-ink-2" />}
                            <span className="max-w-full truncate text-base font-semibold text-ink">{file ? file.name : 'Choose a file'}</span>
                            {file && <span className="text-sm text-ink-3">Tap to choose another</span>}
                            <input id="file-upload" name="file-upload" type="file" className="sr-only" onChange={e => setFile(e.target.files ? e.target.files[0] : null)} accept="image/*,application/pdf" />
                        </label>
                    )}
                </Field>
            </div>
            <footer className="flex flex-none justify-end gap-2 border-t border-line px-4 py-3 sm:px-5">
                <Button type="button" variant="secondary" onClick={onClose} className="flex-1 sm:flex-none">Cancel</Button>
                <Button type="submit" loading={isSubmitting} disabled={!selectedVehicleId || !file} className="flex-1 sm:flex-none">Upload invoice</Button>
            </footer>
        </form>
    );
};

export default AssignInvoiceModal;
