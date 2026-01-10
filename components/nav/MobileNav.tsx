
import React, { useState, useEffect, useRef } from 'react';
import { View } from '../../types';
import { ClipboardDocumentListIcon, CarIcon, DocumentTextIcon, CreditCardIcon, PlusIcon, Bars3Icon, CalculatorIcon, ChartPieIcon, ArchiveBoxIcon, Cog6ToothIcon, BanknotesIcon, WrenchScrewdriverIcon, BuildingStorefrontIcon, ClipboardIcon, ExclamationTriangleIcon, ViewColumnsIcon, InboxIcon } from '../icons';
import { useUI } from '../../hooks/useUI';
import { useData } from '../../hooks/useData';

interface MobileNavProps {
    onLogout: () => void;
}

const NavItem = ({ label, view, icon: Icon, isActive, onClick }: { label: string; view: View; icon: React.ComponentType<{ className?: string }>; isActive: boolean; onClick: (view: View) => void; }) => (
    <button
        onClick={() => onClick(view)}
        className={`flex flex-col items-center justify-center w-full h-full transition-all duration-300 group relative ${isActive ? 'text-white' : 'text-gray-400 hover:text-gray-200'}`}
        aria-current={isActive ? 'page' : undefined}
    >
        <div className={`p-1.5 rounded-2xl transition-all duration-300 ${isActive ? 'bg-brand-500 shadow-lg shadow-brand-500/40 -translate-y-1' : ''}`}>
            <Icon className="h-6 w-6" />
        </div>
        <span className={`text-[10px] font-medium mt-1 transition-opacity duration-300 ${isActive ? 'opacity-100' : 'opacity-0'}`}>{label}</span>
    </button>
);

const MobileNav = ({ onLogout }: MobileNavProps) => {
    const { view: activeView, setView: setActiveView, openModal, triggerCanvasUpload } = useUI();
    const { isServiceBusiness, isVatRegistered } = useData();
    const [isMoreMenuOpen, setMoreMenuOpen] = useState(false);
    const [isAddToDoMenuOpen, setAddToDoMenuOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);
    const addToDoMenuRef = useRef<HTMLDivElement>(null);

    const onPrimaryActionClick = () => {
        if (activeView === 'dashboard') {
            setAddToDoMenuOpen(true);
            return;
        }

        const actionMap: Partial<Record<View, () => void>> = isServiceBusiness ? {
            jobInvoices: () => openModal('jobInvoice', { status: 'Quote' }),
            expenses: () => openModal('expense'),
            canvas: triggerCanvasUpload,
        } : {
            stock: () => openModal('vehicle'),
            expenses: () => openModal('expense'),
            workSheets: () => openModal('workSheet'),
            income: () => openModal('miscInvoice'),
            garage: () => openModal('addInformalVehicle'),
            canvas: triggerCanvasUpload,
        };
        actionMap[activeView]?.();
    }

    const mainNavItems = isServiceBusiness ? [
        { label: 'Dash', view: 'dashboard' as View, icon: ClipboardDocumentListIcon },
        { label: 'Jobs', view: 'jobInvoices' as View, icon: DocumentTextIcon },
        { label: 'Expense', view: 'expenses' as View, icon: CreditCardIcon },
    ] : [
        { label: 'Dash', view: 'dashboard' as View, icon: ClipboardDocumentListIcon },
        { label: 'Stock', view: 'stock' as View, icon: CarIcon },
        { label: 'Expense', view: 'expenses' as View, icon: CreditCardIcon },
    ];
    
    const moreMenuItems = isServiceBusiness ? [
        { label: 'Pipeline', view: 'pipeline' as View, icon: ViewColumnsIcon },
        { label: 'Inbox', view: 'inbox' as View, icon: InboxIcon },
        { label: 'Work Sheets', view: 'workSheets' as View, icon: WrenchScrewdriverIcon },
        { label: 'Work Prep', view: 'workPrep' as View, icon: ClipboardDocumentListIcon },
        { label: 'Canvas', view: 'canvas' as View, icon: ClipboardIcon },
        { label: 'Ledger', view: 'ledger' as View, icon: CalculatorIcon },
        ...(isVatRegistered ? [{ label: 'VAT Summary', view: 'vat' as View, icon: ChartPieIcon }] : []),
        { label: 'Accountant', view: 'accountant' as View, icon: BanknotesIcon },
        { label: 'Filing Cabinet', view: 'filingCabinet' as View, icon: ArchiveBoxIcon },
        { label: 'Settings', view: 'settings' as View, icon: Cog6ToothIcon },
    ] : [
        { label: 'Pipeline', view: 'pipeline' as View, icon: ViewColumnsIcon },
        { label: 'Inbox', view: 'inbox' as View, icon: InboxIcon },
        { label: 'Garage', view: 'garage' as View, icon: BuildingStorefrontIcon },
        { label: 'Sales', view: 'sales' as View, icon: DocumentTextIcon },
        { label: 'Income', view: 'income' as View, icon: BanknotesIcon },
        { label: 'Work Sheets', view: 'workSheets' as View, icon: WrenchScrewdriverIcon },
        { label: 'Work Prep', view: 'workPrep' as View, icon: ClipboardDocumentListIcon },
        { label: 'Canvas', view: 'canvas' as View, icon: ClipboardIcon },
        { label: 'Ledger', view: 'ledger' as View, icon: CalculatorIcon },
        ...(isVatRegistered ? [{ label: 'VAT Summary', view: 'vat' as View, icon: ChartPieIcon }] : []),
        { label: 'Accountant', view: 'accountant' as View, icon: BanknotesIcon },
        { label: 'Filing Cabinet', view: 'filingCabinet' as View, icon: ArchiveBoxIcon },
        { label: 'Settings', view: 'settings' as View, icon: Cog6ToothIcon },
    ];

    const isMoreMenuActive = moreMenuItems.some(item => item.view === activeView);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setMoreMenuOpen(false);
            }
            if (addToDoMenuRef.current && !addToDoMenuRef.current.contains(event.target as Node) && !(event.target as HTMLElement).closest('[aria-label="Add Item"]')) {
                setAddToDoMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleMoreMenuClick = (view: View) => {
        setActiveView(view);
        setMoreMenuOpen(false);
    }
    
    const handleAddToDoMenuClick = (type: 'general' | 'prep' | 'warranty') => {
        openModal('todo', { type });
        setAddToDoMenuOpen(false);
    };

    return (
        <>
            {isMoreMenuOpen && (
                <div 
                    className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
                    onClick={() => setMoreMenuOpen(false)}
                >
                    <div 
                        ref={menuRef}
                        onClick={(e) => e.stopPropagation()}
                        className="absolute bottom-28 right-4 w-64 glass-panel border border-white/10 rounded-2xl shadow-2xl p-2 animate-in slide-in-from-bottom-10 fade-in-0 duration-300"
                    >
                        <ul className="space-y-1">
                            {moreMenuItems.map(({ label, view, icon: Icon }) => (
                                <li key={view}>
                                    <button 
                                        onClick={() => handleMoreMenuClick(view)} 
                                        className={`w-full flex items-center p-3 text-sm font-medium rounded-xl transition-all ${activeView === view ? `bg-brand-600/80 text-white shadow-lg shadow-brand-900/20` : 'text-gray-300 hover:bg-white/10'}`}
                                    >
                                        <Icon className="h-5 w-5 mr-3" />
                                        {label}
                                    </button>
                                </li>
                            ))}
                            <li className="border-t border-white/10 my-1 !-mx-1"></li>
                             <li>
                                <button onClick={onLogout} className="w-full flex items-center p-3 text-sm font-medium rounded-xl text-gray-300 hover:bg-white/10 hover:text-white">
                                   <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 mr-3"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" /></svg>
                                   Logout
                                </button>
                             </li>
                        </ul>
                    </div>
                </div>
            )}

            {isAddToDoMenuOpen && (
                <div 
                    className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
                    onClick={() => setAddToDoMenuOpen(false)}
                >
                    <div 
                        ref={addToDoMenuRef}
                        onClick={(e) => e.stopPropagation()}
                        className="absolute bottom-28 left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] max-w-sm glass-panel border border-white/10 rounded-2xl shadow-2xl p-2 animate-in slide-in-from-bottom-10 fade-in-0 duration-300"
                    >
                        <ul className="space-y-1">
                            <li>
                                <button 
                                    onClick={() => handleAddToDoMenuClick('general')} 
                                    className="w-full flex items-center p-3 text-sm font-medium rounded-xl text-gray-200 hover:bg-white/10"
                                >
                                    <ClipboardDocumentListIcon className="h-5 w-5 mr-3" />
                                    Add General Task
                                </button>
                            </li>
                            {!isServiceBusiness && (
                              <>
                                <li>
                                    <button 
                                        onClick={() => handleAddToDoMenuClick('prep')} 
                                        className="w-full flex items-center p-3 text-sm font-medium rounded-xl text-gray-200 hover:bg-white/10"
                                    >
                                        <WrenchScrewdriverIcon className="h-5 w-5 mr-3" />
                                        Add Vehicle Prep
                                    </button>
                                </li>
                                <li>
                                    <button 
                                        onClick={() => handleAddToDoMenuClick('warranty')} 
                                        className="w-full flex items-center p-3 text-sm font-medium rounded-xl text-gray-200 hover:bg-white/10"
                                    >
                                        <ExclamationTriangleIcon className="h-5 w-5 mr-3" />
                                        Add Warranty Claim
                                    </button>
                                </li>
                              </>
                            )}
                        </ul>
                    </div>
                </div>
            )}
        
            <div className="fixed bottom-0 left-0 right-0 h-auto z-50 pointer-events-none p-4 pb-6">
                <div className="pointer-events-auto mx-auto max-w-lg glass-panel rounded-3xl shadow-2xl shadow-black/50 border border-white/10">
                    <nav className="grid grid-cols-5 items-center h-16 relative">
                        <NavItem {...mainNavItems[0]} isActive={activeView === mainNavItems[0].view} onClick={setActiveView} />
                        <NavItem {...mainNavItems[1]} isActive={activeView === mainNavItems[1].view} onClick={setActiveView} />
                        
                        <div className="relative -top-6 flex justify-center">
                             <button
                                onClick={onPrimaryActionClick}
                                className="flex items-center justify-center w-14 h-14 bg-gradient-to-br from-brand-500 to-brand-700 rounded-full shadow-lg shadow-brand-500/50 hover:shadow-brand-500/70 transition-all duration-300 transform hover:scale-105 active:scale-95 focus:outline-none ring-4 ring-gray-900"
                                aria-label="Add Item"
                            >
                                <PlusIcon className="w-7 h-7 text-white" />
                            </button>
                        </div>

                        <NavItem {...mainNavItems[2]} isActive={activeView === mainNavItems[2].view} onClick={setActiveView} />
                        
                        <button
                            onClick={() => setMoreMenuOpen(true)}
                            className={`flex flex-col items-center justify-center w-full h-full transition-all duration-300 group ${isMoreMenuActive ? 'text-white' : 'text-gray-400 hover:text-gray-200'}`}
                        >
                            <div className={`p-1.5 rounded-2xl transition-all duration-300 ${isMoreMenuActive ? 'bg-brand-500 shadow-lg shadow-brand-500/40 -translate-y-1' : ''}`}>
                                <Bars3Icon className="h-6 w-6" />
                            </div>
                            <span className={`text-[10px] font-medium mt-1 transition-opacity duration-300 ${isMoreMenuActive ? 'opacity-100' : 'opacity-0'}`}>More</span>
                        </button>
                    </nav>
                </div>
            </div>
        </>
    );
};

export default MobileNav;
