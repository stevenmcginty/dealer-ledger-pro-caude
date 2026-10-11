import React from 'react';
import { DatePreset, getPresetRange } from '../../utils/datePresets';
import { chipClass } from './hubShared';

const PRESETS: { key: DatePreset; label: string }[] = [
    { key: 'this_month', label: 'This month' },
    { key: 'last_month', label: 'Last month' },
    { key: 'this_quarter', label: 'This quarter' },
    { key: 'last_quarter', label: 'Last quarter' },
    { key: 'this_year', label: 'This year' },
];

interface DatePresetButtonsProps {
    onSelect: (range: { start: string; end: string }) => void;
}

const DatePresetButtons = ({ onSelect }: DatePresetButtonsProps) => (
    <div role="group" aria-label="Quick periods" className="flex flex-wrap items-center gap-1.5">
        {PRESETS.map(p => (
            <button
                key={p.key}
                type="button"
                onClick={() => onSelect(getPresetRange(p.key))}
                className={chipClass(false)}
            >
                {p.label}
            </button>
        ))}
    </div>
);

export default DatePresetButtons;
