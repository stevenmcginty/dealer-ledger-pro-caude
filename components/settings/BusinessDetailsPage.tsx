import React, { useState, useEffect } from 'react';
import { BusinessDetails, DirectorSalary } from '../../types';
import { useData } from '../../hooks/useData';
import UkDateInput from '../common/UkDateInput';
import Select from '../common/Select';
import { Button, Checkbox, Field, Input, Segmented } from '../ui';
import { CheckIcon, PlusIcon } from '../icons';
import { parseYearEnd, daysInMonth } from '../../utils/accounting/yearEnd';
import { readDirectorSalaries } from '../../utils/accounting/directorSalary';
import { cx } from '../ui/cx';
import { Panel, PanelSection, TextArea } from './SettingsKit';

const YEAR_END_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const OPERATING_MODES: { value: BusinessDetails['operatingMode']; label: string }[] = [
    { value: 'dealership', label: 'Dealership' },
    { value: 'paint_shop', label: 'Paint shop' },
    { value: 'mechanic', label: 'Mechanic' },
];

const BusinessDetailsPage = () => {
    const { businessDetails, updateBusinessDetails, theme } = useData();
    const [formData, setFormData] = useState<BusinessDetails>({
        name: '', address: '', phone: '', email: '', vatNumber: '', companyNumber: '', bankDetails: '', invoiceTerms: '', theme: 'blue', vatStartDate: '', operatingMode: 'dealership', isVatRegistered: false, mtdVatExportEnabled: false
    });
    const [isSaving, setIsSaving] = useState(false);
    const [saveSuccess, setSaveSuccess] = useState(false);

    useEffect(() => {
        if (businessDetails) {
            setFormData({ mtdVatExportEnabled: false, ...businessDetails });
        }
    }, [businessDetails]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value, type } = e.target;
        // Checkboxes save true/false, not the input's "on" value.
        const next = type === 'checkbox' ? (e.target as HTMLInputElement).checked : value;
        setFormData(prev => ({ ...prev, [name]: next }));
    };

    // Accounting year end, stored as 'MM-DD'. Unset shows (and saves) the 31 March default.
    const yearEnd = parseYearEnd(formData.yearEnd);
    const yearEndValue = (month: number, day: number) => `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const setYearEnd = (month: number, day: number) => {
        const safeDay = Math.min(day, daysInMonth(2024, month)); // 2024 is a leap year, so 29 Feb is allowed
        setFormData(prev => ({ ...prev, yearEnd: yearEndValue(month, safeDay) }));
    };

    // Director's salary from the payroll. Rows missing a name, amount or start date are not saved.
    const salaries: DirectorSalary[] = Array.isArray(formData.directorSalaries) ? formData.directorSalaries : readDirectorSalaries(formData.directorSalaries);
    const setSalary = (i: number, patch: Partial<DirectorSalary>) =>
        setFormData(prev => ({ ...prev, directorSalaries: salaries.map((s, j) => (j === i ? { ...s, ...patch } : s)) }));
    const addSalary = () => setFormData(prev => ({ ...prev, directorSalaries: [...salaries, { name: '', monthlyGross: 0, from: '' }] }));
    const removeSalary = (i: number) => setFormData(prev => ({ ...prev, directorSalaries: salaries.filter((_, j) => j !== i) }));

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSaving(true);
        setSaveSuccess(false);
        const { directorSalaries: _draft, ...rest } = formData;
        const cleanSalaries = readDirectorSalaries(salaries);
        // The brand colour is set in Settings > Appearance and saved on its own, so
        // save the live value, never the form's copy (which may be stale).
        await updateBusinessDetails({ ...rest, ...(cleanSalaries.length ? { directorSalaries: cleanSalaries } : {}), yearEnd: formData.yearEnd || yearEndValue(yearEnd.month, yearEnd.day), theme });
        setIsSaving(false);
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 2000);
    };

    const vatOff = !formData.isVatRegistered;

    return (
        <form onSubmit={handleSubmit}>
            <Panel ariaLabel="Business details">
                {/* ---- Company ---- */}
                <PanelSection title="Company" description="Shown at the top of your sales invoices.">
                    <div className="grid grid-cols-1 gap-x-4 gap-y-5 sm:grid-cols-2">
                        <div className="sm:col-span-2">
                            <p id="operatingModeLabel" className="mb-1.5 text-sm font-semibold leading-5 text-ink">What the business does</p>
                            <Segmented
                                ariaLabel="What the business does"
                                full
                                options={OPERATING_MODES}
                                value={formData.operatingMode}
                                onChange={value => setFormData(prev => ({ ...prev, operatingMode: value }))}
                            />
                        </div>
                        <Input wrapperClassName="sm:col-span-2" label="Company name" type="text" name="name" id="name" value={formData.name} onChange={handleChange} autoComplete="organization" />
                        <Field className="sm:col-span-2" label="Address" htmlFor="address">
                            <TextArea name="address" id="address" value={formData.address} onChange={handleChange} rows={4} />
                        </Field>
                        <Input label="Phone number" type="tel" name="phone" id="phone" value={formData.phone || ''} onChange={handleChange} className="num" />
                        <Input label="Email address" type="email" name="email" id="email" value={formData.email || ''} onChange={handleChange} />
                        <Input label="Company number" type="text" name="companyNumber" id="companyNumber" value={formData.companyNumber || ''} onChange={handleChange} className="num" />
                    </div>
                </PanelSection>

                {/* ---- VAT ---- */}
                <PanelSection title="VAT" description="Turn this on and the app works out VAT on sales, expenses and the VAT return.">
                    <div className="grid grid-cols-1 gap-x-4 gap-y-5 sm:grid-cols-2">
                        <Checkbox
                            className="sm:col-span-2"
                            id="isVatRegistered"
                            name="isVatRegistered"
                            label="The business is VAT registered"
                            checked={formData.isVatRegistered || false}
                            onChange={(e) => setFormData(prev => ({ ...prev, isVatRegistered: e.target.checked }))}
                        />
                        <Input label="VAT number" type="text" name="vatNumber" id="vatNumber" value={formData.vatNumber || ''} onChange={handleChange} disabled={vatOff} className="num" />
                        <Field
                            className={cx(vatOff && 'opacity-60')}
                            label="VAT quarter start"
                            htmlFor="vatStartDate"
                            hint="The first day of any of your VAT quarters. For Feb–Apr quarters, pick a 1 February."
                        >
                            <UkDateInput id="vatStartDate" name="vatStartDate" value={formData.vatStartDate || ''} onChange={handleChange} />
                        </Field>
                        <Checkbox
                            className="sm:col-span-2"
                            id="mtdVatExportEnabled"
                            name="mtdVatExportEnabled"
                            label="MTD bridging export"
                            description="Adds an MTD spreadsheet export to the VAT page, for bridging software."
                            checked={formData.mtdVatExportEnabled || false}
                            onChange={(e) => setFormData(prev => ({ ...prev, mtdVatExportEnabled: e.target.checked }))}
                            disabled={vatOff}
                        />
                    </div>
                </PanelSection>

                {/* ---- Year end and payroll ---- */}
                <PanelSection title="Year end and payroll" description="Used by the accountant’s year reports and the corporation tax estimate.">
                    <div className="grid grid-cols-1 gap-x-4 gap-y-5 sm:grid-cols-2">
                        <Field label="Accounting year end" htmlFor="yearEndDay" hint="The last day of the company’s financial year.">
                            {() => (
                                <div className="flex gap-2">
                                    <Select id="yearEndDay" aria-label="Year end day" value={yearEnd.day} onChange={e => setYearEnd(yearEnd.month, Number(e.target.value))} wrapperClassName="w-24 flex-none" className="num">
                                        {Array.from({ length: daysInMonth(2024, yearEnd.month) }, (_, i) => i + 1).map(d => <option key={d} value={d}>{d}</option>)}
                                    </Select>
                                    <Select id="yearEndMonth" aria-label="Year end month" value={yearEnd.month} onChange={e => setYearEnd(Number(e.target.value), yearEnd.day)} wrapperClassName="flex-1">
                                        {YEAR_END_MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                                    </Select>
                                </div>
                            )}
                        </Field>
                        <Input
                            label="Associated companies"
                            hint="Other companies under the same control. 0 if none."
                            type="number"
                            min={0}
                            step={1}
                            id="associatedCompanies"
                            inputMode="numeric"
                            value={formData.associatedCompanies ?? 0}
                            onChange={e => setFormData(prev => ({ ...prev, associatedCompanies: Math.max(0, Math.floor(Number(e.target.value) || 0)) }))}
                            className="num"
                        />

                        <div className="sm:col-span-2">
                            <p className="text-sm font-semibold leading-5 text-ink">Director’s salary <span className="font-normal text-ink-3">(from payroll)</span></p>
                            <p className="mt-1 max-w-[62ch] text-sm leading-5 text-ink-3">
                                The gross monthly salary the accountant runs through payroll. The P&amp;L counts it as wages each month and shows what the business still owes the director. Leave empty if there isn’t one.
                            </p>
                            {salaries.length > 0 && (
                                <ul className="m-0 mt-3 list-none space-y-3 p-0">
                                    {salaries.map((s, i) => (
                                        <li key={i} className="rounded-control border border-line bg-bg p-3">
                                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_10rem] lg:grid-cols-[minmax(0,1fr)_9rem_10.5rem_10.5rem]">
                                                <Input id={`salaryName${i}`} label="Director’s name" type="text" value={s.name} onChange={e => setSalary(i, { name: e.target.value })} placeholder="As on the bank lines" />
                                                <Input
                                                    id={`salaryGross${i}`}
                                                    label="Gross a month"
                                                    type="number"
                                                    min={0}
                                                    step="0.01"
                                                    inputMode="decimal"
                                                    affix="£"
                                                    value={s.monthlyGross || ''}
                                                    onChange={e => setSalary(i, { monthlyGross: Math.max(0, Number(e.target.value) || 0) })}
                                                    className="num text-end"
                                                />
                                                <Field label="From" htmlFor={`salaryFrom${i}`}>
                                                    <UkDateInput id={`salaryFrom${i}`} value={s.from || ''} onChange={e => setSalary(i, { from: e.target.value })} />
                                                </Field>
                                                <Field label="To" optional htmlFor={`salaryTo${i}`}>
                                                    <UkDateInput id={`salaryTo${i}`} value={s.to || ''} onChange={e => setSalary(i, { to: e.target.value })} />
                                                </Field>
                                            </div>
                                            <div className="mt-2 flex justify-end">
                                                <Button type="button" variant="ghost" size="sm" onClick={() => removeSalary(i)}>Remove</Button>
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            )}
                            <Button type="button" variant="secondary" size="sm" icon={<PlusIcon />} onClick={addSalary} className="mt-3">Add director’s salary</Button>
                            <p className="mt-2 text-sm leading-5 text-ink-3">Salary paid from the bank is a wages line with the director’s surname in it.</p>
                        </div>
                    </div>
                </PanelSection>

                {/* ---- Invoices ---- */}
                <PanelSection title="Invoices" description="Printed on every sales invoice, proforma and deposit slip.">
                    <div className="space-y-5">
                        <Field label="Bank details" htmlFor="bankDetails">
                            <TextArea name="bankDetails" id="bankDetails" value={formData.bankDetails || ''} onChange={handleChange} rows={3} />
                        </Field>
                        <Field label="Invoice terms and conditions" htmlFor="invoiceTerms">
                            <TextArea name="invoiceTerms" id="invoiceTerms" value={formData.invoiceTerms || ''} onChange={handleChange} rows={4} />
                        </Field>
                        <Field label="Terms page" htmlFor="termsPage" hint="Printed as page 2 only when you tick “Add terms page” on the invoice.">
                            <TextArea name="termsPage" id="termsPage" value={formData.termsPage || ''} onChange={handleChange} rows={8} />
                        </Field>
                        <Checkbox
                            id="cancellationForm"
                            name="cancellationForm"
                            label="Add a cancellation form to page 2"
                            description="For distance and doorstep sales."
                            checked={formData.cancellationForm || false}
                            onChange={handleChange}
                        />
                    </div>
                </PanelSection>

                <div className="flex flex-col-reverse items-stretch gap-3 p-4 sm:flex-row sm:items-center sm:justify-end sm:p-5">
                    {saveSuccess && (
                        <p role="status" className="inline-flex items-center justify-center gap-1.5 text-sm font-semibold text-success">
                            <CheckIcon className="h-5 w-5" /> Saved
                        </p>
                    )}
                    <Button type="submit" loading={isSaving} className="w-full sm:w-auto">Save business details</Button>
                </div>
            </Panel>
        </form>
    );
};

export default BusinessDetailsPage;
