import React, { useMemo, useState, useEffect } from 'react';
import { FinancialAccount, StatementColumnMapping, StatementDateFormat, StatementAmountMode } from '../../types';
import { extractCSVHeaders, previewCSVRows, applyColumnMapping, isMappingComplete } from '../../utils/csvMapping';
import { useData } from '../../hooks/useData';
import { useUI } from '../../hooks/useUI';
import * as dataService from '../../services/dataService';
import Select from '../common/Select';
import {
    ViewColumnsIcon, XMarkIcon, CheckCircleIcon, ExclamationTriangleIcon, ArrowUpTrayIcon, CheckIcon,
} from '../icons';
import { Button, IconButton, Field, Alert, Checkbox, Stepper, buttonClasses } from '../ui';
import { cx } from '../ui/cx';

interface StatementMappingWizardProps {
    account: FinancialAccount;
    csvText?: string;        // provided when opened from an upload that wasn't recognised
    file?: File | null;      // the statement to re-import after the mapping is saved
}

const DATE_FORMAT_OPTIONS: { value: StatementDateFormat; label: string; example: string }[] = [
    { value: 'DD/MM/YYYY', label: 'DD/MM/YYYY', example: '31/03/2026' },
    { value: 'DD-MM-YYYY', label: 'DD-MM-YYYY', example: '31-03-2026' },
    { value: 'YYYY-MM-DD', label: 'YYYY-MM-DD', example: '2026-03-31' },
    { value: 'MM/DD/YYYY', label: 'MM/DD/YYYY', example: '03/31/2026' },
];

const StatementMappingWizard: React.FC<StatementMappingWizardProps> = ({ account, csvText: initialCsvText, file }) => {
    const { companyId, allReceipts, transactions, updateFinancialAccount } = useData();
    const { openModal, closeModal } = useUI();

    const existing = account.columnMapping;

    const [csvText, setCsvText] = useState(initialCsvText || '');
    const [step, setStep] = useState<1 | 2 | 3>(1);
    const [isSaving, setIsSaving] = useState(false);
    const [loadError, setLoadError] = useState('');

    // Field mapping state (prefilled from any existing saved mapping for re-mapping).
    const [dateColumn, setDateColumn] = useState(existing?.dateColumn || '');
    const [dateFormat, setDateFormat] = useState<StatementDateFormat>(existing?.dateFormat || 'DD/MM/YYYY');
    const [descriptionColumn, setDescriptionColumn] = useState(existing?.descriptionColumn || '');
    const [amountMode, setAmountMode] = useState<StatementAmountMode>(existing?.amountMode || 'single');
    const [amountColumn, setAmountColumn] = useState(existing?.amountColumn || '');
    const [debitColumn, setDebitColumn] = useState(existing?.debitColumn || '');
    const [creditColumn, setCreditColumn] = useState(existing?.creditColumn || '');
    const [methodColumn, setMethodColumn] = useState(existing?.methodColumn || '');
    const [invertAmountSign, setInvertAmountSign] = useState(existing?.invertAmountSign ?? (account.type === 'Credit Card'));

    const headers = useMemo(() => (csvText ? extractCSVHeaders(csvText) : []), [csvText]);
    const previewRows = useMemo(() => (csvText ? previewCSVRows(csvText, 5) : []), [csvText]);

    // Auto-detect an unambiguous date format from the first sample row.
    useEffect(() => {
        if (!dateColumn || previewRows.length === 0) return;
        const sample = previewRows[0]?.[dateColumn];
        if (!sample) return;
        const s = sample.trim();
        if (/^\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}$/.test(s)) setDateFormat('YYYY-MM-DD');
        else if (/^\d{1,2}-\d{1,2}-\d{2,4}$/.test(s)) setDateFormat('DD-MM-YYYY');
    }, [dateColumn, previewRows]);

    const buildMapping = (): StatementColumnMapping => ({
        dateColumn,
        descriptionColumn,
        amountMode,
        ...(amountMode === 'single' ? { amountColumn } : { debitColumn, creditColumn }),
        ...(methodColumn ? { methodColumn } : {}),
        dateFormat,
        invertAmountSign,
    });

    const mappingReady = isMappingComplete(buildMapping());

    const parsedPreview = useMemo(() => {
        if (step !== 3 || !mappingReady) return [];
        const mapping = buildMapping();
        return previewRows.map(row => applyColumnMapping(row, mapping));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [step, mappingReady, previewRows, dateColumn, descriptionColumn, amountMode, amountColumn, debitColumn, creditColumn, methodColumn, dateFormat, invertAmountSign]);

    const handleLoadSample = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0];
        if (!f) return;
        try {
            const text = await f.text();
            if (!text.trim()) { setLoadError('That file looks empty.'); return; }
            setLoadError('');
            setCsvText(text);
            setStep(1);
        } catch {
            setLoadError('Could not read that file.');
        }
        if (e.target) e.target.value = '';
    };

    const handleSave = async () => {
        if (!companyId || !mappingReady) return;
        const mapping = buildMapping();
        setIsSaving(true);
        try {
            await updateFinancialAccount(account.id, { columnMapping: mapping });
            if (file) {
                // Re-run the import now that we know how to read this format.
                openModal('progress', { step: 'parsing', message: 'Applying your format...' });
                await dataService.processStatement(
                    companyId, file, { ...account, columnMapping: mapping }, allReceipts, transactions,
                    (p: any) => { if (p?.step !== 'needs_mapping') openModal('progress', p); }
                );
            } else {
                closeModal();
            }
        } finally {
            setIsSaving(false);
        }
    };

    const renderColumnSelect = (label: string, value: string, onChange: (v: string) => void, required?: boolean) => (
        <Field label={<>{label}{!required && <span className="font-normal text-ink-3"> (optional)</span>}</>}>
            <Select value={value} onChange={e => onChange(e.target.value)} required={required}>
                <option value="">Choose a column</option>
                {headers.map((h, i) => (
                    <option key={`${h}-${i}`} value={h}>{`${String.fromCharCode(65 + i)}: ${h}`}</option>
                ))}
            </Select>
        </Field>
    );

    // A big tappable choice: title + example, ticked when chosen (radio semantics).
    const choiceCard = (key: string, selected: boolean, onPick: () => void, title: string, hint: string) => (
        <button
            key={key}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={onPick}
            className={cx(
                'flex min-h-[56px] items-start gap-2.5 rounded-control border p-3 text-start transition-colors duration-quick ease-out',
                selected ? 'border-accent bg-accent-soft shadow-[inset_0_0_0_1px_rgb(var(--c-accent))]' : 'border-line-strong bg-surface hover:bg-surface-2',
            )}
        >
            <span className="min-w-0 flex-1">
                <span className={cx('block text-sm font-semibold', selected ? 'text-accent-soft-ink' : 'text-ink')}>{title}</span>
                <span className="num block text-sm text-ink-3">{hint}</span>
            </span>
            {selected && <CheckIcon className="mt-0.5 h-4 w-4 flex-none text-accent-soft-ink" />}
        </button>
    );

    const groupTitle = 'font-mono text-xs font-semibold uppercase tracking-[0.08em] text-ink-3';

    // --- Header (shared) ---
    const header = (
        <div className="flex items-start gap-3 border-b border-line px-4 pb-3 pt-1 sm:px-5 sm:pt-5">
            <span className="mt-1 grid h-10 w-10 flex-none place-items-center rounded-control bg-surface-2 text-ink-2" aria-hidden="true">
                <ViewColumnsIcon className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
                <h3 className="text-[1.375rem] font-bold leading-7 tracking-[-0.01em] text-ink">Statement format</h3>
                <p className="text-sm text-ink-2">{account.name} · {account.type}</p>
            </div>
            <IconButton label="Close" icon={<XMarkIcon />} onClick={closeModal} className="-me-2" />
        </div>
    );

    // --- Loader (no CSV yet — opened from Settings) ---
    if (!csvText) {
        return (
            <div className="flex flex-col">
                {header}
                <div className="space-y-4 p-5">
                    <p className="text-base text-ink-2">
                        Upload a sample statement (CSV) from <span className="font-semibold text-ink">{account.name}</span> and
                        we’ll help you match its columns. We remember the layout for every upload to this account after that.
                    </p>
                    {existing && (
                        <Alert tone="info">A format is already saved for this account. Load a sample to check it or change it.</Alert>
                    )}
                    <label className={cx(buttonClasses('primary', 'md'), 'cursor-pointer')}>
                        <ArrowUpTrayIcon /> Choose sample CSV
                        <input type="file" accept=".csv,text/csv,application/vnd.ms-excel,text/plain" onChange={handleLoadSample} className="hidden" />
                    </label>
                    {loadError && <Alert tone="danger">{loadError}</Alert>}
                </div>
            </div>
        );
    }

    const stepLabels = ['Preview', 'Match columns', 'Check'];

    return (
        <div className="flex flex-col">
            {header}

            <div className="border-b border-line px-4 py-3 sm:px-5">
                <Stepper steps={stepLabels.map(label => ({ label }))} current={step - 1} variant="dots" ariaLabel="Statement format steps" />
            </div>

            <div className="overflow-y-auto p-4 sm:p-5">
                {step === 1 && (
                    <div className="space-y-3">
                        <p className="text-sm text-ink-2">Here’s the top of your file. Check the columns look right, then match them.</p>
                        <div className="overflow-x-auto rounded-card border border-line">
                            <table className="w-full border-separate border-spacing-0 text-sm">
                                <thead>
                                    <tr>
                                        <th className="h-10 border-b border-line-strong bg-surface-2 px-2.5 text-start text-xs font-semibold text-ink-3">#</th>
                                        {headers.map((h, i) => (
                                            <th key={`${h}-${i}`} className="h-10 whitespace-nowrap border-b border-line-strong bg-surface-2 px-3 text-start text-xs font-semibold text-ink">
                                                <span className="num me-1 text-ink-3">{String.fromCharCode(65 + i)}</span>{h}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {previewRows.map((row, ri) => (
                                        <tr key={ri}>
                                            <td className="num h-10 border-b border-line px-2.5 text-ink-3">{ri + 1}</td>
                                            {headers.map((h, ci) => (
                                                <td key={ci} className="num h-10 max-w-[160px] truncate whitespace-nowrap border-b border-line px-3 text-ink">{row[h] || ''}</td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {step === 2 && (
                    <div className="space-y-6">
                        <section className="space-y-3">
                            <h4 className={groupTitle}>Date</h4>
                            {renderColumnSelect('Date column', dateColumn, setDateColumn, true)}
                            <div className="space-y-1.5">
                                <p className="text-sm font-semibold leading-5 text-ink" id="map-date-format">Date format</p>
                                <div role="radiogroup" aria-labelledby="map-date-format" className="grid grid-cols-2 gap-2">
                                    {DATE_FORMAT_OPTIONS.map(opt => choiceCard(opt.value, dateFormat === opt.value, () => setDateFormat(opt.value), opt.label, opt.example))}
                                </div>
                            </div>
                        </section>

                        <section className="space-y-3 border-t border-line pt-5">
                            <h4 className={groupTitle}>Description</h4>
                            {renderColumnSelect('Description column', descriptionColumn, setDescriptionColumn, true)}
                        </section>

                        <section className="space-y-3 border-t border-line pt-5">
                            <h4 className={groupTitle}>Amount</h4>
                            <div role="radiogroup" aria-label="How amounts are shown" className="grid grid-cols-2 gap-2">
                                {choiceCard('single', amountMode === 'single', () => setAmountMode('single'), 'One column', '+ and − in one column')}
                                {choiceCard('split', amountMode === 'split', () => setAmountMode('split'), 'Money in / out', 'Separate columns')}
                            </div>

                            {amountMode === 'single' ? (
                                <>
                                    {renderColumnSelect('Amount column', amountColumn, setAmountColumn, true)}
                                    <Checkbox
                                        checked={invertAmountSign}
                                        onChange={e => setInvertAmountSign(e.target.checked)}
                                        label="Flip the sign (+/−)"
                                        description="Turn on if spending shows as a positive number (common on credit cards)."
                                    />
                                </>
                            ) : (
                                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                    {renderColumnSelect('Money out (debit)', debitColumn, setDebitColumn, true)}
                                    {renderColumnSelect('Money in (credit)', creditColumn, setCreditColumn, true)}
                                </div>
                            )}
                        </section>

                        <section className="space-y-3 border-t border-line pt-5">
                            <h4 className={groupTitle}>Extra</h4>
                            {renderColumnSelect('Type or method column', methodColumn, setMethodColumn)}
                        </section>
                    </div>
                )}

                {step === 3 && (
                    <div className="space-y-3">
                        <p className="text-sm text-ink-2">Check these lines look right. If not, go back and change the columns.</p>
                        <div className="overflow-x-auto rounded-card border border-line">
                            <table className="w-full border-separate border-spacing-0 text-sm">
                                <thead>
                                    <tr>
                                        <th className="h-10 border-b border-line-strong bg-surface-2 px-3 text-start text-xs font-semibold uppercase tracking-[0.05em] text-ink-2">Date</th>
                                        <th className="h-10 border-b border-line-strong bg-surface-2 px-3 text-start text-xs font-semibold uppercase tracking-[0.05em] text-ink-2">Description</th>
                                        <th className="h-10 border-b border-line-strong bg-surface-2 px-3 text-end text-xs font-semibold uppercase tracking-[0.05em] text-ink-2">Amount</th>
                                        <th className="h-10 border-b border-line-strong bg-surface-2 px-3 text-center text-xs font-semibold uppercase tracking-[0.05em] text-ink-2"><span className="sr-only">Read OK</span></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {parsedPreview.map((tx, i) => (
                                        <tr key={i}>
                                            <td className="num h-11 whitespace-nowrap border-b border-line px-3 text-ink">{tx.date || '—'}</td>
                                            <td className="h-11 max-w-[220px] truncate border-b border-line px-3 text-ink">{tx.description || '—'}</td>
                                            <td className={cx('num h-11 whitespace-nowrap border-b border-line px-3 text-end font-semibold', tx.amount > 0 ? 'text-success' : 'text-ink')}>
                                                {tx.amount < 0 ? '−' : '+'}£{Math.abs(tx.amount).toFixed(2)}
                                            </td>
                                            <td className="h-11 border-b border-line px-3 text-center">
                                                {tx.valid
                                                    ? <CheckCircleIcon className="inline h-5 w-5 text-success" aria-label="Read OK" />
                                                    : <ExclamationTriangleIcon className="inline h-5 w-5 text-danger" aria-label="Could not read" />}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        {parsedPreview.length > 0 && parsedPreview.every(t => t.valid) ? (
                            <Alert tone="success" title="Looks good">We’ll save this format and use it for every upload to this account.</Alert>
                        ) : (
                            <Alert tone="danger" title="Some lines didn’t read">Go back and check the columns and the date format.</Alert>
                        )}
                    </div>
                )}
            </div>

            {/* Footer */}
            <div className="flex justify-between gap-2 border-t border-line px-4 py-3 sm:px-5">
                <Button
                    variant="secondary"
                    onClick={() => (step === 1 ? closeModal() : setStep((step - 1) as 1 | 2))}
                >
                    {step === 1 ? 'Cancel' : 'Back'}
                </Button>
                {step < 3 ? (
                    <Button
                        onClick={() => setStep((step + 1) as 2 | 3)}
                        disabled={step === 2 && !mappingReady}
                    >
                        Next
                    </Button>
                ) : (
                    <Button
                        onClick={handleSave}
                        disabled={!mappingReady}
                        loading={isSaving}
                    >
                        {file ? 'Save and import' : 'Save format'}
                    </Button>
                )}
            </div>
        </div>
    );
};

export default StatementMappingWizard;
