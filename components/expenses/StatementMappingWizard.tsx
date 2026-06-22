import React, { useMemo, useState, useEffect } from 'react';
import { FinancialAccount, StatementColumnMapping, StatementDateFormat, StatementAmountMode } from '../../types';
import { extractCSVHeaders, previewCSVRows, applyColumnMapping, isMappingComplete } from '../../utils/csvMapping';
import { useData } from '../../hooks/useData';
import { useUI } from '../../hooks/useUI';
import * as dataService from '../../services/dataService';
import Select from '../common/Select';
import Spinner from '../common/Spinner';
import {
    ViewColumnsIcon, XMarkIcon, CheckCircleIcon, ExclamationTriangleIcon, ArrowUpTrayIcon,
} from '../icons';

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
        <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
                {label} {required && <span className="text-red-400">*</span>}
            </label>
            <Select value={value} onChange={e => onChange(e.target.value)}>
                <option value="">— Select column —</option>
                {headers.map((h, i) => (
                    <option key={`${h}-${i}`} value={h}>{`${String.fromCharCode(65 + i)}: ${h}`}</option>
                ))}
            </Select>
        </div>
    );

    // --- Header (shared) ---
    const header = (
        <div className="flex items-start justify-between p-4 border-b border-gray-700">
            <div className="flex items-center gap-3">
                <ViewColumnsIcon className="h-6 w-6 text-brand-400" />
                <div>
                    <h3 className="text-lg font-semibold text-white">Statement Format</h3>
                    <p className="text-xs text-gray-400">{account.name} · {account.type}</p>
                </div>
            </div>
            <button onClick={closeModal} className="p-1 text-gray-400 hover:text-white"><XMarkIcon className="h-5 w-5" /></button>
        </div>
    );

    // --- Loader (no CSV yet — opened from Settings) ---
    if (!csvText) {
        return (
            <div className="flex flex-col">
                {header}
                <div className="p-6 text-center">
                    <p className="text-sm text-gray-300">
                        Upload a sample statement (CSV) from <span className="font-semibold text-white">{account.name}</span> and
                        we'll help you map its columns. We'll remember the layout for every future upload to this account.
                    </p>
                    {existing && (
                        <p className="mt-3 text-xs text-brand-300">A format is already saved for this account — loading a sample lets you review or re-map it.</p>
                    )}
                    <label className="mt-6 inline-flex items-center gap-2 cursor-pointer rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-500">
                        <ArrowUpTrayIcon className="h-5 w-5" /> Choose sample CSV
                        <input type="file" accept=".csv,text/csv,application/vnd.ms-excel,text/plain" onChange={handleLoadSample} className="hidden" />
                    </label>
                    {loadError && <p className="mt-3 text-sm text-red-400">{loadError}</p>}
                </div>
            </div>
        );
    }

    const stepLabels = ['Preview', 'Map Columns', 'Verify'];

    return (
        <div className="flex flex-col">
            {header}

            {/* Step indicator */}
            <div className="flex gap-2 px-4 py-3 border-b border-gray-700/60">
                {stepLabels.map((label, i) => {
                    const s = (i + 1) as 1 | 2 | 3;
                    return (
                        <div key={label} className="flex items-center gap-2 flex-1">
                            <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                                step === s ? 'bg-brand-600 text-white' : step > s ? 'bg-green-600 text-white' : 'bg-gray-700 text-gray-400'
                            }`}>
                                {step > s ? '✓' : s}
                            </span>
                            <span className={`text-xs font-medium ${step === s ? 'text-white' : 'text-gray-500'}`}>{label}</span>
                        </div>
                    );
                })}
            </div>

            <div className="p-4 sm:p-6 overflow-y-auto">
                {step === 1 && (
                    <div>
                        <p className="text-sm text-gray-400 mb-3">Here's a preview of your file. Check the columns look right, then map them.</p>
                        <div className="overflow-x-auto rounded-md border border-gray-700">
                            <table className="w-full text-xs">
                                <thead className="bg-gray-900/60">
                                    <tr>
                                        <th className="px-2 py-2 text-left text-gray-500">#</th>
                                        {headers.map((h, i) => (
                                            <th key={`${h}-${i}`} className="px-3 py-2 text-left text-brand-300 whitespace-nowrap">
                                                <span className="text-gray-500 mr-1">{String.fromCharCode(65 + i)}:</span>{h}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {previewRows.map((row, ri) => (
                                        <tr key={ri} className="border-t border-gray-700/60">
                                            <td className="px-2 py-2 text-gray-500">{ri + 1}</td>
                                            {headers.map((h, ci) => (
                                                <td key={ci} className="px-3 py-2 text-gray-200 whitespace-nowrap max-w-[160px] truncate">{row[h] || ''}</td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {step === 2 && (
                    <div className="space-y-5">
                        <div className="bg-gray-900/40 rounded-md p-4 space-y-4">
                            <h4 className="text-xs font-semibold uppercase tracking-wider text-brand-300">Date</h4>
                            {renderColumnSelect('Date column', dateColumn, setDateColumn, true)}
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-2">Date format <span className="text-red-400">*</span></label>
                                <div className="grid grid-cols-2 gap-2">
                                    {DATE_FORMAT_OPTIONS.map(opt => (
                                        <button
                                            key={opt.value}
                                            type="button"
                                            onClick={() => setDateFormat(opt.value)}
                                            className={`p-2 rounded-md border text-left ${
                                                dateFormat === opt.value ? 'border-brand-500 bg-brand-600/20' : 'border-gray-700 bg-gray-800 hover:border-gray-600'
                                            }`}
                                        >
                                            <div className={`text-sm font-semibold ${dateFormat === opt.value ? 'text-brand-300' : 'text-white'}`}>{opt.label}</div>
                                            <div className="text-xs text-gray-500">{opt.example}</div>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="bg-gray-900/40 rounded-md p-4">
                            <h4 className="text-xs font-semibold uppercase tracking-wider text-brand-300 mb-3">Description</h4>
                            {renderColumnSelect('Description column', descriptionColumn, setDescriptionColumn, true)}
                        </div>

                        <div className="bg-gray-900/40 rounded-md p-4 space-y-4">
                            <h4 className="text-xs font-semibold uppercase tracking-wider text-brand-300">Amount</h4>
                            <div className="grid grid-cols-2 gap-2">
                                <button type="button" onClick={() => setAmountMode('single')}
                                    className={`p-2 rounded-md border text-left ${amountMode === 'single' ? 'border-brand-500 bg-brand-600/20' : 'border-gray-700 bg-gray-800 hover:border-gray-600'}`}>
                                    <div className={`text-sm font-semibold ${amountMode === 'single' ? 'text-brand-300' : 'text-white'}`}>Single column</div>
                                    <div className="text-xs text-gray-500">One column with +/− amounts</div>
                                </button>
                                <button type="button" onClick={() => setAmountMode('split')}
                                    className={`p-2 rounded-md border text-left ${amountMode === 'split' ? 'border-brand-500 bg-brand-600/20' : 'border-gray-700 bg-gray-800 hover:border-gray-600'}`}>
                                    <div className={`text-sm font-semibold ${amountMode === 'split' ? 'text-brand-300' : 'text-white'}`}>Money in / out</div>
                                    <div className="text-xs text-gray-500">Separate debit & credit columns</div>
                                </button>
                            </div>

                            {amountMode === 'single' ? (
                                <>
                                    {renderColumnSelect('Amount column', amountColumn, setAmountColumn, true)}
                                    <label className="flex items-center gap-3 p-2 rounded-md bg-gray-800 border border-gray-700 cursor-pointer">
                                        <input type="checkbox" checked={invertAmountSign} onChange={e => setInvertAmountSign(e.target.checked)}
                                            className="h-4 w-4 rounded border-gray-600 bg-gray-700 text-brand-600 focus:ring-brand-500" />
                                        <span>
                                            <span className="block text-sm font-medium text-white">Flip the sign (+/−)</span>
                                            <span className="block text-xs text-gray-500">Turn on if spending shows as a positive number (common on credit cards).</span>
                                        </span>
                                    </label>
                                </>
                            ) : (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    {renderColumnSelect('Money out (debit)', debitColumn, setDebitColumn, true)}
                                    {renderColumnSelect('Money in (credit)', creditColumn, setCreditColumn, true)}
                                </div>
                            )}
                        </div>

                        <div className="bg-gray-900/40 rounded-md p-4">
                            <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">Optional</h4>
                            {renderColumnSelect('Transaction type / method column', methodColumn, setMethodColumn)}
                        </div>
                    </div>
                )}

                {step === 3 && (
                    <div>
                        <p className="text-sm text-gray-400 mb-3">Check these transactions look right. If not, go back and adjust the mapping.</p>
                        <div className="overflow-x-auto rounded-md border border-gray-700">
                            <table className="w-full text-sm">
                                <thead className="bg-gray-900/60">
                                    <tr>
                                        <th className="px-3 py-2 text-left text-gray-500">Date</th>
                                        <th className="px-3 py-2 text-left text-gray-500">Description</th>
                                        <th className="px-3 py-2 text-right text-gray-500">Amount</th>
                                        <th className="px-3 py-2 text-center text-gray-500">Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {parsedPreview.map((tx, i) => (
                                        <tr key={i} className="border-t border-gray-700/60">
                                            <td className="px-3 py-2 text-gray-200 whitespace-nowrap">{tx.date || '—'}</td>
                                            <td className="px-3 py-2 text-gray-200 max-w-[220px] truncate">{tx.description || '—'}</td>
                                            <td className={`px-3 py-2 text-right font-mono whitespace-nowrap ${tx.amount < 0 ? 'text-red-400' : 'text-green-400'}`}>
                                                {tx.amount < 0 ? '−' : '+'}£{Math.abs(tx.amount).toFixed(2)}
                                            </td>
                                            <td className="px-3 py-2 text-center">
                                                {tx.valid
                                                    ? <CheckCircleIcon className="h-4 w-4 text-green-400 inline" />
                                                    : <ExclamationTriangleIcon className="h-4 w-4 text-red-400 inline" />}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        {parsedPreview.length > 0 && parsedPreview.every(t => t.valid) ? (
                            <div className="mt-3 flex items-center gap-2 rounded-md border border-green-500/30 bg-green-500/10 p-3">
                                <CheckCircleIcon className="h-4 w-4 text-green-400 shrink-0" />
                                <p className="text-xs text-green-300">Looks good. This format will be saved and used for every future upload to this account.</p>
                            </div>
                        ) : (
                            <div className="mt-3 flex items-center gap-2 rounded-md border border-red-500/30 bg-red-500/10 p-3">
                                <ExclamationTriangleIcon className="h-4 w-4 text-red-400 shrink-0" />
                                <p className="text-xs text-red-300">Some rows didn't parse. Go back and check the column / date-format choices.</p>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Footer */}
            <div className="flex justify-between gap-3 p-4 border-t border-gray-700">
                <button
                    type="button"
                    onClick={() => (step === 1 ? closeModal() : setStep((step - 1) as 1 | 2))}
                    className="px-4 py-2 rounded-md bg-gray-700 text-sm font-semibold text-white hover:bg-gray-600"
                >
                    {step === 1 ? 'Cancel' : 'Back'}
                </button>
                {step < 3 ? (
                    <button
                        type="button"
                        onClick={() => setStep((step + 1) as 2 | 3)}
                        disabled={step === 2 && !mappingReady}
                        className="px-5 py-2 rounded-md bg-brand-600 text-sm font-semibold text-white hover:bg-brand-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        Next
                    </button>
                ) : (
                    <button
                        type="button"
                        onClick={handleSave}
                        disabled={!mappingReady || isSaving}
                        className="inline-flex items-center gap-2 px-5 py-2 rounded-md bg-green-600 text-sm font-semibold text-white hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isSaving ? <Spinner className="h-4 w-4" /> : null}
                        {file ? 'Save & Import' : 'Save format'}
                    </button>
                )}
            </div>
        </div>
    );
};

export default StatementMappingWizard;
