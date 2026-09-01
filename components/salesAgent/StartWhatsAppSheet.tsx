/**
 * Start a WhatsApp to a number from this ledger.
 *
 * Used from the Agent Inbox and from a CRM lead. Same shared business number
 * either way; the thread stays in the portal that opened it. Nothing is sent
 * until WhatsApp is live.
 */

import React, { useMemo, useState } from 'react';
import Modal from '../common/Modal';
import { Button, Input, useToast } from '../ui';
import { startAgentWhatsApp } from '../../services/salesAgentService';
import { useData } from '../../hooks/useData';
import { customerMatchesSearch } from '../../utils/customerContact';

export interface StartWhatsAppDefaults {
    phone?: string;
    firstName?: string;
    lastName?: string;
    vehicleTitle?: string;
    leadId?: string;
}

/** Most people who have bought a car are one word away; more than this is a typo. */
const MAX_SUGGESTIONS = 6;

const StartWhatsAppSheet: React.FC<{
    companyId: string;
    defaults?: StartWhatsAppDefaults;
    onClose: () => void;
    onStarted: (convId: string) => void;
}> = ({ companyId, defaults, onClose, onStarted }) => {
    const toast = useToast();
    const { customers } = useData();
    const [phone, setPhone] = useState(defaults?.phone || '');
    const [firstName, setFirstName] = useState(defaults?.firstName || '');
    const [lastName, setLastName] = useState(defaults?.lastName || '');
    const [vehicleTitle, setVehicleTitle] = useState(defaults?.vehicleTitle || '');
    const [busy, setBusy] = useState(false);

    // Look somebody up rather than reading their number off an invoice. Only
    // customers with a mobile on file can be started here, so the list never
    // offers a row that cannot be picked.
    const [lookup, setLookup] = useState('');
    const suggestions = useMemo(() => {
        if (!lookup.trim()) return [];
        return customers
            .filter(c => c.phone && customerMatchesSearch(c, lookup))
            .slice(0, MAX_SUGGESTIONS);
    }, [customers, lookup]);

    const pickCustomer = (customer: { name: string; phone?: string }) => {
        const [first, ...rest] = customer.name.trim().split(/\s+/);
        setPhone(customer.phone || '');
        setFirstName(first || '');
        setLastName(rest.join(' '));
        setLookup('');
    };

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!phone.trim() || busy) return;
        setBusy(true);
        try {
            const result = await startAgentWhatsApp(companyId, {
                phone: phone.trim(),
                firstName: firstName.trim() || undefined,
                lastName: lastName.trim() || undefined,
                vehicleTitle: vehicleTitle.trim() || undefined,
                leadId: defaults?.leadId,
            });
            if (result.sent) {
                toast.success('WhatsApp sent.');
            } else if (result.created) {
                toast.success('Thread opened. WhatsApp is not live yet, so nothing was sent.');
            } else {
                toast.success('That number already has a thread here.');
            }
            onStarted(result.convId);
        } catch (err: any) {
            toast.error(err?.message || 'That WhatsApp could not be started.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <Modal onClose={() => { if (!busy) onClose(); }} size="md">
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
                <div>
                    <h3 className="text-lg font-semibold text-white">New WhatsApp</h3>
                    <p className="mt-1 text-sm text-gray-400">
                        Sends from the shared Radlett number. The first message is the approved
                        follow-up template; free text waits until they reply. Nothing goes out
                        until WhatsApp is live.
                    </p>
                </div>

                <div className="relative">
                    <Input
                        label="Find a customer"
                        value={lookup}
                        onChange={e => setLookup(e.target.value)}
                        placeholder="Optional — name, email or number"
                        autoComplete="off"
                    />
                    {suggestions.length > 0 && (
                        <ul className="absolute z-10 mt-1 w-full max-h-56 overflow-y-auto rounded-md border border-gray-600 bg-gray-800 shadow-lg">
                            {suggestions.map(c => (
                                <li key={c.id}>
                                    <button
                                        type="button"
                                        onClick={() => pickCustomer(c)}
                                        className="w-full px-3 py-2 text-left hover:bg-gray-700"
                                    >
                                        <span className="block text-sm text-white">{c.name}</span>
                                        <span className="block text-xs text-gray-400">
                                            {[c.phone, c.email].filter(Boolean).join(' · ')}
                                        </span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                    {lookup.trim() && suggestions.length === 0 && (
                        <p className="mt-1 text-xs text-gray-500">
                            No customer with a mobile on file matches that. Type the number below instead.
                        </p>
                    )}
                </div>

                <Input
                    label="Mobile number"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    placeholder="07712 000229"
                    autoComplete="tel"
                    required
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Input
                        label="First name"
                        value={firstName}
                        onChange={e => setFirstName(e.target.value)}
                        placeholder="Optional"
                    />
                    <Input
                        label="Last name"
                        value={lastName}
                        onChange={e => setLastName(e.target.value)}
                        placeholder="Optional"
                    />
                </div>
                <Input
                    label="Vehicle"
                    value={vehicleTitle}
                    onChange={e => setVehicleTitle(e.target.value)}
                    placeholder="Optional — goes in the template"
                />

                <div className="flex justify-end gap-3 pt-2">
                    <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
                        Cancel
                    </Button>
                    <Button type="submit" loading={busy} disabled={!phone.trim() || busy}>
                        Open WhatsApp
                    </Button>
                </div>
            </form>
        </Modal>
    );
};

export default StartWhatsAppSheet;
