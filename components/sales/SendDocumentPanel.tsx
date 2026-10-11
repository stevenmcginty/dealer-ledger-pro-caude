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
import { Button, useToast } from '../ui';
import { controlFrame, controlInput, cx, eyebrow } from '../ui/cx';
import { EnvelopeIcon, WhatsAppIcon } from '../icons';
import { updateSalesDocument, uploadInvoicePdf } from '../../services/dataService';
import { sendInvoiceDocument } from '../../services/salesAgentService';
import { printablePdfBlob } from './printablePdf';
import { resolveContactCustomer } from '../../utils/customerContact';

const documentLabel = (doc: SalesDocument): string => doc.documentType.toLowerCase();

const vehicleTitleOf = (doc: SalesDocument): string | undefined => {
    const car = doc.carDetails || {};
    const title = [car.make, car.model].filter(Boolean).join(' ').trim();
    return title || undefined;
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

    /** Type the missing address or number in place; Enter saves it. */
    const contactField = (kind: 'email' | 'phone') => {
        const isEmail = kind === 'email';
        return (
            <span className="flex basis-full items-center gap-1.5 sm:basis-auto">
                <span className={cx(controlFrame(), 'min-h-[44px] min-w-0 flex-1 sm:w-60 sm:flex-none')}>
                    <input
                        type={isEmail ? 'email' : 'tel'}
                        inputMode={isEmail ? 'email' : 'tel'}
                        value={isEmail ? email : phone}
                        onChange={e => (isEmail ? setEmail : setPhone)(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void saveContact(kind); } }}
                        placeholder={isEmail ? 'name@example.com' : '07123 456789'}
                        aria-label={isEmail ? 'Customer email' : 'Customer mobile'}
                        autoFocus
                        className={cx(controlInput, 'py-2', !isEmail && 'num')}
                    />
                </span>
                <Button size="sm" variant="secondary" onClick={() => void saveContact(kind)} loading={savingContact} disabled={isEmail ? !hasEmail : !hasPhone}>
                    Save
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setAdding(null)}>Cancel</Button>
            </span>
        );
    };

    return (
        <div className="flex-none border-b border-line bg-surface px-3 py-2 sm:px-4 print:hidden">
            <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-2">
                <span className={cx(eyebrow, 'me-1')}>Send to customer</span>
                <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    icon={<EnvelopeIcon />}
                    onClick={() => void send('email')}
                    loading={sending === 'email'}
                    disabled={!!sending || !hasEmail}
                    title={hasEmail ? `Email to ${email.trim()}` : 'Add an email address first'}
                >
                    Email
                </Button>
                <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    icon={<WhatsAppIcon className={hasPhone && !sending ? 'text-[#25d366]' : undefined} />}
                    onClick={() => void send('whatsapp')}
                    loading={sending === 'whatsapp'}
                    disabled={!!sending || !hasPhone}
                    title={hasPhone ? `WhatsApp to ${phone.trim()}` : 'Add a mobile number first'}
                >
                    WhatsApp
                </Button>

                {!hasEmail && adding !== 'email' && (
                    <Button type="button" size="sm" variant="ghost" onClick={() => setAdding('email')}>Add email</Button>
                )}
                {!hasPhone && adding !== 'phone' && (
                    <Button type="button" size="sm" variant="ghost" onClick={() => setAdding('phone')}>Add mobile</Button>
                )}

                {adding === 'email' && contactField('email')}
                {adding === 'phone' && contactField('phone')}

                {error && <span role="alert" className="basis-full text-sm text-danger sm:basis-auto">{error}</span>}
            </div>
        </div>
    );
};

export default SendDocumentPanel;
