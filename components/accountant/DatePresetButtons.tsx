import React from 'react';
import { DatePreset, getPresetRange } from '../../utils/datePresets';

const PRESETS: { key: DatePreset; label: string }[] = [
    { key: 'this_month', label: 'This Month' },
    { key: 'last_month', label: 'Last Month' },
    { key: 'this_quarter', label: 'This Quarter' },
    { key: 'last_quarter', label: 'Last Quarter' },
    { key: 'this_year', label: 'This Year' },
];

interface DatePresetButtonsProps {
    onSelect: (range: { start: string; end: string }) => void;
}

const DatePresetButtons = ({ onSelect }: DatePresetButtonsProps) => (
    <div className="flex flex-wrap items-center gap-2">
        {PRESETS.map(p => (
            <button
                key={p.key}
                type="button"
                onClick={() => onSelect(getPresetRange(p.key))}
                className="px-3 py-2 text-sm font-medium text-gray-300 bg-gray-700 hover:bg-gray-600 rounded-md"
            >
                {p.label}
            </button>
        ))}
    </div>
);

export default DatePresetButtons;
