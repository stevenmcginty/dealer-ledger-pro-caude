import React, { useState } from 'react';
import AccountantReport from '../components/accountant/AccountantReport';
import VehicleMarginReport from '../components/accountant/VehicleMarginReport';
import VatTransactionsReport from '../components/accountant/VatTransactionsReport';
import JobsReport from '../components/accountant/JobsReport';
import { useData } from '../hooks/useData';

type AccountantTab = 'pnl' | 'margin' | 'vat_transactions' | 'jobs_report';

const AccountantPage = () => {
    const { isVatRegistered, isServiceBusiness } = useData();
    
    // Set initial tab based on business mode
    const [activeTab, setActiveTab] = useState<AccountantTab>('pnl');

    const getTabClassName = (tab: AccountantTab) => {
        return activeTab === tab
            ? 'border-brand-500 text-brand-400'
            : 'border-transparent text-gray-400 hover:border-gray-500 hover:text-gray-300';
    };

    return (
        <div className="space-y-6">
            <div className="border-b border-gray-700">
                <nav className="-mb-px flex space-x-8 overflow-x-auto" aria-label="Tabs">
                    <button
                        onClick={() => setActiveTab('pnl')}
                        className={`group inline-flex items-center border-b-2 py-4 px-1 text-sm font-medium ${getTabClassName('pnl')}`}
                    >
                        <span>Profit & Loss</span>
                    </button>
                    {isServiceBusiness ? (
                         <button
                            onClick={() => setActiveTab('jobs_report')}
                            className={`group inline-flex items-center border-b-2 py-4 px-1 text-sm font-medium ${getTabClassName('jobs_report')}`}
                        >
                            <span>Jobs Report</span>
                        </button>
                    ) : (
                        <button
                            onClick={() => setActiveTab('margin')}
                            className={`group inline-flex items-center border-b-2 py-4 px-1 text-sm font-medium ${getTabClassName('margin')}`}
                        >
                            <span>Vehicle Margin</span>
                        </button>
                    )}
                    {isVatRegistered && (
                        <button
                            onClick={() => setActiveTab('vat_transactions')}
                            className={`group inline-flex items-center border-b-2 py-4 px-1 text-sm font-medium ${getTabClassName('vat_transactions')}`}
                        >
                            <span>VAT Transactions</span>
                        </button>
                    )}
                </nav>
            </div>
            <div className="mt-2">
                {activeTab === 'pnl' && <AccountantReport />}
                {activeTab === 'margin' && !isServiceBusiness && <VehicleMarginReport />}
                {activeTab === 'jobs_report' && isServiceBusiness && <JobsReport />}
                {activeTab === 'vat_transactions' && isVatRegistered && <VatTransactionsReport />}
            </div>
        </div>
    );
};

export default AccountantPage;
