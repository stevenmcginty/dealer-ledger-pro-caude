// Page 2 of a sales document: the dealer's full terms and, optionally, the
// model cancellation form (Consumer Contracts Regulations 2013, Sch 3 Part B).
// Page 2 is offered only when the company has set it up in Business Details,
// and printed only when the desk ticks "Add terms page" on that view.

import type { BusinessDetails, DocumentType, SalesDocument } from '../types';

const TERMS_PAGE_DOCUMENTS: DocumentType[] = ['Sales Invoice', 'Proforma Invoice', 'Deposit Slip'];

/** True when page 2 is available: a customer-facing sales document, and the company has terms or the form switched on. */
export const showsTermsPage = (documentType: DocumentType, businessDetails: BusinessDetails | null | undefined): boolean => {
    if (!businessDetails || !TERMS_PAGE_DOCUMENTS.includes(documentType)) return false;
    const hasTerms = typeof businessDetails.termsPage === 'string' && businessDetails.termsPage.trim() !== '';
    return hasTerms || businessDetails.cancellationForm === true;
};

/** True when page 2 goes on this view: available, ticked by the desk, and not the unsaved preview. */
export const includesTermsPage = (
    documentType: DocumentType,
    businessDetails: BusinessDetails | null | undefined,
    { ticked, isPreview }: { ticked: boolean; isPreview?: boolean },
): boolean => ticked && !isPreview && showsTermsPage(documentType, businessDetails);

const text = (value: unknown): string => (typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '');

/** A multi-line address on one line: "1 High St, Radlett, WD7 1AA". Blank lines are dropped. */
export const oneLine = (address: unknown): string =>
    text(address).split(/\r?\n/).map(line => line.trim()).filter(Boolean).join(', ');

/** The car being sold, for the cancellation form: "Nissan 370 Z, reg MJ66 MME". '' when the doc names no car. */
export const cancellationFormGoods = (doc: Pick<SalesDocument, 'carDetails'>): string => {
    const car = doc.carDetails || ({} as SalesDocument['carDetails']);
    const name = [text(car.make), text(car.model)].filter(Boolean).join(' ');
    const reg = text(car.reg);
    return [name, reg && `reg ${reg}`].filter(Boolean).join(', ');
};

/** The "To:" line of the cancellation form: name, address, email, phone — empty parts skipped. */
export const cancellationFormRecipient = (businessDetails: BusinessDetails | null | undefined): string =>
    businessDetails
        ? [text(businessDetails.name), oneLine(businessDetails.address), text(businessDetails.email), text(businessDetails.phone)].filter(Boolean).join(', ')
        : '';
