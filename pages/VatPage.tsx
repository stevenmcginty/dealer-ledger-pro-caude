import React from 'react';
import VatSummary from '../components/reporting/VatSummary';
import { useData } from '../hooks/useData';

const VatPage = () => {
    const { isVatRegistered } = useData();

    if (!isVatRegistered) {
        return (
            <div className="text-center p-8 bg-gray-800 rounded-lg">
                <h2 className="text-xl font-bold text-white">VAT Summary Not Available</h2>
                <p className="mt-2 text-gray-400">Your business is not marked as VAT registered. You can change this in the 'Business Details' section of the Settings page.</p>
            </div>
        );
    }
    return <VatSummary />;
};

export default VatPage;