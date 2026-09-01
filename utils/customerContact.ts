/**
 * Keeping one customer's email and mobile in one place.
 *
 * The same two facts used to live in four stores that never spoke: the CRM
 * Customer, the Lead, the sales document, and the sales agent's conversation.
 * A contact typed on an invoice stayed on that invoice, so the next invoice —
 * and the inbox, and every customer picker — knew nothing about it.
 *
 * These helpers decide, from the customer list and the document in front of
 * you, which record the contact belongs on and what actually needs writing.
 * They are pure so the rules can be tested without a database.
 */

export interface ContactCustomer {
    id: string;
    name: string;
    email?: string;
    phone?: string;
}

export interface ContactDocument {
    customerId?: string;
    customerName?: string;
    customerEmail?: string;
    customerPhone?: string;
}

const clean = (value: string | undefined): string => (value || '').trim();
const lower = (value: string | undefined): string => clean(value).toLowerCase();
const digits = (value: string | undefined): string => clean(value).replace(/\D/g, '');

const sameName = (a: string | undefined, b: string | undefined): boolean =>
    !!lower(a) && lower(a) === lower(b);

/**
 * Which customer record a contact on this document belongs to.
 *
 * `customerId` is trusted only while it still names the customer written on the
 * document. Documents saved before the creator learned to clear a stale id can
 * carry the id of whoever was typed first, and writing to that record puts one
 * customer's email address on another customer's file. A name that matches
 * nobody returns null, and the caller creates a new customer instead.
 */
export const resolveContactCustomer = <T extends { id: string; name: string }>(
    customers: T[],
    doc: { customerId?: string; customerName?: string }
): T | null => {
    const byId = customers.find(c => c.id === doc.customerId);
    if (byId && sameName(byId.name, doc.customerName)) return byId;

    const name = lower(doc.customerName);
    return (name ? customers.find(c => lower(c.name) === name) : undefined) || null;
};

/**
 * What is worth writing onto an existing customer.
 *
 * A blank on the document changes nothing — an invoice raised without a mobile
 * must not wipe the mobile already on file. A value that differs does win: the
 * form pre-fills from the customer, so a difference is something a human
 * deliberately typed over the top, and the newer one is the one to keep.
 * Phones compare on their digits, so re-spacing a number is not a write.
 */
export const contactUpdatesFor = (
    customer: Pick<ContactCustomer, 'email' | 'phone'> | null,
    doc: ContactDocument
): { email?: string; phone?: string } => {
    const updates: { email?: string; phone?: string } = {};
    const email = clean(doc.customerEmail);
    const phone = clean(doc.customerPhone);

    if (email && lower(email) !== lower(customer?.email)) updates.email = email;
    if (phone && digits(phone) !== digits(customer?.phone)) updates.phone = phone;
    return updates;
};

export type ContactSyncPlan =
    /** Nothing typed, nothing new, or nothing to attach it to. */
    | { action: 'none' }
    | { action: 'update'; customerId: string; updates: { email?: string; phone?: string } }
    | { action: 'create'; customer: { name: string; address: string; email?: string; phone?: string } };

/**
 * What saving this document should do to the CRM.
 *
 * Called with the END customer — on a finance invoice that is the person taking
 * the car away, not the finance house the invoice is addressed to.
 */
export const planCustomerContactSync = (
    customers: ContactCustomer[],
    doc: ContactDocument & { customerAddress?: string }
): ContactSyncPlan => {
    const email = clean(doc.customerEmail);
    const phone = clean(doc.customerPhone);
    const name = clean(doc.customerName);
    if (!name) return { action: 'none' };
    if (!email && !phone) return { action: 'none' };

    const match = resolveContactCustomer(customers, doc);
    if (!match) {
        return {
            action: 'create',
            customer: {
                name,
                address: clean(doc.customerAddress),
                ...(email ? { email } : {}),
                ...(phone ? { phone } : {}),
            },
        };
    }

    const updates = contactUpdatesFor(match, doc);
    if (!updates.email && !updates.phone) return { action: 'none' };
    return { action: 'update', customerId: match.id, updates };
};

/** Does this customer match what was typed into a search box? Name, email or number. */
export const customerMatchesSearch = (customer: ContactCustomer, query: string): boolean => {
    const q = lower(query);
    if (!q) return false;
    if (lower(customer.name).includes(q)) return true;
    if (lower(customer.email).includes(q)) return true;

    const qDigits = digits(query);
    return qDigits.length >= 3 && digits(customer.phone).includes(qDigits);
};
