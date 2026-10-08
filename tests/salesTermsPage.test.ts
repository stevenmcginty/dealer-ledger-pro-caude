import { describe, expect, it } from 'vitest';
import type { BusinessDetails, SalesDocument } from '../types';
import {
    cancellationFormGoods,
    cancellationFormRecipient,
    includesTermsPage,
    oneLine,
    showsTermsPage,
} from '../utils/salesTermsPage';

const business = (over: Partial<BusinessDetails> = {}): BusinessDetails => ({
    name: 'Test Motors',
    address: '1 High Street\nTown\n\nAB1 2CD',
    phone: '01234 567890',
    email: 'sales@example.com',
    vatNumber: '',
    companyNumber: '',
    bankDetails: '',
    invoiceTerms: '',
    theme: 'blue',
    vatStartDate: '',
    operatingMode: 'dealership',
    isVatRegistered: false,
    ...over,
});

const car = (over: Partial<SalesDocument['carDetails']> = {}) =>
    ({ carDetails: { make: 'Nissan', model: '370 Z', reg: 'MJ66 MME', ...over } as SalesDocument['carDetails'] });

describe('showsTermsPage', () => {
    it('is on for sales documents when the company has terms', () => {
        const bd = business({ termsPage: 'Our terms' });
        expect(showsTermsPage('Sales Invoice', bd)).toBe(true);
        expect(showsTermsPage('Proforma Invoice', bd)).toBe(true);
        expect(showsTermsPage('Deposit Slip', bd)).toBe(true);
    });

    it('is on when only the cancellation form is switched on', () => {
        expect(showsTermsPage('Sales Invoice', business({ cancellationForm: true }))).toBe(true);
    });

    it('is never on for purchase invoices', () => {
        expect(showsTermsPage('Purchase Invoice', business({ termsPage: 'Our terms', cancellationForm: true }))).toBe(false);
    });

    it('is off when there are no terms and no form', () => {
        expect(showsTermsPage('Sales Invoice', business())).toBe(false);
        expect(showsTermsPage('Sales Invoice', business({ termsPage: '   \n ', cancellationForm: false }))).toBe(false);
    });

    it('is off without business details', () => {
        expect(showsTermsPage('Sales Invoice', null)).toBe(false);
        expect(showsTermsPage('Sales Invoice', undefined)).toBe(false);
    });
});

describe('includesTermsPage', () => {
    const bd = business({ termsPage: 'Our terms' });

    it('adds page 2 only when the desk ticks it', () => {
        expect(includesTermsPage('Sales Invoice', bd, { ticked: false })).toBe(false);
        expect(includesTermsPage('Sales Invoice', bd, { ticked: true })).toBe(true);
    });

    it('never adds page 2 to the unsaved preview', () => {
        expect(includesTermsPage('Sales Invoice', bd, { ticked: true, isPreview: true })).toBe(false);
    });

    it('never adds page 2 when it is not available', () => {
        expect(includesTermsPage('Purchase Invoice', bd, { ticked: true })).toBe(false);
        expect(includesTermsPage('Sales Invoice', business(), { ticked: true })).toBe(false);
    });
});

describe('cancellationFormGoods', () => {
    it('names the car with its reg', () => {
        expect(cancellationFormGoods(car())).toBe('Nissan 370 Z, reg MJ66 MME');
    });

    it('leaves out a missing reg', () => {
        expect(cancellationFormGoods(car({ reg: '' }))).toBe('Nissan 370 Z');
    });

    it('uses the reg alone when make and model are missing', () => {
        expect(cancellationFormGoods(car({ make: '', model: '' }))).toBe('reg MJ66 MME');
    });

    it('is empty when the doc names no car', () => {
        expect(cancellationFormGoods(car({ make: '', model: '', reg: '' }))).toBe('');
        expect(cancellationFormGoods({ carDetails: undefined as unknown as SalesDocument['carDetails'] })).toBe('');
    });

    it('ignores values that are not text', () => {
        expect(cancellationFormGoods(car({ make: { bad: 1 } as unknown as string, model: 'Golf' }))).toBe('Golf, reg MJ66 MME');
    });
});

describe('oneLine', () => {
    it('joins address lines and drops blank ones', () => {
        expect(oneLine(' 1 High Street \r\nTown\n\nAB1 2CD ')).toBe('1 High Street, Town, AB1 2CD');
    });

    it('is empty for missing values', () => {
        expect(oneLine(undefined)).toBe('');
        expect(oneLine('')).toBe('');
    });
});

describe('cancellationFormRecipient', () => {
    it('lists name, address, email and phone', () => {
        expect(cancellationFormRecipient(business())).toBe('Test Motors, 1 High Street, Town, AB1 2CD, sales@example.com, 01234 567890');
    });

    it('skips empty parts', () => {
        expect(cancellationFormRecipient(business({ email: '', phone: '  ' }))).toBe('Test Motors, 1 High Street, Town, AB1 2CD');
    });

    it('is empty without business details', () => {
        expect(cancellationFormRecipient(null)).toBe('');
    });
});
