/**
 * Send the document on screen to its customer, from the invoice modal.
 *
 * Email attaches the PDF; WhatsApp sends it as a file when the customer's
 * thread is live, and email plus an approved nudge when it is not (Meta will
 * not carry a file outside the 24h window). A contact that is missing can be
 * typed in here — it is saved onto the document and the customer record, so
 * it only has to be typed once.
 */

import React, { useState } from 'react';
import { SalesDocument } from '../../types';
import { useData } from '../../hooks/useData';
import { useToast } from '../ui';
import Spinner from '../common/Spinner';
import { EnvelopeIcon, WhatsAppIcon } from '../icons';
import { updateSalesDocument, uploadInvoicePdf } from '../../services/dataService';
import { sendInvoiceDocument } from '../../services/salesAgentService';
import { printablePdfBlob } from './printablePdf';

const documentLabel = (doc: SalesDocument): string => doc.documentType.toLowerCase();

const vehicleTitleOf = (doc: SalesDocument): string | undefined => {
    const car = doc.carDetails || {};
    const title = [car.make, car.model].filter(Boolean).join(' ').trim();
    return title || undefined;
};

const sameName = (a: string | undefined, b: string | undefined): boolean =>
    (a || '').trim().toLowerCase() === (b || '').trim().toLowerCase() && !!(a || '').trim();

/**
 * Which customer record a contact typed here belongs to.
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

    const name = (doc.customerName || '').trim().toLowerCase();
    return (name ? customers.find(c => c.name.trim().toLowerCase() === name) : undefined) || null;
};

/** What the panel says after the callable answers. */
export const sendOutcomeMessage = (
    sent: 'whatsapp' | 'email' | 'email+whatsapp',
    nudgeHeld: string | undefined,
    email: string,
    phone: string
): string => {
    const said = sent === 'whatsapp'
        ? `Sent on WhatsApp to ${phone}.`
        : sent === 'email+whatsapp'
            ? `Emailed to ${email}, and a WhatsApp nudge went out.`
            : `Emailed to ${email}.`;
    return nudgeHeld ? `${said} The WhatsApp nudge did not go: ${nudgeHeld}` : said;
};

const SendDocumentPanel: React.FC<{ doc: SalesDocument }> = ({ doc }) => {
    const { companyId, userId, customers, addCustomer, updateCustomer } = useData();
    const toast = useToast();

    const [email, setEmail] = useState(doc.customerEmail || '');
    const [phone, setPhone] = useState(doc.customerPhone || '');
    const [adding, setAdding] = useState<'email' | 'phone' | null>(null);
    const [savingContact, setSavingContact] = useState(false);
    const [sending, setSending] = useState<'email' | 'whatsapp' | null>(null);
    const [error, setError] = useState<string | null>(null);

    const hasEmail = /.+@.+\..+/.test(email.trim());
    const hasPhone = phone.replace(/\D/g, '').length >= 10;

    /** Save the contact onto the document and the customer record. */
    const saveContact = async (kind: 'email' | 'phone') => {
        const value = (kind === 'email' ? email : phone).trim();
        if (kind === 'email' ? !hasEmail : !hasPhone) return;
        if (!companyId) return;
        setSavingContact(true);
        try {
            // By id first, then by name, so the contact lands on the right record
            // instead of spawning a near-duplicate — but never on an id that no
            // longer names the customer on the document.
            const customer = resolveContactCustomer(customers, doc);

            let customerId = customer?.id;
            if (customer) {
                await updateCustomer(customer.id, {
                    ...(kind === 'email' ? { email: value } : { phone: value }),
                });
            } else {
                customerId = await addCustomer({
                    name: doc.customerName || 'Unknown',
                    address: doc.customerAddress || '',
                    ...(kind === 'email' ? { email: value } : { phone: value }),
                });
            }

            await updateSalesDocument(companyId, doc.id, {
                ...(customerId ? { customerId } : {}),
                ...(kind === 'email' ? { customerEmail: value } : { customerPhone: value }),
            });
            setAdding(null);
        } catch (e: any) {
            setError(e?.message || 'Could not save that contact.');
        } finally {
            setSavingContact(false);
        }
    };

    const send = async (via: 'email' | 'whatsapp') => {
        if (!companyId || !userId || sending) return;
        if (via === 'email' && !hasEmail) { setAdding('email'); return; }
        if (via === 'whatsapp' && !hasPhone) { setAdding('phone'); return; }

        setSending(via);
        setError(null);
        try {
            const blob = await printablePdfBlob();
            const filename = `${doc.documentType.replace(/\s/g, '-')}-${doc.invoiceNumber}.pdf`;
            const pdfUrl = await uploadInvoicePdf(companyId, userId, blob, filename);

            const result = await sendInvoiceDocument(companyId, {
                via,
                email: email.trim() || undefined,
                phone: phone.trim() || undefined,
                customerName: doc.customerName || undefined,
                vehicleTitle: vehicleTitleOf(doc),
                documentLabel: documentLabel(doc),
                invoiceNumber: doc.invoiceNumber,
                pdfUrl,
                filename,
            });

            if (result.nudgeHeld) {
                toast.info(sendOutcomeMessage(result.sent, result.nudgeHeld, email.trim(), phone.trim()));
            } else {
                toast.success(sendOutcomeMessage(result.sent, undefined, email.trim(), phone.trim()));
            }
        } catch (e: any) {
            setError(e?.message || 'That document was not sent.');
        } finally {
            setSending(null);
        }
    };

    return (
        <div className="bg-gray-800 border-b border-gray-700 px-4 py-2.5 print:hidden flex-shrink-0">
            <div className="max-w-4xl mx-auto flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium text-gray-400 uppercase tracking-wider mr-1">Send to customer</span>
                <button
                    type="button"
                    onClick={() => void send('email')}
                    disabled={!!sending || !hasEmail}
                    title={hasEmail ? `Email to ${email.trim()}` : 'Add an email address first'}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-sky-600 text-white hover:bg-sky-500 disabled:opacity-35 disabled:cursor-not-allowed"
                >
                    <EnvelopeIcon className="h-3.5 w-3.5" aria-hidden />
                    {sending === 'email' ? <Spinner className="h-3.5 w-3.5" /> : 'Email'}
                </button>
                <button
                    type="button"
                    onClick={() => void send('whatsapp')}
                    disabled={!!sending || !hasPhone}
                    title={hasPhone ? `WhatsApp to ${phone.trim()}` : 'Add a mobile number first'}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-[#25d366] text-[#111b21] hover:bg-[#20bd5a] disabled:opacity-35 disabled:cursor-not-allowed"
                >
                    <WhatsAppIcon className="h-3.5 w-3.5" aria-hidden />
                    {sending === 'whatsapp' ? <Spinner className="h-3.5 w-3.5" /> : 'WhatsApp'}
                </button>

                {!hasEmail && adding !== 'email' && (
                    <button type="button" onClick={() => setAdding('email')} className="text-xs font-medium text-sky-400 hover:underline">
                        Add email
                    </button>
                )}
                {!hasPhone && adding !== 'phone' && (
                    <button type="button" onClick={() => setAdding('phone')} className="text-xs font-medium text-[#25d366] hover:underline">
                        Add mobile
                    </button>
                )}

                {adding === 'email' && (
                    <span className="flex items-center gap-2">
                        <input
                            type="email"
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void saveContact('email'); } }}
                            placeholder="name@example.com"
                            aria-label="Customer email"
                            className="h-8 rounded-full bg-gray-700 border border-gray-600 px-3 text-xs text-white focus:outline-none focus:ring-2 focus:ring-sky-500/50"
                        />
                        <button type="button" onClick={() => void saveContact('email')} disabled={savingContact || !hasEmail} className="h-8 rounded-full bg-sky-600 px-3 text-xs font-semibold text-white disabled:opacity-40">
                            {savingContact ? <Spinner className="h-3 w-3" /> : 'Save'}
                        </button>
                        <button type="button" onClick={() => setAdding(null)} className="text-xs text-gray-400 hover:text-white">Cancel</button>
                    </span>
                )}
                {adding === 'phone' && (
                    <span className="flex items-center gap-2">
                        <input
                            type="tel"
                            value={phone}
                            onChange={e => setPhone(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void saveContact('phone'); } }}
                            placeholder="07123 456789"
                            aria-label="Customer mobile"
                            className="h-8 rounded-full bg-gray-700 border border-gray-600 px-3 text-xs text-white focus:outline-none focus:ring-2 focus:ring-[#25d366]/40"
                        />
                        <button type="button" onClick={() => void saveContact('phone')} disabled={savingContact || !hasPhone} className="h-8 rounded-full bg-[#25d366] px-3 text-xs font-semibold text-[#111b21] disabled:opacity-40">
                            {savingContact ? <Spinner className="h-3 w-3" /> : 'Save'}
                        </button>
                        <button type="button" onClick={() => setAdding(null)} className="text-xs text-gray-400 hover:text-white">Cancel</button>
                    </span>
                )}

                {error && <span className="text-xs text-red-400 basis-full sm:basis-auto">{error}</span>}
            </div>
        </div>
    );
};

export default SendDocumentPanel;
