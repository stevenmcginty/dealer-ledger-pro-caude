import React, { useMemo, useState, useEffect, useRef } from 'react';
import { useWindowSize } from './hooks/useWindowSize';
import { useUI } from './hooks/useUI';
import { useData } from './hooks/useData';
import { signOut } from './services/firebase';
import { formatDate } from './utils/helpers';
import { consumeQuickAction } from './utils/quickAction';
import { View, NewCanvasItem, CanvasItem } from './types';

// Import Layout Components
import DesktopNav from './components/nav/DesktopNav';
import MobileNav from './components/nav/MobileNav';
import NotificationBell from './components/nav/NotificationBell';
import Spinner from './components/common/Spinner';
import ModalManager from './components/common/ModalManager';
import PermissionDeniedHandler from './components/auth/PermissionDeniedHandler';
import { CarIcon, PlusIcon, ExclamationTriangleIcon, WrenchScrewdriverIcon, ClipboardDocumentListIcon, ArrowUpTrayIcon, ClipboardIcon, CalendarIcon } from './components/icons';

// Import Page Components
import DashboardPage from './pages/DashboardPage';
import WorkSheetsPage from './pages/WorkSheetsPage';
import StockPage from './pages/StockPage';
import SalesPage from './pages/SalesPage';
import ExpensesPage from './pages/ExpensesPage';
import IncomePage from './pages/IncomePage';
import LedgerPage from './pages/LedgerPage';
import VatPage from './pages/VatPage';
import FilingCabinetPage from './pages/FilingCabinetPage';
import SettingsPage from './pages/SettingsPage';
import AccountantPage from './pages/AccountantPage';
import GaragePage from './pages/GaragePage';
import CanvasPage from './pages/CanvasPage';
import JobInvoicesPage from './pages/JobInvoicesPage';
import WorkPrepPage from './pages/WorkPrepPage';
import PipelinePage from './pages/PipelinePage';
import InboxPage from './pages/InboxPage';
import LeadDetailPage from './pages/LeadDetailPage';


const LedgerCore = () => {
  const { view, openModal, setView, triggerCanvasUpload } = useUI();
  const { isLoading, error, businessDetails, theme, vehicles, addCanvasItem, isServiceBusiness, isVatRegistered } = useData();
  const { width } = useWindowSize();
  const [isMobile, setIsMobile] = useState(true);
  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);
  const addMenuRef = useRef<HTMLDivElement>(null);
  const [isCanvasMenuOpen, setIsCanvasMenuOpen] = useState(false);
  const canvasMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (width !== undefined) {
      setIsMobile(width < 768);
    }
  }, [width]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
        if (addMenuRef.current && !addMenuRef.current.contains(event.target as Node)) {
            setIsAddMenuOpen(false);
        }
        if (canvasMenuRef.current && !canvasMenuRef.current.contains(event.target as Node)) {
            setIsCanvasMenuOpen(false);
        }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fire a launcher-shortcut quick action once, after data has loaded.
  const quickActionConsumed = useRef(false);
  useEffect(() => {
    if (isLoading || error || quickActionConsumed.current) return;
    const action = consumeQuickAction();
    if (!action) return;
    quickActionConsumed.current = true;
    switch (action) {
      case 'add-expense':
        setView('expenses'); openModal('expense'); break;
      case 'add-vehicle':
        if (isServiceBusiness) { setView('expenses'); openModal('expense'); }
        else { setView('stock'); openModal('vehicle'); }
        break;
      case 'new-invoice':
        if (isServiceBusiness) { setView('jobInvoices'); openModal('jobInvoice'); }
        else { setView('stock'); openModal('invoicePicker'); }
        break;
    }
  }, [isLoading, error, isServiceBusiness, setView, openModal]);

  const notifications = useMemo(() => {
    if (isServiceBusiness) return [];
    const alerts = [];
    const sixMonthsFromNow = new Date();
    sixMonthsFromNow.setMonth(sixMonthsFromNow.getMonth() + 6);

    vehicles.forEach(v => {
      if (v.motDueDate && v.status !== 'Sold') {
        const motDate = new Date(v.motDueDate);
        if (motDate <= sixMonthsFromNow) {
          alerts.push({
            id: `mot-${v.id}`,
            type: 'mot' as const,
            message: `MOT due for ${v.reg} on ${formatDate(v.motDueDate)}`,
            vehicleId: v.id,
            date: v.motDueDate,
          });
        }
      }
    });
    return alerts.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [vehicles, isServiceBusiness]);

  const handleLogout = async () => {
      try {
          await signOut();
      } catch (error) {
          console.error("Error signing out:", error);
          alert("Failed to sign out.");
      }
  };
  
  const getPageTitle = (): string => {
      const titles: Record<View, string> = {
        dashboard: 'Dashboard',
        workSheets: 'Work Sheets',
        workPrep: 'Work Prep',
        stock: 'Vehicle Stock',
        garage: 'Garage',
        sales: 'Sales',
        expenses: 'Expenses',
        income: 'Other Income',
        ledger: 'General Ledger',
        vat: 'VAT Summary',
        filingCabinet: 'Filing Cabinet',
        settings: 'Settings',
        accountant: 'Accountant Reports',
        canvas: 'AI Canvas',
        jobInvoices: 'Jobs & Invoices',
        pipeline: 'Pipeline',
        inbox: 'Inbox',
        leadDetail: 'Lead Details'
      };
      return titles[view];
  }

  const primaryActionConfig: Partial<Record<View, { label: string, action: () => void }>> = useMemo(() => {
    if (isServiceBusiness) {
      return {
        expenses: { label: 'Add Receipt', action: () => openModal('expense') },
        jobInvoices: { label: 'Add Quote', action: () => openModal('jobInvoice') },
        pipeline: { label: 'Add Lead', action: () => openModal('lead') },
      }
    }
    return {
        stock: { label: 'Add Vehicle', action: () => openModal('vehicle') },
        garage: { label: 'Add Informal Car', action: () => openModal('addInformalVehicle') },
        expenses: { label: 'Add Receipt', action: () => openModal('expense') },
        workSheets: { label: 'Add Work Sheet', action: () => openModal('workSheet') },
        income: { label: 'Add Invoice', action: () => openModal('miscInvoice') },
        pipeline: { label: 'Add Lead', action: () => openModal('lead') },
    }
  }, [isServiceBusiness, view, openModal]);
  
  const currentAction = primaryActionConfig[view];

  const handleCanvasMenuClick = async (type: 'file' | 'note') => {
    setIsCanvasMenuOpen(false);
    if (type === 'file') {
      triggerCanvasUpload();
    } else {
      const noteColors: Array<NonNullable<CanvasItem['color']>> = ['yellow', 'pink', 'blue', 'green'];
      const randomColor = noteColors[Math.floor(Math.random() * noteColors.length)];
      const newItemData: NewCanvasItem = {
        itemType: 'note',
        headline: 'New Note',
        notes: '',
        color: randomColor,
      };
      const newId = await addCanvasItem(newItemData);
      const fullNewItem: CanvasItem = {
        ...newItemData,
        id: newId,
        createdAt: Date.now(),
      };
      openModal('canvasItem', fullNewItem);
    }
  };

  const renderView = () => {
    if (!isVatRegistered && view === 'vat') {
        return <div className="text-center p-8 bg-gray-800 rounded-lg"><h2 className="text-xl font-bold text-white">VAT Summary Not Available</h2><p className="mt-2 text-gray-400">Your business is not marked as VAT registered. You can change this in Settings.</p></div>;
    }
    switch (view) {
      case 'dashboard': return <DashboardPage />;
      case 'workSheets': return <WorkSheetsPage />;
      case 'workPrep': return <WorkPrepPage />;
      case 'stock': return isServiceBusiness ? null : <StockPage />;
      case 'garage': return isServiceBusiness ? null : <GaragePage />;
      case 'sales': return isServiceBusiness ? null : <SalesPage />;
      case 'jobInvoices': return isServiceBusiness ? <JobInvoicesPage /> : null;
      case 'expenses': return <ExpensesPage />;
      case 'income': return isServiceBusiness ? null : <IncomePage />;
      case 'ledger': return <LedgerPage />;
      case 'vat': return <VatPage />;
      case 'filingCabinet': return <FilingCabinetPage />;
      case 'settings': return <SettingsPage />;
      case 'accountant': return <AccountantPage />;
      case 'canvas': return <CanvasPage />;
      case 'pipeline': return <PipelinePage />;
      case 'inbox': return <InboxPage />;
      case 'leadDetail': return <LeadDetailPage />;
      default: return <div>Not implemented</div>;
    }
  };
  
  if (isLoading) {
    return <div className="bg-gray-950 flex items-center justify-center h-screen"><Spinner className="h-10 w-10 text-white" /></div>;
  }

  if (error) {
    // This is the special error case for a new, un-provisioned user.
    if (error === 'ACCOUNT_NOT_LINKED') {
        return <PermissionDeniedHandler />;
    }
    // This is for all other critical errors (e.g., Firebase down, rules misconfigured)
    return (
        <div className="bg-gray-950 flex items-center justify-center h-screen p-4">
            <div className="bg-gray-800 p-8 rounded-lg text-center max-w-md shadow-2xl border border-red-500/30">
                <ExclamationTriangleIcon className="h-12 w-12 text-red-400 mx-auto" />
                <h2 className="mt-4 text-xl font-bold text-white">Application Error</h2>
                <p className="mt-2 text-gray-300">Could not load application data. This is often due to a configuration issue with your Firebase settings or a network problem.</p>
                <p className="mt-4 text-xs text-gray-500 bg-gray-900 p-3 rounded-md font-mono">{error}</p>
                <div className="mt-6 flex items-center justify-center gap-x-4">
                    <button onClick={handleLogout} className="px-4 py-2 text-sm font-medium text-gray-300 bg-gray-600 hover:bg-gray-500 rounded-md">
                        Sign Out
                    </button>
                    <button onClick={() => window.location.reload()} className="px-4 py-2 text-sm font-medium text-white bg-brand-600 rounded-md">
                        Retry
                    </button>
                </div>
            </div>
        </div>
    );
  }

  return (
    <div className={`flex h-screen overflow-hidden bg-gray-950 text-gray-100 theme-${theme} print:hidden`}>
      {!isMobile && <DesktopNav onLogout={handleLogout} />}

      <main className="flex-1 flex flex-col min-h-0">
         <header className="md:hidden p-4 flex items-center justify-between border-b border-gray-700/50">
             <div className="flex items-center gap-3 min-w-0 flex-1">
                <CarIcon className={`h-8 w-8 text-brand-400 flex-shrink-0`} />
                <div className="min-w-0">
                    <h1 className="text-lg font-bold text-white leading-tight truncate">{businessDetails?.name || 'Dealer Ledger'}</h1>
                    <p className="text-xs text-gray-400">{getPageTitle()}</p>
                </div>
             </div>
             <div className="flex items-center gap-2 flex-shrink-0">
                {view === 'dashboard' && (
                  <div className="relative" ref={addMenuRef}>
                      <button
                          onClick={() => setIsAddMenuOpen(prev => !prev)}
                          className="p-2 rounded-full bg-brand-600 text-white shadow-sm hover:bg-brand-500"
                          aria-label="Add a task"
                      >
                          <PlusIcon className="h-5 w-5" />
                      </button>
                      {isAddMenuOpen && (
                          <div className="absolute right-0 mt-2 w-56 origin-top-right rounded-md bg-gray-800 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none z-10 animate-in fade-in-0 zoom-in-95 duration-200">
                              <div className="py-1" role="menu" aria-orientation="vertical">
                                  <button onClick={() => { openModal('todo', { type: 'general' }); setIsAddMenuOpen(false); }} className="w-full flex items-center px-4 py-2 text-sm text-gray-200 hover:bg-gray-700" role="menuitem">
                                      <CalendarIcon className="h-5 w-5 mr-3" />
                                      Add General Task
                                  </button>
                                  {!isServiceBusiness && (
                                    <>
                                      <button onClick={() => { openModal('todo', { type: 'prep' }); setIsAddMenuOpen(false); }} className="w-full flex items-center px-4 py-2 text-sm text-gray-200 hover:bg-gray-700" role="menuitem">
                                          <WrenchScrewdriverIcon className="h-5 w-5 mr-3" />
                                          Add Vehicle Prep
                                      </button>
                                      <button onClick={() => { openModal('todo', { type: 'warranty' }); setIsAddMenuOpen(false); }} className="w-full flex items-center px-4 py-2 text-sm text-gray-200 hover:bg-gray-700" role="menuitem">
                                          <ExclamationTriangleIcon className="h-5 w-5 mr-3" />
                                          Add Warranty Claim
                                      </button>
                                    </>
                                  )}
                              </div>
                          </div>
                      )}
                  </div>
                )}
                <NotificationBell notifications={notifications} />
             </div>
        </header>

        <header className="hidden md:flex p-6 items-center justify-between border-b border-gray-700/50 flex-shrink-0">
             <h1 className="text-2xl font-bold text-white">{getPageTitle()}</h1>
             <div className="flex items-center gap-4">
                {currentAction && (
                     <button onClick={currentAction.action} className="inline-flex items-center gap-x-2 rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-500">
                        <PlusIcon className="-ml-1 mr-1 h-5 w-5" /> {currentAction.label}
                    </button>
                )}
                 {view === 'canvas' && (
                  <div className="relative" ref={canvasMenuRef}>
                      <button 
                          onClick={() => setIsCanvasMenuOpen(prev => !prev)} 
                          className="inline-flex items-center gap-x-2 rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-brand-500"
                      >
                          <PlusIcon className="-ml-1 mr-1 h-5 w-5" /> Add to Canvas
                      </button>
                      {isCanvasMenuOpen && (
                          <div className="absolute right-0 mt-2 w-56 origin-top-right rounded-md bg-gray-800 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none z-10 animate-in fade-in-0 zoom-in-95 duration-200">
                              <div className="py-1" role="menu" aria-orientation="vertical" aria-labelledby="menu-button">
                                  <button onClick={() => handleCanvasMenuClick('file')} className="w-full flex items-center px-4 py-2 text-sm text-gray-200 hover:bg-gray-700" role="menuitem">
                                      <ArrowUpTrayIcon className="h-5 w-5 mr-3" />
                                      Upload File
                                  </button>
                                  <button onClick={() => handleCanvasMenuClick('note')} className="w-full flex items-center px-4 py-2 text-sm text-gray-200 hover:bg-gray-700" role="menuitem">
                                      <ClipboardIcon className="h-5 w-5 mr-3" />
                                      Add Note
                                  </button>
                              </div>
                          </div>
                      )}
                  </div>
                )}
                
                <div className="relative" ref={addMenuRef}>
                    <button
                        onClick={() => setIsAddMenuOpen(prev => !prev)}
                        className="inline-flex items-center gap-x-2 rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-brand-500"
                    >
                        <PlusIcon className="-ml-1 mr-1 h-5 w-5" />
                        Add Task
                    </button>
                    {isAddMenuOpen && (
                        <div className="absolute right-0 mt-2 w-56 origin-top-right rounded-md bg-gray-800 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none z-10 animate-in fade-in-0 zoom-in-95 duration-200">
                            <div className="py-1" role="menu" aria-orientation="vertical">
                                <button onClick={() => { openModal('todo', { type: 'general' }); setIsAddMenuOpen(false); }} className="w-full flex items-center px-4 py-2 text-sm text-gray-200 hover:bg-gray-700" role="menuitem">
                                    <CalendarIcon className="h-5 w-5 mr-3" />
                                    Add General Task
                                </button>
                                {!isServiceBusiness && (
                                  <>
                                    <button onClick={() => { openModal('todo', { type: 'prep' }); setIsAddMenuOpen(false); }} className="w-full flex items-center px-4 py-2 text-sm text-gray-200 hover:bg-gray-700" role="menuitem">
                                        <WrenchScrewdriverIcon className="h-5 w-5 mr-3" />
                                        Add Vehicle Prep
                                    </button>
                                    <button onClick={() => { openModal('todo', { type: 'warranty' }); setIsAddMenuOpen(false); }} className="w-full flex items-center px-4 py-2 text-sm text-gray-200 hover:bg-gray-700" role="menuitem">
                                        <ExclamationTriangleIcon className="h-5 w-5 mr-3" />
                                        Add Warranty Claim
                                    </button>
                                  </>
                                )}
                            </div>
                        </div>
                    )}
                </div>
                
                <NotificationBell notifications={notifications} />
            </div>
        </header>

         <div className="flex-1 overflow-y-auto p-4 md:p-6 pb-32 md:pb-6">
            <div className="max-w-7xl mx-auto">
                {renderView()}
            </div>
        </div>
      </main>
      
      {isMobile && <MobileNav onLogout={handleLogout} />}

      <ModalManager />
    </div>
  );
};

export default LedgerCore;