import { describe, expect, it } from 'vitest';

import {
    contactUpdatesFor,
    customerMatchesSearch,
    planCustomerContactSync,
    resolveContactCustomer,
} from '../utils/customerContact';

const CUSTOMERS = [
    { id: 'c1', name: 'John Smith', email: 'john@old.com' },
    { id: 'c2', name: 'Jane Doe', phone: '07700 900123' },
];

describe('resolveContactCustomer', () => {
    it('uses the id when it still names the customer on the document', () => {
        expect(resolveContactCustomer(CUSTOMERS, { customerId: 'c1', customerName: 'John Smith' }))
            .toEqual(CUSTOMERS[0]);
    });

    it('ignores an id left over from a name that was typed and then changed', () => {
        expect(resolveContactCustomer(CUSTOMERS, { customerId: 'c1', customerName: 'Jane Doe' }))
            .toEqual(CUSTOMERS[1]);
    });

    it('returns null when the stale id names nobody on the document', () => {
        expect(resolveContactCustomer(CUSTOMERS, { customerId: 'c1', customerName: 'Sam New' })).toBeNull();
    });

    it('falls back to the name when there is no id', () => {
        expect(resolveContactCustomer(CUSTOMERS, { customerName: 'jane doe' })).toEqual(CUSTOMERS[1]);
    });

    it('returns null for a blank name', () => {
        expect(resolveContactCustomer(CUSTOMERS, { customerName: '  ' })).toBeNull();
        expect(resolveContactCustomer(CUSTOMERS, {})).toBeNull();
    });
});

describe('contactUpdatesFor', () => {
    it('fills what the customer does not have', () => {
        expect(contactUpdatesFor({ email: 'john@old.com' }, { customerPhone: '07700 900999' }))
            .toEqual({ phone: '07700 900999' });
    });

    it('writes a value the desk deliberately typed over the top', () => {
        expect(contactUpdatesFor({ email: 'john@old.com' }, { customerEmail: 'john@new.com' }))
            .toEqual({ email: 'john@new.com' });
    });

    it('never wipes what is on file with a blank', () => {
        expect(contactUpdatesFor({ email: 'john@old.com', phone: '07700 900123' }, {})).toEqual({});
        expect(contactUpdatesFor({ email: 'john@old.com' }, { customerEmail: '   ' })).toEqual({});
    });

    it('treats a re-spaced phone number as no change', () => {
        expect(contactUpdatesFor({ phone: '07700 900123' }, { customerPhone: '07700900123' })).toEqual({});
    });

    it('ignores a change of case in an email', () => {
        expect(contactUpdatesFor({ email: 'john@old.com' }, { customerEmail: 'John@Old.com' })).toEqual({});
    });
});

describe('planCustomerContactSync', () => {
    it('does nothing when no contact was typed', () => {
        expect(planCustomerContactSync(CUSTOMERS, { customerName: 'John Smith' })).toEqual({ action: 'none' });
    });

    it('does nothing without a name to attach the contact to', () => {
        expect(planCustomerContactSync(CUSTOMERS, { customerEmail: 'nobody@example.com' }))
            .toEqual({ action: 'none' });
    });

    it('updates the matching customer', () => {
        expect(planCustomerContactSync(CUSTOMERS, {
            customerId: 'c1',
            customerName: 'John Smith',
            customerPhone: '07700 900555',
        })).toEqual({ action: 'update', customerId: 'c1', updates: { phone: '07700 900555' } });
    });

    it('does nothing when the customer already holds the same details', () => {
        expect(planCustomerContactSync(CUSTOMERS, {
            customerId: 'c1',
            customerName: 'John Smith',
            customerEmail: 'john@old.com',
        })).toEqual({ action: 'none' });
    });

    it('creates a customer for a name that is new', () => {
        expect(planCustomerContactSync(CUSTOMERS, {
            customerName: 'Sam New',
            customerAddress: '1 High St',
            customerEmail: 'sam@example.com',
        })).toEqual({
            action: 'create',
            customer: { name: 'Sam New', address: '1 High St', email: 'sam@example.com' },
        });
    });

    it('does not write to the customer a stale id points at', () => {
        // The invoice says Jane, the leftover id says John. John must not get Jane's email.
        const plan = planCustomerContactSync(CUSTOMERS, {
            customerId: 'c1',
            customerName: 'Jane Doe',
            customerEmail: 'jane@example.com',
        });
        expect(plan).toEqual({ action: 'update', customerId: 'c2', updates: { email: 'jane@example.com' } });
    });
});

describe('customerMatchesSearch', () => {
    const jane = { id: 'c2', name: 'Jane Doe', email: 'jane@example.com', phone: '07700 900123' };

    it('matches on part of the name', () => {
        expect(customerMatchesSearch(jane, 'doe')).toBe(true);
    });

    it('matches on part of the email', () => {
        expect(customerMatchesSearch(jane, 'example.com')).toBe(true);
    });

    it('matches a number typed with or without spaces', () => {
        expect(customerMatchesSearch(jane, '900123')).toBe(true);
        expect(customerMatchesSearch(jane, '07700 900')).toBe(true);
    });

    it('does not match on one or two stray digits', () => {
        expect(customerMatchesSearch(jane, '07')).toBe(false);
    });

    it('does not match an empty search', () => {
        expect(customerMatchesSearch(jane, '  ')).toBe(false);
    });
});
