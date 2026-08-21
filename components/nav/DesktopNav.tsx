import React from 'react';
import { View } from '../../types';
import { ClipboardDocumentListIcon, CarIcon, DocumentTextIcon, CreditCardIcon, CalculatorIcon, ChartPieIcon, ArchiveBoxIcon, Cog6ToothIcon, BanknotesIcon, WrenchScrewdriverIcon, BuildingStorefrontIcon, ClipboardIcon, ViewColumnsIcon, UserGroupIcon, ShieldCheckIcon } from '../icons';
import { useUI } from '../../hooks/useUI';
import { useData } from '../../hooks/useData';
import AppUpdateButton from '../common/AppUpdateButton';

interface DesktopNavProps {
    onLogout: () => void;
}

type NavItemProps = {
    label: string;
    view: View;
    icon: React.ComponentType<{ className?: string }>;
    isActive: boolean;
    onClick: (view: View) => void;
};

const NavItem: React.FC<NavItemProps> = ({ label, view, icon: Icon, isActive, onClick }) => (
    <li>
        <button
            onClick={() => onClick(view)}
            className={`flex items-center w-full p-2 text-base font-normal rounded-lg transition-all duration-200 group ${
                isActive 
                ? `bg-brand-600 text-white shadow-lg` 
                : 'text-gray-300 hover:bg-gray-700 hover:text-white'
            }`}
            aria-current={isActive ? 'page' : undefined}
        >
            <Icon className="w-6 h-6 transition-colors" />
            <span className="ml-3 flex-1 whitespace-nowrap text-left">{label}</span>
        </button>
    </li>
);

const DesktopNav = ({ onLogout }: DesktopNavProps) => {
    const { view: activeView, setView: setActiveView } = useUI();
    const { businessDetails, isServiceBusiness, isVatRegistered } = useData();
    const businessName = businessDetails?.name || 'Dealer Ledger';
    
    const navItems = [
        { label: "Dashboard", view: "dashboard" as View, icon: ClipboardDocumentListIcon },
        ...(isServiceBusiness ? [
            { label: "Jobs & Invoices", view: "jobInvoices" as View, icon: DocumentTextIcon },
        ] : [
            { label: "Vehicle Stock", view: "stock" as View, icon: CarIcon },
            { label: "Garage", view: "garage" as View, icon: BuildingStorefrontIcon },
            { label: "Sales", view: "sales" as View, icon: DocumentTextIcon },
        ]),
        { label: "Expenses", view: "expenses" as View, icon: CreditCardIcon },
        ...(!isServiceBusiness ? [{ label: "Income", view: "income" as View, icon: BanknotesIcon }] : []),
        { label: "Work Sheets", view: "workSheets" as View, icon: WrenchScrewdriverIcon },
        { label: "Work Prep", view: "workPrep" as View, icon: ClipboardDocumentListIcon },
        { label: "Internal Jobs", view: "internalJobs" as View, icon: WrenchScrewdriverIcon },
        ...(!isServiceBusiness ? [{ label: "PDI Reports", view: "pdi" as View, icon: ShieldCheckIcon }] : []),
        { label: "Canvas", view: "canvas" as View, icon: ClipboardIcon },
    ];
    
    const crmItems = [
        { label: "Pipeline", view: "pipeline" as View, icon: ViewColumnsIcon },
    ];

    const reportingItems = [
        { label: "Ledger", view: "ledger" as View, icon: CalculatorIcon },
        ...(isVatRegistered ? [{ label: "VAT Summary", view: "vat" as View, icon: ChartPieIcon }] : []),
        { label: "Accountant", view: "accountant" as View, icon: BanknotesIcon },
        { label: "Filing Cabinet", view: "filingCabinet" as View, icon: ArchiveBoxIcon },
    ];

    const settingsItem = { label: "Settings", view: "settings" as View, icon: Cog6ToothIcon };

    return (
        <aside className="w-64 flex-shrink-0 flex-col h-screen sticky top-0" aria-label="Sidebar">
            <div className="flex flex-col h-full overflow-y-auto bg-gray-900 border-r border-gray-700/50 p-4">
                <div className="flex items-center mb-6 px-2">
                    <CarIcon className={`h-8 w-8 text-brand-400`} />
                    <span className="self-center ml-3 text-2xl font-bold text-white whitespace-nowrap tracking-tight">{businessName}</span>
                </div>
                <nav className="flex-1 space-y-4">
                    <ul className="space-y-2">
                         {navItems.map(item => <NavItem key={item.view} label={item.label} view={item.view} icon={item.icon} isActive={activeView === item.view} onClick={setActiveView} />)}
                    </ul>
                    <div className="pt-2">
                        <h3 className="px-2 text-xs font-semibold tracking-wider text-gray-500 uppercase">CRM</h3>
                        <ul className="mt-2 space-y-2">
                            {crmItems.map(item => <NavItem key={item.view} label={item.label} view={item.view} icon={item.icon} isActive={activeView === item.view} onClick={setActiveView} />)}
                        </ul>
                    </div>
                    <div className="pt-2">
                        <h3 className="px-2 text-xs font-semibold tracking-wider text-gray-500 uppercase">Reporting</h3>
                        <ul className="mt-2 space-y-2">
                            {reportingItems.map(item => <NavItem key={item.view} label={item.label} view={item.view} icon={item.icon} isActive={activeView === item.view} onClick={setActiveView} />)}
                        </ul>
                    </div>
                </nav>
                <div className="pt-4 mt-4 border-t border-gray-700">
                    <ul className="space-y-2">
                         <NavItem label={settingsItem.label} view={settingsItem.view} icon={settingsItem.icon} isActive={activeView === settingsItem.view} onClick={setActiveView} />
                         <li>
                             <AppUpdateButton variant="nav" />
                         </li>
                         <li>
                             <button onClick={onLogout} className="flex items-center w-full p-2 text-base font-normal rounded-lg text-gray-300 hover:bg-gray-700 hover:text-white group">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" /></svg>
                                <span className="ml-3 flex-1 whitespace-nowrap text-left">Logout</span>
                             </button>
                         </li>
                    </ul>
                </div>
            </div>
        </aside>
    );
};

export default DesktopNav;