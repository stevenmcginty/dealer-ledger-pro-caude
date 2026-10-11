import { DocumentType, SalesDocument, Vehicle } from '../../types';
import type { ChipStatus, DocKind } from '../ui';
import { formatCurrency } from '../../utils/helpers';

/** The two-letter code each document carries everywhere (Sales, Sell, chips). */
export const DOC_KIND: Record<DocumentType, DocKind> = {
    'Sales Invoice': 'SI',
    'Proforma Invoice': 'PF',
    'Deposit Slip': 'DS',
    'Purchase Invoice': 'PI',
};

/** Sentence-case names for the screen. The stored documentType never changes. */
export const DOC_NAME: Record<DocumentType, string> = {
    'Sales Invoice': 'Sales invoice',
    'Proforma Invoice': 'Proforma',
    'Deposit Slip': 'Deposit slip',
    'Purchase Invoice': 'Purchase invoice',
};

/** Paid in full, or how much is still owed. Read from the saved balance only. */
export const docPayment = (doc: Pick<SalesDocument, 'balance'>): { status: ChipStatus; label: string; paid: boolean } =>
    (doc.balance ?? 0) <= 0.005
        ? { status: 'sold', label: 'Paid', paid: true }
        : { status: 'prep', label: `${formatCurrency(doc.balance)} to pay`, paid: false };

/** A stock car's status in the shared chip vocabulary. */
export const VEHICLE_CHIP: Record<Vehicle['status'], { status: ChipStatus; label: string }> = {
    'Available': { status: 'stock', label: 'For sale' },
    'Deposit Paid': { status: 'reserved', label: 'Reserved' },
    'Sold': { status: 'sold', label: 'Sold' },
};
