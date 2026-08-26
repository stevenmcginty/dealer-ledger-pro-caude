import React, { useState } from 'react';
import { Badge, Button, Card, Input, useToast } from '../ui';
import { saveSalesAgentSharedInbox } from '../../services/salesAgentService';

/**
 * One Gmail and one WhatsApp number, two ledgers.
 *
 * The tokens stay on this company. The other company's id goes in here, and from
 * then on an enquiry about one of their cars lands in their inbox and their replies
 * go out through this company's number and mailbox. The "live" switch is the only
 * thing that lets a WhatsApp actually leave: until Meta has verified the business
 * every send is refused with a plain message rather than a Graph error.
 */
interface SharedInboxCardProps {
    companyId: string;
}

const SharedInboxCard: React.FC<SharedInboxCardProps> = ({ companyId }) => {
    const toast = useToast();
    const [otherCompanyId, setOtherCompanyId] = useState('');
    const [name, setName] = useState('');
    const [live, setLive] = useState(false);
    const [saving, setSaving] = useState(false);
    const [result, setResult] = useState('');

    const handleSave = async () => {
        setSaving(true);
        setResult('');
        try {
            const members = otherCompanyId.trim() ? [otherCompanyId.trim()] : [];
            const { inbox } = await saveSalesAgentSharedInbox(companyId, {
                memberCompanyIds: members,
                fallbackCompanyId: companyId,
                ...(name.trim() ? { name: name.trim() } : {}),
                whatsappLive: live,
            });
            const count = inbox?.memberCompanyIds?.length || 0;
            setResult(
                `Saved. ${count} compan${count === 1 ? 'y' : 'ies'} share this inbox; unmatched enquiries stay here; WhatsApp sending is ${inbox?.whatsappLive ? 'LIVE' : 'off until Meta verification'}.`
            );
            toast.success('Shared inbox saved.');
        } catch (err: any) {
            toast.error(err?.message || 'Could not save the shared inbox.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <Card padding="lg">
            <Card.Header action={<Badge variant={live ? 'success' : 'default'} dot>{live ? 'WhatsApp live' : 'WhatsApp not live'}</Badge>}>
                Shared inbox
            </Card.Header>
            <Card.Body>
                <div className="space-y-4">
                    <p className="text-sm text-gray-400 max-w-2xl">
                        Share this company&rsquo;s Gmail and WhatsApp number with another Dealer Ledger Pro
                        account. Enquiries land in whichever account owns the car; anything unmatched stays
                        here. Both accounts can reply and start WhatsApp chats through the shared number.
                    </p>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <Input
                            label="Other company ID"
                            value={otherCompanyId}
                            onChange={e => setOtherCompanyId(e.target.value)}
                            placeholder="-OXn0r1…"
                        />
                        <Input
                            label="Inbox name (optional)"
                            value={name}
                            onChange={e => setName(e.target.value)}
                            placeholder="Radlett"
                        />
                    </div>
                    <label className="flex items-center gap-3 cursor-pointer">
                        <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-gray-600 bg-gray-800"
                            checked={live}
                            onChange={e => setLive(e.target.checked)}
                        />
                        <span className="text-sm text-gray-200">
                            WhatsApp is live (Meta business verification complete)
                        </span>
                    </label>
                    <div className="flex flex-wrap items-center gap-3">
                        <Button onClick={handleSave} loading={saving} disabled={saving}>
                            Save shared inbox
                        </Button>
                        {result && <span className="text-sm text-gray-300">{result}</span>}
                    </div>
                    <p className="text-xs text-gray-500">
                        Saving again with the ID blank keeps the current members. Existing threads are
                        mirrored so returning customers stay with the account that already knows them.
                    </p>
                </div>
            </Card.Body>
        </Card>
    );
};

export default SharedInboxCard;
