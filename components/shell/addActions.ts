import React from 'react';
import { View } from '../../types';
import { BuildingStorefrontIcon, CalendarIcon, CameraIcon, DocumentTextIcon, ExclamationTriangleIcon, GaugeIcon, NavCarIcon, ShieldCheckIcon, UsersIcon } from '../icons';
import * as I from './icons';

/*
 * Every "new" action in the app, in one list (spec 2.2, S2). Ordered by how
 * often each is used; the action for the screen you are on moves to the front.
 */

export type AddActionId =
    | 'car' | 'expense' | 'saleDoc' | 'lead' | 'task' | 'prep' | 'warranty'
    | 'receipts' | 'workSheet' | 'pdi' | 'internalJob' | 'garageCar' | 'income'
    | 'jobInvoice';

export interface AddAction {
    id: AddActionId;
    label: string;
    hint: string;
    icon: React.ComponentType<I.ShellIconProps>;
}

const ACTIONS: Record<AddActionId, AddAction> = {
    car: { id: 'car', label: 'Car', hint: 'Reg lookup', icon: NavCarIcon },
    expense: { id: 'expense', label: 'Expense', hint: 'Snap a receipt', icon: CameraIcon },
    saleDoc: { id: 'saleDoc', label: 'Sale doc', hint: 'Invoice, proforma', icon: DocumentTextIcon },
    lead: { id: 'lead', label: 'Lead', hint: 'Enquiry', icon: UsersIcon },
    task: { id: 'task', label: 'Task', hint: 'To-do, reminder', icon: CalendarIcon },
    prep: { id: 'prep', label: 'Prep job', hint: 'Work on a car', icon: I.ClipIcon },
    warranty: { id: 'warranty', label: 'Warranty claim', hint: 'Problem after sale', icon: ExclamationTriangleIcon },
    receipts: { id: 'receipts', label: 'Lots of receipts at once', hint: 'Photos or PDFs', icon: I.ReceiptIcon },
    workSheet: { id: 'workSheet', label: 'Work sheet', hint: 'Job for a customer', icon: I.SheetIcon },
    pdi: { id: 'pdi', label: 'PDI check', hint: 'Before handover', icon: ShieldCheckIcon },
    internalJob: { id: 'internalJob', label: 'Internal job', hint: 'Work on your own car', icon: GaugeIcon },
    garageCar: { id: 'garageCar', label: 'Garage car', hint: 'Not in stock yet', icon: BuildingStorefrontIcon },
    income: { id: 'income', label: 'Other income', hint: 'Invoice, not a car', icon: I.IncomeIcon },
    jobInvoice: { id: 'jobInvoice', label: 'Quote or invoice', hint: 'Starts as a quote', icon: I.WrenchIcon },
};

/** The likely action for each screen, which goes first. */
const CONTEXT: Partial<Record<View, AddActionId>> = {
    stock: 'car',
    garage: 'garageCar',
    sales: 'saleDoc',
    expenses: 'expense',
    income: 'income',
    pipeline: 'lead',
    leadDetail: 'lead',
    agentInbox: 'lead',
    workPrep: 'prep',
    pdi: 'pdi',
    workSheets: 'workSheet',
    internalJobs: 'internalJob',
    jobInvoices: 'jobInvoice',
};

/** How many big tiles sit in the grid; the rest are rows under it. */
export const TILE_COUNT = 6;

export const addActionsFor = (view: View, isServiceBusiness: boolean): { tiles: AddAction[]; rows: AddAction[] } => {
    let order: AddActionId[] = isServiceBusiness
        ? ['jobInvoice', 'expense', 'lead', 'task', 'workSheet', 'internalJob', 'receipts']
        : ['car', 'expense', 'saleDoc', 'lead', 'task', 'prep', 'warranty', 'receipts', 'workSheet', 'pdi', 'internalJob', 'garageCar', 'income'];

    const first = CONTEXT[view];
    if (first && order.includes(first)) order = [first, ...order.filter(id => id !== first)];

    const all = order.map(id => ACTIONS[id]);
    return { tiles: all.slice(0, TILE_COUNT), rows: all.slice(TILE_COUNT) };
};
