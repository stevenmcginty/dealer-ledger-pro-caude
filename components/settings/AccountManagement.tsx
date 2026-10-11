import React, { useRef, useState } from 'react';
import { useData } from '../../hooks/useData';
import { useUI } from '../../hooks/useUI';
import { FinancialAccount } from '../../types';
import { BanknotesIcon, ChevronDownIcon, CreditCardIcon, PlusIcon, TrashIcon, EditIcon, ViewColumnsIcon, ArchiveBoxIcon } from '../icons';
import { isMappingComplete } from '../../utils/csvMapping';
import Select from '../common/Select';
import { Badge, Button, EmptyState, Field, Input } from '../ui';
import { Panel, PanelSection, IconTile, dangerQuiet } from './SettingsKit';

// FIX: Extracted props to a named interface to resolve 'key' prop error.
interface AccountRowProps {
    account: FinancialAccount;
}
const AccountRow: React.FC<AccountRowProps> = ({ account }) => {
    const { updateFinancialAccount, deleteFinancialAccount } = useData();
    const { openModal } = useUI();
    const [name, setName] = useState(account.name);
    const [isEditing, setIsEditing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    // Blur and submit can both fire for one rename; save it once.
    const savingRef = useRef(false);

    const hasMapping = isMappingComplete(account.columnMapping);

    const handleSave = async () => {
        if (savingRef.current) return;
        if (name.trim() === '' || name.trim() === account.name) {
            setIsEditing(false);
            setName(account.name);
            return;
        }
        savingRef.current = true;
        setIsSaving(true);
        try {
            await updateFinancialAccount(account.id, { name: name.trim() });
        } finally {
            savingRef.current = false;
            setIsSaving(false);
        }
        setIsEditing(false);
    };

    // Tapping away saves the name, as before. Moving to Save name or Cancel does not.
    const handleFormBlur = (e: React.FocusEvent<HTMLFormElement>) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) handleSave();
    };
    // Keep focus in the field while Save name or Cancel is pressed, so the blur save does not run first.
    const keepFieldFocus = (e: React.MouseEvent) => e.preventDefault();

    const handleDelete = () => {
        if (window.confirm(`Delete the account "${account.name}"? You can't undo this.`)) {
            deleteFinancialAccount(account.id);
        }
    }

    // Closing only hides the account from Expenses tabs and the upload menu; its lines stay in every report.
    const handleToggleClosed = async () => {
        if (!account.closed && !window.confirm(`Mark "${account.name}" as closed? It will be hidden from the Expenses tabs and the upload menu. Its transactions are kept and still count in every report.`)) return;
        setIsSaving(true);
        await updateFinancialAccount(account.id, account.closed ? { closed: false, closedAt: null } : { closed: true, closedAt: Date.now() });
        setIsSaving(false);
    };

    const Icon = account.type === 'Bank' ? BanknotesIcon : CreditCardIcon;

    const statusLine = (
        <span className="block truncate text-sm leading-5 text-ink-3">
            {account.type === 'Bank' ? 'Bank account' : 'Credit card'}
            {' · '}
            {hasMapping
                ? <span className="text-success">Statement format set</span>
                : <span className="font-semibold text-warning">Statement format not set up</span>}
        </span>
    );

    if (isEditing) {
        return (
            <li className="px-4 py-3.5 sm:px-5">
                <form onSubmit={e => { e.preventDefault(); handleSave(); }} onBlur={handleFormBlur} className="flex flex-wrap items-end gap-2">
                    <Input
                        id={`account-name-${account.id}`}
                        label="Account name"
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        autoFocus
                        wrapperClassName="min-w-[12rem] flex-1"
                    />
                    <Button type="submit" loading={isSaving} onMouseDown={keepFieldFocus}>Save name</Button>
                    <Button type="button" variant="ghost" onMouseDown={keepFieldFocus} onClick={() => { setIsEditing(false); setName(account.name); }}>Cancel</Button>
                </form>
            </li>
        );
    }

    // Tap the row to show what you can do with it: detail in the disclosure, not a third line.
    return (
        <li>
            <details className="group">
                <summary className="flex min-h-[64px] cursor-pointer list-none items-center gap-3 px-4 py-3 transition-colors duration-quick ease-out hover:bg-surface-2 active:bg-surface-3 sm:px-5 [&::-webkit-details-marker]:hidden">
                    <IconTile><Icon /></IconTile>
                    <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2 text-base font-semibold leading-6 text-ink">
                            <span className="min-w-0 truncate">{account.name}</span>
                            {account.closed && <Badge size="sm">Closed</Badge>}
                        </span>
                        {statusLine}
                    </span>
                    <ChevronDownIcon className="h-5 w-5 flex-none text-ink-3 transition-transform duration-quick ease-out group-open:rotate-180" />
                </summary>
                <div className="flex flex-wrap gap-2 px-4 pb-4 pt-1 sm:px-5 sm:ps-[72px]">
                    <Button
                        size="sm"
                        variant="secondary"
                        icon={<ViewColumnsIcon />}
                        onClick={() => openModal('statementMapping', { account })}
                        title="Set up or re-map this account's statement format"
                    >
                        {hasMapping ? 'Statement format' : 'Set up statement format'}
                    </Button>
                    <Button size="sm" variant="secondary" icon={<EditIcon />} onClick={() => setIsEditing(true)}>Rename</Button>
                    <Button size="sm" variant="secondary" icon={<ArchiveBoxIcon />} onClick={handleToggleClosed} disabled={isSaving}>
                        {account.closed ? 'Reopen' : 'Mark as closed'}
                    </Button>
                    <button type="button" onClick={handleDelete} className={`${dangerQuiet} min-h-[36px] px-3 text-sm [@media(pointer:coarse)]:min-h-[44px] [&_svg]:h-4 [&_svg]:w-4`}>
                        <TrashIcon /> Delete
                    </button>
                </div>
            </details>
        </li>
    );
};

const AccountManagement = () => {
    const { financialAccounts, addFinancialAccount } = useData();
    const [newName, setNewName] = useState('');
    const [newType, setNewType] = useState<'Bank' | 'Credit Card'>('Bank');
    const [isAdding, setIsAdding] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (newName.trim() === '') return;
        setIsAdding(true);
        await addFinancialAccount({ name: newName.trim(), type: newType });
        setNewName('');
        setIsAdding(false);
    };

    return (
        <div className="space-y-6">
            <Panel ariaLabel="Accounts">
                <PanelSection
                    title="Your accounts"
                    description="Tap an account to set its statement format, rename or close it. Closed accounts drop out of Expenses and the upload menu; their lines still count in every report."
                />
                {financialAccounts.length > 0 ? (
                    <ul className="m-0 list-none divide-y divide-line p-0">
                        {financialAccounts.map(acc => <AccountRow key={acc.id} account={acc} />)}
                    </ul>
                ) : (
                    <EmptyState
                        icon={<BanknotesIcon />}
                        title="No accounts yet"
                        description="Add the bank and card accounts you upload statements for. Each one learns its statement format once."
                    />
                )}
            </Panel>

            <Panel ariaLabel="Add an account">
                <PanelSection title="Add an account">
                    <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1fr)_12rem]">
                        <Input
                            id="newName"
                            label="Account name"
                            type="text"
                            value={newName}
                            onChange={e => setNewName(e.target.value)}
                            placeholder="Lloyds current, Amex Gold"
                            required
                        />
                        <Field label="Type" htmlFor="newType">
                            <Select id="newType" value={newType} onChange={e => setNewType(e.target.value as any)}>
                                <option value="Bank">Bank account</option>
                                <option value="Credit Card">Credit card</option>
                            </Select>
                        </Field>
                        <div className="flex justify-end sm:col-span-2">
                            <Button type="submit" loading={isAdding} icon={<PlusIcon />} className="w-full sm:w-auto">Add account</Button>
                        </div>
                    </form>
                </PanelSection>
            </Panel>
        </div>
    );
};

export default AccountManagement;
