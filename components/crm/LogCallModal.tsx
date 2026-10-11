import React, { useState } from 'react';
import { Button, Input, useToast } from '../ui';
import { controlFrame, controlInput, cx } from '../ui/cx';
import { SheetBody, SheetFooter, SheetFrame, SheetHeader } from './SheetParts';
import { useData } from '../../hooks/useData';
import { Lead } from '../../types';

interface LogCallModalProps {
    lead: Lead;
    onClose: () => void;
}

type CallOutcome = 'connected' | 'no_answer' | 'voicemail' | 'busy' | 'wrong_number';

// `label` is written into the saved call entry ("Call: No Answer"), so it stays
// as it always was; `display` is only what the button says.
const CALL_OUTCOMES: { value: CallOutcome; label: string; display: string }[] = [
    { value: 'connected', label: 'Connected', display: 'Connected' },
    { value: 'no_answer', label: 'No Answer', display: 'No answer' },
    { value: 'voicemail', label: 'Left Voicemail', display: 'Left voicemail' },
    { value: 'busy', label: 'Busy', display: 'Busy' },
    { value: 'wrong_number', label: 'Wrong Number', display: 'Wrong number' },
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
            toast.error("Couldn't save the call. Check your signal and try again.");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <SheetFrame as="form" onSubmit={handleSubmit}>
            <SheetHeader
                title="Log a call"
                description={<>{lead.firstName} {lead.lastName}{lead.phone && <> · <span className="num">{lead.phone}</span></>}</>}
                onClose={onClose}
            />
            <SheetBody className="space-y-5">
                <fieldset>
                    <legend className="mb-2 text-sm font-semibold leading-5 text-ink">How did it go?</legend>
                    <div role="radiogroup" aria-label="Call outcome" className="grid grid-cols-2 gap-1.5">
                        {CALL_OUTCOMES.map(({ value, display }) => {
                            const on = outcome === value;
                            return (
                                <button
                                    key={value}
                                    type="button"
                                    role="radio"
                                    aria-checked={on}
                                    onClick={() => setOutcome(value)}
                                    className={cx(
                                        'flex min-h-[48px] items-center gap-2.5 rounded-control border px-3 text-start text-sm font-semibold transition-colors duration-quick ease-out',
                                        on
                                            ? 'border-accent bg-accent-soft text-accent-soft-ink'
                                            : 'border-line bg-surface text-ink-2 hover:border-line-strong hover:bg-surface-2 hover:text-ink active:bg-surface-3',
                                    )}
                                >
                                    <span aria-hidden="true" className={cx('grid h-[18px] w-[18px] flex-none place-items-center rounded-full border-2', on ? 'border-current' : 'border-line-strong')}>
                                        {on && <span className="h-2 w-2 rounded-full bg-current" />}
                                    </span>
                                    {display}
                                </button>
                            );
                        })}
                    </div>
                </fieldset>

                {/* Duration only matters when they picked up */}
                {outcome === 'connected' && (
                    <Input
                        id="call-duration"
                        label="How long"
                        type="number"
                        inputMode="numeric"
                        value={duration}
                        onChange={(e) => setDuration(e.target.value)}
                        placeholder="5"
                        min="0"
                        trailing={<span className="text-sm">minutes</span>}
                        className="num"
                        wrapperClassName="max-w-[220px]"
                    />
                )}

                <div>
                    <label htmlFor="call-notes" className="mb-1.5 block text-sm font-semibold leading-5 text-ink">
                        What was said <span className="font-normal text-ink-3">(optional)</span>
                    </label>
                    <div className={controlFrame()}>
                        <textarea
                            id="call-notes"
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            placeholder="Wants £500 off, has a part-ex…"
                            rows={3}
                            className={cx(controlInput, 'min-h-[96px] resize-none')}
                        />
                    </div>
                </div>
            </SheetBody>
            <SheetFooter>
                <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>
                    Cancel
                </Button>
                <Button type="submit" variant="primary" loading={isSubmitting}>
                    Save call
                </Button>
            </SheetFooter>
        </SheetFrame>
    );
};

export default LogCallModal;
