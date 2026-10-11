import React, { useState } from 'react';
import { Button, useToast } from '../ui';
import { controlFrame, controlInput, cx } from '../ui/cx';
import { SheetBody, SheetFooter, SheetFrame, SheetHeader } from './SheetParts';
import { useData } from '../../hooks/useData';
import { Lead } from '../../types';

interface AddNoteModalProps {
    lead: Lead;
    onClose: () => void;
}

const AddNoteModal: React.FC<AddNoteModalProps> = ({ lead, onClose }) => {
    const { addLeadActivity } = useData();
    const toast = useToast();
    const [note, setNote] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!note.trim()) return;

        setIsSubmitting(true);
        try {
            await addLeadActivity(lead.id, {
                type: 'NOTE',
                content: note.trim(),
                timestamp: new Date().toISOString(),
            });
            onClose();
        } catch (error) {
            console.error('Error adding note:', error);
            toast.error("Couldn't save the note. Check your signal and try again.");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <SheetFrame as="form" onSubmit={handleSubmit}>
            <SheetHeader title="Add a note" description={`${lead.firstName} ${lead.lastName}`} onClose={onClose} />
            <SheetBody>
                <label htmlFor="lead-note" className="mb-1.5 block text-sm font-semibold leading-5 text-ink">Note</label>
                <div className={controlFrame()}>
                    <textarea
                        id="lead-note"
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder="What happened, what's next"
                        rows={5}
                        autoFocus
                        className={cx(controlInput, 'min-h-[132px] resize-none')}
                    />
                </div>
            </SheetBody>
            <SheetFooter>
                <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>
                    Cancel
                </Button>
                <Button type="submit" variant="primary" loading={isSubmitting} disabled={!note.trim()}>
                    Save note
                </Button>
            </SheetFooter>
        </SheetFrame>
    );
};

export default AddNoteModal;
