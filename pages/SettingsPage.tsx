import React, { useState } from 'react';
import BusinessDetailsPage from '../components/settings/BusinessDetailsPage';
import DataManagement from '../components/settings/DataManagement';
import SupplierManagement from '../components/settings/SupplierManagement';
import AccountManagement from '../components/settings/AccountManagement';
import IntegrationsPage from '../components/settings/IntegrationsPage';
import ConnectorsPage from '../components/settings/ConnectorsPage';
import SalesAgentSettingsPage from '../components/salesAgent/SalesAgentSettingsPage';

type SettingsTab = 'details' | 'suppliers' | 'accounts' | 'integrations' | 'connectors' | 'salesAgent' | 'data';

const SettingsPage = () => {
    // Google sends the browser back to /app/settings?gmail=connected, and the
    // tab that has to notice is the sales agent's — landing on Business Details
    // would drop the return leg on the floor.
    const [activeTab, setActiveTab] = useState<SettingsTab>(() =>
        new URLSearchParams(window.location.search).get('gmail') ? 'salesAgent' : 'details'
    );

    const getTabClassName = (tab: SettingsTab) => {
        return activeTab === tab
            ? 'border-brand-500 text-brand-400'
            : 'border-transparent text-gray-400 hover:border-gray-500 hover:text-gray-300';
    };

    return (
        <div className="space-y-6">
            <div className="border-b border-gray-700">
                <nav className="-mb-px flex space-x-8 overflow-x-auto" aria-label="Tabs">
                    <button
                        onClick={() => setActiveTab('details')}
                        className={`group inline-flex items-center border-b-2 py-4 px-1 text-sm font-medium ${getTabClassName('details')}`}
                    >
                        <span>Business Details</span>
                    </button>
                     <button
                        onClick={() => setActiveTab('suppliers')}
                        className={`group inline-flex items-center border-b-2 py-4 px-1 text-sm font-medium ${getTabClassName('suppliers')}`}
                    >
                        <span>Suppliers</span>
                    </button>
                    <button
                        onClick={() => setActiveTab('accounts')}
                        className={`group inline-flex items-center border-b-2 py-4 px-1 text-sm font-medium ${getTabClassName('accounts')}`}
                    >
                        <span>Financial Accounts</span>
                    </button>
                    <button
                        onClick={() => setActiveTab('integrations')}
                        className={`group inline-flex items-center border-b-2 py-4 px-1 text-sm font-medium ${getTabClassName('integrations')}`}
                    >
                        <span>Integrations</span>
                    </button>
                    <button
                        onClick={() => setActiveTab('connectors')}
                        className={`group inline-flex items-center border-b-2 py-4 px-1 text-sm font-medium ${getTabClassName('connectors')}`}
                    >
                        <span>Connectors</span>
                    </button>
                    <button
                        onClick={() => setActiveTab('salesAgent')}
                        className={`group inline-flex items-center border-b-2 py-4 px-1 text-sm font-medium whitespace-nowrap ${getTabClassName('salesAgent')}`}
                    >
                        <span>AI Sales Agent</span>
                    </button>
                    <button
                        onClick={() => setActiveTab('data')}
                        className={`group inline-flex items-center border-b-2 py-4 px-1 text-sm font-medium ${getTabClassName('data')}`}
                    >
                        <span>Data & File Management</span>
                    </button>
                </nav>
            </div>
            <div className="mt-2">
                <div className={activeTab === 'details' ? '' : 'hidden'}><BusinessDetailsPage /></div>
                <div className={activeTab === 'suppliers' ? '' : 'hidden'}><SupplierManagement /></div>
                <div className={activeTab === 'accounts' ? '' : 'hidden'}><AccountManagement /></div>
                <div className={activeTab === 'integrations' ? '' : 'hidden'}><IntegrationsPage /></div>
                <div className={activeTab === 'connectors' ? '' : 'hidden'}><ConnectorsPage /></div>
                {/* Mounted only while open: it holds live listeners on the agent's
                    settings, its stock index and, once opened, the simulator. */}
                {activeTab === 'salesAgent' && <SalesAgentSettingsPage />}
                <div className={activeTab === 'data' ? '' : 'hidden'}><DataManagement /></div>
            </div>
        </div>
    );
};

export default SettingsPage;