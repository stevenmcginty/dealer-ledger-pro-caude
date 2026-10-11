import React from 'react';
import { formatCurrency } from '../../utils/helpers';
import { PlusIcon, TrashIcon } from '../icons';
import { Button, IconButton, KeyValues, Plate, StatusChip } from '../ui';

type DisplayCar = {
    isInformal: boolean;
    id: string;
    reg: string;
    make: string;
    model: string;
    purchasePrice?: number;
    costs: { id: string; description: string; amount: number; createdAt: number }[];
    totalCost: number;
    totalOwed: number;
};

interface GarageCarCardProps {
    car: DisplayCar;
    onAddCostClick: (reg: string) => void;
    onDeleteCost: (costId: string) => Promise<void>;
    onDeleteInformal: (vehicleId: string) => Promise<void>;
}

const GarageCarCard: React.FC<GarageCarCardProps> = ({ car, onAddCostClick, onDeleteCost, onDeleteInformal }) => {

    const handleDeleteInformal = () => {
        if (window.confirm(`Delete ${car.reg}? Its garage costs go too. You can’t undo this.`)) {
            onDeleteInformal(car.id);
        }
    }

    // The remove button is always visible now (no hover-only actions), so it asks first.
    const handleDeleteCost = (cost: DisplayCar['costs'][number]) => {
        if (window.confirm(`Remove “${cost.description}” (${formatCurrency(cost.amount)}) from ${car.reg}?`)) {
            onDeleteCost(cost.id);
        }
    };

    const facts = [
        ...(car.purchasePrice !== undefined ? [{ label: 'Bought', value: formatCurrency(car.purchasePrice) }] : []),
        { label: 'Costs', value: formatCurrency(car.totalCost) },
        { label: 'Owed', value: formatCurrency(car.totalOwed) },
    ];

    return (
        <article className="flex flex-col rounded-card border border-line bg-surface" aria-label={`${car.reg} ${car.make} ${car.model}`}>
            <header className="flex items-start gap-3 border-b border-line px-4 pb-3 pt-4">
                <div className="min-w-0 flex-1 space-y-1.5">
                    <Plate reg={car.reg} />
                    <p className="truncate text-base font-semibold text-ink">{car.make} {car.model}</p>
                </div>
                {car.isInformal && <StatusChip status="neutral">Informal</StatusChip>}
            </header>

            <div className="flex-1 px-4 pt-3">
                <KeyValues items={facts} />

                {car.costs.length > 0 ? (
                    <ul className="m-0 -mx-1 list-none divide-y divide-line border-t border-line p-0">
                        {car.costs.map(cost => (
                            <li key={cost.id} className="flex min-h-[48px] items-center gap-2 ps-1">
                                <span className="min-w-0 flex-1 truncate text-sm text-ink-2">{cost.description}</span>
                                <span className="num text-sm font-semibold text-ink">{formatCurrency(cost.amount)}</span>
                                <IconButton size="sm" label={`Remove ${cost.description}`} icon={<TrashIcon />} onClick={() => handleDeleteCost(cost)} className="hover:text-danger" />
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p className="border-t border-line py-3 text-sm text-ink-3">No costs yet.</p>
                )}
            </div>

            <footer className="flex items-center gap-2 border-t border-line p-2">
                {car.isInformal && (
                    <Button variant="ghost" size="sm" onClick={handleDeleteInformal} className="text-danger hover:bg-danger-soft">
                        Delete car
                    </Button>
                )}
                <Button variant="secondary" size="sm" icon={<PlusIcon />} onClick={() => onAddCostClick(car.reg)} className="ms-auto">
                    Add cost
                </Button>
            </footer>
        </article>
    );
};

export default GarageCarCard;
