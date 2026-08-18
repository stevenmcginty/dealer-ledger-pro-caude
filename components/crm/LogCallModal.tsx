import React, { useState } from 'react';
import { Button, useToast } from '../ui';
import { XMarkIcon, PhoneIcon } from '../icons';
import { useData } from '../../hooks/useData';
import { Lead } from '../../types';

interface LogCallModalProps {
    lead: Lead;
    onClose: () => void;
}

type CallOutcome = 'connected' | 'no_answer' | 'voicemail' | 'busy' | 'wrong_number';

const CALL_OUTCOMES: { value: CallOutcome; label: string }[] = [
    { value: 'connected', label: 'Connected' },
    { value: 'no_answer', label: 'No Answer' },
    { value: 'voicemail', label: 'Left Voicemail' },
    { value: 'busy', label: 'Busy' },
    { value: 'wrong_number', label: 'Wrong Number' },
];

const LogCallModal: React.FC<LogCallModalProps> = ({ lead, onClose }) => {
    const { addLeadActivity } = useData();
    const toast = useToast();
    const [outcome, setOutcome] = useState<CallOutcome>('connected');
    const [notes, setNotes] = useState('');
    const [duration, setDuration] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        setIsSubmitting(true);
        try {
            const outcomeLabel = CALL_OUTCOMES.find(o => o.value === outcome)?.label || outcome;
            let content = `Call: ${outcomeLabel}`;
            if (duration) {
                content += ` (${duration} mins)`;
            }
            if (notes.trim()) {
                content += `\n${notes.trim()}`;
            }

            await addLeadActivity(lead.id, {
                type: 'CALL_LOG',
                content,
                timestamp: new Date().toISOString(),
            });
            onClose();
        } catch (error) {
            console.error('Error logging call:', error);
            toast.error("Could not log the call. Please try again.");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="flex flex-col w-full">
            {/* Header */}
            <div className="p-4 border-b border-gray-700 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <div className="p-2 rounded-lg bg-amber-500/20">
                        <PhoneIcon className="w-5 h-5 text-amber-400" />
                    </div>
                    <div>
                        <h2 className="text-lg font-semibold text-white">Log Call</h2>
                        <p className="text-xs text-gray-400">
                            {lead.firstName} {lead.lastName}
                            {lead.phone && ` - ${lead.phone}`}
                        </p>
                    </div>
                </div>
                <button
                    onClick={onClose}
                    className="p-1 text-gray-400 hover:text-white rounded-lg hover:bg-gray-700 transition-colors"
                >
                    <XMarkIcon className="w-5 h-5" />
                </button>
            </div>

            {/* Body */}
            <form onSubmit={handleSubmit}>
                <div className="p-4 space-y-4">
                    {/* Call Outcome */}
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">
                            Call Outcome
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                            {CALL_OUTCOMES.map(({ value, label }) => (
                                <button
                                    key={value}
                                    type="button"
                                    onClick={() => setOutcome(value)}
                                    className={`px-3 py-2 text-sm rounded-lg border transition-colors ${
                                        outcome === value
                                            ? 'border-brand-500 bg-brand-500/20 text-white'
                                            : 'border-gray-700 bg-gray-800 text-gray-400 hover:text-white hover:border-gray-600'
                                    }`}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Duration (only show if connected) */}
                    {outcome === 'connected' && (
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-1.5">
                                Duration (minutes)
                            </label>
                            <input
                                type="number"
                                value={duration}
                                onChange={(e) => setDuration(e.target.value)}
                                placeholder="e.g., 5"
                                min="0"
                                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                            />
                        </div>
                    )}

                    {/* Notes */}
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1.5">
                            Notes (optional)
                        </label>
                        <textarea
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            placeholder="What was discussed..."
                            rows={3}
                            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent resize-none"
                        />
                    </div>
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-gray-700 flex justify-end gap-3">
                    <Button
                        type="button"
                        variant="ghost"
                        onClick={onClose}
                        disabled={isSubmitting}
                    >
                        Cancel
                    </Button>
                    <Button
                        type="submit"
                        variant="primary"
                        disabled={isSubmitting}
                    >
                        {isSubmitting ? 'Saving...' : 'Log Call'}
                    </Button>
                </div>
            </form>
        </div>
    );
};

export default LogCallModal;
