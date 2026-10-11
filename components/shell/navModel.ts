import React from 'react';
import { View } from '../../types';
import { BuildingStorefrontIcon, DocumentTextIcon, GaugeIcon, NavCarIcon, NavCarSolidIcon, NavChatIcon, NavHomeIcon, PoundIcon, ShieldCheckIcon, SparklesIcon, UsersIcon } from '../icons';
import * as I from './icons';

/*
 * One place that says where every view lives (spec 2.1) and what it is called.
 * The tab bar, rail, sidebar, More screen and search all read from here, so a
 * screen is named the same everywhere.
 */

type Icon = React.ComponentType<I.ShellIconProps>;

export interface ViewMeta {
    label: string;
    icon: Icon;
    /** Extra words the More filter and search match on. */
    keywords?: string;
}

export const VIEW_META: Record<View, ViewMeta> = {
    dashboard: { label: 'Today', icon: NavHomeIcon, keywords: 'dashboard home tasks calendar' },
    stock: { label: 'Stock', icon: NavCarIcon, keywords: 'cars vehicles' },
    garage: { label: 'Garage', icon: BuildingStorefrontIcon, keywords: 'informal cars' },
    sales: { label: 'Sales documents', icon: DocumentTextIcon, keywords: 'invoices proforma deposit' },
    agentInbox: { label: 'Inbox', icon: NavChatIcon, keywords: 'dave whatsapp email messages agent' },
    pipeline: { label: 'Pipeline', icon: UsersIcon, keywords: 'leads crm enquiries customers' },
    leadDetail: { label: 'Lead', icon: UsersIcon },
    expenses: { label: 'Expenses & bank', icon: I.ReceiptIcon, keywords: 'receipts bank statement reconcile payables' },
    income: { label: 'Other income', icon: I.IncomeIcon, keywords: 'invoices misc' },
    vat: { label: 'VAT', icon: PoundIcon, keywords: 'return quarter hmrc mtd' },
    ledger: { label: 'Ledger', icon: I.BookIcon, keywords: 'general journal' },
    workPrep: { label: 'Prep', icon: I.ClipIcon, keywords: 'work prep checklist' },
    pdi: { label: 'PDI checks', icon: ShieldCheckIcon, keywords: 'pre-delivery inspection' },
    workSheets: { label: 'Work sheets', icon: I.SheetIcon, keywords: 'jobs' },
    internalJobs: { label: 'Internal jobs', icon: GaugeIcon, keywords: 'job sheets' },
    jobInvoices: { label: 'Jobs & invoices', icon: I.WrenchIcon, keywords: 'quotes customers' },
    accountant: { label: 'Accountant', icon: I.ChartIcon, keywords: 'reports profit loss corporation tax' },
    filingCabinet: { label: 'Filing cabinet', icon: I.FolderIcon, keywords: 'documents archive' },
    canvas: { label: 'AI Canvas', icon: SparklesIcon, keywords: 'notes board files' },
    settings: { label: 'Settings', icon: I.SlidersIcon, keywords: 'business details accounts appearance theme' },
};

export interface NavFlags {
    isServiceBusiness: boolean;
    isVatRegistered: boolean;
}

/** The second tab: Stock for dealers, Jobs for mechanics and paint shops. */
export const secondTab = (flags: NavFlags): { view: View; label: string; icon: Icon; solid: Icon } =>
    flags.isServiceBusiness
        ? { view: 'jobInvoices', label: 'Jobs', icon: I.WrenchIcon, solid: I.WrenchIcon }
        : { view: 'stock', label: 'Stock', icon: NavCarIcon, solid: NavCarSolidIcon };

export interface NavGroup {
    id: string;
    title: string;
    views: View[];
}

/** Desktop sidebar groups (spec 2.2). Today sits above them, Settings below. */
export const sidebarGroups = (flags: NavFlags): NavGroup[] => {
    const money: View[] = flags.isServiceBusiness
        ? ['expenses', ...(flags.isVatRegistered ? ['vat' as View] : []), 'ledger']
        : ['expenses', 'income', ...(flags.isVatRegistered ? ['vat' as View] : []), 'ledger'];
    return [
        flags.isServiceBusiness
            ? { id: 'jobs', title: 'Jobs', views: ['jobInvoices', 'agentInbox', 'pipeline'] }
            : { id: 'sell', title: 'Sell', views: ['stock', 'garage', 'agentInbox', 'pipeline', 'sales'] },
        { id: 'money', title: 'Money', views: money },
        {
            id: 'workshop',
            title: 'Workshop',
            views: flags.isServiceBusiness
                ? ['workPrep', 'workSheets', 'internalJobs']
                : ['workPrep', 'pdi', 'workSheets', 'internalJobs'],
        },
        { id: 'reports', title: 'Reports', views: ['accountant', 'filingCabinet', 'canvas'] },
    ];
};

/** More screen groups: every view that is not a tab (spec 2.1 / S12). */
export const moreGroups = (flags: NavFlags): NavGroup[] =>
    sidebarGroups(flags)
        .map(group => ({
            ...group,
            // Tabs (Today, Stock or Jobs, Inbox) are already one tap away.
            views: group.views.filter(v => v !== 'stock' && v !== 'jobInvoices' && v !== 'agentInbox'),
            title: group.id === 'jobs' ? 'Customers' : group.title,
        }))
        .filter(group => group.views.length > 0);

/** Which tab lights up for a view. Anything not on a tab lives under More. */
export const tabFor = (view: View, flags: NavFlags): 'today' | 'second' | 'inbox' | 'more' => {
    if (view === 'dashboard') return 'today';
    if (view === secondTab(flags).view) return 'second';
    if (view === 'agentInbox') return 'inbox';
    return 'more';
};

/** Header title for a view. */
export const titleFor = (view: View): string => VIEW_META[view].label;

/** Views hidden in service mode (as today: LedgerCore renders nothing for them). */
export const isHiddenView = (view: View, flags: NavFlags): boolean =>
    flags.isServiceBusiness
        ? ['stock', 'garage', 'sales', 'income', 'pdi'].includes(view)
        : view === 'jobInvoices';

/** /app/<view> plus the current query string (keeps ?mode=screenshot). */
export const hrefFor = (view: View): string => `/app/${view}${typeof window !== 'undefined' ? window.location.search : ''}`;

/** Count badge text: up to 99, then "99+". */
export const badgeText = (n: number): string => (n > 99 ? '99+' : String(n));
