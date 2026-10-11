import React, { useMemo, useEffect, useRef, lazy, Suspense } from 'react';
import { useUI } from './hooks/useUI';
import { useData } from './hooks/useData';
import { useAgentPushMessages } from './hooks/useAgentPushMessages';
import { signOut, reconnectDatabase } from './services/firebase';
import { reloadOntoLatestBuild } from './contexts/AppUpdateContext';
import { formatDate } from './utils/helpers';
import { consumeQuickAction } from './utils/quickAction';
import { Notification } from './types';

// Import Layout Components
import AppShell from './components/shell/AppShell';
import { ArrowPathIcon, ExclamationTriangleIcon } from './components/icons';
import Spinner from './components/common/Spinner';
import ModalManager from './components/common/ModalManager';
import PermissionDeniedHandler from './components/auth/PermissionDeniedHandler';
import { useToast } from './components/ui';

// Import Page Components (lazy: each page ships as its own chunk so the
// initial entry only carries the shell)
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const WorkSheetsPage = lazy(() => import('./pages/WorkSheetsPage'));
const StockPage = lazy(() => import('./pages/StockPage'));
const CarPage = lazy(() => import('./pages/CarPage'));
const SalesPage = lazy(() => import('./pages/SalesPage'));
const ExpensesPage = lazy(() => import('./pages/ExpensesPage'));
const IncomePage = lazy(() => import('./pages/IncomePage'));
const LedgerPage = lazy(() => import('./pages/LedgerPage'));
const VatPage = lazy(() => import('./pages/VatPage'));
const FilingCabinetPage = lazy(() => import('./pages/FilingCabinetPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const AccountantPage = lazy(() => import('./pages/AccountantPage'));
const GaragePage = lazy(() => import('./pages/GaragePage'));
const CanvasPage = lazy(() => import('./pages/CanvasPage'));
const JobInvoicesPage = lazy(() => import('./pages/JobInvoicesPage'));
const WorkPrepPage = lazy(() => import('./pages/WorkPrepPage'));
const InternalJobsPage = lazy(() => import('./pages/InternalJobsPage'));
const PdiPage = lazy(() => import('./pages/PdiPage'));
const PipelinePage = lazy(() => import('./pages/PipelinePage'));
const LeadDetailPage = lazy(() => import('./pages/LeadDetailPage'));
const AgentInboxPage = lazy(() => import('./components/salesAgent/AgentInboxPage'));


const LedgerCore = () => {
  const { view, vehicleId, openModal, setView } = useUI();
  const toast = useToast();
  const { isLoading, error, theme, vehicles, isServiceBusiness, isVatRegistered } = useData();

  // Sales agent alerts pushed to this device while the app is open show as a
  // toast; the service worker handles them when it is not.
  useAgentPushMessages();

  // Modals portal to document.body, so they sit outside the theme-* wrapper below
  // and would otherwise always render the default blue brand palette. Stamping the
  // theme onto <html> puts the --color-brand-* vars in reach of everything.
  useEffect(() => {
    const themeClass = `theme-${theme}`;
    const root = document.documentElement;
    root.classList.add(themeClass);
    return () => root.classList.remove(themeClass);
  }, [theme]);

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
    const alerts: Notification[] = [];
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
            reg: v.reg,
            vehicleLabel: [v.make, v.model].filter(Boolean).join(' '),
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
          toast.error("Couldn't sign out. Check your signal and try again.");
      }
  };

  const renderView = () => {
    if (!isVatRegistered && view === 'vat') {
        return (
          <div className="max-w-xl rounded-card border border-line bg-surface p-6">
            <h2 className="text-xl font-bold text-ink">VAT isn’t set up</h2>
            <p className="mt-2 text-base text-ink-2">This business isn’t marked as VAT registered. You can change that in Settings.</p>
          </div>
        );
    }
    switch (view) {
      case 'dashboard': return <DashboardPage />;
      case 'workSheets': return <WorkSheetsPage />;
      case 'pdi': return isServiceBusiness ? null : <PdiPage />;
      case 'workPrep': return <WorkPrepPage />;
      case 'internalJobs': return <InternalJobsPage />;
      case 'stock':
        if (isServiceBusiness) return null;
        return vehicleId ? <CarPage vehicleId={vehicleId} /> : <StockPage />;
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
      case 'leadDetail': return <LeadDetailPage />;
      case 'agentInbox': return <AgentInboxPage />;
      default: return <div>Not implemented</div>;
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-[100dvh] items-center justify-center bg-bg text-ink-2" role="status">
        <Spinner className="h-8 w-8" />
        <span className="sr-only">Loading your ledger</span>
      </div>
    );
  }

  if (error) {
    // This is the special error case for a new, un-provisioned user.
    if (error === 'ACCOUNT_NOT_LINKED') {
        return <PermissionDeniedHandler />;
    }
    // This is for all other critical errors (e.g., Firebase down, rules misconfigured)
    const isTimeout = /timed out/i.test(error);
    const handleRetry = () => {
        reconnectDatabase();
        window.location.reload();
    };
    const secondary = 'inline-flex min-h-[48px] items-center justify-center gap-2 rounded-control border border-line-strong bg-surface px-5 text-base font-semibold text-ink transition-colors duration-quick hover:bg-surface-2 active:bg-surface-3';
    return (
        <div className="flex min-h-[100dvh] items-center justify-center bg-bg p-4">
            <div className="w-full max-w-md rounded-card border border-line bg-surface p-6">
                <ExclamationTriangleIcon className="h-8 w-8 text-danger" />
                <h2 className="mt-3 text-xl font-bold text-ink">
                    {isTimeout ? 'Connection stalled' : 'Couldn’t load your ledger'}
                </h2>
                <p className="mt-2 text-base text-ink-2">
                    {isTimeout
                        ? 'The app could not reach your account after a refresh. Update to get the latest version, or retry. You don’t need to delete cookies.'
                        : 'This is usually a signal problem. Try Update, then Retry.'}
                </p>
                <p className="mt-4 break-all rounded-control bg-surface-2 p-3 font-mono text-xs text-ink-2">{error}</p>
                <div className="mt-6 flex flex-col gap-2 sm:flex-row">
                    <button
                        onClick={() => reloadOntoLatestBuild()}
                        className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-control bg-accent px-5 text-base font-semibold text-on-accent transition-colors duration-quick hover:bg-accent-hover active:bg-accent-press"
                    >
                        <ArrowPathIcon className="h-5 w-5" />
                        Update
                    </button>
                    <button onClick={handleRetry} className={secondary}>Retry</button>
                    <button onClick={handleLogout} className={secondary}>Sign out</button>
                </div>
            </div>
        </div>
    );
  }

  return (
    <>
      <AppShell notifications={notifications} onLogout={handleLogout} className={`theme-${theme}`}>
        <Suspense
          fallback={
            <div className="flex items-center justify-center py-24 text-ink-3" role="status">
              <Spinner className="h-6 w-6" />
              <span className="sr-only">Loading</span>
            </div>
          }
        >
          {renderView()}
        </Suspense>
      </AppShell>

      <ModalManager />
    </>
  );
};

export default LedgerCore;
