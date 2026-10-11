import React from 'react';
import VatSummary from '../components/reporting/VatSummary';
import { useData } from '../hooks/useData';
import { useUI } from '../hooks/useUI';
import { EmptyState } from '../components/ui';
import { CalculatorIcon } from '../components/icons';

const VatPage = () => {
    const { isVatRegistered } = useData();
    const { setView } = useUI();

    if (!isVatRegistered) {
        return (
            <div className="rounded-card border border-line bg-surface">
                <EmptyState
                    icon={<CalculatorIcon />}
                    title="VAT is turned off for this business"
                    description="The VAT return shows here once the business is marked as VAT registered in Settings, under Business details."
                    actionLabel="Open Settings"
                    onAction={() => setView('settings')}
                />
            </div>
        );
    }
    return <VatSummary />;
};

export default VatPage;
