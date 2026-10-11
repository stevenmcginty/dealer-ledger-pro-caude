import React, { useState } from 'react';
import { NewGarageCost } from '../../types';
import { Button, Field, Input } from '../ui';
import { PanelHeader } from '../stock/parts';
import CurrencyInput from '../common/CurrencyInput';
import { useData } from '../../hooks/useData';
import { useUI } from '../../hooks/useUI';

interface AddGarageCostModalProps {
    vehicleReg: string;
}

const AddGarageCostModal = ({ vehicleReg }: AddGarageCostModalProps) => {
    const { addGarageCost } = useData();
    const { closeModal } = useUI();
    const [description, setDescription] = useState('');
    const [amountStr, setAmountStr] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        addGarageCost({
            vehicleReg,
            description,
            amount: parseFloat(amountStr) || 0,
        });
        closeModal();
    };

    return (
        <form onSubmit={handleSubmit} className="flex flex-col">
            <PanelHeader title="Add a cost" subtitle={vehicleReg} onClose={closeModal} />
            <div className="space-y-5 p-5">
                <Input
                    id="cost-description"
                    label="What was it for?"
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    required
                    autoFocus
                />
                <Field label="Amount" htmlFor="cost-amount">
                    <CurrencyInput
                        id="cost-amount"
                        value={amountStr}
                        onChange={e => setAmountStr(e.target.value)}
                        required
                    />
                </Field>
            </div>
            <footer className="flex justify-end gap-3 border-t border-line p-4">
                <Button type="button" variant="secondary" onClick={closeModal}>Cancel</Button>
                <Button type="submit">Add cost</Button>
            </footer>
        </form>
    );
};

export default AddGarageCostModal;