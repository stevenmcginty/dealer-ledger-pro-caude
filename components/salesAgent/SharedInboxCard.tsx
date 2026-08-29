import React, { useEffect, useState } from 'react';
import { Badge, Button, Card, Input, useToast } from '../ui';
import {
    SharedInboxMeta,
    saveSalesAgentSharedInbox,
    subscribeToSharedInbox,
} from '../../services/salesAgentService';

/**
 * One Gmail and one WhatsApp number, two ledgers.
 *
 * The tokens stay on this company. The other company's id goes in here, and from
 * then on an enquiry about one of their cars lands in their inbox and their replies
 * go out through this company's number and mailbox. The "live" switch is the only
 * thing that lets a WhatsApp actually leave: until Meta has verified the business
 * every send is refused with a plain message rather than a Graph error.
 *
 * The other ledger is named by company id — Steve does not need to be a member
 * of Chris's Dealer Ledger Pro. Chris sees a read-only card: he sends from this
 * number, he cannot take the tokens.
 */
interface SharedInboxCardProps {
    companyId: string;
}

const otherMembersOf = (inbox: SharedInboxMeta, companyId: string): string[] =>
    inbox.memberCompanyIds.filter(id => id && id !== companyId && id !== inbox.credentialCompanyId);

const SharedInboxCard: React.FC<SharedInboxCardProps> = ({ companyId }) => {
    const toast = useToast();
    const [inbox, setInbox] = useState<SharedInboxMeta | null>(null);
    const [otherCompanyId, setOtherCompanyId] = useState('');
    const [name, setName] = useState('');
    const [live, setLive] = useState(false);
    const [saving, setSaving] = useState(false);
    const [result, setResult] = useState('');

    useEffect(() => {
        if (!companyId) return;
        return subscribeToSharedInbox(companyId, next => {
            setInbox(next);
            if (!next) return;
            setName(next.name || '');
            setLive(next.whatsappLive === true);
            setOtherCompanyId(otherMembersOf(next, companyId).join(', '));
        });
    }, [companyId]);

    const isOwner = !inbox || inbox.credentialCompanyId === companyId;

    const handleSave = async () => {
        setSaving(true);
        setResult('');
        try {
            const members = otherCompanyId
                .split(/[,\s]+/)
                .map(id => id.trim())
                .filter(Boolean);
            const { inbox: saved } = await saveSalesAgentSharedInbox(companyId, {
                memberCompanyIds: members,
                fallbackCompanyId: companyId,
                ...(name.trim() ? { name: name.trim() } : {}),
                whatsappLive: live,
            });
            const count = saved?.memberCompanyIds?.length || 0;
            setResult(
                `Saved. ${count} compan${count === 1 ? 'y' : 'ies'} share this inbox; unmatched enquiries stay here; WhatsApp sending is ${saved?.whatsappLive ? 'LIVE' : 'off until Meta verification'}.`
            );
            toast.success('Shared inbox saved. The other ledger can send WhatsApp from their Agent Inbox after they reload.');
        } catch (err: any) {
            toast.error(err?.message || 'Could not save the shared inbox.');
        } finally {
            setSaving(false);
        }
    };

    if (!isOwner && inbox) {
        return (
            <Card padding="lg">
                <Card.Header action={<Badge variant={inbox.whatsappLive ? 'success' : 'default'} dot>{inbox.whatsappLive ? 'WhatsApp live' : 'WhatsApp not live'}</Badge>}>
                    Shared WhatsApp
                </Card.Header>
                <Card.Body>
                    <p className="text-sm text-gray-300 max-w-2xl">
                        This ledger uses the shared {inbox.name || 'Radlett'} number. You do not connect
                        WhatsApp here — messages in your Agent Inbox go out through that number.
                        {!inbox.whatsappLive ? ' Sending is off until the other ledger marks WhatsApp live.' : ''}
                    </p>
                    <p className="mt-3 text-xs text-gray-500 font-mono break-all">
                        Your company ID (give this to the ledger that holds the number): {companyId}
                    </p>
                </Card.Body>
            </Card>
        );
    }

    return (
        <Card padding="lg">
            <Card.Header action={<Badge variant={live ? 'success' : 'default'} dot>{live ? 'WhatsApp live' : 'WhatsApp not live'}</Badge>}>
                Shared inbox
            </Card.Header>
            <Card.Body>
                <div className="space-y-4">
                    <p className="text-sm text-gray-400 max-w-2xl">
                        Share this company&rsquo;s Gmail and WhatsApp number with another Dealer Ledger Pro
                        account. Paste their company ID — you do not need to be logged into that ledger.
                        Enquiries land in whichever account owns the car; anything unmatched stays here.
                        Both accounts can reply and start WhatsApp chats through the shared number.
                    </p>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <Input
                            label="Other company ID"
                            value={otherCompanyId}
                            onChange={e => setOtherCompanyId(e.target.value)}
                            placeholder="-OXn0r1…"
                            hint="From their Settings → Data → Session Information"
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
