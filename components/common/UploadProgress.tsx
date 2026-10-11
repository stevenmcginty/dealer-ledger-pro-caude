

import React from 'react';
import { CheckCircleIcon, XMarkIcon } from '../icons';
import Spinner from './Spinner';

export interface UploadProgressData {
  step: 'parsing' | 'deduplicating' | 'reconciling' | 'categorizing' | 'saving' | 'complete' | 'error';
  message: string;
  total?: number;
  processed?: number;
  newCount?: number;
  duplicateCount?: number;
  reconciledCount?: number;
  error?: string;
}

interface UploadProgressProps {
    progress: UploadProgressData;
    onClose: () => void;
}

const Step = ({ title, status, details }: { title: string, status: 'pending' | 'active' | 'complete', details?: string }) => {
    const Icon = () => {
        switch (status) {
            case 'active': return <Spinner className="h-5 w-5 text-accent-text" />;
            case 'complete': return <CheckCircleIcon className="h-5 w-5 text-success" />;
            default: return <div className="h-5 w-5 flex items-center justify-center"><div className="h-2 w-2 bg-ink-3 rounded-full"></div></div>;
        }
    };
    return (
        <div className="flex items-start gap-3">
            <div className="flex-shrink-0 pt-1"><Icon /></div>
            <div>
                <p className={`font-semibold ${status === 'pending' ? 'text-ink-3' : 'text-ink'}`}>{title}</p>
                {details && <p className="text-sm text-ink-3">{details}</p>}
            </div>
        </div>
    );
};

const UploadProgress = ({ progress, onClose }: UploadProgressProps) => {
    const steps = ['parsing', 'deduplicating', 'reconciling', 'categorizing', 'saving', 'complete'];
    const currentStepIndex = steps.indexOf(progress.step);

    const getStepStatus = (stepIndex: number) => {
        if (stepIndex < currentStepIndex) return 'complete';
        if (stepIndex === currentStepIndex) return 'active';
        return 'pending';
    };

    const getStepDetails = (step: string) => {
        switch(step) {
            case 'parsing': return progress.total ? `${progress.total} rows found.` : 'Reading file...';
            case 'deduplicating': return `${progress.newCount} new, ${progress.duplicateCount} duplicate transactions.`;
            case 'reconciling': return `${progress.reconciledCount} transactions auto-matched with receipts.`;
            case 'categorizing': return progress.total && progress.processed ? `Analyzed ${progress.processed}/${progress.total} transactions.` : 'Running AI analysis...';
            case 'saving': return `Saving ${progress.newCount} new transactions...`;
            default: return undefined;
        }
    };

    return (
        <div className="w-full">
            <header className="p-4 border-b border-line flex items-center justify-between">
                <h2 className="text-lg font-bold text-ink">Importing Statement</h2>
                {(progress.step === 'complete' || progress.step === 'error') && (
                    <button onClick={onClose} className="grid h-12 w-12 place-items-center rounded-control text-ink-2 transition-colors duration-quick hover:bg-surface-2 hover:text-ink">
                        <XMarkIcon className="h-6 w-6" /><span className="sr-only">Close</span>
                    </button>
                )}
            </header>
            <div className="p-6">
                {progress.step !== 'error' ? (
                    <div className="space-y-4">
                       <Step title="Parse CSV" status={getStepStatus(0)} details={currentStepIndex >= 0 ? getStepDetails('parsing') : undefined} />
                       <Step title="Check for Duplicates" status={getStepStatus(1)} details={currentStepIndex >= 1 ? getStepDetails('deduplicating') : undefined} />
                       <Step title="Auto-reconcile Receipts" status={getStepStatus(2)} details={currentStepIndex >= 2 ? getStepDetails('reconciling') : undefined} />
                       <Step title="AI Categorization" status={getStepStatus(3)} details={currentStepIndex >= 3 ? getStepDetails('categorizing') : undefined} />
                       <Step title="Save to Ledger" status={getStepStatus(4)} details={currentStepIndex >= 4 ? getStepDetails('saving') : undefined} />
                    </div>
                ) : (
                    <div>
                        <h3 className="text-xl font-bold text-danger-ink">Import failed</h3>
                        <p className="mt-2 text-ink-2">{progress.error}</p>
                    </div>
                )}

                {progress.step === 'complete' && (
                     <div className="mt-6 rounded-card border border-success bg-success-soft p-4">
                        <CheckCircleIcon className="mb-2 h-8 w-8 text-success-ink" />
                        <h3 className="text-xl font-bold text-success-ink">Statement imported</h3>
                        <p className="mt-1 text-ink-2">{progress.newCount} new transactions have been added to your ledger.</p>
                        <button onClick={onClose} className="mt-4 min-h-[48px] rounded-control bg-accent px-5 text-base font-semibold text-on-accent transition-colors duration-quick hover:bg-accent-hover active:bg-accent-press">
                            View Statement
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default UploadProgress;