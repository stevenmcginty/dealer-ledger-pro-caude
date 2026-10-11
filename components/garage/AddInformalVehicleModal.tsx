import React, { useState } from 'react';
import { NewInformalVehicle } from '../../types';
import { Button, Field, Input, PlateInput } from '../ui';
import { PanelHeader } from '../stock/parts';
import { useData } from '../../hooks/useData';
import { useUI } from '../../hooks/useUI';

const AddInformalVehicleModal = () => {
    const { addInformalVehicle } = useData();
    const { closeModal } = useUI();
    const [reg, setReg] = useState('');
    const [make, setMake] = useState('');
    const [model, setModel] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        addInformalVehicle({ reg, make, model });
        closeModal();
    };

    return (
        <form onSubmit={handleSubmit} className="flex flex-col">
            <PanelHeader title="Add informal car" subtitle="A car that isn’t in your stock book" onClose={closeModal} />
            <div className="space-y-5 p-5">
                <Field label="Registration" htmlFor="informal-reg">
                    <PlateInput
                        id="informal-reg"
                        value={reg}
                        onChange={e => setReg(e.target.value.toUpperCase())}
                        maxLength={12}
                        required
                        autoFocus
                    />
                </Field>
                <Input id="informal-make" label="Make" value={make} onChange={e => setMake(e.target.value)} required />
                <Input id="informal-model" label="Model" value={model} onChange={e => setModel(e.target.value)} required />
            </div>
            <footer className="flex justify-end gap-3 border-t border-line p-4">
                <Button type="button" variant="secondary" onClick={closeModal}>Cancel</Button>
                <Button type="submit">Add car</Button>
            </footer>
        </form>
    );
};

export default AddInformalVehicleModal;